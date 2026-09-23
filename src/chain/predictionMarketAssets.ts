import { hexToString, stringToHex, type Hex } from 'viem'
import { assetRaceCatalog, oracleIdForCatalogAsset } from '@/chain/assetRaceRegistry'

export const PREDICTION_MARKET_ASSETS = assetRaceCatalog.flatMap((asset) => {
  const source = asset.networks['robinhood-mainnet']
  const oracleId = oracleIdForCatalogAsset(asset, 'robinhood-mainnet')
  if (asset.category !== 'STOCK' || !source.enabled || source.oracle?.type !== 'SIGNED_POOL_BLOCK_PAIR' || !oracleId) {
    return []
  }
  return [{
    assetId: stringToHex(asset.assetId, { size: 32 }) as Hex,
    oracleId,
    decimals: source.oracle.expectedDecimals,
    displayName: asset.displayName,
    ticker: asset.symbol,
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
