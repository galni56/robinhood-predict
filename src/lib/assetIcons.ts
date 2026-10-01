const LOCAL_ASSET_ICONS = new Set([
  'AAPL', 'AI', 'AMZN', 'BLORB', 'BONER', 'CASHCAT', 'CHUMP', 'DOGO', 'FRONG', 'GOOGL',
  'HOOD', 'IF', 'JUGGERNAUT', 'META', 'MOO', 'MSFT', 'MSTR', 'MU', 'NFLX', 'NVDA',
  'PIPEDOG', 'TENDIES', 'TSLA',
])

const SVG_ASSET_ICONS = new Set(['BTC', 'ETH'])

export function assetIconUrl(symbol: string | null | undefined) {
  const normalized = symbol?.trim().toUpperCase()
  if (!normalized) return undefined
  if (SVG_ASSET_ICONS.has(normalized)) return `${import.meta.env.BASE_URL}asset-icons/${normalized}.svg`
  if (!LOCAL_ASSET_ICONS.has(normalized)) return undefined
  return `${import.meta.env.BASE_URL}asset-icons/${normalized}.webp`
}
