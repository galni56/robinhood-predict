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

export type AssetPriceWindow = '1M' | '5M' | '15M' | '1H' | 'ALL'

export const ASSET_PRICE_WINDOWS: readonly AssetPriceWindow[] = ['1M', '5M', '15M', '1H', 'ALL']

const WINDOW_DURATION_MS: Record<Exclude<AssetPriceWindow, 'ALL'>, number> = {
  '1M': 60_000,
  '5M': 5 * 60_000,
  '15M': 15 * 60_000,
  '1H': 60 * 60_000,
}

export function mergeAssetPriceHistory(
  current: AssetPriceHistoryPoint[],
  incoming: AssetPriceHistoryPoint[],
  limit = 14_400,
) {
  const byTimestamp = new Map(current.map((point) => [point.receivedAt, point]))
  for (const point of incoming) byTimestamp.set(point.receivedAt, point)
  return [...byTimestamp.values()]
    .sort((a, b) => a.receivedAt - b.receivedAt)
    .slice(-limit)
}

export function filterAssetPriceWindow<T extends { receivedAt: number }>(
  points: T[],
  windowName: AssetPriceWindow,
  anchor: number,
) {
  if (windowName === 'ALL') return points
  const cutoff = anchor - WINDOW_DURATION_MS[windowName]
  return points.filter((point) => point.receivedAt >= cutoff)
}

export function sampleAssetPriceSeries<T>(points: T[], maxPoints = 1_200) {
  if (!Number.isSafeInteger(maxPoints) || maxPoints < 2) throw new Error('InvalidChartSampleLimit')
  if (points.length <= maxPoints) return points
  return Array.from(
    { length: maxPoints },
    (_, index) => points[Math.round(index * (points.length - 1) / (maxPoints - 1))],
  )
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
  return `${liveUrl.replace(/\/$/, '')}/history?asset=${encodeURIComponent(assetId)}&limit=1440`
}
