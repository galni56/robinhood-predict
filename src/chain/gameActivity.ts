import { useQuery } from '@tanstack/react-query'
import { parseAbiItem, type Address, type Hash } from 'viem'
import { usePublicClient } from 'wagmi'
import {
  ASSET_RACE_ADDRESS,
  assetRaceAbi,
  normalizeRaceAssets,
  type AssetRaceAsset,
} from '@/chain/assetRaces'
import { isLocalAssetRace } from '@/chain/config'
import {
  PRICE_ARENA_ADDRESS,
  priceArenaAbi,
  priceArenaAsset,
  type PriceArenaData,
} from '@/chain/priceArena'
import { settledGameUserStats, type SettledGameClaim, type SettledGameStake } from '@/chain/gameActivityAccounting'

const RACE_BET_EVENT = parseAbiItem(
  'event RaceBetPlaced(uint256 indexed raceId, address indexed user, uint8 indexed assetIndex, uint256 amount, uint256 totalUserStake)',
)
const RACE_CLAIM_EVENT = parseAbiItem('event RaceClaimed(uint256 indexed raceId, address indexed user, uint256 payout)')
const ARENA_ENTRY_EVENT = parseAbiItem(
  'event EntryChanged(uint256 indexed arenaId, address indexed player, uint256 totalStake, uint256 predictionUpdatedAt, bool predictionChanged)',
)
const ARENA_CLAIM_EVENT = parseAbiItem('event Claimed(uint256 indexed arenaId, address indexed player, uint256 payout)')
const ARENA_RESOLVED_EVENT = parseAbiItem(
  'event ArenaResolved(uint256 indexed arenaId, uint256 finalPrice, uint256 winnerCount, uint256 protocolFee, bytes32 observationId)',
)

const RACE_DEPLOY_BLOCK = 77_663_890n
const ARENA_DEPLOY_BLOCK = 77_664_309n

export type GameActivityKind = 'race' | 'arena'

export interface GameBetActivity {
  gameId: bigint
  user: Address
  amount: bigint
  txHash: Hash
  blockNumber: bigint
  assetIndex?: number
  symbol?: string
}

export interface GameUserActivity {
  address: Address
  staked: bigint
  claimed: bigint
  bets: number
  symbols: string[]
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
      let claims: { gameId: bigint; user: Address; payout: bigint }[]
      let arenaSettledStats: Omit<GameUserActivity, 'symbols'>[] | undefined

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
          const { raceId, user, payout } = log.args
          return raceId != null && user && payout != null ? [{ gameId: raceId, user, payout }] : []
        })
      } else {
        const [entryLogs, claimLogs, resolvedLogs] = await Promise.all([
          client.getLogs({ address, event: ARENA_ENTRY_EVENT, fromBlock, toBlock: 'latest' }),
          client.getLogs({ address, event: ARENA_CLAIM_EVENT, fromBlock, toBlock: 'latest' }),
          client.getLogs({ address, event: ARENA_RESOLVED_EVENT, fromBlock, toBlock: 'latest' }),
        ])
        const totals = new Map<string, SettledGameStake<Address>>()
        bets = [...entryLogs]
          .sort((a, b) => a.blockNumber === b.blockNumber ? Number((a.logIndex ?? 0) - (b.logIndex ?? 0)) : a.blockNumber < b.blockNumber ? -1 : 1)
          .flatMap((log) => {
            const { arenaId, player, totalStake } = log.args
            if (arenaId == null || !player || totalStake == null) return []
            const key = `${arenaId}:${player.toLowerCase()}`
            const previous = totals.get(key)?.stake ?? 0n
            totals.set(key, { gameId: arenaId, user: player, stake: totalStake })
            const amount = totalStake > previous ? totalStake - previous : 0n
            return amount > 0n ? [{ gameId: arenaId, user: player, amount, txHash: log.transactionHash, blockNumber: log.blockNumber }] : []
          })
        claims = claimLogs.flatMap((log) => {
          const { arenaId, player, payout } = log.args
          return arenaId != null && player && payout != null ? [{ gameId: arenaId, user: player, payout }] : []
        })
        const resolvedGameIds = new Set(
          resolvedLogs.flatMap((log) => log.args.arenaId == null ? [] : [log.args.arenaId.toString()]),
        )
        arenaSettledStats = settledGameUserStats(
          [...totals.values()],
          claims as SettledGameClaim<Address>[],
          resolvedGameIds,
        )
      }

      const byUser = new Map<string, GameUserActivity>()
      function userStats(user: Address) {
        const key = user.toLowerCase()
        const existing = byUser.get(key)
        if (existing) return existing
        const created = { address: user, staked: 0n, claimed: 0n, bets: 0, symbols: [] }
        byUser.set(key, created)
        return created
      }
      if (arenaSettledStats) {
        for (const settled of arenaSettledStats) {
          const stats = userStats(settled.address)
          stats.staked = settled.staked
          stats.claimed = settled.claimed
          stats.bets = settled.bets
        }
      } else {
        for (const bet of bets) {
          const stats = userStats(bet.user)
          stats.staked += bet.amount
          stats.bets += 1
        }
        for (const claim of claims) userStats(claim.user).claimed += claim.payout
      }

      const leaderboard = [...byUser.values()]
        .sort((a, b) => {
          const aNet = a.claimed - a.staked
          const bNet = b.claimed - b.staked
          return aNet === bNet ? 0 : aNet > bNet ? -1 : 1
        })
        .slice(0, 5)
      const betsByNewest = [...bets]
        .sort((a, b) => a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1)
      const recent = betsByNewest.slice(0, 8)

      // Live list pages deliberately keep only a small window of cards. Asset
      // identity for the side rail must not depend on that window: recent bets
      // and each leaderboard wallet's latest bet may point to much older IDs.
      // Resolve only those referenced games in one bounded multicall.
      const metadataBets = [...recent]
      for (const stats of leaderboard) {
        const latest = betsByNewest.find((bet) => bet.user.toLowerCase() === stats.address.toLowerCase())
        if (latest) metadataBets.push(latest)
      }
      const gameIds = [...new Set(metadataBets.map((bet) => bet.gameId.toString()))].map(BigInt)
      const symbolsByGame = new Map<string, string[]>()

      if (gameIds.length > 0) {
        if (kind === 'race') {
          const results = await client.multicall({
            contracts: gameIds.map((gameId) => ({
              address,
              abi: assetRaceAbi,
              functionName: 'getRaceAssets',
              args: [gameId],
            }) as const),
            allowFailure: true,
          })
          results.forEach((result, index) => {
            if (result.status !== 'success') return
            const assets = normalizeRaceAssets(
              result.result as readonly Omit<AssetRaceAsset, 'assetIndex' | 'symbol' | 'feedAddress'>[],
            )
            symbolsByGame.set(gameIds[index].toString(), assets.map((asset) => asset.symbol))
          })
        } else {
          const results = await client.multicall({
            contracts: gameIds.map((gameId) => ({
              address,
              abi: priceArenaAbi,
              functionName: 'getArena',
              args: [gameId],
            }) as const),
            allowFailure: true,
          })
          results.forEach((result, index) => {
            if (result.status !== 'success') return
            const arena = result.result as unknown as PriceArenaData
            const symbol = priceArenaAsset(arena.assetId)?.symbol
            if (symbol) symbolsByGame.set(gameIds[index].toString(), [symbol])
          })
        }
      }

      const withSymbol = (bet: GameBetActivity): GameBetActivity => ({
        ...bet,
        symbol: symbolsByGame.get(bet.gameId.toString())?.[bet.assetIndex ?? 0],
      })
      const enrichedRecent = recent.map(withSymbol)
      const enrichedLeaderboard = leaderboard.map((stats) => {
        const symbols = betsByNewest
          .filter((bet) => bet.user.toLowerCase() === stats.address.toLowerCase())
          .map((bet) => symbolsByGame.get(bet.gameId.toString())?.[bet.assetIndex ?? 0])
          .filter((symbol): symbol is string => !!symbol)
          .filter((symbol, index, all) => all.indexOf(symbol) === index)
          .slice(0, 3)
        return { ...stats, symbols }
      })

      return { leaderboard: enrichedLeaderboard, recent: enrichedRecent }
    },
  })
}
