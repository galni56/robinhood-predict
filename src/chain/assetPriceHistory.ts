export interface AssetPriceHistoryPoint {
  priceRaw: string
  decimals: number
  receivedAt: number
  blockTimestamp?: number
  blockNumber?: string
}

export interface AssetPriceHistory {
  assetId: string
  quoteSymbol?: string
  poolIdentifier?: string
  protocol?: 'UNISWAP_V3' | 'UNISWAP_V4'
  points: AssetPriceHistoryPoint[]
}

export function assetPriceChartUrl(symbol: string) {
  const normalized = symbol.trim()
  if (!normalized || normalized.length > 32 || !/^[A-Za-z0-9_-]+$/.test(normalized)) return undefined
  return `#/onchain/charts/${encodeURIComponent(normalized)}`
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function parseAssetPriceHistory(value: unknown, expectedAssetId: string): AssetPriceHistory | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<AssetPriceHistory>
  if (candidate.assetId !== expectedAssetId || !Array.isArray(candidate.points)) return undefined
  if (candidate.quoteSymbol != null && typeof candidate.quoteSymbol !== 'string') return undefined
  if (candidate.poolIdentifier != null && !/^0x(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/.test(candidate.poolIdentifier)) return undefined
  if (candidate.protocol != null && !['UNISWAP_V3', 'UNISWAP_V4'].includes(candidate.protocol)) return undefined

  const points = candidate.points.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const point = raw as Partial<AssetPriceHistoryPoint>
    if (
      typeof point.priceRaw !== 'string' || !/^\d+$/.test(point.priceRaw) || BigInt(point.priceRaw) <= 0n
      || !positiveSafeInteger(point.decimals)
      || !positiveSafeInteger(point.receivedAt)
      || (point.blockTimestamp != null && !positiveSafeInteger(point.blockTimestamp))
      || (point.blockNumber != null && (typeof point.blockNumber !== 'string' || !/^\d+$/.test(point.blockNumber)))
    ) return []
    return [point as AssetPriceHistoryPoint]
  })
  return { ...candidate, assetId: candidate.assetId, points } as AssetPriceHistory
}

export function assetPriceHistoryUrl(assetId: string) {
  const liveUrl = import.meta.env.VITE_ASSET_RACE_LIVE_URL?.trim() || '/api/asset-race/live'
  return `${liveUrl.replace(/\/$/, '')}/history?asset=${encodeURIComponent(assetId)}&limit=900`
}
