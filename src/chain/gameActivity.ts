import { useQuery } from '@tanstack/react-query'
import { parseAbiItem, type Address, type Hash } from 'viem'
import { usePublicClient } from 'wagmi'
import { ASSET_RACE_ADDRESS } from '@/chain/assetRaces'
import { isLocalAssetRace } from '@/chain/config'
import { PRICE_ARENA_ADDRESS } from '@/chain/priceArena'

const RACE_BET_EVENT = parseAbiItem(
  'event RaceBetPlaced(uint256 indexed raceId, address indexed user, uint8 indexed assetIndex, uint256 amount, uint256 totalUserStake)',
)
const RACE_CLAIM_EVENT = parseAbiItem('event RaceClaimed(uint256 indexed raceId, address indexed user, uint256 payout)')
const ARENA_ENTRY_EVENT = parseAbiItem(
  'event EntryChanged(uint256 indexed arenaId, address indexed player, uint256 totalStake, uint256 predictionUpdatedAt, bool predictionChanged)',
)
const ARENA_CLAIM_EVENT = parseAbiItem('event Claimed(uint256 indexed arenaId, address indexed player, uint256 payout)')

const RACE_DEPLOY_BLOCK = 72_253_652n
const ARENA_DEPLOY_BLOCK = 72_262_224n

export type GameActivityKind = 'race' | 'arena'

export interface GameBetActivity {
  gameId: bigint
  user: Address
  amount: bigint
  txHash: Hash
  blockNumber: bigint
  assetIndex?: number
}

export interface GameUserActivity {
  address: Address
  staked: bigint
  claimed: bigint
  bets: number
}

export interface GameActivity {
  recent: GameBetActivity[]
  leaderboard: GameUserActivity[]
}

export function useGameActivity(kind: GameActivityKind) {
  const client = usePublicClient()
  const address = kind === 'race' ? ASSET_RACE_ADDRESS : PRICE_ARENA_ADDRESS

  return useQuery({
    queryKey: ['game-activity', kind, address],
    enabled: !!client && !!address,
    refetchInterval: 10_000,
    retry: 1,
    queryFn: async (): Promise<GameActivity> => {
      if (!client || !address) return { recent: [], leaderboard: [] }
      const fromBlock = isLocalAssetRace ? 0n : kind === 'race' ? RACE_DEPLOY_BLOCK : ARENA_DEPLOY_BLOCK

      let bets: GameBetActivity[]
      let claims: { user: Address; payout: bigint }[]

      if (kind === 'race') {
        const [betLogs, claimLogs] = await Promise.all([
          client.getLogs({ address, event: RACE_BET_EVENT, fromBlock, toBlock: 'latest' }),
          client.getLogs({ address, event: RACE_CLAIM_EVENT, fromBlock, toBlock: 'latest' }),
        ])
        bets = betLogs.flatMap((log) => {
          const { raceId, user, assetIndex, amount } = log.args
          if (raceId == null || !user || assetIndex == null || amount == null) return []
          return [{ gameId: raceId, user, assetIndex, amount, txHash: log.transactionHash, blockNumber: log.blockNumber }]
        })
        claims = claimLogs.flatMap((log) => {
          const { user, payout } = log.args
          return user && payout != null ? [{ user, payout }] : []
        })
      } else {
        const [entryLogs, claimLogs] = await Promise.all([
          client.getLogs({ address, event: ARENA_ENTRY_EVENT, fromBlock, toBlock: 'latest' }),
          client.getLogs({ address, event: ARENA_CLAIM_EVENT, fromBlock, toBlock: 'latest' }),
        ])
        const totals = new Map<string, bigint>()
        bets = [...entryLogs]
          .sort((a, b) => a.blockNumber === b.blockNumber ? Number((a.logIndex ?? 0) - (b.logIndex ?? 0)) : a.blockNumber < b.blockNumber ? -1 : 1)
          .flatMap((log) => {
            const { arenaId, player, totalStake } = log.args
            if (arenaId == null || !player || totalStake == null) return []
            const key = `${arenaId}:${player.toLowerCase()}`
            const previous = totals.get(key) ?? 0n
            totals.set(key, totalStake)
            const amount = totalStake > previous ? totalStake - previous : 0n
            return amount > 0n ? [{ gameId: arenaId, user: player, amount, txHash: log.transactionHash, blockNumber: log.blockNumber }] : []
          })
        claims = claimLogs.flatMap((log) => {
          const { player, payout } = log.args
          return player && payout != null ? [{ user: player, payout }] : []
        })
      }

      const byUser = new Map<string, GameUserActivity>()
      function userStats(user: Address) {
        const key = user.toLowerCase()
        const existing = byUser.get(key)
        if (existing) return existing
        const created = { address: user, staked: 0n, claimed: 0n, bets: 0 }
        byUser.set(key, created)
        return created
      }
      for (const bet of bets) {
        const stats = userStats(bet.user)
        stats.staked += bet.amount
        stats.bets += 1
      }
      for (const claim of claims) userStats(claim.user).claimed += claim.payout

      const leaderboard = [...byUser.values()]
        .sort((a, b) => {
          const aNet = a.claimed - a.staked
          const bNet = b.claimed - b.staked
          return aNet === bNet ? 0 : aNet > bNet ? -1 : 1
        })
        .slice(0, 5)
      const recent = [...bets]
        .sort((a, b) => a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1)
        .slice(0, 8)

      return { leaderboard, recent }
    },
  })
}
