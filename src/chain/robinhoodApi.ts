import { useQuery } from '@tanstack/react-query'

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

/** Live bid/ask/volume for a specific set of tickers. The API is per-symbol
 * (no batch endpoint), so this fires one request per ticker in parallel.
 * Refetches every 15s to match the API's own server-side cache window —
 * polling faster just re-fetches the same cached value. */
export function useRobinhoodPrices(symbols: string[]) {
  return useQuery({
    queryKey: ['robinhood-prices', symbols],
    queryFn: async () => {
      const settled = await Promise.allSettled(
        symbols.map(async (symbol) => {
          const res = await fetch(`${API_BASE}/prices/${symbol}`)
          if (!res.ok) throw new Error(`${symbol}: ${res.status}`)
          const data = (await res.json()) as { quotes: RobinhoodQuote[] }
          return data.quotes[0]
        }),
      )
      const byTicker = new Map<string, RobinhoodQuote>()
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) byTicker.set(r.value.tokenSymbol, r.value)
      }
      return byTicker
    },
    enabled: symbols.length > 0,
    refetchInterval: 15_000,
  })
}
