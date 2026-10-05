import { useMemo } from 'react'
import { assetIdHexForSymbol, assetRaceCatalog, assetRaceCatalogByPool } from '@/chain/assetRaceRegistry'
import { categoryCode, type ApprovedRaceAsset } from '@/chain/assetRaces'
import { useGameServerConfig, usePumpSwapAssets, type ServerAsset } from '@/chain/gameServer'

const CATEGORY_NAMES = ['STOCK', 'MEME', 'CRYPTO'] as const
/** Community race durations of the game server (rules.mjs), for when it is off. */
const DEFAULT_RACE_DURATIONS = [300n, 900n, 3_600n]

function pumpSwapAsset(asset: ServerAsset): ApprovedRaceAsset {
  return {
    assetId: assetIdHexForSymbol(asset.symbol),
    enabled: true,
    category: categoryCode(asset.category),
    priceSource: asset.priceSource,
    expectedDecimals: asset.priceDecimals,
    symbol: asset.symbol,
    name: asset.name,
    logoUrl: asset.logoUrl ?? undefined,
    priceUrl: asset.priceUrl ?? undefined,
  }
}

/** Assets both games accept (memes and crypto; stocks are off): from the game
 * server, matched against the reviewed catalog, plus the PumpSwap coins.
 * While the server is off, the catalog and the last known PumpSwap list
 * stand in, so pickers are never empty. */
export function useApprovedRaceAssets() {
  const config = useGameServerConfig()
  const pumpswap = usePumpSwapAssets()

  const assets = useMemo(() => {
    const fromServer = (config.data?.assets ?? []).flatMap((asset): ApprovedRaceAsset[] => {
      if (asset.source === 'pumpswap') return [pumpSwapAsset(asset)]
      const catalog = assetRaceCatalogByPool.get(asset.priceSource)
      const category = categoryCode(asset.category)
      if (!catalog?.enabled || CATEGORY_NAMES[category] !== catalog.category || catalog.priceDecimals !== asset.priceDecimals) return []
      return [{ assetId: catalog.assetId, enabled: true, category, priceSource: asset.priceSource, expectedDecimals: asset.priceDecimals, symbol: catalog.symbol, name: catalog.displayName, logoUrl: catalog.logoUrl, priceUrl: catalog.priceUrl }]
    })
    const list = fromServer.length > 0 ? fromServer : [
      ...assetRaceCatalog.filter((a) => a.enabled && a.category !== 'STOCK').map((catalog): ApprovedRaceAsset => ({
        assetId: catalog.assetId, enabled: true, category: categoryCode(catalog.category), priceSource: catalog.pool, expectedDecimals: catalog.priceDecimals,
        symbol: catalog.symbol, name: catalog.displayName, logoUrl: catalog.logoUrl, priceUrl: catalog.priceUrl,
      })),
      ...pumpswap.assets.map(pumpSwapAsset),
    ]
    return list.filter((a) => CATEGORY_NAMES[a.category] !== 'STOCK').sort((a, b) => a.symbol.localeCompare(b.symbol))
  }, [config.data, pumpswap.assets])

  const durations = useMemo(() => {
    const server = config.data?.race.communityDurations
    return server?.length ? server.map(BigInt) : DEFAULT_RACE_DURATIONS
  }, [config.data])

  return {
    assets,
    durations,
    stake: config.data ? { min: BigInt(config.data.stake.min), max: BigInt(config.data.stake.max) } : undefined,
    gameWallet: config.data?.gameWallet,
    isLoading: config.isLoading && assets.length === 0,
    error: null,
    refetch: async () => { await config.refetch() },
  }
}
