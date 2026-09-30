import { useMemo } from 'react'
import { zeroAddress } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { assetRaceChain } from '@/chain/config'
import { useStableGameCount, useStableGameSnapshots } from '@/chain/useStableGameSnapshots'
import {
  ACTIVE_GAME_POLL_INTERVAL_MS,
  ACTIVE_GAME_REFRESH_OPTIONS,
  HISTORICAL_GAME_POLL_INTERVAL_MS,
  splitProgressiveGameIds,
} from '@/chain/gameSnapshots'
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

  const count = Number(useStableGameCount('asset-race-count', countQuery.data))
  const firstId = Math.max(0, count - MAX_RACES_TO_LIST)
  const ids = useMemo(
    () => Array.from({ length: count - firstId }, (_, index) => BigInt(firstId + index)).reverse(),
    [count, firstId],
  )

  const { fastIds, historyIds } = useMemo(
    () => splitProgressiveGameIds(ids, 12, true),
    [ids],
  )
  const readsFor = (queryIds: readonly bigint[]) => queryIds.flatMap((id) => [
    ({ address: readAddress, chainId: assetRaceChain.id, abi: assetRaceAbi, functionName: 'getRace', args: [id] }) as const,
    ({ address: readAddress, chainId: assetRaceChain.id, abi: assetRaceAbi, functionName: 'getRaceAssets', args: [id] }) as const,
  ])
  const fastQueries = useReadContracts({
    // One ordered multicall keeps each race and its asset grid on the same
    // refresh cycle and halves the HTTP round trips used by the old split reads.
    contracts: readsFor(fastIds),
    query: {
      enabled: !isPreview && fastIds.length > 0,
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
    query: {
      enabled: !isPreview && fastScanComplete && historyIds.length > 0,
      refetchInterval: HISTORICAL_GAME_POLL_INTERVAL_MS,
      ...ACTIVE_GAME_REFRESH_OPTIONS,
    },
  })
  const historyScanComplete = fastScanComplete && (
    historyIds.length === 0 || historyQueries.data != null || historyQueries.isError
  )

  const observedRaces = useMemo(() => {
    const byId = new Map<string, AssetRaceViewModel>()
    const collect = (queryIds: readonly bigint[], data: typeof fastQueries.data) => {
      queryIds.forEach((id, index) => {
        const raceResult = data?.[index * 2]
        const assetsResult = data?.[index * 2 + 1]
        if (raceResult?.status !== 'success' || assetsResult?.status !== 'success') return
        const race = raceResult.result as AssetRaceData
        const assets = normalizeRaceAssets(assetsResult.result as readonly Omit<AssetRaceAsset, 'assetIndex' | 'symbol' | 'feedAddress'>[])
        byId.set(id.toString(), { ...race, id, assets, source: 'onchain' })
      })
    }
    collect(fastIds, fastQueries.data)
    collect(historyIds, historyQueries.data)
    return ids.map((id) => byId.get(id.toString()) ?? null)
  }, [fastIds, fastQueries.data, historyIds, historyQueries.data, ids])
  const onchainRaces = useStableGameSnapshots(ids, observedRaces, {
    cacheKey: 'asset-races',
    idsReady: isPreview || countQuery.data != null,
  })

  async function refetch() {
    await Promise.all([countQuery.refetch(), fastQueries.refetch(), historyQueries.refetch()])
  }

  return {
    races: isPreview ? previewRaces : onchainRaces,
    isPreview,
    configuredAddress: ASSET_RACE_ADDRESS,
    tokenDecimals: ETH_DECIMALS,
    totalRaceCount: isPreview ? previewRaces.length : count,
    isLoading: !isPreview && !historyScanComplete,
    error: countQuery.error ?? fastQueries.error ?? historyQueries.error,
    refetch,
  }
}
