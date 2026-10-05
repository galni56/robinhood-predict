// node --test scripts/solana/game-server/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ARENA,
  RACE,
  RuleError,
  STAKE,
  accuracyMultiplierBp,
  addLobbyAsset,
  arenaDeposit,
  arenaSettlements,
  arenaTimers,
  calculateReturn,
  changePrediction,
  createArena,
  createCommunityRace,
  createPlatformRace,
  parseStakeMemo,
  placeBet,
  raceMemo,
  raceSettlements,
  raceTimers,
  ranking,
  resolveArena,
  resolveRace,
  startRace,
} from './rules.mjs'

const SOL = 1_000_000_000n
const asset = (symbol, category = 'crypto') => ({ symbol, category, priceSource: `pool-${symbol}`, priceDecimals: 8 })
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof RuleError && e.code === code)

function platformRace(now = 1_000) {
  return createPlatformRace(0, {
    title: 'Crypto majors',
    category: 'crypto',
    creator: 'admin',
    bettingStartTime: now,
    bettingEndTime: now + 60,
    raceDuration: 120,
    startGrace: 300,
    resolutionGrace: 600,
    feeBp: 200,
    minActiveContenders: 2,
    minStake: STAKE.min,
    maxStakePerWallet: STAKE.max,
  }, [asset('SOL'), asset('BTC'), asset('ETH')], now)
}

const boundary = (prices, prevBlockTime) => ({ prices, prevSlot: 42, prevBlockTime })

test('return is symmetric in sign and handles extreme prices', () => {
  assert.equal(calculateReturn(100n, 110n), RACE.returnScale / 10n)
  assert.equal(calculateReturn(100n, 90n), -(RACE.returnScale / 10n))
  assert.equal(calculateReturn(7n, 7n), 0n)
  assert.ok(calculateReturn(1n, 2n ** 64n - 1n) > 0n)
  throwsCode(() => calculateReturn(0n, 1n), 'InvalidOraclePrice')
})

test('race: bets, start, resolve and payouts follow the program math', () => {
  const race = platformRace()
  placeBet(race, { wallet: 'a', assetIndex: 0, amount: SOL / 10n, time: 1_010 })
  placeBet(race, { wallet: 'b', assetIndex: 1, amount: SOL / 5n, time: 1_020 })
  placeBet(race, { wallet: 'c', assetIndex: 2, amount: (3n * SOL) / 10n, time: 1_030 })
  placeBet(race, { wallet: 'a', assetIndex: 0, amount: SOL / 10n, time: 1_040 })
  throwsCode(() => placeBet(race, { wallet: 'a', assetIndex: 1, amount: SOL / 10n, time: 1_041 }), 'WrongAsset')
  throwsCode(() => placeBet(race, { wallet: 'd', assetIndex: 0, amount: STAKE.min - 1n, time: 1_041 }), 'StakeBelowMinimum')
  throwsCode(() => placeBet(race, { wallet: 'd', assetIndex: 0, amount: SOL / 10n, time: 1_060 }), 'BettingNotOpen')
  throwsCode(() => placeBet(race, { wallet: 'd', assetIndex: 7, amount: SOL / 10n, time: 1_050 }), 'InvalidCandidate')
  throwsCode(() => placeBet(race, { wallet: 'b', assetIndex: 1, amount: SOL, time: 1_050 }), 'StakeExceedsMaximum')
  assert.equal(race.totalPool, (7n * SOL) / 10n)

  startRace(race, boundary({ 'pool-SOL': 100n, 'pool-BTC': 200n, 'pool-ETH': 300n }, 1_059), 1_061)
  assert.equal(race.status, 'running')
  assert.equal(race.raceEndTime, 1_180)
  resolveRace(race, boundary({ 'pool-SOL': 110n, 'pool-BTC': 200n, 'pool-ETH': 270n }, 1_179), 1_185)
  assert.equal(race.status, 'resolved')
  assert.equal(race.winningAssetIndex, 0)
  // losing pool 0.5 SOL, fee 2% = 0.01 SOL split 50/50, winner takes 0.2 + 0.49
  assert.equal(race.protocolFee, SOL / 200n)
  assert.equal(race.creatorFee, SOL / 200n)
  assert.deepEqual(raceSettlements(race), [{ wallet: 'a', amount: (69n * SOL) / 100n, reason: 'win' }])
})

test('race: a tie at the top voids and refunds everyone', () => {
  const race = platformRace()
  placeBet(race, { wallet: 'a', assetIndex: 0, amount: SOL / 10n, time: 1_010 })
  placeBet(race, { wallet: 'b', assetIndex: 1, amount: SOL / 10n, time: 1_010 })
  startRace(race, boundary({ 'pool-SOL': 100n, 'pool-BTC': 200n }, 1_059), 1_060)
  resolveRace(race, boundary({ 'pool-SOL': 110n, 'pool-BTC': 220n }, 1_179), 1_180)
  assert.equal(race.status, 'void')
  assert.deepEqual(raceSettlements(race).map((s) => s.amount), [SOL / 10n, SOL / 10n])
})

test('race: one backed asset cancels at start; a missed window cancels or voids', () => {
  const lonely = platformRace()
  placeBet(lonely, { wallet: 'a', assetIndex: 0, amount: SOL / 10n, time: 1_010 })
  startRace(lonely, boundary({}, 0), 1_060)
  assert.equal(lonely.status, 'cancelled')
  assert.equal(lonely.cancelReason, 'insufficientActiveContenders')
  assert.deepEqual(raceSettlements(lonely), [{ wallet: 'a', amount: SOL / 10n, reason: 'refund' }])

  const missed = platformRace()
  assert.equal(raceTimers(missed, 1_060 + 300), null)
  assert.equal(raceTimers(missed, 1_060 + 301), 'cancelled')

  const stuck = platformRace()
  placeBet(stuck, { wallet: 'a', assetIndex: 0, amount: SOL / 10n, time: 1_010 })
  placeBet(stuck, { wallet: 'b', assetIndex: 1, amount: SOL / 10n, time: 1_010 })
  startRace(stuck, boundary({ 'pool-SOL': 1n, 'pool-BTC': 1n }, 1_059), 1_060)
  assert.equal(raceTimers(stuck, 1_180 + 601), 'void')
})

test('community race: lobby additions, then betting opens at lobby end', () => {
  const race = createCommunityRace(1, { title: 'Memes', category: 'meme', creator: 'c', raceDuration: 300 }, [asset('WIF', 'meme')], 0)
  assert.equal(race.status, 'lobby')
  throwsCode(() => createCommunityRace(2, { title: 'x', category: 'meme', creator: 'c', raceDuration: 301 }, [], 0), 'DurationNotApproved')
  addLobbyAsset(race, 'p', asset('BONK', 'meme'), 10)
  throwsCode(() => addLobbyAsset(race, 'p', asset('POPCAT', 'meme'), 11), 'LobbyAdditionAlreadyUsed')
  throwsCode(() => addLobbyAsset(race, 'q', asset('WIF', 'meme'), 11), 'DuplicateAsset')
  throwsCode(() => addLobbyAsset(race, 'q', asset('SOL'), 11), 'AssetNotApproved')
  throwsCode(() => placeBet(race, { wallet: 'q', assetIndex: 0, amount: SOL / 10n, time: 12 }), 'InvalidRaceStatus')
  assert.equal(raceTimers(race, 600), 'betting')
  assert.equal(race.bettingEndTime, 1_200)

  const empty = createCommunityRace(3, { title: 'Empty', category: 'meme', creator: 'c', raceDuration: 300 }, [asset('WIF', 'meme')], 0)
  assert.equal(raceTimers(empty, 600), 'cancelled')
})

test('arena ranking orders by error then sequence', () => {
  const entries = [1_100n, 990n, 1_010n, 1_000n, 900n].map((prediction, predictionSeq) => ({ prediction, predictionSeq }))
  assert.deepEqual(ranking(entries, 1_000n), [3, 1, 2, 0, 4])
})

test('arena multiplier is linear between one and three', () => {
  assert.equal(accuracyMultiplierBp(0n, 10n), 30_000n)
  assert.equal(accuracyMultiplierBp(5n, 10n), 20_000n)
  assert.equal(accuracyMultiplierBp(10n, 10n), 10_000n)
  assert.equal(accuracyMultiplierBp(0n, 0n), 10_000n)
})

test('arena: entries, top-ups, prediction changes and resolution', () => {
  const arena = createArena(0, { title: 'SOL close', creator: 'c', duration: 60 }, asset('SOL'), 0)
  assert.equal(arena.startsAt, ARENA.lobbyDuration)
  arenaDeposit(arena, { wallet: 'a', prediction: 1_000n, amount: SOL / 10n, time: 1 })
  arenaDeposit(arena, { wallet: 'b', prediction: 1_200n, amount: SOL / 10n, time: 2 })
  arenaDeposit(arena, { wallet: 'c', prediction: 900n, amount: SOL / 10n, time: 3 })
  arenaDeposit(arena, { wallet: 'd', prediction: 1_500n, amount: SOL / 10n, time: 4 })
  throwsCode(() => arenaDeposit(arena, { wallet: 'e', prediction: 0n, amount: SOL / 10n, time: 5 }), 'InvalidPrediction')
  throwsCode(() => arenaDeposit(arena, { wallet: 'e', prediction: 1n, amount: SOL / 10n, time: 600 }), 'LobbyClosed')
  arenaDeposit(arena, { wallet: 'a', prediction: 0n, amount: SOL / 10n, time: 6 })
  assert.equal(arena.entries[0].predictionSeq, 0, 'a pure top-up keeps the place')
  changePrediction(arena, { wallet: 'c', prediction: 1_100n, time: 7 })
  assert.equal(arena.entries[2].predictionSeq, 4)
  throwsCode(() => changePrediction(arena, { wallet: 'c', prediction: 1_100n, time: 8 }), 'NothingChanged')

  resolveArena(arena, { price: 1_050n, prevSlot: 9, prevBlockTime: 659 }, 661)
  assert.equal(arena.status, 'resolved')
  assert.equal(arena.winnerCount, 2)
  // a and c tie on error 50; a predicted earlier. Losers' pool 0.2 SOL minus 2%.
  const [first, second] = [arena.entries[0], arena.entries[2]]
  assert.equal(first.rank, 1)
  assert.equal(second.rank, 2)
  const paid = arenaSettlements(arena).reduce((sum, s) => sum + s.amount, 0n)
  assert.equal(paid + arena.protocolFee + arena.creatorFee, arena.totalPool)
  assert.equal(arena.creatorFee, (SOL / 5n) * 200n / 10_000n / 2n)
})

test('arena: too few players or a stale price cancels with refunds', () => {
  const alone = createArena(0, { title: 'x', creator: 'c', duration: 60 }, asset('SOL'), 0)
  arenaDeposit(alone, { wallet: 'a', prediction: 1n, amount: SOL / 10n, time: 1 })
  assert.equal(arenaTimers(alone, 600), 'cancelled')
  assert.deepEqual(arenaSettlements(alone), [{ wallet: 'a', amount: SOL / 10n, reason: 'refund' }])

  const stale = createArena(1, { title: 'x', creator: 'c', duration: 60 }, asset('SOL'), 0)
  arenaDeposit(stale, { wallet: 'a', prediction: 1n, amount: SOL / 10n, time: 1 })
  arenaDeposit(stale, { wallet: 'b', prediction: 2n, amount: SOL / 10n, time: 1 })
  resolveArena(stale, { price: 5n, prevSlot: 1, prevBlockTime: 660 - 61 }, 660)
  assert.equal(stale.cancelReason, 'staleDeadlinePrice')
  assert.equal(arenaSettlements(stale).length, 2)
})

test('stake memos round-trip and reject junk', () => {
  assert.deepEqual(parseStakeMemo(raceMemo(12, 3)), { kind: 'race', id: 12, assetIndex: 3 })
  assert.deepEqual(parseStakeMemo('prophet:arena:4:12345678901'), { kind: 'arena', id: 4, prediction: 12345678901n })
  for (const junk of ['', 'prophet:race:1', 'prophet:race:-1:0', 'prophet:poker:1:1', 'other:race:1:0', 'prophet:race:1:0:9']) {
    assert.equal(parseStakeMemo(junk), null, junk)
  }
})
