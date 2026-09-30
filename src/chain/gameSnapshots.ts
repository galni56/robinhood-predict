export interface GameSnapshotWithId {
  id: bigint
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

export function isActiveOnchainStatus(status: number, terminalStatuses: readonly number[]) {
  return !terminalStatuses.includes(status)
}
