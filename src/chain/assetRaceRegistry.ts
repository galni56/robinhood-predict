import registryJson from '../../config/solana-assets.json'
import { SOLANA_CLUSTER } from '@/solana/config'

// Reviewed asset catalog for both games, from config/solana-assets.json (owner
// approval recorded in config/solana-catalog-approved.json). Mainnet builds
// show approved assets only; devnet/localnet show the whole reviewed list.

export type AssetRaceCategoryName = 'STOCK' | 'MEME' | 'CRYPTO'

interface RegistryAsset {
  symbol: string
  name: string
  category: AssetRaceCategoryName
  mint: string
  tokenDecimals: number
  priceDecimals: number
  pool: string
  poolKind: string
  quote: string
  icon: string | null
  priceUrl: string
  approved: boolean
}

export interface AssetRaceCatalogAsset {
  /** On-chain asset id: the UTF-8 symbol zero-padded to 32 bytes, as 0x-hex. */
  assetId: string
  symbol: string
  displayName: string
  category: AssetRaceCategoryName
  mint: string
  /** Reviewed pool the price service reads; the on-chain `price_source`. */
  pool: string
  poolKind: string
  priceDecimals: number
  logoUrl?: string
  priceUrl: string
  enabled: boolean
}

export function assetIdHexForSymbol(symbol: string) {
  const bytes = new TextEncoder().encode(symbol)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `0x${hex.padEnd(64, '0')}`
}

export const assetRaceCatalog: AssetRaceCatalogAsset[] = (registryJson.assets as RegistryAsset[]).map((a) => ({
  assetId: assetIdHexForSymbol(a.symbol),
  symbol: a.symbol,
  displayName: a.name,
  category: a.category,
  mint: a.mint,
  pool: a.pool,
  poolKind: a.poolKind,
  priceDecimals: a.priceDecimals,
  logoUrl: a.icon ?? undefined,
  priceUrl: a.priceUrl,
  enabled: SOLANA_CLUSTER === 'mainnet-beta' ? a.approved : true,
}))

export const assetRaceCatalogById = new Map(assetRaceCatalog.map((asset) => [asset.assetId.toLowerCase(), asset]))
export const assetRaceCatalogByPool = new Map(assetRaceCatalog.map((asset) => [asset.pool, asset]))

export function priceSourceUrlForCatalogAsset(asset?: AssetRaceCatalogAsset): string | undefined {
  return asset?.priceUrl
}

export function priceSourceUrlForAssetId(assetId?: string): string | undefined {
  return assetId ? assetRaceCatalogById.get(assetId.toLowerCase())?.priceUrl : undefined
}

export function priceSourceUrlForSymbol(symbol?: string): string | undefined {
  if (!symbol) return undefined
  return assetRaceCatalog.find((asset) => asset.symbol.toLowerCase() === symbol.toLowerCase())?.priceUrl
}
