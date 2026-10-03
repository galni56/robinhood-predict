import { useMemo } from 'react'
import { Buffer } from 'buffer'
import { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { usePrograms } from '@/solana/programs'
import { arenaFromAccount, type PriceArenaViewModel } from '@/chain/priceArena'
import { useHistory } from '@/chain/history'

const byNewest = (a: { id: bigint }, b: { id: bigint }) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0)

/** Every arena, from the indexer snapshot or, as a fallback, a direct program scan. */
export function usePriceArenas() {
  const { games } = usePrograms()
  const history = useHistory()
  const programId = games.programId.toBase58()
  const indexed = history.data?.programId === programId ? history.data : undefined
  const useDirect = history.isError || (history.data != null && !indexed)
  const direct = useQuery({
    queryKey: ['arenas', programId],
    queryFn: async () => (await games.account.arena.all()).map((a) => arenaFromAccount(a.publicKey, a.account)),
    enabled: useDirect,
    refetchInterval: 10_000,
  })

  const arenas = useMemo<PriceArenaViewModel[]>(() => {
    if (!indexed) return direct.data ?? []
    return indexed.arenas.flatMap((row) => {
      try {
        return [arenaFromAccount(new PublicKey(row.address), games.coder.accounts.decode('arena', Buffer.from(row.data, 'base64')))]
      } catch {
        return []
      }
    })
  }, [direct.data, games, indexed]).sort(byNewest)

  return {
    arenas,
    isLoading: indexed ? false : useDirect ? direct.isLoading : history.isLoading,
    error: useDirect ? direct.error : null,
    refetch: async () => { await Promise.all([history.refetch(), useDirect ? direct.refetch() : null]) },
  }
}
