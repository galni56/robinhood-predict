import { useMemo } from 'react'
import { Buffer } from 'buffer'
import { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { usePrograms } from '@/solana/programs'
import { useHistory, type HistoryGameRow } from '@/chain/history'
import { INDEXER_URL } from '@/solana/services'

const byNewest = (a: { id: bigint }, b: { id: bigint }) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0)

// One decode per indexer row, shared by every hook instance (Landing,
// Archive and Portfolio all mount these hooks). react-query's structural
// sharing keeps an unchanged row the same object across polls, so the
// snapshot's 5s updatedAt churn no longer re-runs Borsh over every game.
// Rows are plain account state - nothing clock-dependent may be cached here.
const decodeCache = new WeakMap<HistoryGameRow, unknown>()

/**
 * Every game of one kind: from the indexer snapshot (one shared server-side
 * scan), or a direct program scan when the indexer is unreachable or serves
 * another program. Shared core of useAssetRaces/usePriceArenas.
 */
export function useIndexedGames<T extends { id: bigint }>(
  accountName: 'race' | 'arena',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fromAccount: (address: PublicKey, account: any) => T,
) {
  const { games } = usePrograms()
  const history = useHistory()
  const programId = games.programId.toBase58()
  const indexed = history.data?.programId === programId ? history.data : undefined
  const rows = accountName === 'race' ? indexed?.races : indexed?.arenas
  const useDirect = INDEXER_URL == null || history.isError || (history.data != null && !indexed)
  const direct = useQuery({
    queryKey: [`${accountName}s`, programId],
    queryFn: async () => (await games.account[accountName].all()).map((r) => fromAccount(r.publicKey, r.account)),
    enabled: useDirect,
    refetchInterval: 10_000,
  })

  const list = useMemo<T[]>(() => {
    const source = rows
      ? rows.flatMap((row) => {
          const cached = decodeCache.get(row) as T | undefined
          if (cached) return [cached]
          try {
            const model = fromAccount(
              new PublicKey(row.address),
              games.coder.accounts.decode(accountName, Buffer.from(row.data, 'base64')),
            )
            decodeCache.set(row, model)
            return [model]
          } catch {
            return []
          }
        })
      : (direct.data ?? [])
    // Copy before sorting: `source` may be react-query's cached array, and
    // an in-place sort would silently mutate the cache.
    return [...source].sort(byNewest)
  }, [accountName, direct.data, fromAccount, games, rows])

  return {
    list,
    isLoading: indexed ? false : useDirect ? direct.isLoading : history.isLoading,
    error: useDirect ? direct.error : null,
    refetch: async () => {
      await Promise.all([history.refetch(), useDirect ? direct.refetch() : null])
    },
  }
}
