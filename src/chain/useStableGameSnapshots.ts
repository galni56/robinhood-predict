import { useEffect, useState } from 'react'
import {
  readSessionGameSnapshots,
  reconcileGameSnapshotsWhenReady,
  selectMonotonicGameCount,
  writeSessionGameSnapshots,
  type GameSnapshotWithId,
} from '@/chain/gameSnapshots'

const sessionGameCountCache = new Map<string, bigint>()

interface StableSnapshotOptions {
  cacheKey?: string
  idsReady?: boolean
}

/**
 * Contract game counts are append-only. Some public RPC nodes can briefly
 * answer from an older block after navigation or endpoint failover; accepting
 * that lower count prunes valid cards from the visible id set. Keep the
 * session high-water mark so stale reads can never make games disappear.
 */
export function useStableGameCount(cacheKey: string, observed: bigint | undefined) {
  const [stable, setStable] = useState(() => sessionGameCountCache.get(cacheKey) ?? 0n)
  const current = selectMonotonicGameCount(stable, observed)

  useEffect(() => {
    if (observed == null) return
    // This mirrors the snapshot cache below: the external RPC observation is
    // committed after render and reused by every route in the SPA session.
    // oxlint-disable-next-line react/set-state-in-effect
    setStable((previous) => {
      const next = selectMonotonicGameCount(previous, observed)
      sessionGameCountCache.set(cacheKey, next)
      return next
    })
  }, [cacheKey, observed])

  return current
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
