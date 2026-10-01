import { useMemo } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import type { Address, Hex } from 'viem'
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_CONFIGURED,
  predictionMarketAbi,
} from '@/chain/contracts'
import { isDemoMode } from '@/chain/demo'
import { predictionSettlementPrice } from '@/chain/predictionMarketSettlement'
import { useStableGameCount, useStableGameSnapshots } from '@/chain/useStableGameSnapshots'
import {
  ACTIVE_GAME_POLL_INTERVAL_MS,
  ACTIVE_GAME_REFRESH_OPTIONS,
  GAME_SNAPSHOT_MULTICALL_BATCH_SIZE,
  HISTORICAL_GAME_POLL_INTERVAL_MS,
  splitProgressiveGameIds,
} from '@/chain/gameSnapshots'
import { usePredictionMarketHistoryIndex, visibleIdsThroughCount } from '@/chain/gameHistory'

const FAST_MARKET_WINDOW_SIZE = 10

export interface PredictionMarketViewModel {
  id: bigint
  assetId: Hex
  oracleId: Hex
  priceDecimals: number
  targetPrice: bigint
  createdAt: bigint
  deadline: bigint
  poolYes: bigint
  poolNo: bigint
  weightedPoolYes: bigint
  weightedPoolNo: bigint
  status: number
  outcome: number
  feeBp: bigint
  creator: Address
  settlementPrice?: bigint
}

/**
 * Polls every market kept by the event-history index and retains the last
 * complete row for each id while a newer multicall is incomplete. This makes
 * newly seeded markets appear without a reload and prevents refresh flicker.
 */
export function usePredictionMarkets({ includeSettlements = false }: { includeSettlements?: boolean } = {}) {
  const enabled = PREDICTION_MARKET_CONFIGURED || isDemoMode()
  const countQuery = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'marketCount',
    query: { enabled, refetchInterval: ACTIVE_GAME_POLL_INTERVAL_MS, ...ACTIVE_GAME_REFRESH_OPTIONS },
  })
  const totalMarketCount = Number(useStableGameCount('prediction-market-count', countQuery.data))
  const historyIndex = usePredictionMarketHistoryIndex(PREDICTION_MARKET_CONFIGURED)
  const ids = useMemo(
    () => historyIndex.data
      ? visibleIdsThroughCount(historyIndex.data, totalMarketCount, false)
      : historyIndex.isError || !PREDICTION_MARKET_CONFIGURED
        ? Array.from({ length: totalMarketCount }, (_, index) => BigInt(index))
        : [],
    [historyIndex.data, historyIndex.isError, totalMarketCount],
  )

  const { fastIds, historyIds } = useMemo(
    () => splitProgressiveGameIds(ids, FAST_MARKET_WINDOW_SIZE),
    [ids],
  )
  const readsFor = (queryIds: readonly bigint[]) => queryIds.flatMap((id) => {
    const market = ({
      address: PREDICTION_MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: 'getMarket',
      args: [id],
    }) as const
    if (!includeSettlements) return [market]
    return [market, ({
      address: PREDICTION_MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: 'settlements',
      args: [id],
    }) as const]
  })

  const fastQueries = useReadContracts({
    // Keep market and settlement reads in one ordered multicall. Two separate
    // useReadContracts hooks briefly reused incompatible cached rows in
    // production, which put getMarket.assetId into the resolved-price slot.
    contracts: readsFor(fastIds),
    batchSize: GAME_SNAPSHOT_MULTICALL_BATCH_SIZE,
    query: {
      enabled: enabled && fastIds.length > 0,
      refetchInterval: ACTIVE_GAME_POLL_INTERVAL_MS,
      ...ACTIVE_GAME_REFRESH_OPTIONS,
    },
  })
  const indexScanComplete = historyIndex.data != null || historyIndex.isError || !PREDICTION_MARKET_CONFIGURED
  const countScanComplete = (countQuery.data != null || countQuery.isError) && indexScanComplete
  const fastScanComplete = countScanComplete && (
    fastIds.length === 0 || fastQueries.data != null || fastQueries.isError
  )
  const historyQueries = useReadContracts({
    contracts: readsFor(historyIds),
    batchSize: GAME_SNAPSHOT_MULTICALL_BATCH_SIZE,
    query: {
      enabled: enabled && fastScanComplete && historyIds.length > 0,
      refetchInterval: HISTORICAL_GAME_POLL_INTERVAL_MS,
      ...ACTIVE_GAME_REFRESH_OPTIONS,
    },
  })
  const historyScanComplete = fastScanComplete && (
    historyIds.length === 0 || historyQueries.data != null || historyQueries.isError
  )

  const observedMarkets = useMemo(() => {
    const stride = includeSettlements ? 2 : 1
    const byId = new Map<string, PredictionMarketViewModel>()
    const collect = (queryIds: readonly bigint[], data: typeof fastQueries.data) => {
      queryIds.forEach((id, index) => {
        const marketResult = data?.[index * stride]
        const settlementResult = includeSettlements ? data?.[index * stride + 1] : undefined
        if (marketResult?.status !== 'success') return
        const market = marketResult.result as Omit<PredictionMarketViewModel, 'id' | 'settlementPrice'>
        const settlementPrice = settlementResult?.status === 'success'
          ? predictionSettlementPrice(settlementResult.result)
          : undefined
        byId.set(id.toString(), { id, ...market, settlementPrice })
      })
    }
    collect(fastIds, fastQueries.data)
    collect(historyIds, historyQueries.data)
    return ids.map((id) => byId.get(id.toString()) ?? null)
  }, [fastIds, fastQueries.data, historyIds, historyQueries.data, ids, includeSettlements])
  const markets = useStableGameSnapshots(ids, observedMarkets, {
    cacheKey: includeSettlements ? 'prediction-markets-with-settlements' : 'prediction-markets',
    idsReady: countQuery.data != null && indexScanComplete,
  })

  return {
    ids,
    markets,
    totalMarketCount,
    isLoading: enabled && !historyScanComplete,
    error: countQuery.error ?? historyIndex.error ?? fastQueries.error ?? historyQueries.error,
    refetch: async () => Promise.all([historyIndex.refetch(), countQuery.refetch(), fastQueries.refetch(), historyQueries.refetch()]),
  }
}
