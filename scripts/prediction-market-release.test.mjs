import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assessPredictionMarketCanaries,
  verifyLegacyPredictionMarketRelease,
  verifyPredictionMarketRelease,
} from './prediction-market-release.mjs'

const marketAddress = `0x${'11'.repeat(20)}`
const oracleAddress = `0x${'22'.repeat(20)}`
const oracleId = `0x${'33'.repeat(32)}`
const configs = [{ assetId: 'NVDA', oracleId }]

function releaseClient(overrides = {}) {
  return {
    async getBytecode() { return overrides.bytecode ?? '0x6000' },
    async readContract({ functionName }) {
      if (functionName === 'feeBp') return overrides.feeBp ?? 200n
      if (functionName === 'CREATOR_FEE_SHARE_BP') return overrides.creatorShareBp ?? 5_000n
      if (functionName === 'endpointOracle') return overrides.endpointOracle ?? oracleAddress
      if (functionName === 'approvedAssets') return overrides.binding ?? [oracleId, 18, true]
      throw new Error(`unexpected call ${functionName}`)
    },
  }
}

test('PredictionMarket V2 release gate accepts the reviewed economics, oracle and asset binding', async () => {
  assert.equal(await verifyPredictionMarketRelease(
    releaseClient(),
    marketAddress,
    configs,
    { expectedOracleAddress: oracleAddress },
  ), true)
})

test('PredictionMarket V2 release gate rejects an EOA and stale V1 economics', async () => {
  await assert.rejects(
    verifyPredictionMarketRelease(releaseClient({ bytecode: '0x' }), marketAddress, configs),
    /has no contract code/,
  )
  await assert.rejects(
    verifyPredictionMarketRelease(releaseClient({ feeBp: 300n }), marketAddress, configs),
    /release fee mismatch/,
  )
  await assert.rejects(
    verifyPredictionMarketRelease(releaseClient({ creatorShareBp: 0n }), marketAddress, configs),
    /creator share mismatch/,
  )
})

test('PredictionMarket V2 release gate rejects the wrong oracle or asset binding', async () => {
  await assert.rejects(
    verifyPredictionMarketRelease(
      releaseClient(),
      marketAddress,
      configs,
      { expectedOracleAddress: `0x${'44'.repeat(20)}` },
    ),
    /does not match the configured signed pool oracle/,
  )
  await assert.rejects(
    verifyPredictionMarketRelease(
      releaseClient({ binding: [`0x${'55'.repeat(32)}`, 18, true] }),
      marketAddress,
      configs,
    ),
    /asset binding mismatch: NVDA/,
  )
})

test('legacy release gate validates V1 without requiring the V2-only creator getter', async () => {
  const functionNames = []
  const client = releaseClient()
  const legacyClient = {
    ...client,
    async readContract(args) {
      functionNames.push(args.functionName)
      if (args.functionName === 'CREATOR_FEE_SHARE_BP') throw new Error('V2 getter called on V1')
      return client.readContract(args)
    },
  }
  assert.equal(await verifyLegacyPredictionMarketRelease(
    legacyClient,
    marketAddress,
    configs,
    { expectedOracleAddress: oracleAddress },
  ), true)
  assert.equal(functionNames.includes('CREATOR_FEE_SHARE_BP'), false)
})

function completeCanarySnapshot(overrides = {}) {
  return {
    marketCount: 2n,
    settlementMarket: { status: 1 },
    cancellationMarket: { status: 2 },
    settlementParticipantCount: 2n,
    cancellationParticipantCount: 1n,
    winnerClaimed: true,
    cancellationStakesRemaining: 0n,
    marketCreatorFee: 1_000_000_000_000n,
    creatorEarnings: 1_000_000_000_000n,
    totalCreatorEarningsLiability: 1_000_000_000_000n,
    accumulatedFees: 1_000_000_000_000n,
    contractBalance: 2_000_000_000_000n,
    ...overrides,
  }
}

test('PredictionMarket V2 canary gate accepts only the exact completed lifecycle and accounting', () => {
  const result = assessPredictionMarketCanaries(completeCanarySnapshot())
  assert.equal(result.complete, true)
  assert.deepEqual(result.failures, [])
})

test('PredictionMarket V2 canary gate blocks an open lifecycle or incomplete refunds', () => {
  const result = assessPredictionMarketCanaries(completeCanarySnapshot({
    settlementMarket: { status: 0 },
    cancellationStakesRemaining: 200_000_000_000_000n,
  }))
  assert.equal(result.complete, false)
  assert.deepEqual(result.failures, ['settlementMarketResolved', 'cancellationFullyRefunded'])
})

test('PredictionMarket V2 canary gate blocks mixed creator/protocol accounting', () => {
  const result = assessPredictionMarketCanaries(completeCanarySnapshot({
    creatorEarnings: 0n,
    accumulatedFees: 2_000_000_000_000n,
  }))
  assert.equal(result.complete, false)
  assert.deepEqual(result.failures, ['creatorBalanceAccrued', 'protocolFeeSeparated'])
})
