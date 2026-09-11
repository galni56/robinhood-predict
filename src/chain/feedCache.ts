import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'

// A separate systemd service on the VPS (poll-feeds.mjs) polls every
// allowlisted Chainlink feed's latestRoundData()/decimals() directly
// against the RPC on its own throttled schedule and writes this snapshot.
// Reading it here means concurrent users never translate into RPC load
// for feed prices at all -- one shared query (same queryKey everywhere)
// fetches every feed's price in a single request, replacing what used to
// be a decimals() + latestRoundData() read per feed per component.
//
// Only exists on the VPS deploy (nginx serves /api/feed-cache/, see
// CLAUDE.md) -- GitHub Pages has no such endpoint, so this query fails
// there and callers should treat a missing/failed snapshot as "fall back
// to reading the chain directly for this feed" rather than a hard error.
export interface FeedSnapshotEntry {
  decimals: number
  answer: string
  updatedAt: string
}

type FeedSnapshot = Record<string, FeedSnapshotEntry>

export function useFeedSnapshot() {
  return useQuery({
    queryKey: ['feed-snapshot'],
    queryFn: async () => {
      const res = await fetch('/api/feed-cache/prices.json', { cache: 'no-store' })
      if (!res.ok) throw new Error(`feed snapshot fetch failed: ${res.status}`)
      return (await res.json()) as FeedSnapshot
    },
    refetchInterval: 2_000,
    retry: 1,
  })
}

/** Look up one feed's price/decimals from an already-fetched snapshot,
 * scaled to a plain USD number. Returns undefined if the feed isn't in the
 * snapshot (not yet polled, or the poller's list is stale) -- callers
 * should fall back to an on-chain read in that case. */
export function readSnapshotPrice(snapshot: FeedSnapshot | undefined, feed: Address | undefined) {
  if (!snapshot || !feed) return undefined
  const entry = snapshot[feed]
  if (!entry) return undefined
  return Number(entry.answer) / 10 ** entry.decimals
}
