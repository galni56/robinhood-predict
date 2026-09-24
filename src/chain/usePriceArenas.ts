import { useMemo } from 'react'
import { zeroAddress } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { assetRaceChain } from '@/chain/config'
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
    query: { enabled, refetchInterval: 5_000 },
  })
  const count = Number(countQuery.data ?? 0n)
  const firstId = Math.max(0, count - MAX_ARENAS_TO_LIST)
  const ids = useMemo(() => Array.from({ length: count - firstId }, (_, i) => BigInt(firstId + i)).reverse(), [count, firstId])
  const arenaQueries = useReadContracts({
    contracts: ids.map((id) => ({ address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'getArena', args: [id] }) as const),
    query: { enabled: enabled && ids.length > 0, refetchInterval: 5_000 },
  })
  const phaseQueries = useReadContracts({
    contracts: ids.map((id) => ({ address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'phase', args: [id] }) as const),
    query: { enabled: enabled && ids.length > 0, refetchInterval: 5_000 },
  })
  const arenas = ids.flatMap((id, index): PriceArenaViewModel[] => {
    const arenaResult = arenaQueries.data?.[index]
    const phaseResult = phaseQueries.data?.[index]
    if (arenaResult?.status !== 'success' || phaseResult?.status !== 'success') return []
    const data = arenaResult.result as unknown as PriceArenaData
    return [{ ...data, id, phase: Number(phaseResult.result), asset: priceArenaAsset(data.assetId) }]
  })

  return {
    arenas,
    isConfigured: enabled,
    isLoading: enabled && (countQuery.isLoading || arenaQueries.isLoading || phaseQueries.isLoading),
    error: countQuery.error ?? arenaQueries.error ?? phaseQueries.error,
    refetch: async () => Promise.all([countQuery.refetch(), arenaQueries.refetch(), phaseQueries.refetch()]),
  }
}
