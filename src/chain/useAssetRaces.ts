import { useMemo } from 'react'
import { zeroAddress } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { assetRaceChain } from '@/chain/config'
import { erc20Abi } from '@/chain/contracts'
import {
  ASSET_RACE_ADDRESS,
  MAX_RACES_TO_LIST,
  assetRaceAbi,
  buildPreviewRaces,
  normalizeRaceAssets,
  type AssetRaceAsset,
  type AssetRaceData,
  type AssetRaceViewModel,
} from '@/chain/assetRaces'

export function useAssetRaces() {
  const isPreview = !ASSET_RACE_ADDRESS
  const previewRaces = useMemo(() => buildPreviewRaces(), [])
  const readAddress = ASSET_RACE_ADDRESS ?? zeroAddress

  const countQuery = useReadContract({
    address: readAddress,
    chainId: assetRaceChain.id,
    abi: assetRaceAbi,
    functionName: 'raceCount',
    query: { enabled: !isPreview, refetchInterval: 10_000 },
  })

  const tokenQuery = useReadContract({
    address: readAddress,
    chainId: assetRaceChain.id,
    abi: assetRaceAbi,
    functionName: 'betToken',
    query: { enabled: !isPreview },
  })

  const tokenDecimalsQuery = useReadContract({
    address: tokenQuery.data ?? zeroAddress,
    chainId: assetRaceChain.id,
    abi: erc20Abi,
    functionName: 'decimals',
    query: { enabled: !isPreview && !!tokenQuery.data },
  })

  const count = countQuery.data == null ? 0 : Number(countQuery.data)
  const firstId = Math.max(0, count - MAX_RACES_TO_LIST)
  const ids = useMemo(
    () => Array.from({ length: count - firstId }, (_, index) => BigInt(firstId + index)).reverse(),
    [count, firstId],
  )

  const raceQueries = useReadContracts({
    contracts: ids.map((id) => ({ address: readAddress, chainId: assetRaceChain.id, abi: assetRaceAbi, functionName: 'getRace', args: [id] }) as const),
    query: { enabled: !isPreview && ids.length > 0, refetchInterval: 10_000 },
  })

  const assetQueries = useReadContracts({
    contracts: ids.map(
      (id) => ({ address: readAddress, chainId: assetRaceChain.id, abi: assetRaceAbi, functionName: 'getRaceAssets', args: [id] }) as const,
    ),
    query: { enabled: !isPreview && ids.length > 0, refetchInterval: 10_000 },
  })

  const onchainRaces = ids
    .map((id, index): AssetRaceViewModel | null => {
      const raceResult = raceQueries.data?.[index]
      const assetsResult = assetQueries.data?.[index]
      if (raceResult?.status !== 'success' || assetsResult?.status !== 'success') return null
      const race = raceResult.result as AssetRaceData
      const assets = normalizeRaceAssets(assetsResult.result as readonly Omit<AssetRaceAsset, 'assetIndex' | 'symbol' | 'feedAddress'>[])
      return { ...race, id, assets, source: 'onchain' }
    })
    .filter((race): race is AssetRaceViewModel => race != null)

  async function refetch() {
    await Promise.all([countQuery.refetch(), raceQueries.refetch(), assetQueries.refetch()])
  }

  return {
    races: isPreview ? previewRaces : onchainRaces,
    isPreview,
    configuredAddress: ASSET_RACE_ADDRESS,
    tokenDecimals: isPreview ? 6 : Number(tokenDecimalsQuery.data ?? 6),
    totalRaceCount: isPreview ? previewRaces.length : count,
    isLoading: !isPreview && (countQuery.isLoading || raceQueries.isLoading || assetQueries.isLoading || tokenQuery.isLoading),
    error: countQuery.error ?? tokenQuery.error ?? tokenDecimalsQuery.error ?? raceQueries.error ?? assetQueries.error,
    refetch,
  }
}
