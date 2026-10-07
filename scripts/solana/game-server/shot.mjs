// Price Shot (the new arena, owner spec 2026-10-07): one coin per room, every
// player calls its price at the end of the match. Pure rules, like rules.mjs:
// no network, no database, time passed in.
//
// Phases:
// - open:  players join the room (free) and press Ready. Once more than half
//          of them, and at least two, are ready, the ready players go on to
//          the aim phase; the others are left out of this match.
// - aim:   AIM_SECONDS to lock a shot. Lock Shot is two steps: the price goes
//          to the server in a signed message (aimShot, kept secret until the
//          match starts), then the stake is a transfer to the game wallet
//          with memo prophet:shot:<id>:0 (lockShot, like a duel stake).
//          Pressing Lock Shot is what has to happen within the aim: the price
//          must arrive before the aim ends; its transfer then has
//          SHOT.lockGrace more seconds to confirm (shown as "confirming
//          shots"). A stake without a timely price, or confirmed after the
//          grace, is refunded.
// - live:  from the end of aim to the deadline; nothing can change.
// - resolved / cancelled: the closest half wins (settlePredictions, the same
//          math as Price Arena). Winnings and refunds are paid to wallets.

import { unitForGroup, duelGroup } from './duel.mjs'
import { BP_DENOMINATOR, CREATOR_FEE_SHARE_BP, RuleError, STAKE, mulDiv, settlePredictions, validateTitle } from './rules.mjs'

export const SHOT = {
  minPlayers: 2,
  maxPlayers: 10,
  aimSeconds: 30,
  /** After the aim, the stakes of shots locked in time get this long to confirm. */
  lockGrace: 15,
  durations: [60, 5 * 60, 15 * 60, 60 * 60],
  feeBp: 200,
  /** The deadline price must come from a block at most this old. */
  maxPriceStaleness: 60,
  /** No result this long after the deadline cancels the match with refunds. */
  resolutionGrace: 60 * 60,
  /** Longest wait past the aim for the deposit scan before the match starts anyway. */
  startGrace: 5 * 60,
  /** A room nobody has joined for this long closes (it holds no money). */
  idleRoomSeconds: 30 * 60,
}

const require = (condition, code) => {
  if (!condition) throw new RuleError(code)
}

export function createShot(id, input, asset, now) {
  const title = String(input.title ?? '').trim() || `${asset.symbol} price shot`
  validateTitle(title)
  require(SHOT.durations.includes(Number(input.duration)), 'InvalidDuration')
  return {
    kind: 'shot',
    id,
    status: 'open',
    cancelReason: 'none',
    creator: input.creator,
    title,
    symbol: asset.symbol,
    priceSource: asset.priceSource,
    priceDecimals: asset.priceDecimals,
    category: asset.category,
    // Same rule as duels: PumpSwap and Prophet-made coins by market cap.
    unit: unitForGroup(duelGroup(asset)),
    duration: Number(input.duration),
    createdAt: now,
    lastJoinAt: now,
    players: [],
    aimEndsAt: 0,
    deadline: 0,
    resolvedAt: 0,
    feeBp: SHOT.feeBp,
    minStake: STAKE.min,
    maxStake: STAKE.max,
    /** Aimed prices not yet backed by a stake: wallet -> prediction. */
    aims: {},
    entries: [],
    nextPredictionSeq: 0,
    totalPool: 0n,
    remainingLiability: 0n,
    finalPrice: 0n,
    finalSlot: 0,
    finalPriceTime: 0,
    winnerCount: 0,
    protocolFee: 0n,
    creatorFee: 0n,
  }
}

const player = (shot, wallet) => shot.players.find((p) => p.wallet === wallet)

export function joinShot(shot, wallet, now) {
  require(shot.status === 'open', 'RoomClosed')
  require(!player(shot, wallet), 'AlreadyInRoom')
  require(shot.players.length < SHOT.maxPlayers, 'RoomFull')
  shot.players.push({ wallet, ready: false, joinedAt: now })
  shot.lastJoinAt = now
}

export function leaveShot(shot, wallet) {
  require(shot.status === 'open', 'RoomClosed')
  require(player(shot, wallet), 'NotInRoom')
  shot.players = shot.players.filter((p) => p.wallet !== wallet)
}

/** Ready (or not ready again). More than half ready, at least two: aim starts. */
export function readyShot(shot, wallet, ready, now) {
  require(shot.status === 'open', 'RoomClosed')
  const p = player(shot, wallet)
  require(p, 'NotInRoom')
  p.ready = ready !== false
  const readyCount = shot.players.filter((x) => x.ready).length
  if (readyCount >= SHOT.minPlayers && readyCount * 2 > shot.players.length) {
    shot.players = shot.players.filter((x) => x.ready)
    shot.status = 'aim'
    shot.aimEndsAt = now + SHOT.aimSeconds
  }
}

/** Lock Shot, step 1 (signed message): the price, secret until the match starts. */
export function aimShot(shot, { wallet, prediction }, now) {
  require(shot.status === 'aim' && now < shot.aimEndsAt, 'AimClosed')
  require(player(shot, wallet), 'NotInMatch')
  require(!shot.entries.some((e) => e.player === wallet), 'AlreadyLocked')
  require(typeof prediction === 'bigint' && prediction > 0n, 'InvalidPrediction')
  shot.aims = { ...(shot.aims ?? {}), [wallet]: { prediction, at: now } }
}

/** Lock Shot, step 2: the stake transfer, confirmed at block time `time`. */
export function lockShot(shot, { wallet, amount, time }) {
  require(shot.status === 'aim' && time < shot.aimEndsAt + SHOT.lockGrace, 'AimClosed')
  require(player(shot, wallet), 'NotInMatch')
  require(!shot.entries.some((e) => e.player === wallet), 'AlreadyLocked')
  const aim = shot.aims?.[wallet]
  require(aim != null && aim.at < shot.aimEndsAt, 'NoAimedPrice')
  const { prediction } = aim
  const stake = amount
  require(typeof stake === 'bigint' && stake >= shot.minStake && stake <= shot.maxStake, 'InvalidStake')
  shot.entries.push({ player: wallet, prediction, stake, lockedAt: time, predictionSeq: shot.nextPredictionSeq++, payout: 0n, rank: 0, accuracyMultiplierBp: 0 })
  shot.totalPool += stake
  shot.remainingLiability += stake
}

function cancelShot(shot, now, reason) {
  shot.status = 'cancelled'
  shot.cancelReason = reason
  shot.resolvedAt = now
  shot.remainingLiability = 0n
  return shot.status
}

/** When the match starts: the aim plus the window for stakes to confirm. */
export const shotStartsAt = (shot) => shot.aimEndsAt + SHOT.lockGrace

/** Every player who sent a price in time has a confirmed stake: nothing left to wait for. */
export const allAimsLocked = (shot) => Object.keys(shot.aims ?? {}).every((w) => shot.entries.some((e) => e.player === w))

/** Aim end, idle rooms, missed resolution window. */
export function shotTimers(shot, now) {
  if (shot.status === 'open' && shot.players.length === 0 && now - shot.lastJoinAt > SHOT.idleRoomSeconds) return cancelShot(shot, now, 'idleRoom')
  // The match starts once the aim is over and either every aimed shot is
  // locked or the confirming window has passed.
  if (shot.status === 'aim' && now >= shot.aimEndsAt && (allAimsLocked(shot) || now >= shotStartsAt(shot))) {
    if (shot.entries.length < SHOT.minPlayers) return cancelShot(shot, now, 'notEnoughShots')
    shot.status = 'live'
    // The full match length from the moment it really starts.
    shot.startedAt = now
    shot.deadline = now + shot.duration
    return shot.status
  }
  if (shot.status === 'live' && now > shot.deadline + SHOT.resolutionGrace) return cancelShot(shot, now, 'resolutionWindowExpired')
  return null
}

export const shotNeedsResolve = (shot, now) => shot.status === 'live' && now >= shot.deadline && now <= shot.deadline + SHOT.resolutionGrace

export function resolveShot(shot, { price, prevSlot, prevBlockTime }, now) {
  require(shotNeedsResolve(shot, now), 'MatchNotLive')
  require(typeof price === 'bigint' && price > 0n, 'InvalidOraclePrice')
  if (shot.deadline - prevBlockTime > SHOT.maxPriceStaleness) return cancelShot(shot, now, 'staleDeadlinePrice')
  const { winnerCount, payoutTotal, statedFee } = settlePredictions(shot.entries, price, shot.feeBp)
  const creatorFee = mulDiv(statedFee, CREATOR_FEE_SHARE_BP, BP_DENOMINATOR)
  shot.status = 'resolved'
  shot.resolvedAt = now
  shot.winnerCount = winnerCount
  shot.finalPrice = price
  shot.finalSlot = prevSlot
  shot.finalPriceTime = prevBlockTime
  shot.creatorFee = creatorFee
  shot.protocolFee = shot.totalPool - payoutTotal - creatorFee
  shot.remainingLiability = payoutTotal
  return shot.status
}

/** What every wallet is paid once the match is final (the creator's fee is paid like an arena's). */
export function shotSettlements(shot) {
  if (shot.status === 'resolved') return shot.entries.filter((e) => e.payout > 0n).map((e) => ({ wallet: e.player, amount: e.payout, reason: 'win' }))
  if (shot.status === 'cancelled') return shot.entries.map((e) => ({ wallet: e.player, amount: e.stake, reason: 'refund' }))
  return []
}
