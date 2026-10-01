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
import { isCoherentPriceArenaSnapshot } from '@/chain/priceArenaSnapshot'
import { GAME_SNAPSHOT_MULTICALL_BATCH_SIZE } from '@/chain/gameSnapshots'
import {
  useTerminalAssetRaceIds,
  useTerminalPredictionMarketIds,
  useTerminalPriceArenaIds,
} from '@/chain/gameHistory'

export const GAME_ARCHIVE_PAGE_SIZE = 12
const EMPTY_GAME_IDS: bigint[] = []

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

function pageCount(count: number) {
  return Math.max(1, Math.ceil(count / GAME_ARCHIVE_PAGE_SIZE))
}

export function usePredictionArchivePage(page: number, enabled: boolean, loadIndex = enabled) {
  const countQuery = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'marketCount',
    query: { enabled: PREDICTION_MARKET_CONFIGURED },
  })
  const count = Number(countQuery.data ?? 0n)
  const terminalIds = useTerminalPredictionMarketIds(loadIndex)
  const allIds = terminalIds.data ?? EMPTY_GAME_IDS
  const ids = useMemo(
    () => allIds.slice(page * GAME_ARCHIVE_PAGE_SIZE, (page + 1) * GAME_ARCHIVE_PAGE_SIZE),
    [allIds, page],
  )
  const queries = useReadContracts({
    contracts: ids.map((id) => ({
      address: PREDICTION_MARKET_ADDRESS,
      abi: predictionMarketAbi,
      functionName: 'getMarket',
      args: [id],
    }) as const),
    batchSize: GAME_SNAPSHOT_MULTICALL_BATCH_SIZE,
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
    historyCount: allIds.length,
    pageCount: pageCount(allIds.length),
    ids,
    items,
    isLoading: countQuery.isLoading || (enabled && (terminalIds.isLoading || queries.isLoading)),
    error: countQuery.error ?? terminalIds.error ?? queries.error,
  }
}

export function useAssetRaceArchivePage(page: number, enabled: boolean, loadIndex = enabled) {
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
  const terminalIds = useTerminalAssetRaceIds(loadIndex)
  const allIds = terminalIds.data ?? EMPTY_GAME_IDS
  const ids = useMemo(
    () => allIds.slice(page * GAME_ARCHIVE_PAGE_SIZE, (page + 1) * GAME_ARCHIVE_PAGE_SIZE),
    [allIds, page],
  )
  const raceQueries = useReadContracts({
    contracts: ids.map((id) => ({ address, chainId: assetRaceChain.id, abi: assetRaceAbi, functionName: 'getRace', args: [id] }) as const),
    batchSize: GAME_SNAPSHOT_MULTICALL_BATCH_SIZE,
    query: { enabled: configured && enabled && ids.length > 0 },
  })
  const assetQueries = useReadContracts({
    contracts: ids.map((id) => ({ address, chainId: assetRaceChain.id, abi: assetRaceAbi, functionName: 'getRaceAssets', args: [id] }) as const),
    batchSize: GAME_SNAPSHOT_MULTICALL_BATCH_SIZE,
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
    historyCount: allIds.length,
    pageCount: pageCount(allIds.length),
    ids,
    items,
    isLoading: countQuery.isLoading || (enabled && (terminalIds.isLoading || raceQueries.isLoading || assetQueries.isLoading)),
    error: countQuery.error ?? terminalIds.error ?? raceQueries.error ?? assetQueries.error,
  }
}

export function usePriceArenaArchivePage(page: number, enabled: boolean, loadIndex = enabled) {
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
  const terminalIds = useTerminalPriceArenaIds(loadIndex)
  const allIds = terminalIds.data ?? EMPTY_GAME_IDS
  const ids = useMemo(
    () => allIds.slice(page * GAME_ARCHIVE_PAGE_SIZE, (page + 1) * GAME_ARCHIVE_PAGE_SIZE),
    [allIds, page],
  )
  const arenaQueries = useReadContracts({
    // Keep data and phase in one ordered result so an archive page change
    // cannot pair a fresh Arena tuple with an older phase array.
    contracts: ids.flatMap((id) => [
      ({ address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'getArena', args: [id] }) as const,
      ({ address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'phase', args: [id] }) as const,
    ]),
    batchSize: GAME_SNAPSHOT_MULTICALL_BATCH_SIZE,
    query: { enabled: configured && enabled && ids.length > 0 },
  })
  const items = ids.flatMap((id, index): PriceArenaViewModel[] => {
    const arenaResult = arenaQueries.data?.[index * 2]
    const phaseResult = arenaQueries.data?.[index * 2 + 1]
    if (arenaResult?.status !== 'success' || phaseResult?.status !== 'success') return []
    const arena = arenaResult.result as unknown as PriceArenaData
    const phase = Number(phaseResult.result)
    const asset = priceArenaAsset(arena.assetId)
    if (!isCoherentPriceArenaSnapshot(arena, phase, asset?.category)) return []
    return [{ ...arena, id, phase, asset }]
  })
  return {
    count,
    historyCount: allIds.length,
    pageCount: pageCount(allIds.length),
    ids,
    items,
    isLoading: countQuery.isLoading || (enabled && (terminalIds.isLoading || arenaQueries.isLoading)),
    error: countQuery.error ?? terminalIds.error ?? arenaQueries.error,
  }
}
