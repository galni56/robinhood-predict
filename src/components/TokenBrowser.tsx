import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatUnits } from 'viem'
import { PREDICTION_MARKET_ASSETS } from '@/chain/predictionMarketAssets'
import { useRobinhoodAssets } from '@/chain/robinhoodApi'
import { useAssetRaceLiveDisplay } from '@/chain/useAssetRaceLiveDisplay'
import { TokenLogo } from '@/components/TokenLogo'
import { formatUsd } from '@/lib/format'

const DEFAULT_TICKERS = PREDICTION_MARKET_ASSETS.map((asset) => asset.ticker)

export function TokenBrowser() {
  const [query, setQuery] = useState('')
  const assets = useRobinhoodAssets()

  const matches = useMemo(() => {
    if (!query.trim()) return null
    const q = query.trim().toLowerCase()
    return PREDICTION_MARKET_ASSETS
      .filter((asset) => {
        const catalogName = (assets.data ?? []).find((item) => item.tokenSymbol === asset.ticker)?.tokenName ?? asset.displayName
        return asset.ticker.toLowerCase().includes(q) || catalogName.toLowerCase().includes(q)
      })
      .map((asset) => asset.ticker)
  }, [query, assets.data])

  const visibleTickers = matches ?? DEFAULT_TICKERS
  const live = useAssetRaceLiveDisplay({ enabled: true })
  const prevByTicker = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    for (const ticker of DEFAULT_TICKERS) {
      const price = live.assets[ticker]
      if (price && !price.stale) {
        prevByTicker.current.set(ticker, Number(formatUnits(BigInt(price.priceRaw), price.decimals)))
      }
    }
  }, [live.assets])

  const nameByTicker = new Map((assets.data ?? []).map((a) => [a.tokenSymbol, a]))

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="font-display text-2xl font-bold">Browse tokenized stocks</h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by ticker or name…"
          className="w-full sm:w-64 rounded-full bg-white/5 border border-white/10 px-4 py-2 text-sm font-medium outline-none focus:border-[#8B7CF7]/60 transition-colors"
        />
      </div>
      <p className="text-white/40 text-xs mb-4">
        {query.trim()
          ? `${visibleTickers.length} match${visibleTickers.length === 1 ? '' : 'es'}`
          : `${DEFAULT_TICKERS.length} reviewed tokenized stocks are enabled for prediction markets.`}
      </p>

      {visibleTickers.length === 0 ? (
        <p className="text-white/30 text-sm text-center py-10">No tokens match "{query}".</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleTickers.map((ticker) => {
            const asset = nameByTicker.get(ticker)
            const price = live.assets[ticker]
            const current = price && !price.stale
              ? Number(formatUnits(BigInt(price.priceRaw), price.decimals))
              : null
            const prev = prevByTicker.current.get(ticker)
            const tickedUp = current == null || prev == null ? true : current >= prev
            return (
              <div key={ticker} className="bg-[#241b2f] border border-white/5 rounded-2xl p-4 flex items-center justify-between gap-3 hover:border-[#8B7CF7]/30 transition-colors">
                <div className="flex min-w-0 items-center gap-3">
                  <TokenLogo ticker={ticker} className="h-11 w-11 rounded-xl" />
                  <div className="min-w-0">
                    <div className="font-bold">{ticker}</div>
                    <div className="text-white/40 text-xs truncate">
                      {asset?.tokenName.replace(/\s*•\s*Robinhood Token$/i, '') ?? PREDICTION_MARKET_ASSETS.find((item) => item.ticker === ticker)?.displayName ?? '…'}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-mono text-sm font-semibold ${tickedUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {current != null ? formatUsd(current) : '…'}
                  </div>
                  <Link to={`/onchain/create?feed=${ticker}`} className="text-[11px] font-bold text-[#B3A7FA] hover:underline">
                    Create Prediction
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
