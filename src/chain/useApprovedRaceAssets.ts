import { useMemo } from 'react'
import { assetRaceCatalogByPool } from '@/chain/assetRaceRegistry'
import { categoryCode, type ApprovedRaceAsset } from '@/chain/assetRaces'
import { useGameServerConfig } from '@/chain/gameServer'

const CATEGORY_NAMES = ['STOCK', 'MEME', 'CRYPTO'] as const

/** Assets the game server accepts for both games, shown only when they match
 * a reviewed catalog entry (same pool, category and price precision), and
 * the community race durations. */
export function useApprovedRaceAssets() {
  const config = useGameServerConfig()

  const assets = useMemo(() => (config.data?.assets ?? []).flatMap((asset): ApprovedRaceAsset[] => {
    const catalog = assetRaceCatalogByPool.get(asset.priceSource)
    const category = categoryCode(asset.category)
    if (!catalog?.enabled || CATEGORY_NAMES[category] !== catalog.category || catalog.priceDecimals !== asset.priceDecimals) return []
    return [{
      assetId: catalog.assetId,
      enabled: true,
      category,
      priceSource: asset.priceSource,
      expectedDecimals: asset.priceDecimals,
      symbol: catalog.symbol,
      name: catalog.displayName,
      logoUrl: catalog.logoUrl,
      priceUrl: catalog.priceUrl,
    }]
  }).sort((a, b) => a.symbol.localeCompare(b.symbol)), [config.data])

  const durations = useMemo(() => (config.data?.race.communityDurations ?? []).map(BigInt), [config.data])

  return {
    assets,
    durations,
    stake: config.data ? { min: BigInt(config.data.stake.min), max: BigInt(config.data.stake.max) } : undefined,
    gameWallet: config.data?.gameWallet,
    isLoading: config.isLoading,
    error: config.error,
    refetch: async () => { await config.refetch() },
  }
}
