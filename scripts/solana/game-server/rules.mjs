// Game rules of the server-wallet version of Prophet: the same Asset Race and
// Price Arena rules the `prophet_games` program enforces (see
// solana/programs/prophet_games/src), as pure functions over plain state.
// Nothing here touches the network or the database; every function takes
// the current time explicitly, so the rules are unit-testable.
//
// Amounts are lamports (BigInt), prices are scaled integers (BigInt), times
// are unix seconds (Number). A rule violation throws RuleError with a stable
// code the API returns and the refund records.

// ------------------------------------------------------------------ limits

export const LAMPORTS_PER_SOL = 1_000_000_000n
export const BP_DENOMINATOR = 10_000n
/** Half of every fee goes to the game creator, half to Prophet. */
export const CREATOR_FEE_SHARE_BP = 5_000n
export const MAX_TITLE_BYTES = 64

/** Native-SOL stake limits per wallet and game (admin setup on the program). */
export const STAKE = { min: LAMPORTS_PER_SOL / 200n, max: LAMPORTS_PER_SOL }

export const RACE = {
  minAssets: 2,
  maxAssets: 6,
  maxFeeBp: 1_000,
  returnScale: 10n ** 18n,
  noWinner: 255,
}

/** Rules every community race inherits (admin setup on the program). */
export const COMMUNITY_POLICY = {
  lobbyDuration: 600,
  bettingDuration: 600,
  startGrace: 300,
  resolutionGrace: 600,
  feeBp: 200,
  minActiveContenders: 2,
}
export const COMMUNITY_RACE_DURATIONS = [5 * 60, 15 * 60, 60 * 60]

export const ARENA = {
  feeBp: 200,
  lobbyDuration: 10 * 60,
  durations: [60, 5 * 60, 15 * 60, 60 * 60],
  /** After this long past the deadline without a resolve, the arena is cancelled. */
  resolutionGrace: 60 * 60,
  /** The deadline price must come from a block at most this old. */
  maxPriceStaleness: 60,
  minParticipants: 2,
  maxParticipants: 10,
  minMultiplierBp: 10_000n,
  maxMultiplierBp: 30_000n,
}

export const CATEGORIES = ['stock', 'meme', 'crypto']
/** How a game shows its numbers: by price or by market cap. Display only:
 * outcomes always use the signed pool price. */
export const UNITS = ['price', 'cap']
const unitOf = (unit) => (UNITS.includes(unit) ? unit : 'price')

export class RuleError extends Error {
  constructor(code, message = code) {
    super(message)
    this.code = code
  }
}

const require = (condition, code) => {
  if (!condition) throw new RuleError(code)
}

export function validateTitle(title) {
  const bytes = Buffer.from(String(title ?? ''), 'utf8')
  require(bytes.length > 0 && bytes.length <= MAX_TITLE_BYTES && bytes.some((b) => b > 0x20), 'InvalidTitle')
}

export const mulDiv = (a, b, denominator) => {
  require(denominator > 0n, 'MathOverflow')
  return (a * b) / denominator
}

/** Percentage return from `start` to `end`, scaled by RACE.returnScale. */
export function calculateReturn(start, end) {
  require(start > 0n && end > 0n, 'InvalidOraclePrice')
  return end >= start ? ((end - start) * RACE.returnScale) / start : -(((start - end) * RACE.returnScale) / start)
}

// ============================================================== Asset Race

function raceAsset(asset) {
  return {
    symbol: asset.symbol,
    priceSource: asset.priceSource,
    priceDecimals: asset.priceDecimals,
    active: false,
    pool: 0n,
    startPrice: 0n,
    endPrice: 0n,
    returnValue: 0n,
  }
}

function pushAsset(race, asset) {
  require(asset && asset.enabled !== false, 'AssetNotApproved')
  require(asset.category === race.category, 'AssetNotApproved')
  require(race.assets.length < RACE.maxAssets, 'InvalidCandidateCount')
  for (const existing of race.assets) {
    require(existing.symbol !== asset.symbol, 'DuplicateAsset')
    require(existing.priceSource !== asset.priceSource, 'DuplicatePriceSource')
  }
  race.assets.push(raceAsset(asset))
}

function emptyRace(id, fields) {
  return {
    kind: 'race',
    id,
    status: 'betting',
    cancelReason: null,
    lobbyEndTime: 0,
    bettingWindow: 0,
    bettingStartTime: 0,
    bettingEndTime: 0,
    raceEndTime: 0,
    resolvedAt: 0,
    activeCount: 0,
    winningAssetIndex: RACE.noWinner,
    totalPool: 0n,
    winningPool: 0n,
    distributableLosingPool: 0n,
    protocolFee: 0n,
    creatorFee: 0n,
    remainingLiability: 0n,
    startSlot: 0,
    startPriceTime: 0,
    endSlot: 0,
    endPriceTime: 0,
    assets: [],
    lobbyAdders: [],
    positions: [],
    ...fields,
  }
}

/** A titled platform race with explicit timing (admin or the scheduler). */
export function createPlatformRace(id, input, assets, now) {
  validateTitle(input.title)
  require(CATEGORIES.includes(input.category), 'InvalidCategory')
  require((assets.length >= RACE.minAssets && assets.length <= RACE.maxAssets), 'InvalidCandidateCount')
  require(
    input.bettingStartTime >= now
      && input.bettingEndTime > input.bettingStartTime
      && input.raceDuration > 0
      && input.startGrace > 0
      && input.resolutionGrace > 0
      && input.minStake > 0n
      && input.maxStakePerWallet >= input.minStake
      && input.minActiveContenders >= RACE.minAssets
      && input.minActiveContenders <= assets.length,
    'InvalidConfiguration',
  )
  require(input.feeBp >= 0 && input.feeBp <= RACE.maxFeeBp, 'FeeExceedsMaximum')
  const race = emptyRace(id, {
    origin: 'platform',
    category: input.category,
    creator: input.creator,
    title: input.title,
    createdAt: now,
    bettingStartTime: input.bettingStartTime,
    bettingEndTime: input.bettingEndTime,
    raceDuration: input.raceDuration,
    startGrace: input.startGrace,
    resolutionGrace: input.resolutionGrace,
    feeBp: input.feeBp,
    minActiveContenders: input.minActiveContenders,
    minStake: input.minStake,
    maxStakePerWallet: input.maxStakePerWallet,
  })
  for (const asset of assets) pushAsset(race, asset)
  return race
}

/** A community race: the creator picks title, category, an approved duration
 * and up to six initial assets; everything else comes from the policy. */
export function createCommunityRace(id, input, assets, now) {
  validateTitle(input.title)
  require(CATEGORIES.includes(input.category), 'InvalidCategory')
  require(COMMUNITY_RACE_DURATIONS.includes(input.raceDuration), 'DurationNotApproved')
  require(assets.length <= RACE.maxAssets, 'InvalidCandidateCount')
  const race = emptyRace(id, {
    origin: 'community',
    status: 'lobby',
    unit: unitOf(input.unit),
    category: input.category,
    creator: input.creator,
    title: input.title,
    createdAt: now,
    lobbyEndTime: now + COMMUNITY_POLICY.lobbyDuration,
    bettingWindow: COMMUNITY_POLICY.bettingDuration,
    raceDuration: input.raceDuration,
    startGrace: COMMUNITY_POLICY.startGrace,
    resolutionGrace: COMMUNITY_POLICY.resolutionGrace,
    feeBp: COMMUNITY_POLICY.feeBp,
    minActiveContenders: COMMUNITY_POLICY.minActiveContenders,
    minStake: STAKE.min,
    maxStakePerWallet: STAKE.max,
  })
  for (const asset of assets) pushAsset(race, asset)
  return race
}

/** Each wallet may add one approved asset to a community lobby. */
export function addLobbyAsset(race, wallet, asset, now) {
  require(race.origin === 'community' && race.status === 'lobby', 'InvalidRaceStatus')
  require(now < race.lobbyEndTime, 'LobbyClosed')
  require(!race.lobbyAdders.includes(wallet), 'LobbyAdditionAlreadyUsed')
  pushAsset(race, asset)
  race.lobbyAdders.push(wallet)
}

/** A bet arriving in a transaction confirmed at `time` (block time). One
 * position per wallet; top-ups must back the same asset. */
export function placeBet(race, { wallet, assetIndex, amount, time }) {
  // A bet confirmed before the cutoff but seen only after the start still
  // counts, as long as its asset is in the race (it has a start price).
  const late = race.status === 'running'
  require(race.status === 'betting' || late, 'InvalidRaceStatus')
  require(time >= race.bettingStartTime && time < race.bettingEndTime, 'BettingNotOpen')
  require(Number.isInteger(assetIndex) && assetIndex >= 0 && assetIndex < race.assets.length, 'InvalidCandidate')
  require(!late || race.assets[assetIndex].active, 'BettingNotOpen')
  require(amount > 0n, 'AmountZero')
  let position = race.positions.find((p) => p.owner === wallet)
  if (!position) {
    require(amount >= race.minStake, 'StakeBelowMinimum')
  } else {
    require(position.assetIndex === assetIndex, 'WrongAsset')
  }
  const newStake = (position?.stake ?? 0n) + amount
  require(newStake <= race.maxStakePerWallet, 'StakeExceedsMaximum')
  if (!position) {
    position = { owner: wallet, assetIndex, stake: 0n, payout: 0n, settled: false }
    race.positions.push(position)
  }
  position.stake = newStake
  race.assets[assetIndex].pool += amount
  race.totalPool += amount
  race.remainingLiability += amount
  return position
}

/**
 * Timer transitions that need no price: lobby end, missed start window,
 * missed resolution window. Returns the new status when it changed.
 */
export function raceTimers(race, now) {
  if (race.status === 'lobby' && now >= race.lobbyEndTime) {
    if (race.assets.length < RACE.minAssets) return cancelRace(race, now, 'insufficientLobbyAssets')
    race.bettingStartTime = now
    race.bettingEndTime = now + race.bettingWindow
    race.status = 'betting'
    return race.status
  }
  if (race.status === 'betting' && now > race.bettingEndTime + race.startGrace) {
    return cancelRace(race, now, 'startWindowExpired')
  }
  if (race.status === 'running' && now > race.raceEndTime + race.resolutionGrace) {
    race.status = 'void'
    race.cancelReason = 'resolutionWindowExpired'
    race.resolvedAt = now
    return race.status
  }
  return null
}

function cancelRace(race, now, reason) {
  race.status = 'cancelled'
  race.cancelReason = reason
  race.resolvedAt = now
  return race.status
}

/** Whether the race needs start prices now (betting closed, start window open). */
export const raceNeedsStart = (race, now) =>
  race.status === 'betting' && now >= race.bettingEndTime && now <= race.bettingEndTime + race.startGrace

export const raceActiveCount = (race) => race.assets.filter((a) => a.pool > 0n).length

/**
 * Start at the betting cutoff. Too few backed assets cancels the race (every
 * stake is refunded). `prices` maps price source -> price at the boundary
 * block (the last block before `bettingEndTime`).
 */
export function startRace(race, { prices, prevSlot, prevBlockTime }, now) {
  require(raceNeedsStart(race, now), 'InvalidRaceStatus')
  const active = raceActiveCount(race)
  if (active < race.minActiveContenders) return cancelRace(race, now, 'insufficientActiveContenders')
  for (const asset of race.assets) {
    if (asset.pool === 0n) continue
    const price = prices[asset.priceSource]
    require(typeof price === 'bigint' && price > 0n, 'InvalidOraclePrice')
    asset.startPrice = price
    asset.active = true
  }
  race.activeCount = active
  race.startSlot = prevSlot
  race.startPriceTime = prevBlockTime
  race.raceEndTime = race.bettingEndTime + race.raceDuration
  race.status = 'running'
  return race.status
}

export const raceNeedsResolve = (race, now) =>
  race.status === 'running' && now >= race.raceEndTime && now <= race.raceEndTime + race.resolutionGrace

/**
 * Resolve at the race end. The highest percentage return wins; a tie at the
 * top voids the race (every stake is refunded). Winners split the losing
 * pool minus the fee pro rata; the creator receives half of the fee.
 */
export function resolveRace(race, { prices, prevSlot, prevBlockTime }, now) {
  require(raceNeedsResolve(race, now), 'InvalidRaceStatus')
  let leader = null
  let topTied = false
  race.assets.forEach((asset, i) => {
    if (!asset.active) return
    const price = prices[asset.priceSource]
    require(typeof price === 'bigint' && price > 0n, 'InvalidOraclePrice')
    asset.endPrice = price
    asset.returnValue = calculateReturn(asset.startPrice, price)
    if (leader && asset.returnValue < leader.value) return
    if (leader && asset.returnValue === leader.value) {
      topTied = true
      return
    }
    leader = { index: i, value: asset.returnValue }
    topTied = false
  })
  require(leader, 'InvalidRaceStatus')
  race.endSlot = prevSlot
  race.endPriceTime = prevBlockTime
  race.resolvedAt = now
  if (topTied) {
    race.status = 'void'
    race.cancelReason = 'topTie'
    return race.status
  }
  const winningPool = race.assets[leader.index].pool
  const losingPool = race.totalPool - winningPool
  const fee = mulDiv(losingPool, BigInt(race.feeBp), BP_DENOMINATOR)
  const creatorFee = mulDiv(fee, CREATOR_FEE_SHARE_BP, BP_DENOMINATOR)
  race.winningAssetIndex = leader.index
  race.winningPool = winningPool
  race.distributableLosingPool = losingPool - fee
  race.protocolFee = fee - creatorFee
  race.creatorFee = creatorFee
  race.remainingLiability -= fee
  race.status = 'resolved'
  for (const position of race.positions) {
    position.payout = position.assetIndex === leader.index
      ? position.stake + mulDiv(position.stake, race.distributableLosingPool, winningPool)
      : 0n
  }
  return race.status
}

/** What each position is owed once the race is final: [{ wallet, amount, reason }]. */
export function raceSettlements(race) {
  if (race.status === 'resolved') {
    return race.positions.filter((p) => p.payout > 0n).map((p) => ({ wallet: p.owner, amount: p.payout, reason: 'win' }))
  }
  if (race.status === 'cancelled' || race.status === 'void') {
    return race.positions.filter((p) => p.stake > 0n).map((p) => ({ wallet: p.owner, amount: p.stake, reason: 'refund' }))
  }
  return []
}

// ============================================================= Price Arena

/** `lobbyDuration` is ARENA.lobbyDuration except on a local test stand. */
export function createArena(id, input, asset, now, lobbyDuration = ARENA.lobbyDuration) {
  validateTitle(input.title)
  require(asset && asset.enabled !== false, 'AssetNotApproved')
  require(ARENA.durations.includes(input.duration), 'UnsupportedDuration')
  const startsAt = now + lobbyDuration
  return {
    kind: 'arena',
    id,
    unit: unitOf(input.unit),
    symbol: asset.symbol,
    priceSource: asset.priceSource,
    priceDecimals: asset.priceDecimals,
    category: asset.category,
    creator: input.creator,
    status: 'open',
    cancelReason: 'none',
    title: input.title,
    createdAt: now,
    startsAt,
    deadline: startsAt + input.duration,
    duration: input.duration,
    resolvedAt: 0,
    feeBp: ARENA.feeBp,
    minStake: STAKE.min,
    maxStake: STAKE.max,
    totalPool: 0n,
    finalPrice: 0n,
    finalSlot: 0,
    finalPriceTime: 0,
    winnerCount: 0,
    protocolFee: 0n,
    creatorFee: 0n,
    remainingLiability: 0n,
    nextPredictionSeq: 0,
    entries: [],
  }
}

const requireOpenLobby = (arena, time) => {
  require(arena.status === 'open', 'ArenaNotOpen')
  require(time < arena.startsAt, 'LobbyClosed')
}

/**
 * Money arriving for an arena at block time `time`: a new entry (needs a
 * prediction), or a top-up of an existing one that may also change the
 * prediction (`prediction == 0n` keeps it).
 */
export function arenaDeposit(arena, { wallet, prediction, amount, time }) {
  requireOpenLobby(arena, time)
  require(amount > 0n, 'AmountZero')
  const entry = arena.entries.find((e) => e.player === wallet)
  if (!entry) {
    require(arena.entries.length < ARENA.maxParticipants, 'ArenaFull')
    require(prediction > 0n, 'InvalidPrediction')
    require(amount >= arena.minStake && amount <= arena.maxStake, 'InvalidStake')
    arena.entries.push({
      player: wallet,
      prediction,
      stake: amount,
      predictionUpdatedAt: time,
      predictionSeq: arena.nextPredictionSeq++,
      payout: 0n,
      rank: 0,
      accuracyMultiplierBp: 0,
      settled: false,
    })
  } else {
    require(entry.stake + amount <= arena.maxStake, 'InvalidStake')
    entry.stake += amount
    if (prediction > 0n && prediction !== entry.prediction) setPrediction(arena, entry, prediction, time)
  }
  arena.totalPool += amount
  arena.remainingLiability += amount
}

/** A prediction change without money (signed message). Moves the player
 * behind everyone who predicted earlier, like the program's update_entry. */
export function changePrediction(arena, { wallet, prediction, time }) {
  requireOpenLobby(arena, time)
  const entry = arena.entries.find((e) => e.player === wallet)
  require(entry, 'NotEntered')
  require(prediction > 0n, 'InvalidPrediction')
  require(prediction !== entry.prediction, 'NothingChanged')
  setPrediction(arena, entry, prediction, time)
}

function setPrediction(arena, entry, prediction, time) {
  entry.prediction = prediction
  entry.predictionUpdatedAt = time
  entry.predictionSeq = arena.nextPredictionSeq++
}

function cancelArena(arena, now, reason) {
  arena.status = 'cancelled'
  arena.cancelReason = reason
  arena.resolvedAt = now
  return arena.status
}

/** Timer transitions: too few players at lobby end, missed resolution window. */
export function arenaTimers(arena, now) {
  if (arena.status !== 'open') return null
  if (now >= arena.startsAt && arena.entries.length < ARENA.minParticipants) {
    return cancelArena(arena, now, 'insufficientParticipants')
  }
  if (now > arena.deadline + ARENA.resolutionGrace) return cancelArena(arena, now, 'resolutionWindowExpired')
  return null
}

export const arenaNeedsResolve = (arena, now) =>
  arena.status === 'open' && now >= arena.deadline && now <= arena.deadline + ARENA.resolutionGrace
    && arena.entries.length >= ARENA.minParticipants

const absoluteError = (prediction, finalPrice) => (prediction > finalPrice ? prediction - finalPrice : finalPrice - prediction)

/** Entry indices by result: smaller error first, then the earlier prediction. */
export function ranking(entries, finalPrice) {
  return entries
    .map((entry, index) => ({ index, error: absoluteError(entry.prediction, finalPrice), seq: entry.predictionSeq }))
    .sort((a, b) => (a.error !== b.error ? (a.error < b.error ? -1 : 1) : a.seq - b.seq))
    .map((x) => x.index)
}

/** 3x for an exact hit, falling linearly to 1x at the worst winning error. */
export function accuracyMultiplierBp(error, cutoffError) {
  if (cutoffError === 0n) return ARENA.minMultiplierBp
  return ARENA.minMultiplierBp + ((ARENA.maxMultiplierBp - ARENA.minMultiplierBp) * (cutoffError - error)) / cutoffError
}

/**
 * Resolve at the deadline price. The better half of the field (rounded down)
 * shares the losing half's stakes minus the fee, weighted by stake x accuracy
 * multiplier (1x-3x). A price older than ARENA.maxPriceStaleness cancels.
 */
export function resolveArena(arena, { price, prevSlot, prevBlockTime }, now) {
  require(arenaNeedsResolve(arena, now), 'ArenaNotOpen')
  require(typeof price === 'bigint' && price > 0n, 'InvalidOraclePrice')
  if (arena.deadline - prevBlockTime > ARENA.maxPriceStaleness) return cancelArena(arena, now, 'staleDeadlinePrice')
  const { winnerCount, payoutTotal, statedFee } = settlePredictions(arena.entries, price, arena.feeBp)
  // The creator receives exactly half of the stated fee; Prophet keeps the
  // other half plus integer-division dust.
  const protocolTake = arena.totalPool - payoutTotal
  const creatorFee = mulDiv(statedFee, CREATOR_FEE_SHARE_BP, BP_DENOMINATOR)
  arena.status = 'resolved'
  arena.resolvedAt = now
  arena.winnerCount = winnerCount
  arena.finalPrice = price
  arena.finalSlot = prevSlot
  arena.finalPriceTime = prevBlockTime
  arena.protocolFee = protocolTake - creatorFee
  arena.creatorFee = creatorFee
  arena.remainingLiability = payoutTotal
  return arena.status
}

/**
 * The closest-half payout shared by Price Arena and Price Shot. The better
 * half of the field (rounded down) shares the losing half's stakes minus the
 * fee, weighted by stake x accuracy multiplier (1x-3x). Sets each entry's
 * rank, accuracyMultiplierBp and payout; returns the totals.
 */
export function settlePredictions(entries, price, feeBp) {
  const order = ranking(entries, price)
  const winnerCount = Math.floor(order.length / 2)
  const losingPool = order.slice(winnerCount).reduce((sum, i) => sum + entries[i].stake, 0n)
  const statedFee = mulDiv(losingPool, BigInt(feeBp), BP_DENOMINATOR)
  const distributable = losingPool - statedFee
  const cutoffError = absoluteError(entries[order[winnerCount - 1]].prediction, price)
  const scores = []
  let scoreTotal = 0n
  order.slice(0, winnerCount).forEach((i, position) => {
    const entry = entries[i]
    const multiplier = accuracyMultiplierBp(absoluteError(entry.prediction, price), cutoffError)
    const score = entry.stake * multiplier
    entry.rank = position + 1
    entry.accuracyMultiplierBp = Number(multiplier)
    scores.push(score)
    scoreTotal += score
  })
  let payoutTotal = 0n
  order.slice(0, winnerCount).forEach((i, k) => {
    const entry = entries[i]
    entry.payout = entry.stake + mulDiv(distributable, scores[k], scoreTotal)
    payoutTotal += entry.payout
  })
  order.forEach((i, position) => {
    if (position >= winnerCount) {
      entries[i].rank = position + 1
      entries[i].payout = 0n
    }
  })
  return { winnerCount, payoutTotal, statedFee }
}

export function arenaSettlements(arena) {
  if (arena.status === 'resolved') {
    return arena.entries.filter((e) => e.payout > 0n).map((e) => ({ wallet: e.player, amount: e.payout, reason: 'win' }))
  }
  if (arena.status === 'cancelled') {
    return arena.entries.filter((e) => e.stake > 0n).map((e) => ({ wallet: e.player, amount: e.stake, reason: 'refund' }))
  }
  return []
}

// ------------------------------------------------------------------- memos

// Every stake is a plain SOL transfer to the game wallet with one memo that
// names its purpose:
//   prophet:race:<raceId>:<assetIndex>
//   prophet:arena:<arenaId>:<prediction>   (prediction 0 = keep, top-up only)
//   prophet:duel:<duelId>:0                (a racer pays the stake)
//   prophet:duel:<duelId>:<seat>           (a spectator backs that racer)
//   prophet:shot:<shotId>:0                (a Price Shot stake; the price was aimed by signed message)
export const MEMO_PREFIX = 'prophet'

export function parseStakeMemo(text) {
  const parts = String(text ?? '').trim().split(':')
  if (parts[0] !== MEMO_PREFIX || parts.length !== 4) return null
  const [, kind, id, arg] = parts
  if (!/^\d{1,12}$/.test(id) || !/^\d{1,30}$/.test(arg)) return null
  if (kind === 'race') return { kind, id: Number(id), assetIndex: Number(arg) }
  if (kind === 'arena') return { kind, id: Number(id), prediction: BigInt(arg) }
  // Duels: 0 pays the racer's stake, a seat number backs that racer.
  if (kind === 'duel') return { kind, id: Number(id), seat: Number(arg) }
  // Price Shot: the stake of the shot this wallet aimed (the price is not public).
  if (kind === 'shot' && arg === '0') return { kind, id: Number(id) }
  return null
}

export const duelMemo = (duelId, seat = 0) => `${MEMO_PREFIX}:duel:${duelId}:${seat}`
export const shotMemo = (shotId) => `${MEMO_PREFIX}:shot:${shotId}:0`

export const raceMemo = (raceId, assetIndex) => `${MEMO_PREFIX}:race:${raceId}:${assetIndex}`
export const arenaMemo = (arenaId, prediction) => `${MEMO_PREFIX}:arena:${arenaId}:${prediction}`
