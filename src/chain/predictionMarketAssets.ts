import { hexToString, stringToHex, type Hex } from 'viem'
import { assetRaceCatalog, oracleIdForCatalogAsset, priceSourceUrlForCatalogAsset } from '@/chain/assetRaceRegistry'
import type { AssetPriceQuote } from '@/lib/format'

export type PredictionMarketMode = 'stocks' | 'memes' | 'crypto'

export const PREDICTION_MARKET_ASSETS = assetRaceCatalog.flatMap((asset) => {
  const source = asset.networks['robinhood-mainnet']
  const oracleId = oracleIdForCatalogAsset(asset, 'robinhood-mainnet')
  if (!['STOCK', 'MEME', 'CRYPTO'].includes(asset.category) || !source.enabled || source.oracle?.type !== 'SIGNED_POOL_BLOCK_PAIR' || !oracleId) {
    return []
  }
  return [{
    assetId: stringToHex(asset.assetId, { size: 32 }) as Hex,
    oracleId,
    decimals: source.oracle.expectedDecimals,
    displayName: asset.displayName,
    ticker: asset.symbol,
    category: asset.category as 'STOCK' | 'MEME' | 'CRYPTO',
    quoteSymbol: (asset.category === 'MEME' ? 'ETH' : 'USDG') as AssetPriceQuote,
    priceUrl: priceSourceUrlForCatalogAsset(asset),
  }]
})

export function predictionAssetForTicker(ticker?: string | null) {
  return PREDICTION_MARKET_ASSETS.find((asset) => asset.ticker.toLowerCase() === ticker?.toLowerCase())
}

export function predictionAssetForId(assetId?: Hex) {
  return PREDICTION_MARKET_ASSETS.find((asset) => asset.assetId.toLowerCase() === assetId?.toLowerCase())
}

export function tickerForPredictionAssetId(assetId?: Hex) {
  if (!assetId) return undefined
  const decoded = hexToString(assetId, { size: 32 }).replace(/\0+$/, '')
  return predictionAssetForId(assetId)?.ticker ?? (decoded || undefined)
}

export function predictionModeForAssetId(assetId?: Hex): PredictionMarketMode {
  const category = predictionAssetForId(assetId)?.category
  return category === 'MEME' ? 'memes' : category === 'CRYPTO' ? 'crypto' : 'stocks'
}

export function predictionAssetsForMode(mode: PredictionMarketMode) {
  const category = mode === 'memes' ? 'MEME' : mode === 'crypto' ? 'CRYPTO' : 'STOCK'
  return PREDICTION_MARKET_ASSETS.filter((asset) => asset.category === category)
}

export function predictionQuoteForAssetId(assetId?: Hex): AssetPriceQuote {
  return predictionAssetForId(assetId)?.quoteSymbol ?? 'USDG'
}
