import { useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { ALLOWLISTED_FEEDS } from '@/chain/contracts'

// Robinhood Chain's own read-only REST API (see docs.robinhood.com/chain/stock-token-apis)
// — gives token metadata + live prices for every tokenized stock, separate
// from our own PredictionMarket contract. Blocked by CORS from a browser and
// geo-blocked from some networks when called directly, so both `npm run dev`
// (vite.config.ts) and prod (nginx on the VPS) proxy it under our own origin.
const API_BASE = '/api/robinhood'

export interface RobinhoodAsset {
  tokenSymbol: string
  tokenName: string
  deployments: { contractAddress: string; chainId: number; networkName: string }[]
  status: string
  logoUrl: string
}

export interface RobinhoodQuote {
  tokenSymbol: string
  bid: string
  ask: string
  currency: string
  dailyTradingVolume: string
  isTradingHalt: boolean
  generatedAt: string
  dailyHigh: string
  dailyLow: string
}

/** Full token catalog (~194 tickers) — name, symbol, contract address, logo.
 * Static-ish (assets rarely get added/removed), so cached for a while. */
export function useRobinhoodAssets() {
  return useQuery({
    queryKey: ['robinhood-assets'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/assets`)
      if (!res.ok) throw new Error(`Robinhood assets fetch failed: ${res.status}`)
      const data = (await res.json()) as { assets: RobinhoodAsset[] }
      return data.assets
    },
    staleTime: 10 * 60_000,
  })
}

/** Fetches one ticker per request in parallel and merges each quote onto
 * `previous` (last known-good data) as soon as it lands, publishing every
 * intermediate state through `publish`. Without this, the whole grid sat on
 * "…" until the single slowest of ~50 parallel requests settled — now each
 * ticker paints the moment its own request resolves, and a slow/failed
 * ticker no longer blocks (or blanks) the rest. */
async function fetchPrices(
  symbols: string[],
  previous: Map<string, RobinhoodQuote> | undefined,
  publish: (byTicker: Map<string, RobinhoodQuote>) => void,
) {
  const byTicker = new Map(previous ?? [])
  await Promise.allSettled(
    symbols.map(async (symbol) => {
      const res = await fetch(`${API_BASE}/prices/${symbol}`)
      if (!res.ok) throw new Error(`${symbol}: ${res.status}`)
      const data = (await res.json()) as { quotes: RobinhoodQuote[] }
      const quote = data.quotes[0]
      if (quote) {
        byTicker.set(quote.tokenSymbol, quote)
        publish(new Map(byTicker))
      }
    }),
  )
  return byTicker
}

/** Wires `fetchPrices`' progressive updates into the given query's cache
 * entry, so each ticker re-renders as soon as its own request resolves
 * instead of the whole query waiting on the slowest one. */
function fetchPricesForQuery(queryClient: QueryClient, queryKey: QueryKey, symbols: string[]) {
  const previous = queryClient.getQueryData<Map<string, RobinhoodQuote>>(queryKey)
  return fetchPrices(symbols, previous, (byTicker) => queryClient.setQueryData(queryKey, byTicker))
}

/** Live bid/ask/volume for a specific set of tickers. The API is per-symbol
 * (no batch endpoint), so this fires one request per ticker in parallel.
 * Refetches every 15s to match the API's own server-side cache window —
 * polling faster just re-fetches the same cached value.
 *
 * The query key includes `symbols` itself, so two callers passing
 * different arrays (even with overlapping tickers) get separate cache
 * entries and separate requests — fine for a genuinely different symbol
 * set (e.g. search results), wasteful for a set that's shown elsewhere
 * unchanged. Use `useCorePrices()` below for the common/shared set instead
 * of passing `CORE_TICKERS` here. */
export function useRobinhoodPrices(symbols: string[]) {
  const queryClient = useQueryClient()
  const queryKey = ['robinhood-prices', symbols]
  return useQuery({
    queryKey,
    queryFn: () => fetchPricesForQuery(queryClient, queryKey, symbols),
    enabled: symbols.length > 0,
    refetchInterval: 15_000,
  })
}

// The tickers shown by default in more than one place at once (ticker tape,
// token browser's empty-search view) — kept as one list so every consumer
// shares the query below instead of each firing its own duplicate requests
// for the same symbols every 15s. Union of a fixed "recognizable name"
// list and every allowlisted ticker (TokenBrowser's default view shows all
// of the latter, so they need to be in here too or their price never
// resolves outside of an explicit search).
const RECOGNIZABLE_TICKERS = [
  'TSLA', 'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'AVGO', 'CRWD', 'SNOW',
  'INTC', 'TSM', 'SPY', 'QQQ', 'GLD', 'NFLX', 'AMD', 'ADBE', 'ORCL', 'CSCO',
  'IBM', 'WDAY', 'SHOP', 'COIN', 'PLTR', 'SNAP', 'RDDT', 'SOFI', 'DELL', 'PANW',
]
export const CORE_TICKERS = Array.from(new Set([...RECOGNIZABLE_TICKERS, ...ALLOWLISTED_FEEDS.map((f) => f.ticker)]))

/** Prices for CORE_TICKERS on a fixed query key (not parameterized by any
 * caller-supplied array), so every component using this hook shares the
 * exact same React Query cache entry — one set of requests every 15s no
 * matter how many places on screen show these tickers. */
export function useCorePrices() {
  const queryClient = useQueryClient()
  const queryKey = ['robinhood-prices-core']
  return useQuery({
    queryKey,
    queryFn: () => fetchPricesForQuery(queryClient, queryKey, CORE_TICKERS),
    refetchInterval: 15_000,
  })
}
