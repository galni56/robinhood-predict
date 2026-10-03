import { useQuery } from '@tanstack/react-query'
import { PRICE_SERVICE_URL } from '@/solana/services'

// Display prices from the price service (`GET /prices`): one snapshot of every
// reviewed pool, served from memory, polled by every page through a single
// shared react-query entry. Settlement never uses these numbers.

export interface LivePrice {
  symbol: string
  raw: bigint
  decimals: number
  /** Decimal string as the service formats it. */
  price: string
  /** Mint supply (memes only), for a display market cap. */
  supply?: { raw: bigint; decimals: number }
}

/** Price × mint supply in USD, display only; undefined without a supply. */
export function marketCapUsd(price: Pick<LivePrice, 'raw' | 'decimals' | 'supply'> | undefined): number | undefined {
  if (!price?.supply) return undefined
  const value = (Number(price.raw) / 10 ** price.decimals) * (Number(price.supply.raw) / 10 ** price.supply.decimals)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

/** SOL/USD rate used to quote stakes entered in USD. */
export interface SolUsdQuote {
  priceRaw: bigint
  decimals: number
  receivedAt: number
  staleAfterMs: number
}

export interface LivePrices {
  /** Keyed by asset symbol; empty while the feed is unreachable or stale. */
  assets: Record<string, LivePrice>
  solUsd?: SolUsdQuote
  disconnected: boolean
  slot?: number
}

const POLL_MS = 3_000
export const LIVE_PRICE_STALE_MS = 15_000

interface PricesResponse {
  slot?: number
  prices?: Record<string, { price?: string; raw?: string; decimals?: number; supply?: { raw?: string; decimals?: number } }>
}

async function fetchPrices() {
  const response = await fetch(`${PRICE_SERVICE_URL}/prices`)
  if (!response.ok) throw new Error(`Price service returned ${response.status}`)
  const body = (await response.json()) as PricesResponse
  const assets: Record<string, LivePrice> = {}
  for (const [symbol, entry] of Object.entries(body.prices ?? {})) {
    if (typeof entry.raw !== 'string' || !/^\d+$/.test(entry.raw)) continue
    if (!Number.isSafeInteger(entry.decimals) || entry.decimals! < 0 || entry.decimals! > 18) continue
    const raw = BigInt(entry.raw)
    if (raw <= 0n) continue
    const supply = entry.supply && typeof entry.supply.raw === 'string' && /^\d+$/.test(entry.supply.raw) && Number.isSafeInteger(entry.supply.decimals)
      ? { raw: BigInt(entry.supply.raw), decimals: entry.supply.decimals! }
      : undefined
    assets[symbol] = { symbol, raw, decimals: entry.decimals!, price: entry.price ?? '', supply }
  }
  return { slot: body.slot, assets }
}

export function useLivePrices({ enabled = true }: { enabled?: boolean } = {}): LivePrices {
  const query = useQuery({
    queryKey: ['live-prices'],
    queryFn: fetchPrices,
    enabled: enabled && PRICE_SERVICE_URL != null,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    retry: 1,
  })
  const receivedAt = query.dataUpdatedAt
  // Successful polls keep the data at most one interval old; a failed poll
  // means the feed is unreachable, so stop showing its last numbers.
  const disconnected = !enabled || !query.data || query.isRefetchError
  if (disconnected) return { assets: {}, disconnected: true }
  const sol = query.data!.assets.SOL
  return {
    assets: query.data!.assets,
    solUsd: sol ? { priceRaw: sol.raw, decimals: sol.decimals, receivedAt, staleAfterMs: LIVE_PRICE_STALE_MS } : undefined,
    disconnected: false,
    slot: query.data!.slot,
  }
}
