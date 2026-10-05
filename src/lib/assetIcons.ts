import { assetRaceCatalog } from '@/chain/assetRaceRegistry'

// Project artwork in public/asset-icons, keyed by the underlying ticker
// (xStocks reuse their stock's artwork: NVDAx → NVDA).
const LOCAL_ASSET_ICONS = new Set(['AAPL', 'AMZN', 'GOOGL', 'HOOD', 'META', 'MSFT', 'MSTR', 'NVDA', 'TSLA'])
const SVG_ASSET_ICONS = new Set(['BTC', 'ETH'])
// Meme/crypto artwork bundled locally where the catalog URL is unreliable
// (the WIF catalog icon points at the dead nftstorage gateway).
const PNG_ASSET_ICONS = new Set(['SOL', 'TRUMP', 'WIF'])

const STOCK_SYMBOLS = new Set(assetRaceCatalog.filter((asset) => asset.category === 'STOCK').map((asset) => asset.symbol.toUpperCase()))
// Token metadata logos from the reviewed catalog for everything else.
const CATALOG_ICONS = new Map(
  assetRaceCatalog.flatMap((asset) => (asset.logoUrl ? [[asset.symbol.toUpperCase(), asset.logoUrl] as const] : [])),
)
// Logos of assets the game server adds at runtime (PumpSwap coins).
const DYNAMIC_ICONS = new Map<string, string>()

export function registerAssetIcons(assets: { symbol: string; logoUrl?: string | null }[]) {
  for (const asset of assets) if (asset.logoUrl) DYNAMIC_ICONS.set(asset.symbol.toUpperCase(), asset.logoUrl)
}

export function assetIconUrl(symbol: string | null | undefined) {
  const normalized = symbol?.trim().toUpperCase()
  if (!normalized) return undefined
  if (SVG_ASSET_ICONS.has(normalized)) return `${import.meta.env.BASE_URL}asset-icons/${normalized}.svg`
  if (PNG_ASSET_ICONS.has(normalized)) return `${import.meta.env.BASE_URL}asset-icons/${normalized}.png`
  const underlying = STOCK_SYMBOLS.has(normalized) && normalized.endsWith('X') ? normalized.slice(0, -1) : normalized
  if (LOCAL_ASSET_ICONS.has(underlying)) return `${import.meta.env.BASE_URL}asset-icons/${underlying}.webp`
  return CATALOG_ICONS.get(normalized) ?? DYNAMIC_ICONS.get(normalized)
}
