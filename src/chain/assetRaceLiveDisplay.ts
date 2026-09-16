export const LIVE_DISPLAY_RETURN_SCALE = 10n ** 18n

export interface AssetRaceLivePrice {
  assetId: string
  oracleId: string
  priceUsdG?: string // Backward-compatible Stock field only.
  priceQuote?: string
  quoteSymbol?: string
  quoteUnit?: 'ETH_QUOTE' | 'USDG'
  quoteKind?: 'WETH' | 'NATIVE_ETH'
  quoteToken?: string
  priceRaw: string
  decimals: number
  blockNumber: string
  blockHash: string
  blockTimestamp: number
  poolIdentifier: string
  protocol: 'UNISWAP_V3' | 'UNISWAP_V4'
  receivedAt: number
  priceChangedAt: number
  provider: 'ROBINHOOD_POOL_RPC'
  stale: boolean
}

export interface AssetRaceLiveSnapshot {
  provider: 'ROBINHOOD_POOL_RPC'
  heartbeatAt: number
  staleAfterMs: number
  upstreamRequestCount: number
  assets: Record<string, AssetRaceLivePrice>
  errors: Record<string, string>
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function parseAssetRaceLiveSnapshot(value: unknown): AssetRaceLiveSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<AssetRaceLiveSnapshot>
  if (
    candidate.provider !== 'ROBINHOOD_POOL_RPC'
      || !positiveSafeInteger(candidate.heartbeatAt)
      || !positiveSafeInteger(candidate.staleAfterMs)
      || typeof candidate.assets !== 'object' || !candidate.assets
      || typeof candidate.errors !== 'object' || !candidate.errors
  ) return undefined

  const assets: Record<string, AssetRaceLivePrice> = {}
  for (const [assetId, raw] of Object.entries(candidate.assets)) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as Partial<AssetRaceLivePrice>
    if (
      entry.assetId !== assetId
        || typeof entry.oracleId !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(entry.oracleId)
        || entry.provider !== 'ROBINHOOD_POOL_RPC'
        || (typeof entry.priceQuote !== 'string' && typeof entry.priceUsdG !== 'string')
        || typeof entry.priceRaw !== 'string' || !/^\d+$/.test(entry.priceRaw) || BigInt(entry.priceRaw) <= 0n
        || !positiveSafeInteger(entry.decimals)
        || typeof entry.blockNumber !== 'string' || !/^\d+$/.test(entry.blockNumber)
        || typeof entry.blockHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(entry.blockHash)
        || !positiveSafeInteger(entry.blockTimestamp)
        || typeof entry.poolIdentifier !== 'string'
        || !['UNISWAP_V3', 'UNISWAP_V4'].includes(entry.protocol ?? '')
        || !positiveSafeInteger(entry.receivedAt)
        || !positiveSafeInteger(entry.priceChangedAt)
        || typeof entry.stale !== 'boolean'
    ) continue
    assets[assetId] = entry as AssetRaceLivePrice
  }

  return { ...candidate, assets } as AssetRaceLiveSnapshot
}

export function calculateLiveDisplayReturnWad(
  settlementStartPrice: bigint,
  livePrice: bigint,
) {
  if (settlementStartPrice <= 0n || livePrice <= 0n) return 0n
  return ((livePrice - settlementStartPrice) * LIVE_DISPLAY_RETURN_SCALE) / settlementStartPrice
}

export function displayedRaceReturnWad(args: {
  final: boolean
  officialReturn: bigint
  settlementStartPrice: bigint
  livePrice: bigint
}) {
  return args.final
    ? args.officialReturn
    : calculateLiveDisplayReturnWad(args.settlementStartPrice, args.livePrice)
}
