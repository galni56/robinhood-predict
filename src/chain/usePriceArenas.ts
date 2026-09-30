import { useMemo } from 'react'
import { zeroAddress } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { assetRaceChain } from '@/chain/config'
import { useStableGameCount, useStableGameSnapshots } from '@/chain/useStableGameSnapshots'
import {
  ACTIVE_GAME_POLL_INTERVAL_MS,
  ACTIVE_GAME_REFRESH_OPTIONS,
  GAME_SNAPSHOT_MULTICALL_BATCH_SIZE,
  HISTORICAL_GAME_POLL_INTERVAL_MS,
  splitProgressiveGameIds,
} from '@/chain/gameSnapshots'
import {
  MAX_ARENAS_TO_LIST,
  PRICE_ARENA_ADDRESS,
  priceArenaAbi,
  priceArenaAsset,
  type PriceArenaData,
  type PriceArenaViewModel,
} from '@/chain/priceArena'
import { isCoherentPriceArenaSnapshot } from '@/chain/priceArenaSnapshot'

export function usePriceArenas() {
  const address = PRICE_ARENA_ADDRESS ?? zeroAddress
  const enabled = !!PRICE_ARENA_ADDRESS
  const countQuery = useReadContract({
    address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'arenaCount',
    query: { enabled, refetchInterval: ACTIVE_GAME_POLL_INTERVAL_MS, ...ACTIVE_GAME_REFRESH_OPTIONS },
  })
  const count = Number(useStableGameCount('price-arena-count', countQuery.data))
  const firstId = Math.max(0, count - MAX_ARENAS_TO_LIST)
  const ids = useMemo(() => Array.from({ length: count - firstId }, (_, i) => BigInt(firstId + i)).reverse(), [count, firstId])
  const { fastIds, historyIds } = useMemo(
    () => splitProgressiveGameIds(ids, 8, true),
    [ids],
  )
  const readsFor = (queryIds: readonly bigint[]) => queryIds.flatMap((id) => [
    ({ address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'getArena', args: [id] }) as const,
    ({ address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'phase', args: [id] }) as const,
  ])
  const fastQueries = useReadContracts({
    // Arena data and its derived phase must update together. Keeping both reads
    // in one multicall removes an extra round trip and avoids mixed old/new rows.
    contracts: readsFor(fastIds),
    batchSize: GAME_SNAPSHOT_MULTICALL_BATCH_SIZE,
    query: {
      enabled: enabled && fastIds.length > 0,
      refetchInterval: ACTIVE_GAME_POLL_INTERVAL_MS,
      ...ACTIVE_GAME_REFRESH_OPTIONS,
    },
  })
  const countScanComplete = countQuery.data != null || countQuery.isError
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
  const observedArenas = useMemo(() => {
    const byId = new Map<string, PriceArenaViewModel>()
    const collect = (queryIds: readonly bigint[], data: typeof fastQueries.data) => {
      queryIds.forEach((id, index) => {
        const arenaResult = data?.[index * 2]
        const phaseResult = data?.[index * 2 + 1]
        if (arenaResult?.status !== 'success' || phaseResult?.status !== 'success') return
        const arena = arenaResult.result as unknown as PriceArenaData
        const phase = Number(phaseResult.result)
        const asset = priceArenaAsset(arena.assetId)
        if (!isCoherentPriceArenaSnapshot(arena, phase, asset?.category)) return
        byId.set(id.toString(), { ...arena, id, phase, asset })
      })
    }
    collect(fastIds, fastQueries.data)
    collect(historyIds, historyQueries.data)
    return ids.map((id) => byId.get(id.toString()) ?? null)
  }, [fastIds, fastQueries.data, historyIds, historyQueries.data, ids])
  const stableArenas = useStableGameSnapshots(ids, observedArenas, {
    // v2 intentionally drops Arena rows captured before structural validation.
    cacheKey: 'price-arenas-v2',
    idsReady: countQuery.data != null,
  })
  const arenas = stableArenas.filter((arena) => (
    isCoherentPriceArenaSnapshot(arena, arena.phase, arena.asset?.category)
  ))

  return {
    arenas,
    isConfigured: enabled,
    isLoading: enabled && !historyScanComplete,
    error: countQuery.error ?? fastQueries.error ?? historyQueries.error,
    refetch: async () => Promise.all([countQuery.refetch(), fastQueries.refetch(), historyQueries.refetch()]),
  }
}
