import { useQuery } from '@tanstack/react-query'
import { parseAbiItem } from 'viem'
import { usePublicClient } from 'wagmi'
import { DEPLOY_BLOCK, PREDICTION_MARKET_ADDRESS } from '@/chain/contracts'

const BET_PLACED_EVENT = parseAbiItem(
  'event BetPlaced(uint256 indexed id, address indexed user, uint8 side, uint256 amount, uint256 weightBp)',
)

export interface BetLog {
  id: bigint
  user: `0x${string}`
  side: number
  amount: bigint
  txHash: `0x${string}`
  blockNumber: bigint
}

/** Every BetPlaced log across all markets, shared behind one TanStack Query
 * key so the markets-list sidebar (leaderboard/recent-bets widgets) and the
 * live activity ticker both read the same cached scan instead of each
 * firing their own getLogs call -- same dedup pattern as useFeedSnapshot()/
 * useCorePrices() elsewhere in this app, for the same reason: request
 * volume against the RPC should scale with polling interval, not with how
 * many components happen to want this data on screen at once. */
export function useBetLogs() {
  const client = usePublicClient()
  return useQuery({
    queryKey: ['bet-logs'],
    queryFn: async (): Promise<BetLog[]> => {
      const logs = await client!.getLogs({
        address: PREDICTION_MARKET_ADDRESS,
        event: BET_PLACED_EVENT,
        fromBlock: DEPLOY_BLOCK,
        toBlock: 'latest',
      })
      return logs
        .filter((log) => log.args.id != null && log.args.user && log.args.side != null && log.args.amount != null)
        .map((log) => ({
          id: log.args.id!,
          user: log.args.user!,
          side: log.args.side!,
          amount: log.args.amount!,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        }))
    },
    enabled: !!client,
    refetchInterval: 10_000,
    retry: 1,
  })
}
