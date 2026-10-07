// The payout outbox worker and solvency/sweep: everything that sends SOL
// out of the game wallet. Split out of engine.mjs; the engine owns the
// state machines that queue payouts, this module owns sending them.
//
// Money rules (see engine.mjs header): every transfer is written to the
// outbox, signed, stored with its blockhash expiry, and only then broadcast;
// a stored transaction is rebuilt only once finalized history confirms it
// never landed.

import { BASE_FEE, RENT_EXEMPT_MINIMUM } from './chain.mjs'

/**
 * @param {object} o
 * @param {() => {at: number, pending: number}} o.lastScan current scan state
 */
export function createPayouts({ db, chain, opts, log, now, coldWallet, lastScan: currentScan }) {
  const lastBroadcast = new Map()
  // Payouts that landed (confirmed, no error) but are not finalized yet: the
  // SOL already left the wallet, so solvency must not count them as owed.
  const landedUnfinal = new Map()
  // Base fee plus the priority fee, when one is configured.
  const txFee = chain.payoutFee ?? BASE_FEE
  let lastSweepCheck = 0

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
          if (landed && status.err == null && status.confirmationStatus !== 'finalized') {
            landedUnfinal.set(p.id, BigInt(p.amount))
            continue
          }
          landedUnfinal.delete(p.id)
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
      if (balance - amount - txFee * 2n < RENT_EXEMPT_MINIMUM) {
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
      balance -= amount + txFee
    }
  }

  /** What the game wallet owes: stakes in live games, queued payouts, creator and game balances. */
  function liabilities() {
    const live = db.liveGames().reduce((sum, g) => sum + g.remainingLiability, 0n)
    const inFlight = [...landedUnfinal.values()].reduce((sum, a) => sum + a, 0n)
    return live + db.owedTotal() + db.creatorBalancesTotal() + db.balancesTotal() - inFlight
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
    if (currentScan().pending > 0 || now() - currentScan().at > opts.sweepEverySeconds + 60) return
    lastSweepCheck = t
    const { surplus } = await solvency()
    // Only what the books say we earned, and never more than is really
    // spare: a liability bug can then not turn player stakes into a sweep.
    const fees = db.unsweptFees()
    const spare = surplus - opts.reserve
    const amount = fees < spare ? fees : spare
    if (spare > fees + opts.sweepMin) log.warn(`game wallet holds ${spare - fees} lamports beyond earned fees; left in place for review`)
    if (amount >= opts.sweepMin) {
      db.addPayout({ key: `sweep:${t}`, kind: 'sweep', wallet: coldWallet, amount })
      log.log(`sweeping ${amount} lamports of surplus to the cold wallet`)
    }
  }

  return { processPayouts, liabilities, solvency, maybeSweep }
}
