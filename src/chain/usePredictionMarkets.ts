import { useMemo } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import type { Hex } from 'viem'
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_CONFIGURED,
  predictionMarketAbi,
} from '@/chain/contracts'
import { isDemoMode } from '@/chain/demo'
import { useStableGameSnapshots } from '@/chain/useStableGameSnapshots'

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
}

/**
 * Polls the bounded recent market window and keeps the last complete row for
 * each id while a newer multicall is incomplete. This makes newly seeded
 * markets appear without requiring a reload and prevents refresh flicker.
 */
export function usePredictionMarkets() {
  const enabled = PREDICTION_MARKET_CONFIGURED || isDemoMode()
  const countQuery = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'marketCount',
    query: { enabled, refetchInterval: 10_000 },
  })
  const totalMarketCount = Number(countQuery.data ?? 0n)
  const firstId = Math.max(0, totalMarketCount - MAX_MARKETS_TO_LIST)
  const ids = useMemo(
    () => Array.from({ length: totalMarketCount - firstId }, (_, index) => BigInt(firstId + index)),
    [totalMarketCount, firstId],
  )

  const marketQueries = useReadContracts({
    contracts: ids.map((id) => ({
      address: PREDICTION_MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: 'getMarket',
      args: [id],
    }) as const),
    query: { enabled: enabled && ids.length > 0, refetchInterval: 10_000 },
  })

  const observedMarkets = useMemo(() => ids.map((id, index): PredictionMarketViewModel | null => {
    const result = marketQueries.data?.[index]
    if (result?.status !== 'success') return null
    return { id, ...(result.result as Omit<PredictionMarketViewModel, 'id'>) }
  }), [ids, marketQueries.data])
  const markets = useStableGameSnapshots(ids, observedMarkets)

  return {
    ids,
    markets,
    totalMarketCount,
    isLoading: enabled && markets.length === 0 && (countQuery.isLoading || marketQueries.isLoading),
    error: countQuery.error ?? marketQueries.error,
    refetch: async () => Promise.all([countQuery.refetch(), marketQueries.refetch()]),
  }
}
