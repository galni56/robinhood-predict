import { useMemo } from 'react'
import { Buffer } from 'buffer'
import { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { usePrograms } from '@/solana/programs'
import { raceFromAccount, type AssetRaceViewModel } from '@/chain/assetRaces'
import { useHistory } from '@/chain/history'

const byNewest = (a: { id: bigint }, b: { id: bigint }) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0)

/** Every race. Read from the indexer snapshot (one shared server-side scan);
 * if the indexer is unreachable or serves another program, scan the program
 * directly instead. */
export function useAssetRaces() {
  const { games } = usePrograms()
  const history = useHistory()
  const programId = games.programId.toBase58()
  const indexed = history.data?.programId === programId ? history.data : undefined
  const useDirect = history.isError || (history.data != null && !indexed)
  const direct = useQuery({
    queryKey: ['races', programId],
    queryFn: async () => (await games.account.race.all()).map((r) => raceFromAccount(r.publicKey, r.account)),
    enabled: useDirect,
    refetchInterval: 10_000,
  })

  const races = useMemo<AssetRaceViewModel[]>(() => {
    if (!indexed) return direct.data ?? []
    return indexed.races.flatMap((row) => {
      try {
        return [raceFromAccount(new PublicKey(row.address), games.coder.accounts.decode('race', Buffer.from(row.data, 'base64')))]
      } catch {
        return []
      }
    })
  }, [direct.data, games, indexed]).sort(byNewest)

  return {
    races,
    isLoading: indexed ? false : useDirect ? direct.isLoading : history.isLoading,
    error: useDirect ? direct.error : null,
    refetch: async () => { await Promise.all([history.refetch(), useDirect ? direct.refetch() : null]) },
  }
}
