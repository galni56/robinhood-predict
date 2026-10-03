import { useQuery } from '@tanstack/react-query'
import { INDEXER_URL } from '@/solana/services'

// The history indexer's snapshot (scripts/solana/indexer.mjs, `GET /history`):
// every race and arena (with raw account data), recent activity, per-wallet
// totals and the leaderboard. Amounts are decimal strings in base units.

export interface HistoryGameRow {
  id: number
  address: string
  /** Raw account data, base64; decoded with the program IDL. */
  data: string
  stakeMint: string
  status: string
}

export interface HistoryRaceRow extends HistoryGameRow {
  title: string
  category: string
  creator: string
  totalPool: string
  winningAssetIndex: number | null
  resolvedAt: number | null
  assets: { symbol: string; pool: string }[]
}

export interface HistoryArenaRow extends HistoryGameRow {
  title: string
  symbol: string
  category: string
  creator: string
  totalPool: string
  resolvedAt: number | null
  players: { player: string; prediction: string; stake: string; rank: number; payout: string; settled: boolean }[]
}

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
  programId: string
  updatedAt: number
  eventCount: number
  races: HistoryRaceRow[]
  arenas: HistoryArenaRow[]
  activity: HistoryActivity[]
  wallets: Record<string, HistoryWallet>
  leaderboard: HistoryWallet[]
  leaderboards?: { race: HistoryGameStanding[]; arena: HistoryGameStanding[] }
}

async function fetchHistory(): Promise<HistorySnapshot> {
  const response = await fetch(`${INDEXER_URL}/history`)
  if (!response.ok) throw new Error(`Indexer returned ${response.status}`)
  return (await response.json()) as HistorySnapshot
}

/** One shared poll of the indexer snapshot for lists, activity and stats. */
export function useHistory({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['history'],
    queryFn: fetchHistory,
    enabled,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    retry: 1,
  })
}

export function decodeBase64(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}
