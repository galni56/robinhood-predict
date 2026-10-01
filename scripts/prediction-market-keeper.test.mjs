import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ActiveMarketTracker,
  pollMarketContexts,
  predictionMarketKeeperAbi,
  predictionMarketKeeperV1Abi,
  endpointProofForMarket,
  readKeeperConfig,
  REVIEWED_LEGACY_PREDICTION_MARKET_ADDRESS,
  transitionForMarket,
  verifyConfiguredAssets,
  verifyLegacyConfiguredAssets,
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

test('keeper accepts only the reviewed legacy V1 address', () => {
  const names = [
    'PREDICTION_MARKET_RPC_URL',
    'PREDICTION_MARKET_ADDRESS',
    'PREDICTION_MARKET_SIGNED_POOL_ORACLE_ADDRESS',
    'PREDICTION_MARKET_LEGACY_ADDRESS',
  ]
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  try {
    process.env.PREDICTION_MARKET_RPC_URL = 'https://rpc.invalid'
    process.env.PREDICTION_MARKET_ADDRESS = `0x${'11'.repeat(20)}`
    process.env.PREDICTION_MARKET_SIGNED_POOL_ORACLE_ADDRESS = `0x${'22'.repeat(20)}`
    process.env.PREDICTION_MARKET_LEGACY_ADDRESS = `0x${'33'.repeat(20)}`
    assert.throws(() => readKeeperConfig(), /not the reviewed V1 contract/)
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]
      else process.env[name] = previous[name]
    }
  }
})

test('legacy keeper ABI decodes the exact V1 market tuple', () => {
  const getMarket = predictionMarketKeeperV1Abi.find((item) => item.name === 'getMarket')
  assert.equal(getMarket.outputs[0].components.length, 13)
  assert.equal(getMarket.outputs[0].components.at(-1).name, 'feeBp')
  assert.equal(REVIEWED_LEGACY_PREDICTION_MARKET_ADDRESS, '0x4bfd0efc15C3198fe3AFf4741FF121AB2F38060e')
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
  const matchingClient = {
    async getBytecode() { return '0x6000' },
    async readContract({ functionName }) {
      if (functionName === 'feeBp') return 200n
      if (functionName === 'CREATOR_FEE_SHARE_BP') return 5_000n
      if (functionName === 'endpointOracle') return `0x${'78'.repeat(20)}`
      if (functionName === 'approvedAssets') return [oracleId, 18, true]
      throw new Error(`unexpected call ${functionName}`)
    },
  }
  assert.equal(await verifyConfiguredAssets(matchingClient, `0x${'34'.repeat(20)}`, configs), true)

  const wrongClient = {
    ...matchingClient,
    async readContract({ functionName }) {
      if (functionName === 'approvedAssets') return [`0x${'56'.repeat(32)}`, 18, true]
      return matchingClient.readContract({ functionName })
    },
  }
  await assert.rejects(
    verifyConfiguredAssets(wrongClient, `0x${'34'.repeat(20)}`, configs),
    /PredictionMarket asset binding mismatch: NVDA/,
  )
})

test('legacy keeper validates code, fee, oracle and bindings without a creator-share getter', async () => {
  const configs = [{ assetId: 'NVDA', oracleId }]
  const client = {
    async getBytecode() { return '0x6000' },
    async readContract({ functionName }) {
      if (functionName === 'feeBp') return 200n
      if (functionName === 'endpointOracle') return `0x${'78'.repeat(20)}`
      if (functionName === 'approvedAssets') return [oracleId, 18, true]
      if (functionName === 'CREATOR_FEE_SHARE_BP') throw new Error('unexpected V2 getter')
      throw new Error(`unexpected call ${functionName}`)
    },
  }
  assert.equal(await verifyLegacyConfiguredAssets(
    client,
    REVIEWED_LEGACY_PREDICTION_MARKET_ADDRESS,
    configs,
    { expectedOracleAddress: `0x${'78'.repeat(20)}` },
  ), true)
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

test('one keeper processes V2 and V1 writes sequentially with the correct ABI', async () => {
  const v2Address = `0x${'44'.repeat(20)}`
  const v1Address = REVIEWED_LEGACY_PREDICTION_MARKET_ADDRESS
  const writes = []
  const simulations = []
  const logs = []
  const publicClient = {
    async readContract({ functionName }) {
      if (functionName === 'marketCount') return 1n
      if (functionName === 'getMarket') return market({ poolNo: 0n })
      if (functionName === 'participantCount') return 1n
      throw new Error(`unexpected call ${functionName}`)
    },
    async simulateContract(request) {
      simulations.push(request)
      return { request: { address: request.address } }
    },
    async waitForTransactionReceipt() { return { status: 'success' } },
  }
  const walletClient = {
    async writeContract(request) {
      writes.push(request.address)
      return `0x${String(writes.length).padStart(64, '0')}`
    },
  }
  await pollMarketContexts({
    blockTimestamp: 1_001n,
    collector: {},
    contexts: [
      { abi: predictionMarketKeeperAbi, address: v2Address, label: 'v2', tracker: new ActiveMarketTracker() },
      { abi: predictionMarketKeeperV1Abi, address: v1Address, label: 'v1', tracker: new ActiveMarketTracker() },
    ],
    dryRun: false,
    logger: { log(message) { logs.push(message) }, error() {} },
    publicClient,
    walletClient,
  })

  assert.deepEqual(writes, [v2Address, v1Address])
  assert.equal(simulations[0].abi, predictionMarketKeeperAbi)
  assert.equal(simulations[1].abi, predictionMarketKeeperV1Abi)
  assert.match(logs[0], /keeper:v2/)
  assert.match(logs[1], /keeper:v1/)
})
