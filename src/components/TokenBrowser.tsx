import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ALLOWLISTED_FEEDS } from '@/chain/contracts'
import { useCorePrices, useRobinhoodAssets, useRobinhoodPrices } from '@/chain/robinhoodApi'
import { formatUsd } from '@/lib/format'

// Shown when the search box is empty, instead of pulling live prices for
// all ~194 tokens at once (keeps requests bounded — 60 req/s rate limit on
// the underlying API, per its docs). Mix of the already-allowlisted
// tickers plus a few more recognizable ones.
const DEFAULT_TICKERS = ['TSLA', 'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NFLX', 'AMD', 'COIN', 'PLTR', 'SPY']

const ALLOWLISTED_TICKERS = new Set<string>(ALLOWLISTED_FEEDS.map((f) => f.ticker))

export function TokenBrowser() {
  const [query, setQuery] = useState('')
  const assets = useRobinhoodAssets()

  const matches = useMemo(() => {
    if (!query.trim()) return null
    const q = query.trim().toLowerCase()
    return (assets.data ?? [])
      .filter((a) => a.tokenSymbol.toLowerCase().includes(q) || a.tokenName.toLowerCase().includes(q))
      .slice(0, 15)
      .map((a) => a.tokenSymbol)
  }, [query, assets.data])

  // Allowlisted tickers (the ones you can actually create a prediction on)
  // sort first, so "Not allowlisted yet" cards don't crowd out the
  // actionable ones above the fold.
  const visibleTickers = [...(matches ?? DEFAULT_TICKERS)].sort(
    (a, b) => Number(ALLOWLISTED_TICKERS.has(b)) - Number(ALLOWLISTED_TICKERS.has(a)),
  )
  // No search: DEFAULT_TICKERS is a subset of CORE_TICKERS, so reuse the
  // shared cache (also used by TickerTape) instead of firing duplicate
  // requests for the same symbols. Searching for something outside that
  // core set genuinely needs its own fetch.
  const corePrices = useCorePrices()
  const searchPrices = useRobinhoodPrices(matches ?? [])
  const prices = matches ? searchPrices : corePrices
  const prevByTicker = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!prices.data) return
    for (const [ticker, q] of prices.data) prevByTicker.current.set(ticker, Number(q.bid))
  }, [prices.data])

  const nameByTicker = new Map((assets.data ?? []).map((a) => [a.tokenSymbol, a]))

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-xl font-bold">Browse tokenized stocks</h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by ticker or name…"
          className="w-full sm:w-64 rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-[#C6FF3D]/60 transition-colors"
        />
      </div>
      <p className="text-white/40 text-xs mb-4">
        {query.trim()
          ? `${visibleTickers.length} match${visibleTickers.length === 1 ? '' : 'es'}`
          : `Showing a few of ~${assets.data?.length ?? 194} tokenized stocks on Robinhood Chain — search for more.`}
      </p>

      {visibleTickers.length === 0 ? (
        <p className="text-white/30 text-sm text-center py-10">No tokens match "{query}".</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleTickers.map((ticker) => {
            const asset = nameByTicker.get(ticker)
            const q = prices.data?.get(ticker)
            const bid = q ? Number(q.bid) : null
            const prev = prevByTicker.current.get(ticker)
            const tickedUp = bid == null || prev == null ? true : bid >= prev
            const canCreate = ALLOWLISTED_TICKERS.has(ticker)

            return (
              <div key={ticker} className="bg-[#12121c]/95 border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold">{ticker}</div>
                  <div className="text-white/40 text-xs truncate">{asset?.tokenName.replace(/\s*•\s*Robinhood Token$/i, '') ?? '…'}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-mono text-sm font-semibold ${tickedUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {bid != null ? formatUsd(bid) : '…'}
                  </div>
                  {canCreate ? (
                    <Link to={`/onchain/create?feed=${ticker}`} className="text-[11px] text-[#C6FF3D] hover:underline">
                      Create Prediction
                    </Link>
                  ) : (
                    <span className="text-[11px] text-white/20">Not allowlisted yet</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
