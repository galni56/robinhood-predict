import { useEffect, useRef } from 'react'
import { CORE_TICKERS, useCorePrices } from '@/chain/robinhoodApi'
import { formatUsd } from '@/lib/format'

/** Horizontal auto-scrolling price strip — 30 tickers, live bid price,
 * colored by whether it just ticked up or down since the last 15s poll
 * (compared client-side, since the API gives a snapshot, not history).
 * Shares its price cache with TokenBrowser's default view via
 * useCorePrices() — see robinhoodApi.ts — instead of firing its own
 * duplicate requests for the same tickers. */
export function TickerTape() {
  const prices = useCorePrices()
  const prevByTicker = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!prices.data) return
    for (const [ticker, q] of prices.data) {
      prevByTicker.current.set(ticker, Number(q.bid))
    }
  }, [prices.data])

  if (!prices.data) {
    return <div className="border-y border-white/10 bg-[#0a0a12] h-10" />
  }

  const items = CORE_TICKERS.map((ticker) => {
    const q = prices.data.get(ticker)
    if (!q) return null
    const bid = Number(q.bid)
    const prev = prevByTicker.current.get(ticker)
    const tickedUp = prev == null || bid >= prev
    return { ticker, bid, tickedUp }
  }).filter((x): x is { ticker: string; bid: number; tickedUp: boolean } => x != null)

  // Duplicated so the CSS marquee loops seamlessly.
  const track = [...items, ...items]

  return (
    <div className="border-y border-white/10 bg-[#0a0a12] overflow-hidden group">
      <div className="flex w-max animate-[ticker-scroll_60s_linear_infinite] group-hover:[animation-play-state:paused]">
        {track.map((item, i) => (
          <span key={`${item.ticker}-${i}`} className="flex items-center gap-1.5 px-4 py-2 text-xs whitespace-nowrap shrink-0">
            <span className="font-bold text-white/70">{item.ticker}</span>
            <span className={item.tickedUp ? 'font-mono text-emerald-400' : 'font-mono text-rose-400'}>{formatUsd(item.bid)}</span>
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
