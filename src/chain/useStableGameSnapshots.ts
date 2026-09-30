import { useEffect, useState } from 'react'
import { reconcileGameSnapshots, type GameSnapshotWithId } from '@/chain/gameSnapshots'

/** Retains complete cards while a refreshed multicall is temporarily partial. */
export function useStableGameSnapshots<T extends GameSnapshotWithId>(
  currentIds: readonly bigint[],
  observed: readonly (T | null)[],
) {
  const [stable, setStable] = useState<T[]>([])
  const merged = reconcileGameSnapshots(stable, currentIds, observed)

  useEffect(() => {
    // Query snapshots are an external RPC data source. Persisting their last
    // complete merge is intentional: it prevents partial polls from erasing UI.
    // oxlint-disable-next-line react/set-state-in-effect
    setStable((previous) => {
      const next = reconcileGameSnapshots(previous, currentIds, observed)
      return next.length === previous.length && next.every((item, index) => item === previous[index])
        ? previous
        : next
    })
  }, [currentIds, observed])

  return merged
}
