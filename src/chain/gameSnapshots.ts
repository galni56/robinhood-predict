export interface GameSnapshotWithId {
  id: bigint
}

export function selectMonotonicGameCount(previous: bigint, observed: bigint | undefined) {
  return observed != null && observed > previous ? observed : previous
}

const sessionGameSnapshotCache = new Map<string, GameSnapshotWithId[]>()

export function readSessionGameSnapshots<T extends GameSnapshotWithId>(cacheKey: string): T[] {
  return [...(sessionGameSnapshotCache.get(cacheKey) ?? [])] as T[]
}

export function writeSessionGameSnapshots<T extends GameSnapshotWithId>(cacheKey: string, snapshots: readonly T[]) {
  sessionGameSnapshotCache.set(cacheKey, [...snapshots])
}

export function clearSessionGameSnapshots(cacheKey: string) {
  sessionGameSnapshotCache.delete(cacheKey)
}

/**
 * Merge a partial RPC refresh into the last complete recent-game snapshot.
 *
 * Multicalls may temporarily return only part of a newly enlarged id window.
 * Rebuilding the UI directly from that partial response makes otherwise valid
 * cards disappear until the next poll. Successful rows are authoritative;
 * missing/failed rows retain their last complete value.
 */
export function reconcileGameSnapshots<T extends GameSnapshotWithId>(
  previous: readonly T[],
  currentIds: readonly bigint[],
  observed: readonly (T | null)[],
): T[] {
  const currentIdSet = new Set(currentIds.map((id) => id.toString()))
  const byId = new Map(
    previous
      .filter((item) => currentIdSet.has(item.id.toString()))
      .map((item) => [item.id.toString(), item]),
  )

  for (const item of observed) {
    if (item && currentIdSet.has(item.id.toString())) byId.set(item.id.toString(), item)
  }

  return currentIds.flatMap((id) => {
    const item = byId.get(id.toString())
    return item ? [item] : []
  })
}

/**
 * An undefined count during remount is not an authoritative empty game list.
 * Keep the last complete bounded window until the fresh count arrives.
 */
export function reconcileGameSnapshotsWhenReady<T extends GameSnapshotWithId>(
  previous: readonly T[],
  currentIds: readonly bigint[],
  observed: readonly (T | null)[],
  idsReady: boolean,
): T[] {
  return idsReady ? reconcileGameSnapshots(previous, currentIds, observed) : [...previous]
}

export const ACTIVE_GAME_REFRESH_OPTIONS = {
  refetchOnMount: 'always',
  refetchOnWindowFocus: 'always',
  refetchOnReconnect: 'always',
  refetchIntervalInBackground: false,
  staleTime: 0,
} as const

// Active game reads are batched per product and React Query pauses interval
// polling while the tab is hidden. A one-second cadence keeps the UI within one
// block/RPC round trip of the chain without creating one request per card.
export const ACTIVE_GAME_POLL_INTERVAL_MS = 1_000

export function isActiveOnchainStatus(status: number, terminalStatuses: readonly number[]) {
  return !terminalStatuses.includes(status)
}
