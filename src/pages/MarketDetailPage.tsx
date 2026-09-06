import { useEffect } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { BetForm } from '@/components/BetForm'
import { AddressPill, AwaitingCounterBetsBadge, CancelledBadge, HashPill, SideBadge, StatusBadge } from '@/components/Pills'
import { CountdownTimer } from '@/components/CountdownTimer'
import { PriceChart } from '@/components/PriceChart'
import { formatPct, formatUsd, timeAgo } from '@/lib/format'
import { TOKEN_BY_SYMBOL } from '@/market/tokens'
import { useAuthStore } from '@/store/authStore'
import { useChainStore } from '@/store/chainStore'
import { bettingWindowEnd, currentWeightBp, useMarketStore } from '@/store/marketStore'
import type { MarketSide, PricePoint } from '@/types'

const EMPTY_HISTORY: PricePoint[] = []

export function MarketDetailPage() {
  const { marketId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const user = useAuthStore((s) => s.currentUser())
  const market = useMarketStore((s) => s.markets[marketId])
  const token = TOKEN_BY_SYMBOL.get(market?.symbol ?? '')
  const price = useMarketStore((s) => s.prices[market?.symbol ?? ''])
  const series = useMarketStore((s) => s.history[market?.symbol ?? ''] ?? EMPTY_HISTORY)
  // These read a *stable function reference* out of the store, then get
  // called below in the render body — not inside the selector itself. Zustand
  // v5 compares selector results by identity (via useSyncExternalStore); a
  // selector that computes a new array/object every call (e.g. `s.oddsFor(id)`
  // directly) causes "Maximum update depth exceeded" / infinite re-render.
  const oddsFor = useMarketStore((s) => s.oddsFor)
  const positionsForUser = useMarketStore((s) => s.positionsForUser)
  const txs = useChainStore((s) => s.txs)

  const odds = oddsFor(marketId)
  const positions = positionsForUser(user?.id ?? '')
  const txsForMarket = Object.values(txs)
    .filter((t) => t.marketId === marketId)
    .sort((a, b) => b.timestamp - a.timestamp)

  // Came back from /login after clicking the bet form's login prompt — force
  // BetForm to remount pre-selected on the side that was chosen before.
  const reopenBet = (location.state as { reopenBet?: { side: MarketSide } } | null)?.reopenBet
  useEffect(() => {
    if (reopenBet) navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!market || !token) return <Navigate to="/markets" replace />

  const myPositions = positions.filter((p) => p.marketId === marketId)
  const awaitingCounterBets = market.poolYes === 0 || market.poolNo === 0

  // Betting closes before the deadline, with an early-bet weight that decays
  // over the betting window — mirrors the contract exactly (see marketStore.ts).
  const cutoffMs = bettingWindowEnd(market.createdAt, market.deadline)
  const bettingClosed = currentWeightBp(market.createdAt, market.deadline, Date.now()) == null

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div>
          <Link to="/markets" className="text-sm text-white/40 hover:text-white/70">
            ← All markets
          </Link>
          <div className="flex items-baseline justify-between mt-2">
            <div>
              <h1 className="text-2xl font-extrabold">{token.symbol}</h1>
              <p className="text-white/40 text-sm">{token.name}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-mono font-bold">{formatUsd(price ?? token.startPrice)}</div>
              <AddressPill address={token.contractAddress} to={`/explorer/address/${token.contractAddress}`} label="contract" />
            </div>
          </div>
        </div>

        <div className="bg-[#12121c]/95 border border-white/10 rounded-2xl p-4">
          <PriceChart data={series} target={market.target} height={280} />
        </div>

        <div className="bg-[#12121c]/95 border border-white/10 rounded-2xl p-4">
          <h2 className="font-semibold mb-3">On-chain transactions for this market</h2>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="text-white/40 text-xs uppercase">
                <tr className="text-left">
                  <th className="pb-2">Tx</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">When</th>
                </tr>
              </thead>
              <tbody>
                {txsForMarket.slice(0, 12).map((tx) => (
                  <tr key={tx.hash} className="border-t border-white/5">
                    <td className="py-2">
                      <HashPill hash={tx.hash} to={`/explorer/tx/${tx.hash}`} />
                    </td>
                    <td className="py-2">{tx.type === 'BET' && tx.side ? <SideBadge side={tx.side} /> : tx.type}</td>
                    <td className="py-2 font-mono">{formatUsd(tx.amount)}</td>
                    <td className="py-2">
                      <StatusBadge status={tx.status} />
                    </td>
                    <td className="py-2 text-white/40">{timeAgo(tx.timestamp)}</td>
                  </tr>
                ))}
                {txsForMarket.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-white/30">
                      No bets on this market yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-[#12121c]/95 border border-white/10 rounded-2xl p-4">
          <h2 className="font-semibold mb-1">{market.question}</h2>
          {market.cancelled ? (
            <div className="mt-3">
              <CancelledBadge />
              <p className="text-white/40 text-sm mt-2">
                Market cancelled — bets came in on only one side, so everyone was refunded in full.
              </p>
            </div>
          ) : market.resolved ? (
            <div className="mt-3">
              <SideBadge side={market.outcome ?? 'NO'} />
              <p className="text-white/40 text-sm mt-2">Market has resolved.</p>
            </div>
          ) : (
            <>
              <p className="text-white/40 text-xs mb-3">
                {bettingClosed ? (
                  <>
                    Betting closed, waiting to resolve: <CountdownTimer deadline={market.deadline} />
                  </>
                ) : (
                  <>
                    Betting open for: <CountdownTimer deadline={cutoffMs} />
                  </>
                )}
              </p>

              {awaitingCounterBets && (
                <div className="mb-3 flex items-start gap-2">
                  <AwaitingCounterBetsBadge />
                  <p className="text-[11px] text-amber-400/80">
                    Bets get refunded in full if nobody takes the other side.
                  </p>
                </div>
              )}

              <div className="h-2 rounded-full bg-rose-500/25 overflow-hidden mb-1">
                <div className="h-full bg-emerald-400" style={{ width: `${odds.yesPct * 100}%` }} />
              </div>
              <div className="flex justify-between text-xs text-white/50 mb-4">
                <span>YES {formatPct(odds.yesPct)}</span>
                <span>NO {formatPct(odds.noPct)}</span>
              </div>

              <BetForm key={reopenBet?.side ?? 'YES'} marketId={marketId} initialSide={reopenBet?.side ?? 'YES'} />
            </>
          )}
        </div>

        {user && myPositions.length > 0 && (
          <div className="bg-[#12121c]/95 border border-white/10 rounded-2xl p-4">
            <h2 className="font-semibold mb-3">Your bets here</h2>
            <div className="space-y-2">
              {myPositions.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <SideBadge side={p.side} />
                  <span className="font-mono">{formatUsd(p.amount)}</span>
                  <span className="text-white/40 text-xs">
                    {p.settled
                      ? p.refunded
                        ? `refunded ${formatUsd(p.payout ?? 0)}`
                        : p.payout
                          ? `+${formatUsd(p.payout)}`
                          : 'lost'
                      : 'in play'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
