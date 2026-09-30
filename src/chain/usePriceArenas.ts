import { useMemo } from 'react'
import { zeroAddress } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { assetRaceChain } from '@/chain/config'
import { useStableGameSnapshots } from '@/chain/useStableGameSnapshots'
import { ACTIVE_GAME_POLL_INTERVAL_MS, ACTIVE_GAME_REFRESH_OPTIONS } from '@/chain/gameSnapshots'
import {
  MAX_ARENAS_TO_LIST,
  PRICE_ARENA_ADDRESS,
  priceArenaAbi,
  priceArenaAsset,
  type PriceArenaData,
  type PriceArenaViewModel,
} from '@/chain/priceArena'

export function usePriceArenas() {
  const address = PRICE_ARENA_ADDRESS ?? zeroAddress
  const enabled = !!PRICE_ARENA_ADDRESS
  const countQuery = useReadContract({
    address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'arenaCount',
    query: { enabled, refetchInterval: ACTIVE_GAME_POLL_INTERVAL_MS, ...ACTIVE_GAME_REFRESH_OPTIONS },
  })
  const count = Number(countQuery.data ?? 0n)
  const firstId = Math.max(0, count - MAX_ARENAS_TO_LIST)
  const ids = useMemo(() => Array.from({ length: count - firstId }, (_, i) => BigInt(firstId + i)).reverse(), [count, firstId])
  const arenaQueries = useReadContracts({
    // Arena data and its derived phase must update together. Keeping both reads
    // in one multicall removes an extra round trip and avoids mixed old/new rows.
    contracts: ids.flatMap((id) => [
      ({ address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'getArena', args: [id] }) as const,
      ({ address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'phase', args: [id] }) as const,
    ]),
    query: {
      enabled: enabled && ids.length > 0,
      refetchInterval: ACTIVE_GAME_POLL_INTERVAL_MS,
      ...ACTIVE_GAME_REFRESH_OPTIONS,
    },
  })
  const observedArenas = useMemo(() => ids.map((id, index): PriceArenaViewModel | null => {
    const arenaResult = arenaQueries.data?.[index * 2]
    const phaseResult = arenaQueries.data?.[index * 2 + 1]
    if (arenaResult?.status !== 'success' || phaseResult?.status !== 'success') return null
    const data = arenaResult.result as unknown as PriceArenaData
    return { ...data, id, phase: Number(phaseResult.result), asset: priceArenaAsset(data.assetId) }
  }), [ids, arenaQueries.data])
  const arenas = useStableGameSnapshots(ids, observedArenas, {
    cacheKey: 'price-arenas',
    idsReady: countQuery.data != null,
  })

  return {
    arenas,
    isConfigured: enabled,
    isLoading: enabled && arenas.length === 0
      && (countQuery.isLoading || arenaQueries.isLoading),
    error: countQuery.error ?? arenaQueries.error,
    refetch: async () => Promise.all([countQuery.refetch(), arenaQueries.refetch()]),
  }
}
