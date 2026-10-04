import type { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { getJson, type ServerArena } from '@/chain/gameServer'
import { GAME_SERVER_URL } from '@/solana/services'
import { PRICE_ARENA_STATUS, arenaFromServer } from '@/chain/priceArena'
import { DESIGN_SAMPLES_ENABLED, SAMPLE_ARENAS } from '@/chain/designSamples'

/** One arena with every entry, and the connected wallet's entry and payout. */
export function usePriceArena(arenaId: bigint | null, wallet?: PublicKey | null) {
  const query = useQuery({
    queryKey: ['arena', arenaId?.toString()],
    queryFn: async () => {
      try {
        return arenaFromServer(await getJson<ServerArena>(`/games/arena/${arenaId}`))
      } catch (error) {
        if (error instanceof Error && error.message === 'GameNotFound') return null
        throw error
      }
    },
    enabled: arenaId != null && GAME_SERVER_URL != null,
    refetchInterval: (q) => {
      const arena = q.state.data
      return arena && arena.status !== PRICE_ARENA_STATUS.OPEN && arena.payouts.every((p) => p.status === 'done') ? 30_000 : 3_000
    },
  })
  // Dev-only: sample arenas stand in so detail screens can be designed
  // without servers (same gate as the list hooks).
  const sample = DESIGN_SAMPLES_ENABLED && arenaId != null ? SAMPLE_ARENAS.find((item) => item.id === arenaId) : undefined
  const arena = query.data ?? ((query.isFetched || query.isError || GAME_SERVER_URL == null) ? sample : undefined) ?? undefined
  const me = wallet?.toBase58()
  return {
    arena,
    entries: arena?.entries ?? [],
    walletEntry: me ? arena?.entries.find((entry) => entry.player === me) : undefined,
    payout: me ? arena?.payouts.find((p) => p.wallet === me && (p.kind === 'win' || p.kind === 'refund')) : undefined,
    minStake: arena?.minStake,
    maxStake: arena?.maxStake,
    isLoading: query.isLoading,
    error: query.error,
    refetch: async () => { await query.refetch() },
  }
}
