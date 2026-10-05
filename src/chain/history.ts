import { useQuery } from '@tanstack/react-query'
import { GAME_SERVER_URL } from '@/solana/services'

// The game server's history snapshot (`GET /history`): recent activity
// (stakes, payouts, refunds), per-wallet totals and the leaderboards.
// Amounts are decimal strings in lamports.

export type HistoryActivityType = 'bet' | 'entry' | 'claim' | 'refund' | string

export interface HistoryActivity {
  signature: string
  slot: number
  time: number | null
  type: HistoryActivityType
  game: 'race' | 'arena'
  gameId?: number | null
  gameAddress: string
  wallet?: string
  amount?: string
  assetIndex?: number
  symbol?: string | null
  /** The game's stake currency (absent in older snapshots: SOL). */
  stakeMint?: string | null
}

export interface HistoryWallet {
  wallet: string
  staked: string
  claimed: string
  refunded: string
  net: string
  games: number
  wins: number
  lastActive: number | null
}

/** Per-game standing for the list sidebars (SOL-staked games only). */
export interface HistoryGameStanding {
  wallet: string
  staked: string
  claimed: string
  refunded: string
  net: string
  symbols: string[]
}

export interface HistorySnapshot {
  cluster: string
  /** The game wallet. */
  programId: string
  updatedAt: number
  eventCount: number
  activity: HistoryActivity[]
  wallets: Record<string, HistoryWallet>
  leaderboard: HistoryWallet[]
  leaderboards?: { race: HistoryGameStanding[]; arena: HistoryGameStanding[] }
}

async function fetchHistory(): Promise<HistorySnapshot> {
  const response = await fetch(`${GAME_SERVER_URL}/history`)
  if (!response.ok) throw new Error(`Game server returned ${response.status}`)
  return (await response.json()) as HistorySnapshot
}

/** One shared poll of the history snapshot for activity and stats. */
export function useHistory({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['history'],
    queryFn: fetchHistory,
    enabled: enabled && GAME_SERVER_URL != null,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    retry: 1,
  })
}

