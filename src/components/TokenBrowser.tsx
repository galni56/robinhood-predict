import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatUnits } from 'viem'
import { predictionAssetsForMode, type PredictionMarketMode } from '@/chain/predictionMarketAssets'
import { useRobinhoodAssets } from '@/chain/robinhoodApi'
import { useAssetRaceLiveDisplay } from '@/chain/useAssetRaceLiveDisplay'
import { PriceSourceLink } from '@/components/PriceSourceLink'
import { TokenLogo } from '@/components/TokenLogo'
import { formatAssetPrice } from '@/lib/format'

const modeLabels: Record<PredictionMarketMode, { heading: string; plural: string }> = {
  stocks: { heading: 'tokenized stocks', plural: 'tokenized stocks' },
  memes: { heading: 'meme assets', plural: 'meme assets' },
  crypto: { heading: 'crypto assets', plural: 'crypto assets' },
}

export function TokenBrowser({ mode }: { mode: PredictionMarketMode }) {
  const [query, setQuery] = useState('')
  const assets = useRobinhoodAssets()
  const marketAssets = useMemo(() => predictionAssetsForMode(mode), [mode])
  const defaultTickers = useMemo(() => marketAssets.map((asset) => asset.ticker), [marketAssets])

  const matches = useMemo(() => {
    if (!query.trim()) return null
    const q = query.trim().toLowerCase()
    return marketAssets
      .filter((asset) => {
        const catalogName = (assets.data ?? []).find((item) => item.tokenSymbol === asset.ticker)?.tokenName ?? asset.displayName
        return asset.ticker.toLowerCase().includes(q) || catalogName.toLowerCase().includes(q)
      })
      .map((asset) => asset.ticker)
  }, [query, assets.data, marketAssets])

  const visibleTickers = matches ?? defaultTickers
  const live = useAssetRaceLiveDisplay({ enabled: true })
  const prevByTicker = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    for (const ticker of defaultTickers) {
      const price = live.assets[ticker]
      if (price && !price.stale) {
        prevByTicker.current.set(ticker, Number(formatUnits(BigInt(price.priceRaw), price.decimals)))
      }
    }
  }, [defaultTickers, live.assets])

  const nameByTicker = new Map((assets.data ?? []).map((a) => [a.tokenSymbol, a]))

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="font-display text-2xl font-bold">Browse {modeLabels[mode].heading}</h2>
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
          : `${defaultTickers.length} reviewed ${modeLabels[mode].plural} are enabled for prediction markets.`}
      </p>

      {visibleTickers.length === 0 ? (
        <p className="text-white/30 text-sm text-center py-10">No tokens match "{query}".</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleTickers.map((ticker) => {
            const asset = nameByTicker.get(ticker)
            const marketAsset = marketAssets.find((item) => item.ticker === ticker)
            const price = live.assets[ticker]
            const current = price && !price.stale
              ? Number(formatUnits(BigInt(price.priceRaw), price.decimals))
              : null
            const prev = prevByTicker.current.get(ticker)
            const tickedUp = current == null || prev == null ? true : current >= prev
            return (
              <div key={ticker} className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-[#241b2f] p-4 transition-colors hover:border-[#8B7CF7]/30 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <TokenLogo ticker={ticker} className="h-11 w-11 rounded-xl" />
                  <div className="min-w-0">
                    <div className="font-bold">{ticker}</div>
                    <div className="text-white/40 text-xs truncate">
                      {mode === 'stocks'
                        ? asset?.tokenName.replace(/\s*•\s*Robinhood Token$/i, '') ?? marketAsset?.displayName ?? '…'
                        : marketAsset?.displayName ?? '…'}
                    </div>
                  </div>
                </div>
                <div className="flex items-end justify-between gap-3 sm:block sm:shrink-0 sm:text-right">
                  <div className={`font-mono text-sm font-semibold ${tickedUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {current != null && marketAsset ? formatAssetPrice(current, marketAsset.quoteSymbol) : '…'}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 sm:mt-1">
                    <PriceSourceLink href={marketAsset?.priceUrl} symbol={ticker} tone="market" className="text-[11px]" />
                    <Link to={`/onchain/create?feed=${ticker}&mode=${mode}`} className="text-[11px] font-bold text-[#B3A7FA] hover:underline">
                      Create Prediction
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
