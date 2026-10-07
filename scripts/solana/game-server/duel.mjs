// Coin duels (the new races, owner design 2026-10-05): every racer brings one
// coin, 2-6 racers pay the same stake, everyone must press "ready", the coin
// with the biggest % gain wins. Spectators back one racer each. Pure rules,
// like rules.mjs: no network, no database, time passed in.
//
// Money:
// - Racers pay the lobby's stake; the winning racer takes all racer stakes.
// - Spectator money on losing racers is split: 30% to the winning racer, 70%
//   to the winner's spectators pro rata (all to the racer if nobody backed him).
// - Prophet's 2% comes only out of winnings (never out of a stake returned).
// - A top tie or a missed price window voids the duel: everything back.
// - Ready check: no timer until the first racer presses "ready"; from then
//   the others have readyWindow (+ one prepareExtra). Before anyone is ready,
//   a paid racer may still leave with the full stake.
// - A paid racer who misses the ready window is kicked: stake back minus a tax
//   (10%, 20% once spectators backed him; doubled after 10 kicks in 7 days),
//   half of it to Prophet, half shared by the racers still in the lobby. His
//   spectators get their money back in full.

import { BP_DENOMINATOR, RuleError, STAKE, calculateReturn, validateTitle } from './rules.mjs'
import { FINAL_STATUSES } from './db.mjs'

export const DUEL = {
  minRacers: 2,
  maxRacers: 6,
  /** Seconds a racer who joined has to pay the stake. */
  payWindow: 120,
  /** Seconds the others have to press "ready" once the first racer did. */
  readyWindow: 60,
  /** One "preparing" press adds this much, once. */
  prepareExtra: 15,
  // Owner, 2026-10-06: memes up to 15 min, crypto up to 30 min.
  durations: { meme: [60, 180, 300, 900], crypto: [60, 300, 900, 1800] },
  feeBp: 200n,
  racerShareBp: 3_000n,
  tax: { baseBp: 1_000n, backedBp: 2_000n, repeatThreshold: 10, repeatMultiplier: 2n },
  /** After this long without start prices the duel is void. */
  startGrace: 300,
  resolutionGrace: 600,
  emptyLobbies: 4,
}

const require = (condition, code) => {
  if (!condition) throw new RuleError(code)
}

export function createDuel(id, now, creator = null) {
  return {
    kind: 'duel',
    id,
    status: 'open',
    creator,
    title: `Duel #${id}`,
    createdAt: now,
    category: null,
    unit: 'price',
    stake: 0n,
    duration: 0,
    nextSeat: 1,
    racers: [],
    backers: [],
    kicks: [],
    readyStartedAt: 0,
    startTime: 0,
    endTime: 0,
    resolvedAt: 0,
    startSlot: 0,
    endSlot: 0,
    winnerSeat: 0,
    cancelReason: null,
    remainingLiability: 0n,
  }
}

const racer = (duel, wallet) => duel.racers.find((r) => r.wallet === wallet)
const paidRacers = (duel) => duel.racers.filter((r) => r.paid)
export const duelSeat = (duel, seat) => duel.racers.find((r) => r.seat === seat)

/**
 * The lobby group of a coin (owner, 2026-10-06: groups never mix in one
 * race): 'crypto' and 'meme' from the reviewed catalog, 'pumpswap' for coins
 * the server adds from PumpSwap, 'prophet' for coins launched on Prophet.
 */
export function duelGroup(asset) {
  if (asset.launchedOnProphet === true) return 'prophet'
  if (asset.source === 'pumpswap') return 'pumpswap'
  return asset.category
}
/** Race lengths: crypto has its own, every meme-like group the meme ones. */
export const durationsFor = (group) => DUEL.durations[group === 'crypto' ? 'crypto' : 'meme']

/** A racer brings a coin. The first one also sets the group, stake, duration and unit. */
export function joinDuel(duel, { wallet, asset, stake, duration, unit, title }, now) {
  require(duel.status === 'open' || duel.status === 'ready', 'DuelClosed')
  require(asset && asset.enabled !== false, 'AssetNotApproved')
  require(asset.category === 'meme' || asset.category === 'crypto', 'AssetNotApproved')
  require(!racer(duel, wallet), 'AlreadyInDuel')
  require(!duel.backers.some((b) => b.wallet === wallet), 'BackersCannotRace')
  require(duel.racers.length < DUEL.maxRacers, 'DuelFull')
  if (duel.racers.length === 0) {
    require(typeof stake === 'bigint' && stake >= STAKE.min && stake <= STAKE.max, 'InvalidStake')
    require(durationsFor(duelGroup(asset)).includes(duration), 'UnsupportedDuration')
    if (title != null && String(title).trim()) {
      validateTitle(String(title).trim())
      duel.title = String(title).trim()
    }
    duel.category = duelGroup(asset)
    duel.stake = stake
    duel.duration = duration
    // Market cap only for memes: bridged crypto's Solana supply is not its real cap.
    duel.unit = unit === 'cap' && duel.category !== 'crypto' ? 'cap' : 'price'
  } else {
    require(duelGroup(asset) === duel.category, 'WrongCategory')
  }
  require(!duel.racers.some((r) => r.symbol === asset.symbol || r.priceSource === asset.priceSource), 'CoinTaken')
  duel.racers.push({
    seat: duel.nextSeat++,
    wallet,
    symbol: asset.symbol,
    priceSource: asset.priceSource,
    priceDecimals: asset.priceDecimals,
    joinedAt: now,
    paid: false,
    paidAmount: 0n,
    ready: false,
    readyDeadline: 0,
    prepared: false,
    cheers: 0,
    startPrice: 0n,
    endPrice: 0n,
    returnValue: 0n,
  })
}

const timerRunning = (duel) => duel.racers.some((r) => r.ready)

/**
 * Leaving: free before paying; after paying only while nobody has pressed
 * "ready" yet - then the stake and his spectators' money go back in full.
 * Returns the transfers to make.
 */
export function leaveDuel(duel, wallet) {
  const r = racer(duel, wallet)
  require(r, 'NotInDuel')
  require(duel.status === 'open' || duel.status === 'ready', 'DuelClosed')
  require(!r.paid || !timerRunning(duel), 'ReadyCheckRunning')
  const transfers = []
  if (r.paid) {
    const backers = duel.backers.filter((b) => b.seat === r.seat)
    transfers.push({ wallet: r.wallet, amount: r.paidAmount, reason: 'refund' })
    for (const b of backers) transfers.push({ wallet: b.wallet, amount: b.amount, reason: 'refund' })
    duel.backers = duel.backers.filter((b) => b.seat !== r.seat)
    duel.remainingLiability -= r.paidAmount + backers.reduce((sum, b) => sum + b.amount, 0n)
  }
  duel.racers = duel.racers.filter((x) => x !== r)
  if (duel.status === 'ready' && paidRacers(duel).length < DUEL.minRacers) duel.status = 'open'
  if (duel.racers.length === 0 && duel.backers.length === 0) resetLobby(duel)
  return transfers
}

function resetLobby(duel) {
  duel.category = null
  duel.stake = 0n
  duel.duration = 0
  duel.unit = 'price'
}

/** The stake transfer (exact amount, confirmed at block time `time`). */
export function payDuel(duel, { wallet, amount, time }) {
  require(duel.status === 'open' || duel.status === 'ready', 'DuelClosed')
  const r = racer(duel, wallet)
  require(r, 'NotInDuel')
  require(!r.paid, 'AlreadyPaid')
  require(amount === duel.stake, 'WrongStakeAmount')
  r.paid = true
  r.paidAmount = amount
  duel.remainingLiability += amount
  // Joining a running ready check: the same minute as everyone else.
  if (duel.status === 'ready' && timerRunning(duel)) r.readyDeadline = time + DUEL.readyWindow
  if (duel.status === 'open' && paidRacers(duel).length >= DUEL.minRacers) startReadyCheck(duel)
}

/** Two or more paid: the ready buttons appear; no timer until someone is ready. */
function startReadyCheck(duel) {
  duel.status = 'ready'
  duel.readyStartedAt = 0
  for (const r of paidRacers(duel)) {
    r.ready = false
    r.prepared = false
    r.readyDeadline = 0
  }
}

/** Spectator money on one paid racer; one racer per spectator; capped. */
export function backDuel(duel, { wallet, seat, amount, time, maxPerWallet }) {
  require(duel.status === 'open' || duel.status === 'ready', 'BettingClosed')
  require(!racer(duel, wallet), 'RacersCannotBack')
  const target = duelSeat(duel, seat)
  require(target && target.paid, 'NoSuchRacer')
  require(amount > 0n, 'AmountZero')
  const mine = duel.backers.filter((b) => b.wallet === wallet)
  require(mine.every((b) => b.seat === seat), 'OneRacerPerBacker')
  const total = mine.reduce((sum, b) => sum + b.amount, 0n) + amount
  require(maxPerWallet == null || total <= maxPerWallet, 'BackLimit')
  duel.backers.push({ wallet, seat, amount, at: time })
  duel.remainingLiability += amount
}

export function readyDuel(duel, wallet, now) {
  require(duel.status === 'ready', 'NoReadyCheck')
  const r = racer(duel, wallet)
  require(r && r.paid, 'NotInDuel')
  require(r.readyDeadline === 0 || now <= r.readyDeadline, 'TooLate')
  if (!timerRunning(duel)) {
    // The first "ready" starts everyone else's minute.
    duel.readyStartedAt = now
    for (const other of paidRacers(duel)) if (other !== r) other.readyDeadline = now + DUEL.readyWindow
  }
  r.ready = true
  maybeStart(duel, now)
}

export function prepareDuel(duel, wallet, now) {
  require(duel.status === 'ready', 'NoReadyCheck')
  const r = racer(duel, wallet)
  require(r && r.paid && !r.ready, 'NotInDuel')
  require(!r.prepared, 'AlreadyPrepared')
  require(r.readyDeadline > 0, 'NoTimerYet')
  require(now <= r.readyDeadline, 'TooLate')
  r.prepared = true
  r.readyDeadline += DUEL.prepareExtra
}

/** Starts the countdown to prices once every paid racer is ready and nobody is still paying. */
function maybeStart(duel, now) {
  const paid = paidRacers(duel)
  if (duel.status !== 'ready' || paid.length < DUEL.minRacers) return
  if (paid.some((r) => !r.ready) || duel.racers.some((r) => !r.paid)) return
  duel.racers = paid
  duel.status = 'starting'
  duel.startTime = now
}

const taxRate = (backed, kicksThisWeek) => {
  const base = backed ? DUEL.tax.backedBp : DUEL.tax.baseBp
  return kicksThisWeek >= DUEL.tax.repeatThreshold ? base * DUEL.tax.repeatMultiplier : base
}

/**
 * Timers: unpaid racers past the pay window leave; paid racers past the
 * ready deadline are kicked with a tax. Returns the money to move:
 * [{ wallet, amount, reason }] and the wallets kicked (for the AFK count).
 * `kicksThisWeek(wallet)` counts earlier kicks.
 */
export function duelTimers(duel, now, kicksThisWeek = () => 0) {
  const transfers = []
  const kicked = []
  if (duel.status === 'open' || duel.status === 'ready') {
    duel.racers = duel.racers.filter((r) => r.paid || now <= r.joinedAt + DUEL.payWindow)
  }
  if (duel.status === 'ready') {
    for (const r of [...duel.racers]) {
      if (!r.paid || r.ready || r.readyDeadline === 0 || now <= r.readyDeadline) continue
      const backers = duel.backers.filter((b) => b.seat === r.seat)
      const tax = (r.paidAmount * taxRate(backers.length > 0, kicksThisWeek(r.wallet))) / BP_DENOMINATOR
      duel.racers = duel.racers.filter((x) => x !== r)
      duel.backers = duel.backers.filter((b) => b.seat !== r.seat)
      transfers.push({ wallet: r.wallet, amount: r.paidAmount - tax, reason: 'kick-refund' })
      for (const b of backers) transfers.push({ wallet: b.wallet, amount: b.amount, reason: 'refund' })
      // Half of the tax to the racers who stayed, half stays with Prophet.
      const stayed = paidRacers(duel)
      const share = stayed.length ? tax / 2n / BigInt(stayed.length) : 0n
      if (share > 0n) for (const s of stayed) transfers.push({ wallet: s.wallet, amount: share, reason: 'tax-share' })
      duel.remainingLiability -= r.paidAmount + backers.reduce((sum, b) => sum + b.amount, 0n)
      duel.kicks.push({ wallet: r.wallet, seat: r.seat, at: now, tax })
      kicked.push(r.wallet)
    }
    if (paidRacers(duel).length < DUEL.minRacers) {
      duel.status = 'open'
      duel.readyStartedAt = 0
      for (const r of duel.racers) {
        r.ready = false
        r.prepared = false
        r.readyDeadline = 0
      }
    } else {
      maybeStart(duel, now)
    }
  }
  if (duel.status === 'open' && duel.racers.length === 0 && duel.backers.length === 0) resetLobby(duel)
  if (duel.status === 'starting' && now > duel.startTime + DUEL.startGrace) voidDuel(duel, now, 'startWindowExpired')
  if (duel.status === 'running' && now > duel.endTime + DUEL.resolutionGrace) voidDuel(duel, now, 'resolutionWindowExpired')
  return { transfers, kicked }
}

function voidDuel(duel, now, reason) {
  duel.status = 'void'
  duel.cancelReason = reason
  duel.resolvedAt = now
}

export const duelNeedsStart = (duel, now) => duel.status === 'starting' && now <= duel.startTime + DUEL.startGrace
export const duelNeedsResolve = (duel, now) => duel.status === 'running' && now >= duel.endTime && now <= duel.endTime + DUEL.resolutionGrace

/** Start prices at the boundary block (the last block before startTime). */
export function startDuel(duel, { prices, prevSlot }, now) {
  require(duelNeedsStart(duel, now), 'InvalidDuelStatus')
  for (const r of duel.racers) {
    const price = prices[r.priceSource]
    require(typeof price === 'bigint' && price > 0n, 'InvalidOraclePrice')
    r.startPrice = price
  }
  duel.startSlot = prevSlot
  duel.endTime = duel.startTime + duel.duration
  duel.status = 'running'
}

export function resolveDuel(duel, { prices, prevSlot }, now) {
  require(duelNeedsResolve(duel, now), 'InvalidDuelStatus')
  let best = null
  let tied = false
  for (const r of duel.racers) {
    const price = prices[r.priceSource]
    require(typeof price === 'bigint' && price > 0n, 'InvalidOraclePrice')
    r.endPrice = price
    r.returnValue = calculateReturn(r.startPrice, price)
    if (best && r.returnValue < best.returnValue) continue
    if (best && r.returnValue === best.returnValue) {
      tied = true
      continue
    }
    best = r
    tied = false
  }
  duel.endSlot = prevSlot
  duel.resolvedAt = now
  if (tied) return voidDuel(duel, now, 'topTie')
  duel.winnerSeat = best.seat
  duel.status = 'resolved'
}

/** What every wallet receives once the duel is final: [{ wallet, amount, reason }]. */
export function duelSettlements(duel) {
  if (!FINAL_STATUSES.has(duel.status)) return []
  if (duel.status !== 'resolved') {
    return [
      ...duel.racers.filter((r) => r.paid).map((r) => ({ wallet: r.wallet, amount: r.paidAmount, reason: 'refund' })),
      ...duel.backers.map((b) => ({ wallet: b.wallet, amount: b.amount, reason: 'refund' })),
    ]
  }
  const winner = duelSeat(duel, duel.winnerSeat)
  const racerPot = duel.racers.reduce((sum, r) => sum + r.paidAmount, 0n)
  const onWinner = duel.backers.filter((b) => b.seat === winner.seat)
  const onWinnerTotal = onWinner.reduce((sum, b) => sum + b.amount, 0n)
  const losingBacked = duel.backers.filter((b) => b.seat !== winner.seat).reduce((sum, b) => sum + b.amount, 0n)
  const racerCut = onWinnerTotal > 0n ? (losingBacked * DUEL.racerShareBp) / BP_DENOMINATOR : losingBacked
  const backersCut = losingBacked - racerCut
  const fee = (gain) => (gain * DUEL.feeBp) / BP_DENOMINATOR
  const racerGain = racerPot - winner.paidAmount + racerCut
  const out = [{ wallet: winner.wallet, amount: winner.paidAmount + racerGain - fee(racerGain), reason: 'win' }]
  // Same wallet backing twice is merged so each spectator gets one payout.
  const byWallet = new Map()
  for (const b of onWinner) byWallet.set(b.wallet, (byWallet.get(b.wallet) ?? 0n) + b.amount)
  for (const [wallet, amount] of byWallet) {
    const gain = onWinnerTotal > 0n ? (backersCut * amount) / onWinnerTotal : 0n
    out.push({ wallet, amount: amount + gain - fee(gain), reason: 'win' })
  }
  return out
}
