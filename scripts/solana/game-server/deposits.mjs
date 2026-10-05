// Deposit ingestion: reads every transaction that touched the game wallet
// (address scan + player reports via /deposit), applies stakes exactly once
// (signature primary key, re-check inside the transaction, in-flight map)
// and queues refunds for what cannot be applied. Split out of engine.mjs;
// applying a stake to a game is the engine's job (applyStake).

import { BASE_FEE } from './chain.mjs'
import { RuleError, parseStakeMemo } from './rules.mjs'

/**
 * @param {object} o
 * @param {(memo: object, stake: object) => void} o.applyStake throws RuleError to refuse
 * @param {(scan: {at: number, pending: number}) => void} o.setLastScan
 */
export function createDeposits({ db, chain, opts, log, now, funders, adoptWallet, applyStake, setLastScan }) {
  const inflight = new Map()

  /** Applies one transaction that touched the game wallet (idempotent). */
  function ingest(signature) {
    if (!inflight.has(signature)) {
      inflight.set(signature, ingestOnce(signature).finally(() => inflight.delete(signature)))
    }
    return inflight.get(signature)
  }

  async function ingestOnce(signature) {
    const known = db.getDeposit(signature)
    if (known) return describeDeposit(known)
    const tx = await chain.readTransaction(signature)
    if (!tx) return { signature, status: 'pending' }
    // /deposit accepts any signature: never store rows for transactions that
    // did not touch the game wallet (the table would grow with spam).
    if (tx.touchesWallet === false) return { signature, status: 'ignored', reason: 'NotForGameWallet' }
    return db.transaction(() => {
      const raced = db.getDeposit(signature)
      if (raced) return describeDeposit(raced)
      applyTransaction(signature, tx)
      return describeDeposit(db.getDeposit(signature))
    })
  }

  function applyTransaction(signature, tx) {
    const base = { signature, slot: tx.slot, blockTime: tx.blockTime }
    if (tx.failed) return db.putDeposit({ ...base, status: 'ignored', reason: 'failed' })
    if (tx.inbound.length === 0) {
      if (tx.outbound.length > 0) return db.putDeposit({ ...base, status: 'outgoing' })
      const unmatched = tx.innerInbound.length > 0 || tx.balanceDelta > 0n
      if (unmatched) log.warn(`deposit ${signature}: SOL arrived outside a plain transfer; needs a manual look`)
      return db.putDeposit({ ...base, status: unmatched ? 'unmatched' : 'ignored', amount: tx.balanceDelta > 0n ? tx.balanceDelta : null })
    }
    const stakeMemos = tx.memos.filter((m) => m.trim().startsWith('prophet:'))
    const funding = stakeMemos.length === 0 ? tx.inbound.every((t) => funders.has(t.from)) : stakeMemos.length === 1 && stakeMemos[0].trim() === 'prophet:fund'
    if (funding) {
      const total = tx.inbound.reduce((sum, t) => sum + t.lamports, 0n)
      log.log(`game wallet funded with ${total} lamports by ${tx.inbound[0].from}`)
      return db.putDeposit({ ...base, wallet: tx.inbound[0].from, amount: total, memo: stakeMemos[0] ?? null, status: 'funding' })
    }
    const memo = stakeMemos.length === 1 ? parseStakeMemo(stakeMemos[0]) : null
    if (tx.inbound.length !== 1 || !memo || tx.blockTime == null) {
      const reason = tx.inbound.length !== 1 ? 'MultipleTransfers' : tx.blockTime == null ? 'NoBlockTime' : 'NoStakeMemo'
      // One refund per sender per transaction: N tiny transfers in one tx
      // used to cost us N refund fees for the sender's one.
      const bySender = new Map()
      for (const t of tx.inbound) bySender.set(t.from, (bySender.get(t.from) ?? 0n) + t.lamports)
      let refunded = false
      for (const [from, lamports] of bySender) refunded = refundDeposit(`${signature}:${from}`, from, lamports) || refunded
      const total = tx.inbound.reduce((sum, t) => sum + t.lamports, 0n)
      // Dust too small to refund is kept (and counted as earned by the fee ledger).
      return db.putDeposit({ ...base, wallet: tx.inbound[0].from, amount: total, memo: stakeMemos.join(' | ') || null, status: refunded ? 'refunded' : 'kept', reason })
    }
    const [transfer] = tx.inbound
    const record = { ...base, wallet: transfer.from, amount: transfer.lamports, memo: stakeMemos[0], gameKind: memo.kind, gameId: memo.id }
    try {
      applyStake(memo, { wallet: transfer.from, amount: transfer.lamports, time: tx.blockTime })
      db.putDeposit({ ...record, status: 'accepted' })
    } catch (error) {
      if (!(error instanceof RuleError)) throw error
      const refunded = refundDeposit(signature, transfer.from, transfer.lamports)
      db.putDeposit({ ...record, status: refunded ? 'refunded' : 'kept', reason: error.code })
    }
  }

  function refundDeposit(key, wallet, amount) {
    // The refund's own network fee comes out of it, so bouncing deposits off
    // the game wallet can never drain the fee reserve.
    const net = amount - BASE_FEE
    if (net < opts.minRefund) return false
    return db.addPayout({ key: `deposit:${key}`, kind: 'refund', wallet, amount: net })
  }

  function describeDeposit(row) {
    return {
      signature: row.signature,
      status: row.status,
      reason: row.reason,
      wallet: row.wallet,
      amount: row.amount,
      game: row.game_kind ? { kind: row.game_kind, id: row.game_id } : null,
      refund: row.status === 'refunded' ? 'queued' : null,
    }
  }

  /**
   * First start on a wallet: whatever it did before belongs to no game, so
   * its history is recorded as pre-existing instead of being refunded.
   */
  async function init() {
    // One database belongs to one game wallet: what it says we owe is only
    // true for the wallet that took the stakes.
    const owner = db.getMeta('game_wallet')
    if (owner && owner !== chain.address) throw new Error(`this database belongs to game wallet ${owner}, not ${chain.address}`)
    if (!owner) db.setMeta('game_wallet', chain.address)
    if (db.getMeta('initialized')) return
    // A brand-new database next to a wallet that already has history is
    // either the first deploy or a LOST database. In the second case every
    // live stake would be forgotten as "pre-existing" and the whole balance
    // would look like surplus to sweep. Make the operator say which it is.
    const firstPage = await chain.signatures(undefined)
    if (firstPage.length > 0 && !adoptWallet) {
      throw new Error(
        `game wallet ${chain.address} already has ${firstPage.length >= 1000 ? '1000+' : firstPage.length} transaction(s) but this database is new. ` +
          'If this is a fresh wallet that was only funded, restart with ADOPT_WALLET=1. If a database was lost, restore it from backup instead - ' +
          'adopting would forget every live stake.',
      )
    }
    let before
    let count = 0
    for (;;) {
      const signatures = await chain.signatures(before)
      db.transaction(() => {
        for (const { signature, slot, blockTime } of signatures) {
          if (!db.getDeposit(signature)) db.putDeposit({ signature, slot, blockTime, status: 'preexisting' })
        }
      })
      count += signatures.length
      if (signatures.length < 1000) break
      before = signatures[signatures.length - 1].signature
    }
    db.setMeta('initialized', now())
    log.log(`game wallet history: ${count} earlier transaction(s) recorded as pre-existing`)
  }

  /**
   * Reads signature pages older than `before` until a fully known page or
   * the end of history, at most `opts.scanPages` pages. Collects the unknown
   * ones into `fresh`; returns where to continue, or null when done.
   */
  async function collect(before, fresh) {
    for (let page = 0; page < opts.scanPages; page++) {
      const signatures = await chain.signatures(before)
      const unknown = signatures.filter((s) => !db.getDeposit(s.signature))
      fresh.push(...unknown)
      if (unknown.length === 0 || signatures.length < 1000) return null
      before = signatures[signatures.length - 1].signature
    }
    return before
  }

  /**
   * Catches every transaction that touched the game wallet, including stakes
   * whose sender never told the API. Newest pages first until a fully known
   * page, then applied oldest first.
   *
   * After a long outage the unknown history can be longer than one pass
   * reads. Where a pass stopped is stored (meta `scan_cursors`) and later
   * passes keep reading from there until they meet known history; until
   * then games do not settle (the backlog may hold their stakes).
   */
  async function scanDeposits() {
    const fresh = []
    const cursors = JSON.parse(db.getMeta('scan_cursors') ?? '[]')
    const head = await collect(undefined, fresh)
    if (head) cursors.push(head)
    else if (cursors.length > 0) {
      // Newest history is caught up: spend this pass on the oldest backlog.
      const next = await collect(cursors[0], fresh)
      if (next) cursors[0] = next
      else cursors.shift()
    }
    db.setMeta('scan_cursors', JSON.stringify(cursors))
    if (cursors.length > 0) log.warn(`deposit scan: older history still being read (${cursors.length} backlog cursor(s))`)
    let pending = cursors.length
    // A signature listed long ago that still cannot be read (dropped fork,
    // unsupported version) would stay pending forever and freeze every
    // game's settlement; past this many finalized slots it is given up on.
    const finalized = chain.finalizedSlot ? await chain.finalizedSlot().catch(() => 0) : 0
    for (const { signature, slot } of fresh.reverse()) {
      try {
        const result = await ingest(signature)
        if (result.status !== 'pending') continue
        if (finalized > 0 && slot != null && slot < finalized - opts.unreadableAfterSlots) {
          db.putDeposit({ signature, slot, status: 'dropped', reason: 'NeverReadable' })
          log.error(`deposit ${signature}: unreadable ${finalized - slot} slots after finalization; marked dropped - check by hand`)
          continue
        }
        pending++
      } catch (error) {
        // A 429/timeout on one transaction: count it as pending (games keep
        // waiting for it) and keep ingesting the rest.
        pending++
        log.warn(`scan ${signature}: ${error.message.split('\n')[0]}`)
      }
    }
    setLastScan({ at: now(), pending })
    return { scanned: fresh.length, pending }
  }

  return { ingest, init, scanDeposits }
}
