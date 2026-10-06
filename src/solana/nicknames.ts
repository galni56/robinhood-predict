import { useQuery } from '@tanstack/react-query'
import { getJson } from '@/chain/gameServer'
import { GAME_SERVER_URL } from '@/solana/services'
import { SAMPLE_NICKNAMES, SAMPLE_PLAYERS_ENABLED } from '@/chain/samplePlayers'

// Nicknames live on the game server (one per wallet, unique, set by a signed
// message). Every <AddressLabel> reads the same shared map.

export const MAX_NICKNAME_BYTES = 24

export const NICKNAMES_QUERY_KEY = ['nicknames'] as const

function useNicknames(enabled = true) {
  return useQuery({
    queryKey: NICKNAMES_QUERY_KEY,
    queryFn: () => getJson<Record<string, string>>('/nicknames'),
    enabled: enabled && GAME_SERVER_URL != null,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

/** The wallet's nickname, or null when it has none. */
export function useNickname(owner?: string, enabled = true) {
  const all = useNicknames(enabled && !!owner)
  if (owner && SAMPLE_PLAYERS_ENABLED && SAMPLE_NICKNAMES[owner]) return { ...all, data: SAMPLE_NICKNAMES[owner] }
  return { ...all, data: owner && all.data ? all.data[owner] ?? null : all.data ? null : undefined }
}
