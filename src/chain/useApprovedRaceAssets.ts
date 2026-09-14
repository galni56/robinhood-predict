import { useMemo } from 'react'
import { zeroAddress, type Address, type Hex } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { ASSET_RACE_ADDRESS, ASSET_RACE_CATEGORY, assetRaceAbi, symbolForRaceAsset, type ApprovedRaceAsset } from '@/chain/assetRaces'
import { assetRaceChain, isLocalAssetRace } from '@/chain/config'
import { useRobinhoodAssets } from '@/chain/robinhoodApi'
import localMemeAssets from '../../config/local-meme-assets.json'

const FALLBACK_NAMES: Record<string, string> = {
  NVDA: 'NVIDIA',
  TSLA: 'Tesla',
  AAPL: 'Apple',
  META: 'Meta Platforms',
  AMD: 'Advanced Micro Devices',
  COIN: 'Coinbase',
  MSTR: 'Strategy',
  AMZN: 'Amazon',
  MSFT: 'Microsoft',
  GOOGL: 'Alphabet',
}

const LOCAL_MEME_NAMES = new Map(localMemeAssets.map((asset) => [asset.symbol, asset.name]))

export function useApprovedRaceAssets() {
  const address = ASSET_RACE_ADDRESS ?? zeroAddress
  const enabled = !!ASSET_RACE_ADDRESS
  const catalog = useRobinhoodAssets(!isLocalAssetRace)
  const idsQuery = useReadContract({
    address,
    chainId: assetRaceChain.id,
    abi: assetRaceAbi,
    functionName: 'getApprovedAssetIds',
    query: { enabled, refetchInterval: 15_000 },
  })
  const durationsQuery = useReadContract({
    address,
    chainId: assetRaceChain.id,
    abi: assetRaceAbi,
    functionName: 'getApprovedRaceDurations',
    query: { enabled, refetchInterval: 15_000 },
  })

  const ids = useMemo(() => (idsQuery.data ?? []) as readonly Hex[], [idsQuery.data])
  const registryQueries = useReadContracts({
    contracts: ids.map((assetId) => ({
      address,
      chainId: assetRaceChain.id,
      abi: assetRaceAbi,
      functionName: 'approvedAssets',
      args: [assetId],
    }) as const),
    query: { enabled: enabled && ids.length > 0, refetchInterval: 15_000 },
  })

  const assets = useMemo(() => {
    const metadata = new Map((catalog.data ?? []).map((item) => [item.tokenSymbol.toUpperCase(), item]))
    return ids.flatMap((assetId, index): ApprovedRaceAsset[] => {
      const result = registryQueries.data?.[index]
      if (result?.status !== 'success') return []
      const [registered, assetEnabled, category, oracle, oracleId, expectedDecimals, maxPriceAge] = result.result
      if (!registered || !assetEnabled) return []
      const symbol = symbolForRaceAsset(assetId, oracleId, index)
      const item = metadata.get(symbol)
      const localMemeName = category === ASSET_RACE_CATEGORY.MEME ? LOCAL_MEME_NAMES.get(symbol) : undefined
      return [{
        assetId,
        registered,
        enabled: assetEnabled,
        category,
        oracle: oracle as Address,
        oracleId,
        expectedDecimals,
        maxPriceAge,
        symbol,
        name: localMemeName ?? item?.tokenName.replace(/\s*•\s*Robinhood Token$/i, '') ?? FALLBACK_NAMES[symbol] ?? symbol,
        logoUrl: item?.logoUrl,
      }]
    })
  }, [catalog.data, ids, registryQueries.data])

  async function refetch() {
    await Promise.all([idsQuery.refetch(), durationsQuery.refetch(), registryQueries.refetch()])
  }

  return {
    assets,
    durations: (durationsQuery.data ?? []) as readonly bigint[],
    isLoading: idsQuery.isLoading || durationsQuery.isLoading || registryQueries.isLoading,
    error: idsQuery.error ?? durationsQuery.error ?? registryQueries.error,
    refetch,
  }
}
