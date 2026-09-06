import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { BetForm } from '@/components/BetForm'
import { AwaitingCounterBetsBadge } from '@/components/Pills'
import { CountdownTimer } from '@/components/CountdownTimer'
import { formatPct, formatUsd } from '@/lib/format'
import { TOKEN_BY_SYMBOL } from '@/market/tokens'
import { bettingWindowEnd, currentWeightBp, useMarketStore } from '@/store/marketStore'
import type { MarketSide } from '@/types'

/** Quick-bet popup opened from a market card in the list — same `BetForm`
 * the detail page uses, plus just enough market context (price, odds,
 * countdown) to place a bet without navigating away. */
export function BetModal({ marketId, initialSide, onClose }: { marketId: string; initialSide: MarketSide; onClose: () => void }) {
  const market = useMarketStore((s) => s.markets[marketId])
  const prices = useMarketStore((s) => s.prices)
  const oddsFor = useMarketStore((s) => s.oddsFor)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!market) return null
  const token = TOKEN_BY_SYMBOL.get(market.symbol)
  if (!token) return null

  const price = prices[token.symbol] ?? token.startPrice
  const odds = oddsFor(marketId)
  const awaitingCounterBets = market.poolYes === 0 || market.poolNo === 0
  const bettingClosed = currentWeightBp(market.createdAt, market.deadline, Date.now()) == null
  const cutoffMs = bettingWindowEnd(market.createdAt, market.deadline)

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#121320] shadow-2xl p-5">
        <button onClick={onClose} className="absolute top-3 right-3 text-white/40 hover:text-white text-lg leading-none">
          ✕
        </button>

        <div className="flex items-baseline justify-between pr-6 mb-1">
          <div>
            <div className="font-bold">{token.symbol}</div>
            <div className="text-white/40 text-xs">{token.name}</div>
          </div>
          <div className="font-mono font-semibold">{formatUsd(price)}</div>
        </div>
        <p className="text-white/50 text-xs mb-3">{market.question}</p>

        {awaitingCounterBets && (
          <div className="mb-3">
            <AwaitingCounterBetsBadge />
          </div>
        )}

        <div className="h-2 rounded-full bg-rose-500/25 overflow-hidden mb-1">
          <div className="h-full bg-emerald-400" style={{ width: `${odds.yesPct * 100}%` }} />
        </div>
        <div className="flex justify-between text-xs text-white/50 mb-1">
          <span>ЗА {formatPct(odds.yesPct)}</span>
          <span>ПРОТИВ {formatPct(odds.noPct)}</span>
        </div>
        <p className="text-white/40 text-xs mb-4">
          {bettingClosed ? (
            <>
              Ставки закрыты, ждём дедлайна: <CountdownTimer deadline={market.deadline} />
            </>
          ) : (
            <>
              Ставки открыты ещё: <CountdownTimer deadline={cutoffMs} />
            </>
          )}
        </p>

        <BetForm marketId={marketId} initialSide={initialSide} />
      </div>
    </div>,
    document.body,
  )
}
