const LOCAL_ASSET_ICONS = new Set([
  'AAPL', 'AI', 'AMZN', 'BLORB', 'BONER', 'CASHCAT', 'CHUMP', 'DOGO', 'FRONG', 'GOOGL',
  'HOOD', 'IF', 'JUGGERNAUT', 'META', 'MOO', 'MSFT', 'MSTR', 'MU', 'NFLX', 'NVDA',
  'PIPEDOG', 'TENDIES', 'TSLA',
])

export function assetIconUrl(symbol: string | null | undefined) {
  const normalized = symbol?.trim().toUpperCase()
  if (!normalized || !LOCAL_ASSET_ICONS.has(normalized)) return undefined
  return `${import.meta.env.BASE_URL}asset-icons/${normalized}.webp`
}
