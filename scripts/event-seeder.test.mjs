import assert from 'node:assert/strict'
import test from 'node:test'
import { stringToHex } from 'viem'
import {
  OpenItemTracker,
  DISCOVERY_MULTICALL_BATCH_SIZE,
  arenaTitleFor,
  buildCommunityRacePayload,
  communityRaceTitleFor,
  isOpenNow,
  isRaceOpenNow,
  nextAssetToSeed,
  nextRaceConfigsToSeed,
  pickCommunityRaceAssetIds,
  pickCommunityRaceAssetIdsFrom,
  readSeederConfig,
  raceCombinationKey,
  rotateConfigs,
  targetPriceFromSnapshot,
} from './event-seeder.mjs'

function withEnv(overrides, fn) {
  const saved = new Map(Object.keys(overrides).map((key) => [key, process.env[key]]))
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    return fn()
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('config requires an RPC URL', () => {
  withEnv({ EVENT_SEEDER_RPC_URL: undefined, PREDICTION_MARKET_RPC_URL: undefined }, () => {
    assert.throws(() => readSeederConfig(), /EVENT_SEEDER_RPC_URL is required/)
  })
})

test('config falls back to the prediction-market RPC/address envs', () => {
  withEnv({
    EVENT_SEEDER_RPC_URL: undefined,
    PREDICTION_MARKET_RPC_URL: 'https://rpc.invalid',
    EVENT_SEEDER_MARKET_ADDRESS: undefined,
    PREDICTION_MARKET_ADDRESS: '0x1111111111111111111111111111111111111111',
    EVENT_SEEDER_ARENA_ADDRESS: undefined,
    PRICE_ARENA_ADDRESS: '0x2222222222222222222222222222222222222222',
  }, () => {
    const config = readSeederConfig()
    assert.equal(config.rpcUrl, 'https://rpc.invalid')
    assert.equal(config.marketAddress, '0x1111111111111111111111111111111111111111')
    assert.equal(config.arenaAddress, '0x2222222222222222222222222222222222222222')
    assert.equal(config.dryRun, true)
  })
})

test('config rejects an unsupported arena duration', () => {
  withEnv({
    EVENT_SEEDER_RPC_URL: 'https://rpc.invalid',
    EVENT_SEEDER_MARKET_ADDRESS: '0x1111111111111111111111111111111111111111',
    EVENT_SEEDER_ARENA_ADDRESS: '0x2222222222222222222222222222222222222222',
    EVENT_SEEDER_ARENA_DURATION_SECONDS: '123',
  }, () => {
    assert.throws(() => readSeederConfig(), /EVENT_SEEDER_ARENA_DURATION_SECONDS must be one of/)
  })
})

test('config rejects max target-price offset below min', () => {
  withEnv({
    EVENT_SEEDER_RPC_URL: 'https://rpc.invalid',
    EVENT_SEEDER_MARKET_ADDRESS: '0x1111111111111111111111111111111111111111',
    EVENT_SEEDER_ARENA_ADDRESS: '0x2222222222222222222222222222222222222222',
    EVENT_SEEDER_TARGET_PRICE_MIN_BP: '300',
    EVENT_SEEDER_TARGET_PRICE_MAX_BP: '100',
  }, () => {
    assert.throws(() => readSeederConfig(), /EVENT_SEEDER_TARGET_PRICE_MAX_BP must be >=/)
  })
})

test('config requires a private key outside dry-run', () => {
  withEnv({
    EVENT_SEEDER_RPC_URL: 'https://rpc.invalid',
    EVENT_SEEDER_MARKET_ADDRESS: '0x1111111111111111111111111111111111111111',
    EVENT_SEEDER_ARENA_ADDRESS: '0x2222222222222222222222222222222222222222',
    DRY_RUN: 'false',
    EVENT_SEEDER_PRIVATE_KEY: undefined,
  }, () => {
    assert.throws(() => readSeederConfig(), /EVENT_SEEDER_PRIVATE_KEY is required for live mode/)
  })
})

test('isOpenNow requires OPEN status and a future deadline', () => {
  assert.equal(isOpenNow(0, 1_000n, 999n), true)
  assert.equal(isOpenNow(0, 1_000n, 1_000n), false)
  assert.equal(isOpenNow(1, 1_000n, 999n), false)
})

function makeClient(rowsById) {
  return {
    async readContract({ functionName, args }) {
      if (!['getMarket', 'getArena', 'getRace'].includes(functionName)) throw new Error(`unexpected call ${functionName}`)
      const [id] = args
      const row = rowsById.get(id)
      if (!row) throw new Error(`no row for id ${id}`)
      return row
    },
  }
}

test('OpenItemTracker only scans new ids and tracks open ones', async () => {
  const rows = new Map([
    [0n, { assetId: '0xaa', status: 0, deadline: 100n }],
    [1n, { assetId: '0xbb', status: 3, deadline: 50n }], // already resolved/cancelled
  ])
  const client = makeClient(rows)
  const tracker = new OpenItemTracker()

  await tracker.discover(client, { getFn: 'getMarket', rowToItem: (row) => row }, 2n, 10n)
  assert.equal(tracker.openCount(10n), 1)
  assert.deepEqual(tracker.openAssetIdSet(10n), new Set(['0xaa']))

  // A second discover with an unchanged count must not re-read anything.
  const client2 = makeClient(new Map())
  await tracker.discover(client2, { getFn: 'getMarket', rowToItem: (row) => row }, 2n, 10n)
  assert.equal(tracker.openCount(10n), 1)
})

test('OpenItemTracker drops entries once their deadline passes, without a read', async () => {
  const rows = new Map([[0n, { assetId: '0xaa', status: 0, deadline: 100n }]])
  const tracker = new OpenItemTracker()
  await tracker.discover(makeClient(rows), { getFn: 'getMarket', rowToItem: (row) => row }, 1n, 10n)
  assert.equal(tracker.openCount(50n), 1)
  tracker.prune(150n)
  assert.equal(tracker.openCount(150n), 0)
})

test('OpenItemTracker restores large histories with bounded multicalls instead of sequential RPC reads', async () => {
  const count = BigInt(DISCOVERY_MULTICALL_BATCH_SIZE * 2 + 5)
  const batchSizes = []
  const client = {
    async multicall({ contracts }) {
      batchSizes.push(contracts.length)
      return contracts.map(({ args }) => ({
        status: 'success',
        result: { assetId: `asset-${args[0]}`, status: 0, deadline: 1_000n },
      }))
    },
    async readContract() {
      throw new Error('sequential read should not be used')
    },
  }
  const tracker = new OpenItemTracker()
  await tracker.discover(client, { address: '0x1', abi: [], getFn: 'getMarket', rowToItem: (row) => row }, count, 10n)

  assert.deepEqual(batchSizes, [DISCOVERY_MULTICALL_BATCH_SIZE, DISCOVERY_MULTICALL_BATCH_SIZE, 5])
  assert.equal(tracker.nextId, count)
  assert.equal(tracker.openCount(10n), Number(count))
})

test('OpenItemTracker does not advance its cursor past a failed discovery batch', async () => {
  const tracker = new OpenItemTracker()
  const client = { async multicall() {
    return [
      { status: 'success', result: { assetId: 'first', status: 0, deadline: 1_000n } },
      { status: 'failure', error: new Error('temporary RPC error') },
    ]
  } }

  await assert.rejects(
    tracker.discover(client, { address: '0x1', abi: [], getFn: 'getMarket', rowToItem: (row) => row }, 2n, 10n),
    /DiscoveryReadFailed:1/,
  )
  assert.equal(tracker.nextId, 0n)
  assert.equal(tracker.openCount(10n), 0)
})

test('nextAssetToSeed stops once the target open count is met', () => {
  const configs = [{ assetId: 'NVDA' }, { assetId: 'TSLA' }]
  assert.equal(nextAssetToSeed(configs, new Set(), 2, 2), undefined)
})

test('nextAssetToSeed skips assets that already have an open listing', () => {
  const configs = [{ assetId: 'NVDA' }, { assetId: 'TSLA' }]
  const openIds = new Set([stringToHex('NVDA', { size: 32 }).toLowerCase()])
  const next = nextAssetToSeed(configs, openIds, 1, 3)
  assert.equal(next.assetId, 'TSLA')
})

test('nextAssetToSeed returns undefined once every configured asset is already open', () => {
  const configs = [{ assetId: 'NVDA' }]
  const openIds = new Set([stringToHex('NVDA', { size: 32 }).toLowerCase()])
  assert.equal(nextAssetToSeed(configs, openIds, 1, 5), undefined)
})

test('targetPriceFromSnapshot stays within the configured band, in either direction', () => {
  const priceRaw = 1_000_000n
  const up = targetPriceFromSnapshot(priceRaw, { minBp: 100, maxBp: 300, random: () => 0 })
  assert.equal(up, priceRaw + (priceRaw * 100n) / 10_000n) // random()=0 -> min offset, sign call also 0 -> positive

  let call = 0
  const sequence = [0.999, 0.999] // max offset, sign>=0.5 -> negative
  const down = targetPriceFromSnapshot(priceRaw, { minBp: 100, maxBp: 300, random: () => sequence[call++] })
  assert.equal(down, priceRaw - (priceRaw * 300n) / 10_000n)
})

test('targetPriceFromSnapshot rejects a non-positive price', () => {
  assert.throws(() => targetPriceFromSnapshot(0n), /InvalidPriceForTargetOffset/)
})

test('arenaTitleFor formats minute and hour durations and stays under the byte cap', () => {
  assert.equal(arenaTitleFor({ assetId: 'NVDA' }, 900), 'NVDA 15m Arena')
  assert.equal(arenaTitleFor({ assetId: 'NVDA' }, 3_600), 'NVDA 1h Arena')
})

test('pickCommunityRaceAssetIds takes the first N configs in registry order', () => {
  const configs = [{ assetId: 'NVDA' }, { assetId: 'TSLA' }, { assetId: 'AAPL' }]
  const picked = pickCommunityRaceAssetIds(configs, 2)
  assert.deepEqual(picked, [stringToHex('NVDA', { size: 32 }), stringToHex('TSLA', { size: 32 })])
})

test('pickCommunityRaceAssetIds throws if there are not enough approved assets', () => {
  assert.throws(() => pickCommunityRaceAssetIds([{ assetId: 'NVDA' }], 2), /NotEnoughApprovedAssetsForRace/)
})

function racePayloadInputs(overrides = {}) {
  const approvedAssetIds = [stringToHex('NVDA', { size: 32 }), stringToHex('TSLA', { size: 32 })]
  return {
    title: 'NVDA vs TSLA',
    category: 0,
    raceDuration: 300,
    assetIds: approvedAssetIds,
    approvedDurations: [60, 300, 900],
    approvedAssetIds,
    ...overrides,
  }
}

test('buildCommunityRacePayload accepts a valid configuration', () => {
  const payload = buildCommunityRacePayload(racePayloadInputs())
  assert.equal(payload.functionName, 'createCommunityRace')
  assert.deepEqual(payload.args, ['NVDA vs TSLA', 0, 300n, racePayloadInputs().assetIds])
})

test('buildCommunityRacePayload rejects an empty or whitespace-only title', () => {
  assert.throws(() => buildCommunityRacePayload(racePayloadInputs({ title: '' })), /InvalidTitle/)
  assert.throws(() => buildCommunityRacePayload(racePayloadInputs({ title: '   ' })), /InvalidTitle/)
})

test('buildCommunityRacePayload rejects a title over 64 bytes', () => {
  assert.throws(() => buildCommunityRacePayload(racePayloadInputs({ title: 'x'.repeat(65) })), /InvalidTitle/)
})

test('buildCommunityRacePayload rejects a duration outside the approved set', () => {
  assert.throws(() => buildCommunityRacePayload(racePayloadInputs({ raceDuration: 120 })), /DurationNotApproved/)
})

test('buildCommunityRacePayload rejects too few or too many assets', () => {
  const [nvda] = racePayloadInputs().assetIds
  assert.throws(() => buildCommunityRacePayload(racePayloadInputs({ assetIds: [nvda] })), /InvalidCandidateCount/)
  assert.throws(() => buildCommunityRacePayload(racePayloadInputs({ assetIds: Array(7).fill(nvda) })), /InvalidCandidateCount/)
})

test('buildCommunityRacePayload rejects an asset the contract has not approved', () => {
  const unapproved = stringToHex('ZZZZ', { size: 32 })
  assert.throws(
    () => buildCommunityRacePayload(racePayloadInputs({ assetIds: [racePayloadInputs().assetIds[0], unapproved] })),
    /AssetNotApproved/,
  )
})

test('config only requires EVENT_SEEDER_RACE_ADDRESS when Asset Race generation is enabled', () => {
  withEnv({
    EVENT_SEEDER_RPC_URL: 'https://rpc.invalid',
    EVENT_SEEDER_MARKET_ADDRESS: '0x1111111111111111111111111111111111111111',
    EVENT_SEEDER_ARENA_ADDRESS: '0x2222222222222222222222222222222222222222',
    EVENT_SEEDER_ASSET_RACE_ENABLED: undefined,
    EVENT_SEEDER_RACE_ADDRESS: undefined,
    ASSET_RACE_ADDRESS: undefined,
  }, () => {
    const config = readSeederConfig()
    assert.equal(config.assetRaceEnabled, false)
    assert.equal(config.raceAddress, undefined)
  })

  withEnv({
    EVENT_SEEDER_RPC_URL: 'https://rpc.invalid',
    EVENT_SEEDER_MARKET_ADDRESS: '0x1111111111111111111111111111111111111111',
    EVENT_SEEDER_ARENA_ADDRESS: '0x2222222222222222222222222222222222222222',
    EVENT_SEEDER_ASSET_RACE_ENABLED: 'true',
    EVENT_SEEDER_RACE_ADDRESS: undefined,
    ASSET_RACE_ADDRESS: undefined,
  }, () => {
    assert.throws(() => readSeederConfig(), /EVENT_SEEDER_RACE_ADDRESS is invalid/)
  })

  withEnv({
    EVENT_SEEDER_RPC_URL: 'https://rpc.invalid',
    EVENT_SEEDER_MARKET_ADDRESS: '0x1111111111111111111111111111111111111111',
    EVENT_SEEDER_ARENA_ADDRESS: '0x2222222222222222222222222222222222222222',
    EVENT_SEEDER_ASSET_RACE_ENABLED: 'true',
    EVENT_SEEDER_RACE_ADDRESS: undefined,
    ASSET_RACE_ADDRESS: '0x3333333333333333333333333333333333333333',
  }, () => {
    const config = readSeederConfig()
    assert.equal(config.raceAddress, '0x3333333333333333333333333333333333333333')
    assert.equal(config.raceTargetOpen, 2)
    assert.equal(config.raceDurationSeconds, 900)
    assert.equal(config.raceAssetCount, 2)
  })
})

test('isRaceOpenNow treats LOBBY/BETTING/RUNNING as open and RESOLVED/CANCELLED/VOID as terminal', () => {
  assert.equal(isRaceOpenNow(5, 1_000n, 999n), true) // LOBBY
  assert.equal(isRaceOpenNow(0, 1_000n, 999n), true) // BETTING
  assert.equal(isRaceOpenNow(1, 1_000n, 999n), true) // RUNNING
  assert.equal(isRaceOpenNow(2, 1_000n, 999n), false) // RESOLVED
  assert.equal(isRaceOpenNow(3, 1_000n, 999n), false) // CANCELLED
  assert.equal(isRaceOpenNow(4, 1_000n, 999n), false) // VOID
  assert.equal(isRaceOpenNow(5, 1_000n, 1_000n), false) // past occupiedUntil
})

test('OpenItemTracker accepts a custom open predicate for races', async () => {
  const rows = new Map([[0n, { assetId: '0xaa', status: 5, deadline: 1_000n }]]) // LOBBY
  const tracker = new OpenItemTracker(0n, isRaceOpenNow)
  await tracker.discover(makeClient(rows), { getFn: 'getRace', rowToItem: (row) => row }, 1n, 10n)
  assert.equal(tracker.openCount(10n), 1)
  assert.equal(tracker.openCount(1_000n), 0)
  assert.deepEqual(tracker.openIds(10n), [0n])
  assert.deepEqual(tracker.openIds(1_000n), [])
})

test('OpenItemTracker refresh releases a race slot after an early cancellation', async () => {
  let status = 5 // LOBBY
  const client = {
    readContract: async () => ({
      status,
      lobbyEndTime: 100n,
      bettingWindow: 100n,
      startGrace: 100n,
      raceDuration: 100n,
      resolutionGrace: 100n,
    }),
  }
  const rowToItem = (race) => ({
    assetId: `0x${'0'.repeat(64)}`,
    status: race.status,
    deadline: race.lobbyEndTime + race.bettingWindow + race.startGrace + race.raceDuration + race.resolutionGrace,
  })
  const read = { address: '0x0000000000000000000000000000000000000001', abi: [], getFn: 'getRace', rowToItem }
  const tracker = new OpenItemTracker(0n, isRaceOpenNow)

  await tracker.discover(client, read, 1n, 50n)
  assert.equal(tracker.openCount(50n), 1)

  status = 3 // CANCELLED well before occupiedUntil
  await tracker.refresh(client, read, 50n)
  assert.equal(tracker.openCount(50n), 0)
})

test('OpenItemTracker refresh retains a tracked race across a transient RPC failure', async () => {
  const tracker = new OpenItemTracker(0n, isRaceOpenNow)
  const read = { getFn: 'getRace', rowToItem: (row) => row }
  const initialRows = new Map([[0n, { assetId: 'race', status: 1, deadline: 500n }]])

  await tracker.discover(makeClient(initialRows), read, 1n, 50n)
  await tracker.refresh({ readContract: async () => { throw new Error('temporary RPC error') } }, read, 50n)

  assert.equal(tracker.openCount(50n), 1)
})

test('rotateConfigs wraps around the registry and starts at the given offset', () => {
  const configs = [{ assetId: 'NVDA' }, { assetId: 'TSLA' }, { assetId: 'AAPL' }]
  assert.deepEqual(rotateConfigs(configs, 2, 0), [{ assetId: 'NVDA' }, { assetId: 'TSLA' }])
  assert.deepEqual(rotateConfigs(configs, 2, 1), [{ assetId: 'TSLA' }, { assetId: 'AAPL' }])
  assert.deepEqual(rotateConfigs(configs, 2, 3), [{ assetId: 'NVDA' }, { assetId: 'TSLA' }]) // wraps
})

test('race combination keys ignore asset order', () => {
  const nvda = stringToHex('NVDA', { size: 32 })
  const tsla = stringToHex('TSLA', { size: 32 })
  assert.equal(raceCombinationKey([nvda, tsla]), raceCombinationKey([tsla, nvda]))
})

test('race selection resumes after the newest onchain pair and skips an already-open combination', () => {
  const configs = [
    { assetId: 'NVDA' }, { assetId: 'TSLA' }, { assetId: 'AAPL' },
    { assetId: 'META' }, { assetId: 'MSFT' }, { assetId: 'GOOGL' },
  ]
  const encoded = (symbols) => symbols.map((symbol) => stringToHex(symbol, { size: 32 }))
  const newest = encoded(['MSFT', 'GOOGL'])

  assert.deepEqual(
    nextRaceConfigsToSeed(configs, 2, newest, new Set()),
    [{ assetId: 'NVDA' }, { assetId: 'TSLA' }],
  )

  const blocked = new Set([raceCombinationKey(encoded(['NVDA', 'TSLA']))])
  assert.deepEqual(
    nextRaceConfigsToSeed(configs, 2, newest, blocked),
    [{ assetId: 'AAPL' }, { assetId: 'META' }],
  )
})

test('race selection also blocks a repeated open title after lobby assets expand', () => {
  const configs = [
    { assetId: 'NVDA' }, { assetId: 'TSLA' }, { assetId: 'AAPL' }, { assetId: 'META' },
  ]
  const encoded = (symbols) => symbols.map((symbol) => stringToHex(symbol, { size: 32 }))

  assert.deepEqual(
    nextRaceConfigsToSeed(
      configs,
      2,
      encoded(['AAPL', 'META']),
      new Set([raceCombinationKey(encoded(['NVDA', 'TSLA', 'AAPL']))]),
      new Set(['nvda vs tsla']),
    ),
    [{ assetId: 'AAPL' }, { assetId: 'META' }],
  )
})

test('pickCommunityRaceAssetIdsFrom encodes the rotated selection', () => {
  const configs = [{ assetId: 'NVDA' }, { assetId: 'TSLA' }, { assetId: 'AAPL' }]
  assert.deepEqual(
    pickCommunityRaceAssetIdsFrom(configs, 2, 1),
    [stringToHex('TSLA', { size: 32 }), stringToHex('AAPL', { size: 32 })],
  )
})

test('communityRaceTitleFor joins the candidate tickers and stays under the byte cap', () => {
  assert.equal(communityRaceTitleFor([{ assetId: 'NVDA' }, { assetId: 'TSLA' }]), 'NVDA vs TSLA')
})
