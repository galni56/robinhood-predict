import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ActiveMarketTracker,
  endpointProofForMarket,
  readKeeperConfig,
  transitionForMarket,
  verifyConfiguredAssets,
} from './prediction-market-keeper.mjs'

const oracleId = `0x${'12'.repeat(32)}`

test('keeper requires a dedicated PredictionMarket lifecycle RPC', () => {
  const predictionRpc = process.env.PREDICTION_MARKET_RPC_URL
  const raceRpc = process.env.ASSET_RACE_RPC_URL
  try {
    delete process.env.PREDICTION_MARKET_RPC_URL
    process.env.ASSET_RACE_RPC_URL = 'https://asset-race-rpc.invalid'
    assert.throws(() => readKeeperConfig(), /PREDICTION_MARKET_RPC_URL is required/)
  } finally {
    if (predictionRpc === undefined) delete process.env.PREDICTION_MARKET_RPC_URL
    else process.env.PREDICTION_MARKET_RPC_URL = predictionRpc
    if (raceRpc === undefined) delete process.env.ASSET_RACE_RPC_URL
    else process.env.ASSET_RACE_RPC_URL = raceRpc
  }
})

function market(overrides = {}) {
  return {
    oracleId,
    deadline: 1_000n,
    poolYes: 1n,
    poolNo: 1n,
    participantCount: 2n,
    status: 0,
    ...overrides,
  }
}

test('only open markets at or after their deadline transition', () => {
  assert.equal(transitionForMarket(market(), 999n), undefined)
  assert.equal(transitionForMarket(market({ status: 1 }), 1_000n), undefined)
  assert.deepEqual(transitionForMarket(market(), 1_000n), {
    needsEndpointProof: true,
    outcome: 'DEADLINE_SETTLEMENT',
  })
})

test('one-sided markets cancel without an oracle proof', async () => {
  const oneSided = market({ poolNo: 0n })
  assert.deepEqual(transitionForMarket(oneSided, 1_001n), {
    needsEndpointProof: false,
    outcome: 'CANCELLED',
  })
  assert.equal(await endpointProofForMarket({}, oneSided), '0x')
})

test('one participant funding both sides cancels without an oracle proof', async () => {
  const oneParticipant = market({ participantCount: 1n })
  assert.deepEqual(transitionForMarket(oneParticipant, 1_001n), {
    needsEndpointProof: false,
    outcome: 'CANCELLED',
  })
  assert.equal(await endpointProofForMarket({}, oneParticipant), '0x')
})

test('two-sided markets collect a signed pool proof for the exact deadline and oracle id', async () => {
  let received
  const collector = { async proofsFor(oracleIds, targetTimestamp) {
    received = { oracleIds, targetTimestamp }
    return { proofs: new Map([[oracleId.toLowerCase(), '0x1234']]) }
  } }
  const proof = await endpointProofForMarket(collector, market())
  assert.equal(proof, '0x1234')
  assert.equal(received.targetTimestamp, 1_000n)
  assert.deepEqual(received.oracleIds, [oracleId])
})

test('keeper fails closed when an onchain asset binding differs from the reviewed pool registry', async () => {
  const configs = [{ assetId: 'NVDA', oracleId }]
  const matchingClient = { async readContract() { return [oracleId, 18, true] } }
  assert.equal(await verifyConfiguredAssets(matchingClient, `0x${'34'.repeat(20)}`, configs), true)

  const wrongClient = { async readContract() { return [`0x${'56'.repeat(32)}`, 18, true] } }
  await assert.rejects(
    verifyConfiguredAssets(wrongClient, `0x${'34'.repeat(20)}`, configs),
    /PredictionMarket asset binding mismatch: NVDA/,
  )
})

test('keeper scans existing markets once, then reads only new and due open markets', async () => {
  const contractAddress = `0x${'34'.repeat(20)}`
  const markets = new Map([
    [0n, market({ status: 1, deadline: 10n })],
    [1n, market({ deadline: 100n })],
    [2n, market({ deadline: 200n })],
  ])
  const reads = []
  const publicClient = { async readContract({ args }) {
    reads.push(args[0])
    return markets.get(args[0])
  } }
  const tracker = new ActiveMarketTracker()

  await tracker.discover(publicClient, contractAddress, 3n)
  assert.deepEqual(reads, [0n, 1n, 2n])
  assert.deepEqual(tracker.dueMarketIds(99n), [])

  await tracker.discover(publicClient, contractAddress, 3n)
  assert.deepEqual(reads, [0n, 1n, 2n])

  markets.set(3n, market({ deadline: 300n }))
  await tracker.discover(publicClient, contractAddress, 4n)
  assert.deepEqual(reads, [0n, 1n, 2n, 3n])
  assert.deepEqual(tracker.dueMarketIds(100n), [1n])

  await tracker.refresh(publicClient, contractAddress, 1n)
  assert.deepEqual(reads, [0n, 1n, 2n, 3n, 1n])
  tracker.complete(1n)
  assert.deepEqual(tracker.dueMarketIds(1_000n), [2n, 3n])
})

test('tracker reports the soonest deadline across tracked markets, or undefined when idle', () => {
  const tracker = new ActiveMarketTracker()
  assert.equal(tracker.earliestDueAt(), undefined)

  tracker.observe(0n, market({ deadline: 300n }))
  tracker.observe(1n, market({ deadline: 150n }))
  assert.equal(tracker.earliestDueAt(), 150n)

  tracker.complete(1n)
  assert.equal(tracker.earliestDueAt(), 300n)

  tracker.observe(0n, market({ status: 1 })) // resolved -> terminal -> no longer tracked
  assert.equal(tracker.earliestDueAt(), undefined)
})
