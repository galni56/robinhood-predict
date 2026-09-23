import { encodeAbiParameters, getAddress } from 'viem'

const ROUND_PHASE_SHIFT = 64n
const AGGREGATOR_ROUND_MASK = (1n << ROUND_PHASE_SHIFT) - 1n

export const chainlinkFeedAbi = [
  {
    type: 'function',
    name: 'latestRoundData',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
  {
    type: 'function',
    name: 'getRoundData',
    stateMutability: 'view',
    inputs: [{ name: 'roundId', type: 'uint80' }],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
]

export function feedAddressFromOracleId(oracleId) {
  if (!/^0x0{24}[0-9a-fA-F]{40}$/.test(oracleId)) throw new Error('InvalidChainlinkOracleId')
  return getAddress(`0x${oracleId.slice(-40)}`)
}

/** Finds the first Chainlink round at or after targetTimestamp and returns
 * the adjacent-round proof verified onchain by ChainlinkV3RaceOracle. */
export async function chainlinkRoundProof(publicClient, oracleId, targetTimestamp) {
  const feed = feedAddressFromOracleId(oracleId)
  const latest = await publicClient.readContract({ address: feed, abi: chainlinkFeedAbi, functionName: 'latestRoundData' })
  const latestRoundId = latest[0]
  if (latest[3] < targetTimestamp) throw new Error('EndpointObservationNotAvailable')

  const phase = latestRoundId >> ROUND_PHASE_SHIFT
  let low = 1n
  let high = latestRoundId & AGGREGATOR_ROUND_MASK
  while (low < high) {
    const middle = (low + high) >> 1n
    const roundId = (phase << ROUND_PHASE_SHIFT) | middle
    const round = await publicClient.readContract({
      address: feed,
      abi: chainlinkFeedAbi,
      functionName: 'getRoundData',
      args: [roundId],
    })
    if (round[3] >= targetTimestamp) high = middle
    else low = middle + 1n
  }

  if (low === 1n) throw new Error('ChainlinkPhaseBoundaryUnsupported')
  const selectedRoundId = (phase << ROUND_PHASE_SHIFT) | low
  const previousRoundId = selectedRoundId - 1n
  return encodeAbiParameters(
    [{ type: 'uint80' }, { type: 'uint80' }],
    [selectedRoundId, previousRoundId],
  )
}
