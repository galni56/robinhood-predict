import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BetModal } from '@/components/BetModal'
import { MarketsSidebar } from '@/components/MarketsSidebar'
import { Sparkline } from '@/components/PriceChart'
import { AddressPill, AwaitingCounterBetsBadge } from '@/components/Pills'
import { CountdownTimer } from '@/components/CountdownTimer'
import { formatPct, formatUsd } from '@/lib/format'
import { TOKEN_BY_SYMBOL } from '@/market/tokens'
import { useMarketStore } from '@/store/marketStore'
import type { MarketSide } from '@/types'

interface ReopenBetState {
  reopenBet?: { marketId: string; side: MarketSide }
}

export function MarketsPage() {
  const prices = useMarketStore((s) => s.prices)
  const history = useMarketStore((s) => s.history)
  const markets = useMarketStore((s) => s.markets)
  const oddsFor = useMarketStore((s) => s.oddsFor)
  const location = useLocation()
  const navigate = useNavigate()

  const [betTarget, setBetTarget] = useState<{ marketId: string; side: MarketSide } | null>(null)

  // Coming back from /login after clicking a bet button while logged out —
  // reopen the same popup on the same side instead of leaving them stranded.
  useEffect(() => {
    const state = location.state as ReopenBetState | null
    if (state?.reopenBet) {
      setBetTarget(state.reopenBet)
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Open markets only — resolved/cancelled ones live in /archive so this
  // list doesn't fill up with finished stuff over time.
  const list = Object.values(markets)
    .filter((m) => !m.resolved && !m.cancelled)
    .sort((a, b) => a.deadline - b.deadline)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8 flex items-start justify-between gap-6 flex-wrap">
        <div className="max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">All markets</h1>
          <p className="text-white/50 text-sm mt-1.5">
            {list.length} open right now. Bet YES or NO before the deadline — early bets carry more weight, and a
            market with only one side ever betting cancels and refunds in full.{' '}
            <Link to="/whitepaper" className="text-violet-300 hover:underline">
              How the payout math works →
            </Link>
          </p>
        </div>
        <Link
          to="/markets/create"
          className="shrink-0 text-sm px-4 py-2.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:brightness-110 text-white font-semibold transition-all shadow-[0_0_20px_-6px_rgba(217,70,239,0.7)]"
        >
          + Create market
        </Link>
      </div>

      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
          {list.length === 0 && (
            <div className="text-center py-16 text-white/40 text-sm">
              No open markets right now.{' '}
              <Link to="/markets/create" className="text-violet-300 hover:underline">
                Create the first one
              </Link>
              {' · '}
              <Link to="/archive" className="text-violet-300 hover:underline">
                browse the archive
              </Link>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {list.map((market) => {
              const token = TOKEN_BY_SYMBOL.get(market.symbol)
              if (!token) return null
              const price = prices[token.symbol] ?? token.startPrice
              const series = history[token.symbol] ?? []
              const odds = oddsFor(market.id)
              const change = series.length > 1 ? (price - series[0].price) / series[0].price : 0
              const awaitingCounterBets = market.poolYes === 0 || market.poolNo === 0

              return (
                <div
                  key={market.id}
                  onClick={() => navigate(`/markets/${market.id}`)}
                  className="group relative cursor-pointer bg-[#12121c]/95 border border-white/10 rounded-2xl p-4 hover:border-violet-400/30 hover:bg-[#181829]/95 hover:shadow-[0_0_28px_-14px_rgba(139,92,246,0.9)] transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-bold flex items-center gap-2">
                        {token.symbol}
                        {awaitingCounterBets && <AwaitingCounterBetsBadge />}
                      </div>
                      <div className="text-white/40 text-xs">{token.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-semibold">{formatUsd(price)}</div>
                      <div className={change >= 0 ? 'text-xs text-emerald-400' : 'text-xs text-rose-400'}>
                        {change >= 0 ? '+' : ''}
                        {formatPct(change)}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-white/50 mb-2">Target: ${market.target}</p>
                  <Sparkline data={series} color={change >= 0 ? '#2dd888' : '#ff5577'} />

                  <div className="mt-3 flex items-center justify-between text-xs">
                    <AddressPill address={token.contractAddress} label="contract" />
                    <span className="text-white/40">
                      ⏱ <CountdownTimer deadline={market.deadline} />
                    </span>
                  </div>

                  <div className="mt-3">
                    <div className="h-1.5 rounded-full bg-rose-500/25 overflow-hidden">
                      <div className="h-full bg-emerald-400" style={{ width: `${odds.yesPct * 100}%` }} />
                    </div>
                    <div className="flex justify-between text-[11px] text-white/40 mt-1">
                      <span>YES {formatPct(odds.yesPct)}</span>
                      <span>NO {formatPct(odds.noPct)}</span>
                    </div>
                  </div>

                  {awaitingCounterBets && (
                    <p className="mt-2 text-[11px] text-amber-400/80">
                      Your bet gets refunded in full if nobody takes the other side.
                    </p>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setBetTarget({ marketId: market.id, side: 'YES' })
                      }}
                      className="py-1.5 rounded-lg text-xs font-bold bg-emerald-400/15 text-emerald-300 border border-emerald-400/30 hover:bg-emerald-400 hover:text-black transition-colors"
                    >
                      YES
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setBetTarget({ marketId: market.id, side: 'NO' })
                      }}
                      className="py-1.5 rounded-lg text-xs font-bold bg-rose-400/15 text-rose-300 border border-rose-400/30 hover:bg-rose-400 hover:text-black transition-colors"
                    >
                      NO
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <aside className="hidden lg:block w-72 shrink-0 sticky top-20">
          <MarketsSidebar />
        </aside>
      </div>

      {betTarget && <BetModal marketId={betTarget.marketId} initialSide={betTarget.side} onClose={() => setBetTarget(null)} />}
    </div>
  )
}
