import { useMemo } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import type { Hex } from 'viem'
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_CONFIGURED,
  predictionMarketAbi,
} from '@/chain/contracts'
import { isDemoMode } from '@/chain/demo'
import { predictionSettlementPrice } from '@/chain/predictionMarketSettlement'
import { useStableGameCount, useStableGameSnapshots } from '@/chain/useStableGameSnapshots'
import { ACTIVE_GAME_POLL_INTERVAL_MS, ACTIVE_GAME_REFRESH_OPTIONS } from '@/chain/gameSnapshots'

export const MAX_MARKETS_TO_LIST = 60

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
  settlementPrice?: bigint
}

/**
 * Polls the bounded recent market window and keeps the last complete row for
 * each id while a newer multicall is incomplete. This makes newly seeded
 * markets appear without requiring a reload and prevents refresh flicker.
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
  const firstId = Math.max(0, totalMarketCount - MAX_MARKETS_TO_LIST)
  const ids = useMemo(
    () => Array.from({ length: totalMarketCount - firstId }, (_, index) => BigInt(firstId + index)),
    [totalMarketCount, firstId],
  )

  const marketQueries = useReadContracts({
    // Keep market and settlement reads in one ordered multicall. Two separate
    // useReadContracts hooks briefly reused incompatible cached rows in
    // production, which put getMarket.assetId into the resolved-price slot.
    contracts: ids.flatMap((id) => {
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
    }),
    query: {
      enabled: enabled && ids.length > 0,
      refetchInterval: ACTIVE_GAME_POLL_INTERVAL_MS,
      ...ACTIVE_GAME_REFRESH_OPTIONS,
    },
  })

  const observedMarkets = useMemo(() => ids.map((id, index): PredictionMarketViewModel | null => {
    const stride = includeSettlements ? 2 : 1
    const marketResult = marketQueries.data?.[index * stride]
    const settlementResult = includeSettlements ? marketQueries.data?.[index * stride + 1] : undefined
    if (marketResult?.status !== 'success') return null
    const market = marketResult.result as Omit<PredictionMarketViewModel, 'id' | 'settlementPrice'>
    const settlementPrice = settlementResult?.status === 'success'
      ? predictionSettlementPrice(settlementResult.result)
      : undefined
    return { id, ...market, settlementPrice }
  }), [ids, includeSettlements, marketQueries.data])
  const markets = useStableGameSnapshots(ids, observedMarkets, {
    cacheKey: includeSettlements ? 'prediction-markets-with-settlements' : 'prediction-markets',
    idsReady: countQuery.data != null,
  })

  return {
    ids,
    markets,
    totalMarketCount,
    isLoading: enabled && markets.length === 0 && (countQuery.isLoading || marketQueries.isLoading),
    error: countQuery.error ?? marketQueries.error,
    refetch: async () => Promise.all([countQuery.refetch(), marketQueries.refetch()]),
  }
}
