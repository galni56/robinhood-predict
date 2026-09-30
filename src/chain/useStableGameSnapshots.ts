import { useEffect, useState } from 'react'
import {
  readSessionGameSnapshots,
  reconcileGameSnapshotsWhenReady,
  writeSessionGameSnapshots,
  type GameSnapshotWithId,
} from '@/chain/gameSnapshots'

interface StableSnapshotOptions {
  cacheKey?: string
  idsReady?: boolean
}

/** Retains complete cards while a refreshed multicall is temporarily partial. */
export function useStableGameSnapshots<T extends GameSnapshotWithId>(
  currentIds: readonly bigint[],
  observed: readonly (T | null)[],
  { cacheKey, idsReady = true }: StableSnapshotOptions = {},
) {
  const [stable, setStable] = useState<T[]>(() =>
    cacheKey ? readSessionGameSnapshots<T>(cacheKey) : [],
  )
  const merged = reconcileGameSnapshotsWhenReady(stable, currentIds, observed, idsReady)

  useEffect(() => {
    if (!idsReady) return
    // Query snapshots are an external RPC data source. Persisting their last
    // complete merge is intentional: it prevents partial polls from erasing UI.
    // oxlint-disable-next-line react/set-state-in-effect
    setStable((previous) => {
      const next = reconcileGameSnapshotsWhenReady(previous, currentIds, observed, true)
      if (cacheKey) writeSessionGameSnapshots(cacheKey, next)
      return next.length === previous.length && next.every((item, index) => item === previous[index])
        ? previous
        : next
    })
  }, [cacheKey, currentIds, idsReady, observed])

  return merged
}
