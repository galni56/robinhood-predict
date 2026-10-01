import { stringToHex, zeroAddress } from 'viem'

export const PREDICTION_MARKET_RELEASE_FEE_BP = 200n
export const PREDICTION_MARKET_CREATOR_SHARE_BP = 5_000n
export const PREDICTION_MARKET_CANARY_STAKE_WEI = 100_000_000_000_000n
export const PREDICTION_MARKET_CANARY_CREATOR_FEE_WEI = 1_000_000_000_000n
export const REVIEWED_LEGACY_PREDICTION_MARKET_ADDRESS = '0x4bfd0efc15C3198fe3AFf4741FF121AB2F38060e'

const predictionMarketReleaseAbi = [
  { type: 'function', name: 'feeBp', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'CREATOR_FEE_SHARE_BP', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'endpointOracle', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    type: 'function', name: 'approvedAssets', stateMutability: 'view',
    inputs: [{ name: 'assetId', type: 'bytes32' }],
    outputs: [
      { name: 'oracleId', type: 'bytes32' },
      { name: 'decimals', type: 'uint8' },
      { name: 'allowed', type: 'bool' },
    ],
  },
]

async function readPredictionMarketBaseRelease(publicClient, marketAddress, configs) {
  const [bytecode, feeBp, endpointOracle, bindings] = await Promise.all([
    publicClient.getBytecode({ address: marketAddress }),
    publicClient.readContract({ address: marketAddress, abi: predictionMarketReleaseAbi, functionName: 'feeBp' }),
    publicClient.readContract({ address: marketAddress, abi: predictionMarketReleaseAbi, functionName: 'endpointOracle' }),
    Promise.all(configs.map((config) => publicClient.readContract({
      address: marketAddress,
      abi: predictionMarketReleaseAbi,
      functionName: 'approvedAssets',
      args: [stringToHex(config.assetId, { size: 32 })],
    }))),
  ])
  return { bindings, bytecode, endpointOracle, feeBp }
}

function assertPredictionMarketBaseRelease(
  { bindings, bytecode, endpointOracle, feeBp },
  configs,
  expectedOracleAddress,
) {
  if (!bytecode || bytecode === '0x') throw new Error('PredictionMarket release address has no contract code')
  if (BigInt(feeBp) !== PREDICTION_MARKET_RELEASE_FEE_BP) {
    throw new Error(`PredictionMarket release fee mismatch: expected ${PREDICTION_MARKET_RELEASE_FEE_BP}, got ${feeBp}`)
  }
  if (endpointOracle.toLowerCase() === zeroAddress) throw new Error('PredictionMarket endpoint oracle is zero')
  if (expectedOracleAddress && endpointOracle.toLowerCase() !== expectedOracleAddress.toLowerCase()) {
    throw new Error('PredictionMarket endpoint oracle does not match the configured signed pool oracle')
  }

  for (let index = 0; index < configs.length; index += 1) {
    const [oracleId, decimals, allowed] = bindings[index]
    const config = configs[index]
    if (!allowed || oracleId.toLowerCase() !== config.oracleId.toLowerCase() || Number(decimals) !== 18) {
      throw new Error(`PredictionMarket asset binding mismatch: ${config.assetId}`)
    }
  }
}

/**
 * Fail-closed compatibility gate shared by every process that can create or
 * settle Prediction Markets. It checks contract capabilities and frozen
 * release economics, so a stale V1 address cannot silently receive writes.
 */
export async function verifyPredictionMarketRelease(
  publicClient,
  marketAddress,
  configs,
  { expectedOracleAddress } = {},
) {
  const [baseRelease, creatorShareBp] = await Promise.all([
    readPredictionMarketBaseRelease(publicClient, marketAddress, configs),
    publicClient.readContract({
      address: marketAddress,
      abi: predictionMarketReleaseAbi,
      functionName: 'CREATOR_FEE_SHARE_BP',
    }),
  ])

  assertPredictionMarketBaseRelease(baseRelease, configs, expectedOracleAddress)
  if (BigInt(creatorShareBp) !== PREDICTION_MARKET_CREATOR_SHARE_BP) {
    throw new Error(`PredictionMarket creator share mismatch: expected ${PREDICTION_MARKET_CREATOR_SHARE_BP}, got ${creatorShareBp}`)
  }
  return true
}

/**
 * Compatibility gate for the immutable V1 contract while it remains in
 * settlement-only mode. Unlike the V2 gate it intentionally does not call the
 * V2-only creator-share getter, but it still pins code, fee, oracle and every
 * reviewed asset binding before the keeper is allowed to write.
 */
export async function verifyLegacyPredictionMarketRelease(
  publicClient,
  marketAddress,
  configs,
  { expectedOracleAddress } = {},
) {
  const baseRelease = await readPredictionMarketBaseRelease(publicClient, marketAddress, configs)
  assertPredictionMarketBaseRelease(baseRelease, configs, expectedOracleAddress)
  return true
}

/**
 * Final fail-closed gate for the two reviewed V2 canaries. This deliberately
 * requires the pristine two-canary deployment: once public seeding starts the
 * release has already crossed this gate and this exact rehearsal is no longer
 * repeatable from aggregate balances alone.
 */
export function assessPredictionMarketCanaries(snapshot) {
  const expectedCreatorFee = PREDICTION_MARKET_CANARY_CREATOR_FEE_WEI
  const checks = {
    onlyReviewedCanariesExist: snapshot.marketCount === 2n,
    settlementMarketResolved: Number(snapshot.settlementMarket.status) === 1,
    cancellationMarketCancelled: Number(snapshot.cancellationMarket.status) === 2,
    settlementHasTwoParticipants: snapshot.settlementParticipantCount === 2n,
    cancellationHasOneParticipant: snapshot.cancellationParticipantCount === 1n,
    winnerClaimed: snapshot.winnerClaimed === true,
    cancellationFullyRefunded: snapshot.cancellationStakesRemaining === 0n,
    creatorFeeRecorded: snapshot.marketCreatorFee === expectedCreatorFee,
    creatorBalanceAccrued: snapshot.creatorEarnings === expectedCreatorFee,
    creatorLiabilitySeparated: snapshot.totalCreatorEarningsLiability === expectedCreatorFee,
    protocolFeeSeparated: snapshot.accumulatedFees === expectedCreatorFee,
    exactResidualBalance: snapshot.contractBalance === expectedCreatorFee * 2n,
  }
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
  return { complete: failures.length === 0, checks, failures }
}
