export interface GameHistoryIndex {
  /** Every active/resolved game plus cancelled games that received a stake. */
  visibleIds: bigint[]
  /** Resolved/void games plus played cancellations, newest first. */
  terminalIds: bigint[]
  /** Contract count covered by this event snapshot. */
  indexedCount: number
}

function descendingUnique(ids: readonly bigint[]) {
  return [...new Set(ids.map(String))]
    .map(BigInt)
    .sort((a, b) => (a === b ? 0 : a > b ? -1 : 1))
}

export function terminalPlayedIds(
  completedIds: readonly bigint[],
  cancelledIds: readonly bigint[],
  playedIds: readonly bigint[],
) {
  const played = new Set(playedIds.map(String))
  return descendingUnique([
    ...completedIds,
    ...cancelledIds.filter((id) => played.has(id.toString())),
  ])
}

export function buildGameHistoryIndex(
  createdIds: readonly bigint[],
  completedIds: readonly bigint[],
  cancelledIds: readonly bigint[],
  playedIds: readonly bigint[],
): GameHistoryIndex {
  const played = new Set(playedIds.map(String))
  const emptyCancellations = new Set(
    cancelledIds.filter((id) => !played.has(id.toString())).map(String),
  )
  const everyKnownId = descendingUnique([
    ...createdIds,
    ...completedIds,
    ...cancelledIds,
    ...playedIds,
  ])
  const indexedCount = everyKnownId.length > 0 ? Number(everyKnownId[0] + 1n) : 0
  return {
    visibleIds: everyKnownId.filter((id) => !emptyCancellations.has(id.toString())),
    terminalIds: terminalPlayedIds(completedIds, cancelledIds, playedIds),
    indexedCount,
  }
}

/**
 * Merge the event index with IDs created after its latest scan. The onchain
 * count refreshes every second, so a new game appears immediately rather than
 * waiting for the slower full-history event refresh.
 */
export function visibleIdsThroughCount(index: GameHistoryIndex | undefined, count: number, newestFirst = true) {
  if (!index) return []
  const ids = [...index.visibleIds]
  for (let id = index.indexedCount; id < count; id += 1) ids.push(BigInt(id))
  const unique = descendingUnique(ids)
  return newestFirst ? unique : unique.reverse()
}
