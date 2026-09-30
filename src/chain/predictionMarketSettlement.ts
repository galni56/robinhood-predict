/**
 * Decode PredictionMarket.settlements(id) defensively.
 *
 * viem returns the three Solidity outputs as a tuple. Reject any stale or
 * mismatched multicall row instead of coercing its first field (for example a
 * bytes32 asset id from getMarket) into a displayed dollar price.
 */
export function predictionSettlementPrice(result: unknown): bigint | undefined {
  if (!Array.isArray(result) || typeof result[0] !== 'bigint') return undefined
  return result[0]
}
