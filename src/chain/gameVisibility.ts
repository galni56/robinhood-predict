/**
 * A cancelled game is useful history only after at least one real stake
 * reached its pool. Keep this rule shared so list tabs and Archive cannot
 * silently disagree about one-sided/undersubscribed games.
 */
export function isPlayedCancellation(status: number, cancelledStatus: number, totalPool: bigint) {
  return status === cancelledStatus && totalPool > 0n
}

/** `All` keeps every non-cancelled state and only played cancellations. */
export function isVisibleInAll(status: number, cancelledStatus: number, totalPool: bigint) {
  return status !== cancelledStatus || totalPool > 0n
}
