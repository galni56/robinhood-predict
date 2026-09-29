import { useMemo } from 'react'
import { zeroAddress, type Address, type Hex } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import {
  ASSET_RACE_ADDRESS,
  assetRaceAbi,
  normalizeRaceAssets,
  type AssetRaceAsset,
  type AssetRaceData,
  type AssetRaceViewModel,
} from '@/chain/assetRaces'
import { assetRaceChain } from '@/chain/config'
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_CONFIGURED,
  predictionMarketAbi,
} from '@/chain/contracts'
import {
  PRICE_ARENA_ADDRESS,
  priceArenaAbi,
  priceArenaAsset,
  type PriceArenaData,
  type PriceArenaViewModel,
} from '@/chain/priceArena'

export const GAME_ARCHIVE_PAGE_SIZE = 12

export interface PredictionArchiveMarket {
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

function descendingPageIds(count: number, page: number) {
  const newestId = count - 1 - page * GAME_ARCHIVE_PAGE_SIZE
  if (newestId < 0) return []
  const length = Math.min(GAME_ARCHIVE_PAGE_SIZE, newestId + 1)
  return Array.from({ length }, (_, index) => BigInt(newestId - index))
}

function pageCount(count: number) {
  return Math.max(1, Math.ceil(count / GAME_ARCHIVE_PAGE_SIZE))
}

export function usePredictionArchivePage(page: number, enabled: boolean) {
  const countQuery = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'marketCount',
    query: { enabled: PREDICTION_MARKET_CONFIGURED },
  })
  const count = Number(countQuery.data ?? 0n)
  const ids = useMemo(() => descendingPageIds(count, page), [count, page])
  const queries = useReadContracts({
    contracts: ids.map((id) => ({
      address: PREDICTION_MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: 'getMarket',
      args: [id],
    }) as const),
    query: { enabled: PREDICTION_MARKET_CONFIGURED && enabled && ids.length > 0 },
  })
  const items = ids.flatMap((id, index): PredictionArchiveMarket[] => {
    const result = queries.data?.[index]
    return result?.status === 'success'
      ? [{ id, ...(result.result as Omit<PredictionArchiveMarket, 'id'>) }]
      : []
  })
  return {
    count,
    pageCount: pageCount(count),
    ids,
    items,
    isLoading: countQuery.isLoading || (enabled && queries.isLoading),
    error: countQuery.error ?? queries.error,
  }
}

export function useAssetRaceArchivePage(page: number, enabled: boolean) {
  const address = ASSET_RACE_ADDRESS ?? zeroAddress
  const configured = !!ASSET_RACE_ADDRESS
  const countQuery = useReadContract({
    address,
    chainId: assetRaceChain.id,
    abi: assetRaceAbi,
    functionName: 'raceCount',
    query: { enabled: configured },
  })
  const count = Number(countQuery.data ?? 0n)
  const ids = useMemo(() => descendingPageIds(count, page), [count, page])
  const raceQueries = useReadContracts({
    contracts: ids.map((id) => ({ address, chainId: assetRaceChain.id, abi: assetRaceAbi, functionName: 'getRace', args: [id] }) as const),
    query: { enabled: configured && enabled && ids.length > 0 },
  })
  const assetQueries = useReadContracts({
    contracts: ids.map((id) => ({ address, chainId: assetRaceChain.id, abi: assetRaceAbi, functionName: 'getRaceAssets', args: [id] }) as const),
    query: { enabled: configured && enabled && ids.length > 0 },
  })
  const items = ids.flatMap((id, index): AssetRaceViewModel[] => {
    const raceResult = raceQueries.data?.[index]
    const assetResult = assetQueries.data?.[index]
    if (raceResult?.status !== 'success' || assetResult?.status !== 'success') return []
    const assets = normalizeRaceAssets(
      assetResult.result as readonly Omit<AssetRaceAsset, 'assetIndex' | 'symbol' | 'feedAddress'>[],
    )
    return [{ ...(raceResult.result as AssetRaceData), id, assets, source: 'onchain' }]
  })
  return {
    count,
    pageCount: pageCount(count),
    ids,
    items,
    isLoading: countQuery.isLoading || (enabled && (raceQueries.isLoading || assetQueries.isLoading)),
    error: countQuery.error ?? raceQueries.error ?? assetQueries.error,
  }
}

export function usePriceArenaArchivePage(page: number, enabled: boolean) {
  const address = (PRICE_ARENA_ADDRESS ?? zeroAddress) as Address
  const configured = !!PRICE_ARENA_ADDRESS
  const countQuery = useReadContract({
    address,
    chainId: assetRaceChain.id,
    abi: priceArenaAbi,
    functionName: 'arenaCount',
    query: { enabled: configured },
  })
  const count = Number(countQuery.data ?? 0n)
  const ids = useMemo(() => descendingPageIds(count, page), [count, page])
  const arenaQueries = useReadContracts({
    contracts: ids.map((id) => ({ address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'getArena', args: [id] }) as const),
    query: { enabled: configured && enabled && ids.length > 0 },
  })
  const phaseQueries = useReadContracts({
    contracts: ids.map((id) => ({ address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'phase', args: [id] }) as const),
    query: { enabled: configured && enabled && ids.length > 0 },
  })
  const items = ids.flatMap((id, index): PriceArenaViewModel[] => {
    const arenaResult = arenaQueries.data?.[index]
    const phaseResult = phaseQueries.data?.[index]
    if (arenaResult?.status !== 'success' || phaseResult?.status !== 'success') return []
    const arena = arenaResult.result as unknown as PriceArenaData
    return [{ ...arena, id, phase: Number(phaseResult.result), asset: priceArenaAsset(arena.assetId) }]
  })
  return {
    count,
    pageCount: pageCount(count),
    ids,
    items,
    isLoading: countQuery.isLoading || (enabled && (arenaQueries.isLoading || phaseQueries.isLoading)),
    error: countQuery.error ?? arenaQueries.error ?? phaseQueries.error,
  }
}
