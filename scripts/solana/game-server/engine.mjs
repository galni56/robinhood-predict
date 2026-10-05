// The game server's engine: turns SOL that reaches the game wallet into
// bets and arena entries, runs every game through its timers with boundary
// prices from the price service, and pays winners, refunds and creator fees
// from the game wallet.
//
// Money rules:
// - A stake is a top-level System transfer to the game wallet with one
//   `prophet:` memo (rules.mjs). Each transaction signature is applied once.
// - Anything that cannot be applied (late, wrong game, over the limit, no
//   memo...) is refunded to the sender, minus nothing, when it is at least
//   MIN_REFUND; smaller dust is kept so nobody can make us pay fees in a loop.
// - Every transfer we owe is first written to the payouts outbox. It is
//   signed, its signature and blockhash expiry are stored, and only then is
//   it broadcast. A stored transaction is only rebuilt once its blockhash has
//   expired without it landing, so a crash or a lost send never pays twice.
// - Everything beyond what players are owed (Prophet's fees) can be swept to
//   the owner's cold wallet, so the hot wallet holds as little as possible.
// - Top-ups of the game wallet itself (fee money) come from the cold wallet
//   or the admin, or carry the memo `prophet:fund`; they are never refunded.

import { createPublicKey, verify, createHash } from 'node:crypto'
import {
  ARENA,
  COMMUNITY_POLICY,
  COMMUNITY_RACE_DURATIONS,
  RACE,
  RuleError,
  STAKE,
  addLobbyAsset,
  arenaDeposit,
  arenaNeedsResolve,
  arenaSettlements,
  arenaTimers,
  changePrediction,
  createArena,
  createCommunityRace,
  createPlatformRace,
  parseStakeMemo,
  placeBet,
  raceActiveCount,
  raceNeedsResolve,
  raceNeedsStart,
  raceSettlements,
  raceTimers,
  resolveArena,
  resolveRace,
  startRace,
} from './rules.mjs'
import { BASE_FEE, RENT_EXEMPT_MINIMUM, fromBase58, isAddress } from './chain.mjs'
import { DUEL, backDuel, createDuel, duelNeedsResolve, duelNeedsStart, duelSettlements, duelTimers, joinDuel, leaveDuel, payDuel, prepareDuel, readyDuel, resolveDuel, startDuel } from './duel.mjs'
import { FINAL_STATUSES } from './db.mjs'

const LAMPORTS_PER_SOL = 1_000_000_000n

export const DEFAULTS = {
  /** Wait this long past a boundary for late stakes to show up and for the
   * boundary's slots to finalize (~13s on mainnet) before settling. */
  settleDelay: 15,
  /** Smaller unusable deposits are kept instead of refunded. */
  minRefund: LAMPORTS_PER_SOL / 1_000n,
  /** Creator fees are sent once they reach this (must exceed rent exemption). */
  creatorPayoutMin: LAMPORTS_PER_SOL / 1_000n,
  /** Kept in the hot wallet above what is owed, for transaction fees. */
  reserve: LAMPORTS_PER_SOL / 50n,
  /** Sweep surplus to the cold wallet once it reaches this. */
  sweepMin: LAMPORTS_PER_SOL / 10n,
  sweepEverySeconds: 3_600,
  /** Signed actions must be this fresh. */
  messageMaxAge: 300,
  maxOpenGamesPerWallet: 3,
  maxOpenCommunityGames: 50,
  maxPayoutAttempts: 6,
  rebroadcastEverySeconds: 8,
  arenaLobbyDuration: ARENA.lobbyDuration,
  /** A listed signature still unreadable this many slots below the
   * finalized slot is marked dropped instead of blocking settlement. */
  unreadableAfterSlots: 300,
  /** Spectators may back one duel racer with up to this much (USD cents). */
  duelBackCapUsdCents: 10_000,
}

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

/** Verifies a wallet's ed25519 signature over `message` (UTF-8). */
export function verifyWalletSignature(wallet, message, signatureBase64) {
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(fromBase58(wallet))]), format: 'der', type: 'spki' })
  const signature = Buffer.from(signatureBase64, 'base64')
  return signature.length === 64 && verify(null, Buffer.from(message, 'utf8'), key, signature)
}

/** Catalog assets (config/solana-assets.json) the games may use. */
export function catalogAssets(catalog) {
  return catalog.assets
    // Stocks are off (owner decision, 2026-10-05): memes and crypto only.
    .filter((a) => a.approved !== false && a.category !== 'STOCK')
    .map((a) => ({
      symbol: a.symbol,
      name: a.name,
      category: a.category.toLowerCase(),
      priceSource: a.pool,
      priceDecimals: a.priceDecimals,
      enabled: true,
      mint: a.mint,
      logoUrl: a.icon ?? null,
      priceUrl: a.priceUrl ?? null,
      source: a.source ?? 'catalog',
      ...(a.source === 'pumpswap' ? { liquidityUsd: a.liquidityUsd, volume24hUsd: a.volume24hUsd, poolCreatedAt: a.poolCreatedAt, addedAt: a.addedAt } : {}),
    }))
}

/**
 * @param {object} o
 * @param {ReturnType<import('./db.mjs').openDatabase>} o.db
 * @param {ReturnType<import('./chain.mjs').createChain>} o.chain
 * @param {{ boundary(target: number, sources: string[]): Promise<{prevSlot:number, prevBlockTime:number, prices:Record<string,bigint>, decimals:Record<string,number>, attestation:object}> }} o.prices
 * @param {ReturnType<typeof catalogAssets>} o.assets
 * @param {string} o.cluster
 * @param {string|null} [o.coldWallet] owner's wallet that receives swept surplus
 * @param {string} [o.admin] wallet credited as creator of platform races
 * @param {() => number} [o.clock] unix seconds
 */
export function createEngine({ db, chain, prices, assets, cluster, coldWallet = null, admin = null, adoptWallet = false, signingDomains = null, clock, log = console, options = {} }) {
  const opts = { ...DEFAULTS, ...options }
  const now = clock ?? (() => Math.floor(Date.now() / 1000))
  // Replaced when the PumpSwap catalog refreshes (setAssets).
  let currentAssets = assets
  let assetBySymbol = new Map(assets.map((a) => [a.symbol, a]))
  const platformCreator = admin ?? chain.address
  const funders = new Set([coldWallet, admin].filter(Boolean))
  let lastScan = { at: 0, pending: 0 }
  let lastSweepCheck = 0
  const lastBroadcast = new Map()

  // ------------------------------------------------------------ deposits

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
      for (const [from, lamports] of bySender) refundDeposit(`${signature}:${from}`, from, lamports)
      const total = tx.inbound.reduce((sum, t) => sum + t.lamports, 0n)
      return db.putDeposit({ ...base, wallet: tx.inbound[0].from, amount: total, memo: stakeMemos.join(' | ') || null, status: 'refunded', reason })
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

  function applyStake(memo, stake) {
    const game = db.getGame(memo.kind, memo.id)
    if (!game) throw new RuleError('GameNotFound')
    if (memo.kind === 'race') placeBet(game, { ...stake, assetIndex: memo.assetIndex })
    else if (memo.kind === 'arena') arenaDeposit(game, { ...stake, prediction: memo.prediction })
    else if (memo.seat === 0) payDuel(game, stake)
    else backDuel(game, { ...stake, seat: memo.seat, maxPerWallet: duelBackCap() })
    db.saveGame(game)
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
   * Catches every transaction that touched the game wallet, including stakes
   * whose sender never told the API. Newest pages first until a fully known
   * page, then applied oldest first.
   */
  async function scanDeposits() {
    const fresh = []
    let before
    for (let page = 0; page < 20; page++) {
      const signatures = await chain.signatures(before)
      const unknown = signatures.filter((s) => !db.getDeposit(s.signature))
      fresh.push(...unknown)
      if (unknown.length === 0 || signatures.length < 1000) break
      before = signatures[signatures.length - 1].signature
    }
    let pending = 0
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
    lastScan = { at: now(), pending }
    return { scanned: fresh.length, pending }
  }

  // -------------------------------------------------------------- games

  /** Loads a game fresh, applies `fn`, saves it and queues what it now owes. */
  function mutate(kind, id, fn) {
    return db.transaction(() => {
      const game = db.getGame(kind, id)
      if (!game) throw new RuleError('GameNotFound')
      const wasFinal = FINAL_STATUSES.has(game.status)
      const result = fn(game)
      db.saveGame(game)
      if (!wasFinal && FINAL_STATUSES.has(game.status)) queueSettlements(game)
      return result
    })
  }

  /** Money the duel rules moved outside settlement (leaves, kicks, tax shares). */
  function queueDuelTransfers(duel, transfers, tag) {
    transfers.forEach((tr, i) => {
      db.addPayout({ key: `duel:${duel.id}:${tag}:${i}:${tr.reason}:${tr.wallet}`, kind: tr.reason === 'tax-share' ? 'tax-share' : 'refund', wallet: tr.wallet, amount: tr.amount, gameKind: 'duel', gameId: duel.id })
    })
  }

  function queueSettlements(game) {
    const raw = game.kind === 'race' ? raceSettlements(game) : game.kind === 'arena' ? arenaSettlements(game) : duelSettlements(game)
    // One payout per wallet and reason (a spectator may have backed twice).
    const merged = new Map()
    for (const s of raw) {
      const key = `${s.reason}:${s.wallet}`
      merged.set(key, { ...s, amount: (merged.get(key)?.amount ?? 0n) + s.amount })
    }
    const settlements = [...merged.values()]
    for (const s of settlements) {
      db.addPayout({ key: `${game.kind}:${game.id}:${s.reason}:${s.wallet}`, kind: s.reason, wallet: s.wallet, amount: s.amount, gameKind: game.kind, gameId: game.id })
    }
    // Platform races and duels credit Prophet; their creator half stays with the fees.
    const creatorPaid = game.kind === 'arena' || (game.kind === 'race' && game.origin === 'community')
    if (game.status === 'resolved' && creatorPaid && game.creatorFee > 0n) {
      const balance = db.creatorBalance(game.creator) + game.creatorFee
      if (balance >= opts.creatorPayoutMin) {
        db.addPayout({ key: `creator:${game.creator}:${game.kind}:${game.id}`, kind: 'creator', wallet: game.creator, amount: balance, gameKind: game.kind, gameId: game.id })
        db.setCreatorBalance(game.creator, 0n)
      } else {
        db.setCreatorBalance(game.creator, balance)
      }
    }
    log.log(`${game.kind} #${game.id}: ${game.status}${game.cancelReason && game.cancelReason !== 'none' ? ` (${game.cancelReason})` : ''}, ${settlements.length} payout(s) queued`)
  }

  /** Prices at a boundary, checked against what each asset expects. */
  async function boundaryPrices(target, assetsNeeded) {
    const result = await prices.boundary(target, [...new Set(assetsNeeded.map((a) => a.priceSource))])
    for (const a of assetsNeeded) {
      if (result.decimals[a.priceSource] !== a.priceDecimals) throw new Error(`price decimals changed for ${a.symbol}`)
    }
    return result
  }

  const attestationRecord = (b) => ({ prevSlot: b.prevSlot, prevBlockTime: b.prevBlockTime, ...b.attestation })

  /** Every stake confirmed before `boundary` is visible once this is true. */
  const settledPast = (boundary, t) => t >= boundary + opts.settleDelay && lastScan.at >= boundary + opts.settleDelay && lastScan.pending === 0

  async function advanceRace(race, t) {
    const { id } = race
    if (race.status === 'lobby') {
      if (t >= race.lobbyEndTime) mutate('race', id, (r) => raceTimers(r, t))
      return
    }
    if (race.status === 'betting') {
      if (!settledPast(race.bettingEndTime, t)) {
        // A stuck scan must not freeze stakes: once the start window has
        // expired the race cancels and refunds anyway (late-ingested stakes
        // on a cancelled race are refunded as they arrive).
        if (t >= race.bettingEndTime + race.startGrace) mutate('race', id, (r) => raceTimers(r, t))
        return
      }
      if (!raceNeedsStart(race, t) || raceActiveCount(race) < race.minActiveContenders) {
        // Past the start window, or too few backed assets: cancel and refund.
        mutate('race', id, (r) => raceTimers(r, t) ?? startRace(r, { prices: {}, prevSlot: 0, prevBlockTime: 0 }, t))
        return
      }
      const active = race.assets.filter((a) => a.pool > 0n)
      const b = await boundaryPrices(race.bettingEndTime, active)
      mutate('race', id, (r) => {
        if (!raceNeedsStart(r, t)) return null
        r.startAttestation = attestationRecord(b)
        return startRace(r, b, t)
      })
      return
    }
    if (race.status === 'running' && t >= race.raceEndTime) {
      if (!raceNeedsResolve(race, t)) {
        mutate('race', id, (r) => raceTimers(r, t))
        return
      }
      const b = await boundaryPrices(race.raceEndTime, race.assets.filter((a) => a.active))
      mutate('race', id, (r) => {
        if (!raceNeedsResolve(r, t)) return null
        r.endAttestation = attestationRecord(b)
        return resolveRace(r, b, t)
      })
    }
  }

  async function advanceArena(arena, t) {
    const { id } = arena
    if (arena.status !== 'open') return
    if (t >= arena.startsAt && arena.entries.length < ARENA.minParticipants) {
      if (settledPast(arena.startsAt, t)) mutate('arena', id, (a) => arenaTimers(a, t))
      return
    }
    if (t < arena.deadline) return
    if (!arenaNeedsResolve(arena, t)) {
      mutate('arena', id, (a) => arenaTimers(a, t))
      return
    }
    const asset = { symbol: arena.symbol, priceSource: arena.priceSource, priceDecimals: arena.priceDecimals }
    const b = await boundaryPrices(arena.deadline, [asset])
    mutate('arena', id, (a) => {
      if (!arenaNeedsResolve(a, t)) return null
      a.finalAttestation = attestationRecord(b)
      return resolveArena(a, { price: b.prices[a.priceSource], prevSlot: b.prevSlot, prevBlockTime: b.prevBlockTime }, t)
    })
  }

  // ------------------------------------------------------------- payouts

  async function processPayouts() {
    const sent = db.payouts('sent')
    if (sent.length > 0) {
      const height = await chain.blockHeight()
      for (let i = 0; i < sent.length; i += 200) {
        const chunk = sent.slice(i, i + 200)
        const statuses = await chain.statuses(chunk.map((p) => p.signature))
        for (const [k, p] of chunk.entries()) {
          const status = statuses[k]
          const landed = status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')
          // Done only once finalized: a confirmed block can (rarely) be rolled
          // back, and a payout marked done there would never be re-sent.
          if (landed && status.err == null && status.confirmationStatus !== 'finalized') continue
          if (landed && status.err == null) {
            db.markDone(p.id)
            lastBroadcast.delete(p.id)
            log.log(`payout #${p.id} ${p.kind}: ${p.amount} lamports to ${p.wallet} done (${p.signature})`)
          } else if (landed) {
            // It landed and failed: no SOL moved, a new transaction is safe.
            lastBroadcast.delete(p.id)
            db.markRetry(p.id, p.attempts >= opts.maxPayoutAttempts ? 'stuck' : 'pending', JSON.stringify(status.err))
            log.warn(`payout #${p.id} failed on chain: ${JSON.stringify(status.err)}`)
          } else if (!status && height > p.last_valid_height) {
            // The blockhash looks expired and the status lookup saw nothing -
            // but a lagging RPC node, or a restart after the status cache
            // rolled over, also returns null for a payout that DID land.
            // Re-signing on that alone pays twice. Only rebuild once
            // finalized history confirms the transaction never landed.
            if ((await chain.finalizedBlockHeight()) <= p.last_valid_height) continue
            const final = await chain.finalizedTransaction(p.signature)
            lastBroadcast.delete(p.id)
            if (final && final.err == null) {
              db.markDone(p.id)
              log.log(`payout #${p.id} ${p.kind}: found landed in finalized history (${p.signature})`)
            } else {
              const reason = final ? JSON.stringify(final.err) : 'expired before landing'
              db.markRetry(p.id, p.attempts >= opts.maxPayoutAttempts ? 'stuck' : 'pending', reason)
            }
          } else if (!status && (now() - (lastBroadcast.get(p.id) ?? 0)) >= opts.rebroadcastEverySeconds) {
            lastBroadcast.set(p.id, now())
            chain.broadcast(p.tx).catch((error) => log.warn(`payout #${p.id} rebroadcast: ${error.message.split('\n')[0]}`))
          }
        }
      }
    }

    const pending = db.payouts('pending')
    if (pending.length === 0) return
    let balance = await chain.balance()
    for (const p of pending) {
      const amount = BigInt(p.amount)
      if (balance - amount - BASE_FEE * 2n < RENT_EXEMPT_MINIMUM) {
        log.warn(`payout #${p.id}: game wallet balance ${balance} is too low for ${amount}; waiting`)
        continue
      }
      const prepared = await chain.preparePayout({ to: p.wallet, lamports: amount, memo: `prophet:payout:${p.id}` })
      if (!db.markSent(p.id, prepared.signature, prepared.lastValidBlockHeight, prepared.serialized)) continue
      lastBroadcast.set(p.id, now())
      try {
        await chain.broadcast(prepared.serialized)
      } catch (error) {
        // Stays `sent`: it is retried only after its blockhash expires.
        log.warn(`payout #${p.id} send: ${error.message.split('\n')[0]}`)
      }
      balance -= amount + BASE_FEE
    }
  }

  /** What the game wallet owes: stakes in live games, queued payouts, creator balances. */
  function liabilities() {
    const live = db.liveGames().reduce((sum, g) => sum + g.remainingLiability, 0n)
    return live + db.owedTotal() + db.creatorBalancesTotal()
  }

  async function solvency() {
    const balance = await chain.balance()
    const owed = liabilities()
    return { balance, owed, surplus: balance - owed - RENT_EXEMPT_MINIMUM }
  }

  async function maybeSweep(t) {
    if (!coldWallet || t - lastSweepCheck < opts.sweepEverySeconds) return
    // The wallet balance already includes stakes the scanner has not applied
    // yet; counting them as surplus would sweep money we owe.
    if (lastScan.pending > 0 || now() - lastScan.at > opts.sweepEverySeconds + 60) return
    lastSweepCheck = t
    const { surplus } = await solvency()
    const amount = surplus - opts.reserve
    if (amount >= opts.sweepMin) {
      db.addPayout({ key: `sweep:${t}`, kind: 'sweep', wallet: coldWallet, amount })
      log.log(`sweeping ${amount} lamports of surplus to the cold wallet`)
    }
  }

  // --------------------------------------------------------------- duels

  // SOL/USD for the spectator cap; refreshed every tick when the service has it.
  let solUsd = null
  const duelBackCap = () => (solUsd ? (BigInt(opts.duelBackCapUsdCents) * LAMPORTS_PER_SOL * 10n ** BigInt(solUsd.decimals)) / (solUsd.raw * 100n) : LAMPORTS_PER_SOL / 2n)
  const kicksThisWeek = (wallet) => db.kicksSince(wallet, now() - 7 * 24 * 3600)

  async function advanceDuel(duel, t) {
    const { id } = duel
    if (duel.status === 'open' || duel.status === 'ready' || duel.status === 'starting' || duel.status === 'running') {
      mutate('duel', id, (d) => {
        const { transfers, kicked } = duelTimers(d, t, kicksThisWeek)
        for (const wallet of kicked) db.addKick(wallet, t)
        if (transfers.length) queueDuelTransfers(d, transfers, `t${t}`)
      })
    }
    const fresh = db.getGame('duel', id)
    if (fresh.status === 'starting' && t >= fresh.startTime + 2 && duelNeedsStart(fresh, t)) {
      const b = await boundaryPrices(fresh.startTime, fresh.racers.map((r) => ({ symbol: r.symbol, priceSource: r.priceSource, priceDecimals: r.priceDecimals })))
      mutate('duel', id, (d) => {
        if (!duelNeedsStart(d, t)) return null
        d.startAttestation = attestationRecord(b)
        return startDuel(d, b, t)
      })
    } else if (fresh.status === 'running' && duelNeedsResolve(fresh, t)) {
      const b = await boundaryPrices(fresh.endTime, fresh.racers.map((r) => ({ symbol: r.symbol, priceSource: r.priceSource, priceDecimals: r.priceDecimals })))
      mutate('duel', id, (d) => {
        if (!duelNeedsResolve(d, t)) return null
        d.endAttestation = attestationRecord(b)
        return resolveDuel(d, b, t)
      })
    }
  }

  /** Keeps DUEL.emptyLobbies empty lobbies waiting for racers. */
  function fillDuelLobbies(t) {
    const empty = db.liveGames().filter((g) => g.kind === 'duel' && g.status === 'open' && g.racers.length === 0).length
    for (let i = empty; i < DUEL.emptyLobbies; i++) {
      db.transaction(() => db.saveGame(createDuel(db.nextId('duel'), t)))
    }
  }

  // ---------------------------------------------------------------- tick

  let running = false
  async function tick() {
    if (running) return
    running = true
    // Each stage is isolated: an RPC error in the scan or a slow price
    // service must never stop winners from being paid (or vice versa).
    const stage = async (name, fn) => {
      try {
        await fn()
      } catch (error) {
        log.warn(`tick ${name}: ${error.message.split('\n')[0]}`)
      }
    }
    try {
      await stage('scan', scanDeposits)
      // Payouts run before game advancement: boundary price fetches can take
      // seconds each, and they must never hold up winners being paid.
      await stage('payouts', processPayouts)
      const t = now()
      if (prices?.solUsd) solUsd = await prices.solUsd().catch(() => solUsd)
      await stage('lobbies', async () => fillDuelLobbies(t))
      for (const game of db.liveGames()) {
        try {
          if (game.kind === 'race') await advanceRace(game, t)
          else if (game.kind === 'arena') await advanceArena(game, t)
          else await advanceDuel(game, t)
        } catch (error) {
          log.warn(`${game.kind} #${game.id}: ${error.message}`)
        }
      }
      // Second pass: settlements queued by this tick go out right away.
      await stage('payouts', processPayouts)
      // Older than twice the message lifetime: any replay is rejected as expired.
      await stage('replay-guard', async () => db.pruneMessages(t - 2 * opts.messageMaxAge))
      await stage('sweep', () => maybeSweep(t))
    } finally {
      running = false
    }
  }

  // ------------------------------------------------------------- actions

  const openGamesBy = (wallet) => db.liveGames().filter((g) => g.creator === wallet)
  const openCommunityGames = () => db.liveGames().filter((g) => g.kind === 'arena' || g.origin === 'community')

  function requireAsset(symbol) {
    const asset = assetBySymbol.get(symbol)
    if (!asset) throw new RuleError('AssetNotApproved')
    return asset
  }

  function requireCreationRoom(wallet) {
    if (openGamesBy(wallet).length >= opts.maxOpenGamesPerWallet) throw new RuleError('TooManyOpenGames')
    if (openCommunityGames().length >= opts.maxOpenCommunityGames) throw new RuleError('TooManyOpenGames')
  }

  /**
   * A wallet-signed action. `message` is "Prophet\n" + JSON with `action`,
   * `wallet`, `cluster`, `issuedAt` and the action's fields; the signature is
   * the wallet's signMessage over it (base64).
   */
  function act({ message, signature }) {
    if (typeof message !== 'string' || !message.startsWith('Prophet\n')) throw new RuleError('BadMessage')
    let payload
    try {
      payload = JSON.parse(message.slice('Prophet\n'.length))
    } catch {
      throw new RuleError('BadMessage')
    }
    const { action, wallet, issuedAt } = payload
    if (!isAddress(wallet) || payload.cluster !== cluster) throw new RuleError('BadMessage')
    // Domain binding: a signature collected on a look-alike site is useless
    // here. The nonce makes every signed message unique, so two identical
    // actions in the same second are not mistaken for a replay.
    if (signingDomains && !signingDomains.includes(payload.domain)) throw new RuleError('WrongDomain')
    if (typeof payload.nonce !== 'string' || !/^[0-9a-f]{16,64}$/.test(payload.nonce)) throw new RuleError('BadMessage')
    if (!Number.isInteger(issuedAt) || Math.abs(now() - issuedAt) > opts.messageMaxAge) throw new RuleError('MessageExpired')
    if (typeof signature !== 'string' || !verifyWalletSignature(wallet, message, signature)) throw new RuleError('BadSignature')
    const t = now()
    return db.transaction(() => {
      // Keyed on the signed message itself, not the signature string: base64
      // decoding is lenient (padding, url-safe alphabet, whitespace), so one
      // signature has many spellings and keying on the text let a replay
      // through within the message lifetime.
      try {
        db.useMessage(`msg:${createHash('sha256').update(message).digest('hex')}`, wallet)
      } catch {
        throw new RuleError('MessageReused')
      }
      switch (action) {
        case 'create-race': {
          requireCreationRoom(wallet)
          const symbols = Array.isArray(payload.assets) ? payload.assets : []
          const race = createCommunityRace(db.nextId('race'), {
            title: payload.title, category: payload.category, creator: wallet, raceDuration: payload.duration, unit: payload.unit,
          }, symbols.map(requireAsset), t)
          db.saveGame(race)
          return { kind: 'race', id: race.id }
        }
        case 'add-lobby-asset':
          mutate('race', Number(payload.race), (r) => addLobbyAsset(r, wallet, requireAsset(payload.asset), t))
          return { kind: 'race', id: Number(payload.race) }
        case 'create-arena': {
          requireCreationRoom(wallet)
          const arena = createArena(db.nextId('arena'), { title: payload.title, creator: wallet, duration: payload.duration, unit: payload.unit }, requireAsset(payload.asset), t, opts.arenaLobbyDuration)
          db.saveGame(arena)
          return { kind: 'arena', id: arena.id }
        }
        case 'change-prediction': {
          if (!/^\d{1,30}$/.test(String(payload.prediction))) throw new RuleError('InvalidPrediction')
          mutate('arena', Number(payload.arena), (a) => changePrediction(a, { wallet, prediction: BigInt(payload.prediction), time: t }))
          return { kind: 'arena', id: Number(payload.arena) }
        }
        case 'set-nickname': {
          const nickname = String(payload.nickname ?? '').trim()
          if (nickname === '') {
            db.clearNickname(wallet)
            return { nickname: null }
          }
          const bytes = Buffer.byteLength(nickname, 'utf8')
          if (bytes > 24 || /[\u0000-\u001f\u007f]/.test(nickname)) throw new RuleError('InvalidNickname')
          const owner = db.nicknameOwner(nickname.toLowerCase())
          if (owner && owner !== wallet) throw new RuleError('NicknameTaken')
          db.setNickname(wallet, nickname)
          return { nickname }
        }
        case 'duel-create': {
          if (openGamesBy(wallet).filter((g) => g.kind === 'duel').length >= opts.maxOpenGamesPerWallet) throw new RuleError('TooManyOpenGames')
          const duel = createDuel(db.nextId('duel'), t, wallet)
          db.saveGame(duel)
          return { kind: 'duel', id: duel.id }
        }
        case 'duel-join': {
          const stake = payload.stake != null && /^\d{1,20}$/.test(String(payload.stake)) ? BigInt(payload.stake) : undefined
          mutate('duel', Number(payload.duel), (d) => joinDuel(d, { wallet, asset: requireAsset(payload.asset), stake, duration: payload.duration, unit: payload.unit, title: payload.title }, t))
          return { kind: 'duel', id: Number(payload.duel) }
        }
        case 'duel-leave':
          mutate('duel', Number(payload.duel), (d) => queueDuelTransfers(d, leaveDuel(d, wallet), `leave${t}`))
          return { kind: 'duel', id: Number(payload.duel) }
        case 'duel-ready':
          mutate('duel', Number(payload.duel), (d) => readyDuel(d, wallet, t))
          return { kind: 'duel', id: Number(payload.duel) }
        case 'duel-prepare':
          mutate('duel', Number(payload.duel), (d) => prepareDuel(d, wallet, t))
          return { kind: 'duel', id: Number(payload.duel) }
        default:
          throw new RuleError('UnknownAction')
      }
    })
  }

  /** A platform race (admin CLI or the schedule). */
  function createPlatform(input) {
    return db.transaction(() => {
      const race = createPlatformRace(db.nextId('race'), {
        startGrace: 300,
        resolutionGrace: 600,
        feeBp: 200,
        minActiveContenders: 2,
        minStake: STAKE.min,
        maxStakePerWallet: STAKE.max,
        ...input,
        creator: platformCreator,
      }, input.symbols.map(requireAsset), now())
      db.saveGame(race)
      return race
    })
  }

  /** Keeps one race per schedule entry open for betting (config/platform-races.json). */
  function fillSchedule(schedule) {
    if (schedule?.enabled !== true) return
    const t = now()
    const live = db.liveGames().filter((g) => g.kind === 'race' && g.origin === 'platform')
    for (const entry of schedule.races) {
      const open = live.some((r) => r.title === entry.title && r.status === 'betting' && r.bettingEndTime > t)
      if (open) continue
      const race = createPlatform({
        title: entry.title,
        category: entry.category.toLowerCase(),
        symbols: entry.symbols,
        bettingStartTime: t,
        bettingEndTime: t + entry.bettingSeconds,
        raceDuration: entry.raceSeconds,
        startGrace: schedule.defaults?.startGraceSeconds ?? 300,
        resolutionGrace: schedule.defaults?.resolutionGraceSeconds ?? 600,
        feeBp: schedule.defaults?.feeBp ?? 200,
        minActiveContenders: schedule.defaults?.minActiveContenders ?? 2,
      })
      log.log(`schedule: race #${race.id} "${race.title}" created`)
    }
  }

  /** A free cheer for a racer (no wallet; the server rate-limits per address). */
  function cheer(duelId, seat) {
    return mutate('duel', Number(duelId), (d) => {
      const r = d.racers.find((x) => x.seat === Number(seat))
      if (!r || d.status === 'resolved' || d.status === 'void') throw new RuleError('NoSuchRacer')
      r.cheers += 1
      return r.cheers
    })
  }

  return {
    init,
    cheer,
    ingest,
    scanDeposits,
    tick,
    act,
    createPlatform,
    fillSchedule,
    processPayouts,
    solvency,
    liabilities,
    get lastScan() {
      return lastScan
    },
    config: () => ({
      cluster,
      gameWallet: chain.address,
      stake: { min: STAKE.min, max: STAKE.max },
      race: { minAssets: RACE.minAssets, maxAssets: RACE.maxAssets, communityDurations: COMMUNITY_RACE_DURATIONS, communityPolicy: COMMUNITY_POLICY },
      arena: { durations: ARENA.durations, lobbyDuration: ARENA.lobbyDuration, maxParticipants: ARENA.maxParticipants, feeBp: ARENA.feeBp },
      duel: { minRacers: DUEL.minRacers, maxRacers: DUEL.maxRacers, durations: DUEL.durations, payWindow: DUEL.payWindow, readyWindow: DUEL.readyWindow, prepareExtra: DUEL.prepareExtra, backCap: duelBackCap(), racerShareBp: Number(DUEL.racerShareBp), feeBp: Number(DUEL.feeBp) },
      assets: currentAssets,
    }),
    setAssets(list) {
      currentAssets = list
      assetBySymbol = new Map(list.map((a) => [a.symbol, a]))
    },
    /** Symbols of assets used by games that are not final yet. */
    liveSymbols() {
      // Duels keep their coins in racers[], races in assets[], arenas in symbol.
      return new Set(db.liveGames().flatMap((g) => (g.kind === 'race' ? g.assets.map((a) => a.symbol) : g.kind === 'duel' ? (g.racers ?? []).map((r) => r.symbol) : [g.symbol])))
    },
  }
}
