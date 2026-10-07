// Price Shot (the new arena, owner spec 2026-10-07): one coin per room, every
// player calls its price at the end of the match. Pure rules, like rules.mjs:
// no network, no database, time passed in.
//
// Phases:
// - open:  players join the room (free) and press Ready. Once more than half
//          of them, and at least two, are ready, the ready players go on to
//          the aim phase; the others are left out of this match.
// - aim:   AIM_SECONDS to set a price and a stake and press Lock Shot. The
//          stake comes out of the player's game balance at once. Predictions
//          stay hidden from the others until the match starts.
// - live:  from the end of aim to the deadline; nothing can change.
// - resolved / cancelled: the closest half wins (settlePredictions, the same
//          math as Price Arena). Payouts and refunds go back to game balances.
//
// Money: a stake moves from the player's balance into the room
// (remainingLiability); settlement or cancellation moves it back out.

import { BP_DENOMINATOR, CREATOR_FEE_SHARE_BP, RuleError, STAKE, mulDiv, settlePredictions, validateTitle } from './rules.mjs'

export const SHOT = {
  minPlayers: 2,
  maxPlayers: 10,
  aimSeconds: 30,
  durations: [60, 5 * 60, 15 * 60, 60 * 60],
  feeBp: 200,
  /** The deadline price must come from a block at most this old. */
  maxPriceStaleness: 60,
  /** No result this long after the deadline cancels the match with refunds. */
  resolutionGrace: 60 * 60,
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
    unit: input.unit === 'cap' ? 'cap' : 'price',
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

/** Lock Shot: the prediction and the stake (already taken from the balance). */
export function lockShot(shot, { wallet, prediction, stake }, now) {
  require(shot.status === 'aim' && now < shot.aimEndsAt, 'AimClosed')
  require(player(shot, wallet), 'NotInMatch')
  require(!shot.entries.some((e) => e.player === wallet), 'AlreadyLocked')
  require(typeof prediction === 'bigint' && prediction > 0n, 'InvalidPrediction')
  require(typeof stake === 'bigint' && stake >= shot.minStake && stake <= shot.maxStake, 'InvalidStake')
  shot.entries.push({ player: wallet, prediction, stake, lockedAt: now, predictionSeq: shot.nextPredictionSeq++, payout: 0n, rank: 0, accuracyMultiplierBp: 0 })
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

/** Aim end, idle rooms, missed resolution window. */
export function shotTimers(shot, now) {
  if (shot.status === 'open' && shot.players.length === 0 && now - shot.lastJoinAt > SHOT.idleRoomSeconds) return cancelShot(shot, now, 'idleRoom')
  if (shot.status === 'aim' && now >= shot.aimEndsAt) {
    if (shot.entries.length < SHOT.minPlayers) return cancelShot(shot, now, 'notEnoughShots')
    shot.status = 'live'
    shot.deadline = shot.aimEndsAt + shot.duration
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
  shot.remainingLiability = 0n
  return shot.status
}

/** What goes back to game balances once the match is final. */
export function shotCredits(shot) {
  if (shot.status === 'resolved') {
    const out = shot.entries.filter((e) => e.payout > 0n).map((e) => ({ wallet: e.player, amount: e.payout, reason: 'win' }))
    if (shot.creatorFee > 0n) out.push({ wallet: shot.creator, amount: shot.creatorFee, reason: 'creator' })
    return out
  }
  if (shot.status === 'cancelled') return shot.entries.map((e) => ({ wallet: e.player, amount: e.stake, reason: 'refund' }))
  return []
}
