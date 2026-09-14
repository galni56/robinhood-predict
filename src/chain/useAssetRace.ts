import { useEffect, useMemo, useState } from 'react'
import { zeroAddress, type Address } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { aggregatorV3Abi } from '@/chain/contracts'
import { assetRaceChain, isLocalAssetRace } from '@/chain/config'
import { useFeedSnapshot } from '@/chain/feedCache'
import {
  ASSET_RACE_ADDRESS,
  ASSET_RACE_STATUS,
  RETURN_SCALE,
  assetRaceAbi,
  buildPreviewRaces,
  mockRaceOracleAbi,
  normalizeRaceAssets,
  type AssetRaceAsset,
  type AssetRaceData,
  type AssetRacePosition,
  type AssetRaceViewModel,
} from '@/chain/assetRaces'

const PREVIEW_RETURN_PATTERNS = [
  [48_200_000_000_000_000n, 31_100_000_000_000_000n, 7_300_000_000_000_000n, -10_400_000_000_000_000n],
  [42_500_000_000_000_000n, 45_100_000_000_000_000n, 9_800_000_000_000_000n, -8_200_000_000_000_000n],
  [51_400_000_000_000_000n, 44_700_000_000_000_000n, 12_100_000_000_000_000n, -12_600_000_000_000_000n],
  [46_900_000_000_000_000n, 39_300_000_000_000_000n, 15_400_000_000_000_000n, -6_700_000_000_000_000n],
] as const

function snapshotEntryFor(
  snapshot: Record<string, { decimals: number; answer: string; updatedAt: string }> | undefined,
  feed: Address | undefined,
) {
  if (!snapshot || !feed) return undefined
  const key = Object.keys(snapshot).find((candidate) => candidate.toLowerCase() === feed.toLowerCase())
  return key ? snapshot[key] : undefined
}

export function useAssetRace(raceId: bigint | null, walletAddress?: Address) {
  const isPreview = !ASSET_RACE_ADDRESS
  const readAddress = ASSET_RACE_ADDRESS ?? zeroAddress
  const previews = useMemo(() => buildPreviewRaces(), [])
  const [previewTick, setPreviewTick] = useState(0)

  const raceQuery = useReadContract({
    address: readAddress,
    chainId: assetRaceChain.id,
    abi: assetRaceAbi,
    functionName: 'getRace',
    args: raceId == null ? undefined : [raceId],
    query: { enabled: !isPreview && raceId != null, refetchInterval: 5_000 },
  })

  const assetsQuery = useReadContract({
    address: readAddress,
    chainId: assetRaceChain.id,
    abi: assetRaceAbi,
    functionName: 'getRaceAssets',
    args: raceId == null ? undefined : [raceId],
    query: { enabled: !isPreview && raceId != null, refetchInterval: 5_000 },
  })

  const positionQuery = useReadContract({
    address: readAddress,
    chainId: assetRaceChain.id,
    abi: assetRaceAbi,
    functionName: 'getPosition',
    args: raceId != null && walletAddress ? [raceId, walletAddress] : undefined,
    query: { enabled: !isPreview && raceId != null && !!walletAddress, refetchInterval: 5_000 },
  })

  const normalizedAssets = useMemo(() => {
    if (!assetsQuery.data) return []
    return normalizeRaceAssets(
      assetsQuery.data as readonly Omit<AssetRaceAsset, 'assetIndex' | 'symbol' | 'feedAddress'>[],
    )
  }, [assetsQuery.data])

  const feedSnapshot = useFeedSnapshot(!isPreview && !isLocalAssetRace)
  const feedReads = useReadContracts({
    contracts: normalizedAssets.map((asset) => ({
      address: asset.feedAddress ?? zeroAddress,
      chainId: assetRaceChain.id,
      abi: aggregatorV3Abi,
      functionName: 'latestRoundData',
    }) as const),
    query: {
      enabled:
        !isPreview && !isLocalAssetRace &&
        normalizedAssets.some((asset) => asset.feedAddress && !snapshotEntryFor(feedSnapshot.data, asset.feedAddress)),
      refetchInterval: 2_000,
    },
  })

  const localOracleReads = useReadContracts({
    contracts: normalizedAssets.map((asset) => ({
      address: asset.oracle,
      chainId: assetRaceChain.id,
      abi: mockRaceOracleAbi,
      functionName: 'latestObservation',
      args: [asset.oracleId],
    }) as const),
    query: {
      enabled: !isPreview && isLocalAssetRace && normalizedAssets.length > 0,
      refetchInterval: 1_000,
    },
  })

  const onchainAssets = normalizedAssets.map((asset, index): AssetRaceAsset => {
    const snapshot = snapshotEntryFor(feedSnapshot.data, asset.feedAddress)
    const direct = feedReads.data?.[index]
    const round = direct?.status === 'success' ? direct.result : undefined
    const local = localOracleReads.data?.[index]
    const observation = local?.status === 'success' ? local.result : undefined
    return {
      ...asset,
      livePrice: observation?.price ?? (snapshot ? BigInt(snapshot.answer) : round?.[1]),
      liveDecimals: observation?.decimals ?? snapshot?.decimals ?? asset.expectedDecimals,
      liveUpdatedAt: observation?.updatedAt ?? (snapshot ? BigInt(snapshot.updatedAt) : round?.[3]),
    }
  })

  const previewRace = raceId == null ? undefined : previews.find((race) => race.id === raceId)
  useEffect(() => {
    if (!isPreview || previewRace?.status !== ASSET_RACE_STATUS.RUNNING) return
    const timer = window.setInterval(() => setPreviewTick((tick) => tick + 1), 1_800)
    return () => window.clearInterval(timer)
  }, [isPreview, previewRace?.status])

  const animatedPreview = useMemo(() => {
    if (!previewRace || previewRace.status !== ASSET_RACE_STATUS.RUNNING) return previewRace
    const pattern = PREVIEW_RETURN_PATTERNS[previewTick % PREVIEW_RETURN_PATTERNS.length]
    return {
      ...previewRace,
      assets: previewRace.assets.map((asset, index) => {
        const returnValue = pattern[index] ?? 0n
        return {
          ...asset,
          livePrice: asset.startPrice + (asset.startPrice * returnValue) / RETURN_SCALE,
          liveUpdatedAt: previewRace.raceEndTime - 300n + BigInt(previewTick) * 2n,
        }
      }),
    }
  }, [previewRace, previewTick])

  const race: AssetRaceViewModel | undefined = isPreview
    ? animatedPreview
    : raceQuery.data && raceId != null
      ? { ...(raceQuery.data as AssetRaceData), id: raceId, assets: onchainAssets, source: 'onchain' }
      : undefined

  async function refetch() {
    await Promise.all([raceQuery.refetch(), assetsQuery.refetch(), positionQuery.refetch(), feedReads.refetch(), localOracleReads.refetch()])
  }

  return {
    race,
    position: isPreview ? race?.previewPosition : (positionQuery.data as AssetRacePosition | undefined),
    isPreview,
    isLoading: !isPreview && (raceQuery.isLoading || assetsQuery.isLoading),
    error: raceQuery.error ?? assetsQuery.error ?? positionQuery.error,
    feedSnapshotError: feedSnapshot.error,
    refetch,
  }
}
