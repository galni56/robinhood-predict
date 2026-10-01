import { useQuery } from '@tanstack/react-query'
import { parseAbiItem, type Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { ASSET_RACE_ADDRESS } from '@/chain/assetRaces'
import { assetRaceNetworkKey } from '@/chain/config'
import {
  DEPLOY_BLOCK,
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_CONFIGURED,
} from '@/chain/contracts'
import { PRICE_ARENA_ADDRESS } from '@/chain/priceArena'
import {
  buildGameHistoryIndex,
} from '@/chain/gameHistoryIndex'
export { visibleIdsThroughCount } from '@/chain/gameHistoryIndex'

const RACE_DEPLOY_BLOCK = 72_253_652n
const ARENA_DEPLOY_BLOCK = 72_262_224n

const MARKET_CREATED_EVENT = parseAbiItem(
  'event MarketCreated(uint256 indexed id, bytes32 indexed assetId, bytes32 indexed oracleId, int256 targetPrice, uint256 deadline)',
)
const MARKET_BET_EVENT = parseAbiItem(
  'event BetPlaced(uint256 indexed id, address indexed user, uint8 side, uint256 amount, uint256 weightBp)',
)
const MARKET_RESOLVED_EVENT = parseAbiItem(
  'event MarketResolved(uint256 indexed id, uint8 outcome, int256 settlePrice)',
)
const MARKET_VOIDED_EVENT = parseAbiItem('event MarketVoided(uint256 indexed id, string reason)')

const RACE_CREATED_EVENT = parseAbiItem(
  'event RaceCreated(uint256 indexed raceId, uint8 indexed category, uint64 bettingStartTime, uint64 bettingEndTime, uint64 raceDuration, uint16 feeBp)',
)
const RACE_BET_EVENT = parseAbiItem(
  'event RaceBetPlaced(uint256 indexed raceId, address indexed user, uint8 indexed assetIndex, uint256 amount, uint256 totalUserStake)',
)
const RACE_RESOLVED_EVENT = parseAbiItem(
  'event RaceResolved(uint256 indexed raceId, uint8 indexed winningAssetIndex, int256 winningReturn, uint256 winningPool, uint256 protocolFee)',
)
const RACE_CANCELLED_EVENT = parseAbiItem('event RaceCancelled(uint256 indexed raceId, uint8 reason)')
const RACE_VOIDED_EVENT = parseAbiItem('event RaceVoided(uint256 indexed raceId, uint8 reason)')

const ARENA_CREATED_EVENT = parseAbiItem(
  'event ArenaCreated(uint256 indexed arenaId, address indexed creator, bytes32 indexed assetId, uint8 category, uint256 startsAt, uint256 deadline, uint256 duration, string title)',
)
const ARENA_ENTRY_EVENT = parseAbiItem(
  'event EntryChanged(uint256 indexed arenaId, address indexed player, uint256 totalStake, uint256 predictionUpdatedAt, bool predictionChanged)',
)
const ARENA_RESOLVED_EVENT = parseAbiItem(
  'event ArenaResolved(uint256 indexed arenaId, uint256 finalPrice, uint256 winnerCount, uint256 protocolFee, bytes32 observationId)',
)
const ARENA_CANCELLED_EVENT = parseAbiItem('event ArenaCancelled(uint256 indexed arenaId, string reason)')

function descendingUnique(ids: readonly bigint[]) {
  return [...new Set(ids.map(String))]
    .map(BigInt)
    .sort((a, b) => (a === b ? 0 : a > b ? -1 : 1))
}

function historyQueryOptions() {
  return {
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnMount: 'always' as const,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  }
}

export function usePredictionMarketHistoryIndex(enabled = true) {
  const client = usePublicClient()
  return useQuery({
    queryKey: ['prediction-market-history-index', PREDICTION_MARKET_ADDRESS, DEPLOY_BLOCK.toString()],
    enabled: enabled && !!client && PREDICTION_MARKET_CONFIGURED,
    ...historyQueryOptions(),
    queryFn: async () => {
      if (!client || !PREDICTION_MARKET_CONFIGURED) return buildGameHistoryIndex([], [], [], [])
      const [created, resolved, voided, bets] = await Promise.all([
        client.getLogs({ address: PREDICTION_MARKET_ADDRESS, event: MARKET_CREATED_EVENT, fromBlock: DEPLOY_BLOCK, toBlock: 'latest' }),
        client.getLogs({ address: PREDICTION_MARKET_ADDRESS, event: MARKET_RESOLVED_EVENT, fromBlock: DEPLOY_BLOCK, toBlock: 'latest' }),
        client.getLogs({ address: PREDICTION_MARKET_ADDRESS, event: MARKET_VOIDED_EVENT, fromBlock: DEPLOY_BLOCK, toBlock: 'latest' }),
        client.getLogs({ address: PREDICTION_MARKET_ADDRESS, event: MARKET_BET_EVENT, fromBlock: DEPLOY_BLOCK, toBlock: 'latest' }),
      ])
      const ids = <T extends { args: { id?: bigint } }>(logs: readonly T[]) => logs.flatMap((log) => log.args.id == null ? [] : [log.args.id])
      return buildGameHistoryIndex(ids(created), ids(resolved), ids(voided), ids(bets))
    },
  })
}

export function useAssetRaceHistoryIndex(enabled = true) {
  const client = usePublicClient()
  return useQuery({
    queryKey: ['asset-race-history-index', ASSET_RACE_ADDRESS],
    enabled: enabled && !!client && !!ASSET_RACE_ADDRESS,
    ...historyQueryOptions(),
    queryFn: async () => {
      if (!client || !ASSET_RACE_ADDRESS) return buildGameHistoryIndex([], [], [], [])
      const fromBlock = assetRaceNetworkKey === 'robinhood-mainnet' ? RACE_DEPLOY_BLOCK : 0n
      const [created, resolved, voided, cancelled, bets] = await Promise.all([
        client.getLogs({ address: ASSET_RACE_ADDRESS, event: RACE_CREATED_EVENT, fromBlock, toBlock: 'latest' }),
        client.getLogs({ address: ASSET_RACE_ADDRESS, event: RACE_RESOLVED_EVENT, fromBlock, toBlock: 'latest' }),
        client.getLogs({ address: ASSET_RACE_ADDRESS, event: RACE_VOIDED_EVENT, fromBlock, toBlock: 'latest' }),
        client.getLogs({ address: ASSET_RACE_ADDRESS, event: RACE_CANCELLED_EVENT, fromBlock, toBlock: 'latest' }),
        client.getLogs({ address: ASSET_RACE_ADDRESS, event: RACE_BET_EVENT, fromBlock, toBlock: 'latest' }),
      ])
      const ids = <T extends { args: { raceId?: bigint } }>(logs: readonly T[]) => logs.flatMap((log) => log.args.raceId == null ? [] : [log.args.raceId])
      return buildGameHistoryIndex(ids(created), [...ids(resolved), ...ids(voided)], ids(cancelled), ids(bets))
    },
  })
}

export function usePriceArenaHistoryIndex(enabled = true) {
  const client = usePublicClient()
  return useQuery({
    queryKey: ['price-arena-history-index', PRICE_ARENA_ADDRESS],
    enabled: enabled && !!client && !!PRICE_ARENA_ADDRESS,
    ...historyQueryOptions(),
    queryFn: async () => {
      if (!client || !PRICE_ARENA_ADDRESS) return buildGameHistoryIndex([], [], [], [])
      const fromBlock = assetRaceNetworkKey === 'robinhood-mainnet' ? ARENA_DEPLOY_BLOCK : 0n
      const [created, resolved, cancelled, entries] = await Promise.all([
        client.getLogs({ address: PRICE_ARENA_ADDRESS, event: ARENA_CREATED_EVENT, fromBlock, toBlock: 'latest' }),
        client.getLogs({ address: PRICE_ARENA_ADDRESS, event: ARENA_RESOLVED_EVENT, fromBlock, toBlock: 'latest' }),
        client.getLogs({ address: PRICE_ARENA_ADDRESS, event: ARENA_CANCELLED_EVENT, fromBlock, toBlock: 'latest' }),
        client.getLogs({ address: PRICE_ARENA_ADDRESS, event: ARENA_ENTRY_EVENT, fromBlock, toBlock: 'latest' }),
      ])
      const ids = <T extends { args: { arenaId?: bigint } }>(logs: readonly T[]) => logs.flatMap((log) => log.args.arenaId == null ? [] : [log.args.arenaId])
      return buildGameHistoryIndex(ids(created), ids(resolved), ids(cancelled), ids(entries))
    },
  })
}

export function useTerminalPredictionMarketIds(enabled = true) {
  const index = usePredictionMarketHistoryIndex(enabled)
  return { ...index, data: index.data?.terminalIds }
}

export function useTerminalAssetRaceIds(enabled = true) {
  const index = useAssetRaceHistoryIndex(enabled)
  return { ...index, data: index.data?.terminalIds }
}

export function useTerminalPriceArenaIds(enabled = true) {
  const index = usePriceArenaHistoryIndex(enabled)
  return { ...index, data: index.data?.terminalIds }
}

export function useWalletAssetRaceIds(wallet?: Address) {
  const client = usePublicClient()
  return useQuery({
    queryKey: ['wallet-asset-race-ids', ASSET_RACE_ADDRESS, wallet?.toLowerCase()],
    enabled: !!client && !!ASSET_RACE_ADDRESS && !!wallet,
    staleTime: 10_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!client || !ASSET_RACE_ADDRESS || !wallet) return []
      const logs = await client.getLogs({
        address: ASSET_RACE_ADDRESS,
        event: RACE_BET_EVENT,
        args: { user: wallet },
        fromBlock: assetRaceNetworkKey === 'robinhood-mainnet' ? RACE_DEPLOY_BLOCK : 0n,
        toBlock: 'latest',
      })
      return descendingUnique(logs.flatMap((log) => log.args.raceId == null ? [] : [log.args.raceId]))
    },
  })
}

export function useWalletPriceArenaIds(wallet?: Address) {
  const client = usePublicClient()
  return useQuery({
    queryKey: ['wallet-price-arena-ids', PRICE_ARENA_ADDRESS, wallet?.toLowerCase()],
    enabled: !!client && !!PRICE_ARENA_ADDRESS && !!wallet,
    staleTime: 10_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!client || !PRICE_ARENA_ADDRESS || !wallet) return []
      const logs = await client.getLogs({
        address: PRICE_ARENA_ADDRESS,
        event: ARENA_ENTRY_EVENT,
        args: { player: wallet },
        fromBlock: assetRaceNetworkKey === 'robinhood-mainnet' ? ARENA_DEPLOY_BLOCK : 0n,
        toBlock: 'latest',
      })
      return descendingUnique(logs.flatMap((log) => log.args.arenaId == null ? [] : [log.args.arenaId]))
    },
  })
}
