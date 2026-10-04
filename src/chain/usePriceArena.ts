import { useMemo } from 'react'
import type { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { usePrograms } from '@/solana/programs'
import { arenaPda } from '@/solana/pda'
import { PRICE_ARENA_STATUS, arenaFromAccount } from '@/chain/priceArena'
import { DESIGN_SAMPLES_ENABLED, SAMPLE_ARENAS } from '@/chain/designSamples'

/** One arena; every entry lives inside the arena account, so a single read
 * covers the board and the connected wallet's entry. */
export function usePriceArena(arenaId: bigint | null, wallet?: PublicKey | null) {
  const { games } = usePrograms()
  const arenaKey = useMemo(() => (arenaId == null ? null : arenaPda(arenaId)), [arenaId])
  const query = useQuery({
    queryKey: ['arena', arenaKey?.toBase58()],
    queryFn: async () => {
      const account = await games.account.arena.fetchNullable(arenaKey!)
      return account ? arenaFromAccount(arenaKey!, account) : null
    },
    enabled: !!arenaKey,
    refetchInterval: (q) => (q.state.data && q.state.data.status !== PRICE_ARENA_STATUS.OPEN ? 30_000 : 4_000),
  })
  // Dev-only: sample arenas stand in so detail screens can be designed
  // without a validator (same gate as the list hooks).
  const sample = DESIGN_SAMPLES_ENABLED && arenaId != null ? SAMPLE_ARENAS.find((item) => item.id === arenaId) : undefined
  const arena = query.data ?? ((query.isFetched || query.isError) ? sample : undefined) ?? undefined
  const me = wallet?.toBase58()
  return {
    arena,
    entries: arena?.entries ?? [],
    walletEntry: me ? arena?.entries.find((entry) => entry.player === me) : undefined,
    minStake: arena?.minStake,
    maxStake: arena?.maxStake,
    isLoading: query.isLoading,
    error: query.error,
    refetch: async () => { await query.refetch() },
  }
}
