import { useMemo } from 'react'
import { zeroAddress } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { assetRaceChain } from '@/chain/config'
import { useStableGameSnapshots } from '@/chain/useStableGameSnapshots'
import { ACTIVE_GAME_POLL_INTERVAL_MS, ACTIVE_GAME_REFRESH_OPTIONS } from '@/chain/gameSnapshots'
import {
  ASSET_RACE_ADDRESS,
  ETH_DECIMALS,
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
    query: { enabled: !isPreview, refetchInterval: ACTIVE_GAME_POLL_INTERVAL_MS, ...ACTIVE_GAME_REFRESH_OPTIONS },
  })

  const count = countQuery.data == null ? 0 : Number(countQuery.data)
  const firstId = Math.max(0, count - MAX_RACES_TO_LIST)
  const ids = useMemo(
    () => Array.from({ length: count - firstId }, (_, index) => BigInt(firstId + index)).reverse(),
    [count, firstId],
  )

  const raceQueries = useReadContracts({
    // One ordered multicall keeps each race and its asset grid on the same
    // refresh cycle and halves the HTTP round trips used by the old split reads.
    contracts: ids.flatMap((id) => [
      ({ address: readAddress, chainId: assetRaceChain.id, abi: assetRaceAbi, functionName: 'getRace', args: [id] }) as const,
      ({ address: readAddress, chainId: assetRaceChain.id, abi: assetRaceAbi, functionName: 'getRaceAssets', args: [id] }) as const,
    ]),
    query: {
      enabled: !isPreview && ids.length > 0,
      refetchInterval: ACTIVE_GAME_POLL_INTERVAL_MS,
      ...ACTIVE_GAME_REFRESH_OPTIONS,
    },
  })

  const observedRaces = useMemo(() => ids.map((id, index): AssetRaceViewModel | null => {
    const raceResult = raceQueries.data?.[index * 2]
    const assetsResult = raceQueries.data?.[index * 2 + 1]
    if (raceResult?.status !== 'success' || assetsResult?.status !== 'success') return null
    const race = raceResult.result as AssetRaceData
    const assets = normalizeRaceAssets(assetsResult.result as readonly Omit<AssetRaceAsset, 'assetIndex' | 'symbol' | 'feedAddress'>[])
    return { ...race, id, assets, source: 'onchain' }
  }), [ids, raceQueries.data])
  const onchainRaces = useStableGameSnapshots(ids, observedRaces, {
    cacheKey: 'asset-races',
    idsReady: isPreview || countQuery.data != null,
  })

  async function refetch() {
    await Promise.all([countQuery.refetch(), raceQueries.refetch()])
  }

  return {
    races: isPreview ? previewRaces : onchainRaces,
    isPreview,
    configuredAddress: ASSET_RACE_ADDRESS,
    tokenDecimals: ETH_DECIMALS,
    totalRaceCount: isPreview ? previewRaces.length : count,
    isLoading: !isPreview && onchainRaces.length === 0
      && (countQuery.isLoading || raceQueries.isLoading),
    error: countQuery.error ?? raceQueries.error,
    refetch,
  }
}
