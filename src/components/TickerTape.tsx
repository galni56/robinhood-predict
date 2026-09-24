import { useEffect, useRef } from 'react'
import { formatUnits } from 'viem'
import { CORE_TICKERS } from '@/chain/robinhoodApi'
import { useAssetRaceLiveDisplay } from '@/chain/useAssetRaceLiveDisplay'
import { TokenLogo } from '@/components/TokenLogo'
import { formatUsd } from '@/lib/format'

/** Horizontal auto-scrolling strip using the same StockToken/USDG pool
 * snapshot that settles all three onchain games. */
export function TickerTape() {
  const live = useAssetRaceLiveDisplay({ enabled: true })
  const prevByTicker = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    for (const ticker of CORE_TICKERS) {
      const price = live.assets[ticker]
      if (price && !price.stale) {
        prevByTicker.current.set(ticker, Number(formatUnits(BigInt(price.priceRaw), price.decimals)))
      }
    }
  }, [live.assets])

  if (live.disconnected) {
    return <div className="border-y border-white/10 bg-[#17111f] h-10" />
  }

  const items = CORE_TICKERS.map((ticker) => {
    const price = live.assets[ticker]
    if (!price || price.stale) return null
    const value = Number(formatUnits(BigInt(price.priceRaw), price.decimals))
    const prev = prevByTicker.current.get(ticker)
    const tickedUp = prev == null || value >= prev
    return { ticker, value, tickedUp }
  }).filter((x): x is { ticker: string; value: number; tickedUp: boolean } => x != null)

  // Duplicated so the CSS marquee loops seamlessly.
  const track = [...items, ...items]

  return (
    <div className="border-y border-white/10 bg-[#17111f] overflow-hidden group">
      <div className="flex w-max animate-[ticker-scroll_60s_linear_infinite] group-hover:[animation-play-state:paused]">
        {track.map((item, i) => (
          <span key={`${item.ticker}-${i}`} className="flex items-center gap-1.5 px-4 py-2 text-xs whitespace-nowrap shrink-0">
            <TokenLogo ticker={item.ticker} className="h-5 w-5 rounded-md" />
            <span className="font-bold text-white/70">{item.ticker}</span>
            <span className={item.tickedUp ? 'font-mono text-emerald-400' : 'font-mono text-rose-400'}>{formatUsd(item.value)}</span>
          </span>
        ))}
      </div>
      <style>{`
        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
