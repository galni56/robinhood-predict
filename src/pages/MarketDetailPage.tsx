import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { PriceChart } from '@/components/PriceChart'
import { AddressPill, HashPill, SideBadge, StatusBadge } from '@/components/Pills'
import { CountdownTimer } from '@/components/CountdownTimer'
import { formatPct, formatUsd, timeAgo } from '@/lib/format'
import { TOKEN_BY_SYMBOL } from '@/market/tokens'
import { useAuthStore } from '@/store/authStore'
import { useChainStore } from '@/store/chainStore'
import { useMarketStore } from '@/store/marketStore'
import type { MarketSide, PricePoint } from '@/types'

const EMPTY_HISTORY: PricePoint[] = []

export function MarketDetailPage() {
  const { marketId = '' } = useParams()

  const user = useAuthStore((s) => s.currentUser())
  const market = useMarketStore((s) => s.markets[marketId])
  const token = TOKEN_BY_SYMBOL.get(market?.symbol ?? '')
  const price = useMarketStore((s) => s.prices[market?.symbol ?? ''])
  const series = useMarketStore((s) => s.history[market?.symbol ?? ''] ?? EMPTY_HISTORY)
  // These three read a *stable function reference* out of the store, then get
  // called below in the render body — not inside the selector itself. Zustand
  // v5 compares selector results by identity (via useSyncExternalStore); a
  // selector that computes a new array/object every call (e.g. `s.oddsFor(id)`
  // directly) causes "Maximum update depth exceeded" / infinite re-render.
  const oddsFor = useMarketStore((s) => s.oddsFor)
  const positionsForUser = useMarketStore((s) => s.positionsForUser)
  const placeBet = useMarketStore((s) => s.placeBet)
  const forceResolve = useMarketStore((s) => s.forceResolve)
  const balance = useChainStore((s) => (user ? s.balanceOf(user.walletAddress) : 0))
  const txs = useChainStore((s) => s.txs)

  const odds = oddsFor(marketId)
  const positions = positionsForUser(user?.id ?? '')
  const txsForMarket = Object.values(txs)
    .filter((t) => t.marketId === marketId)
    .sort((a, b) => b.timestamp - a.timestamp)

  const [side, setSide] = useState<MarketSide>('YES')
  const [amount, setAmount] = useState('50')
  const [feedback, setFeedback] = useState<string | null>(null)

  if (!market || !token) return <Navigate to="/markets" replace />

  const myPositions = positions.filter((p) => p.marketId === marketId)
  const potentialPayout =
    Number(amount) > 0
      ? (Number(amount) / ((side === 'YES' ? odds.totalPool * odds.yesPct : odds.totalPool * odds.noPct) + Number(amount))) *
        (odds.totalPool + Number(amount))
      : 0

  function onBet() {
    if (!user) return
    const result = placeBet(user, marketId, side, Number(amount))
    setFeedback(result.ok ? `Ставка на ${side === 'YES' ? 'ЗА' : 'ПРОТИВ'} отправлена в mempool ✅` : result.error)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div>
          <Link to="/markets" className="text-sm text-white/40 hover:text-white/70">
            ← Все рынки
          </Link>
          <div className="flex items-baseline justify-between mt-2">
            <div>
              <h1 className="text-2xl font-semibold">{token.symbol}</h1>
              <p className="text-white/40 text-sm">{token.name}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-mono font-semibold">{formatUsd(price ?? token.startPrice)}</div>
              <AddressPill address={token.contractAddress} to={`/explorer/address/${token.contractAddress}`} label="контракт" />
            </div>
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
          <PriceChart data={series} target={market.target} height={280} />
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
          <h2 className="font-medium mb-3">Транзакции этого рынка on-chain</h2>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="text-white/40 text-xs uppercase">
                <tr className="text-left">
                  <th className="pb-2">Tx</th>
                  <th className="pb-2">Тип</th>
                  <th className="pb-2">Сумма</th>
                  <th className="pb-2">Статус</th>
                  <th className="pb-2">Когда</th>
                </tr>
              </thead>
              <tbody>
                {txsForMarket.slice(0, 12).map((tx) => (
                  <tr key={tx.hash} className="border-t border-white/5">
                    <td className="py-2">
                      <HashPill hash={tx.hash} to={`/explorer/tx/${tx.hash}`} />
                    </td>
                    <td className="py-2">
                      {tx.type === 'BET' && tx.side ? <SideBadge side={tx.side} /> : tx.type}
                    </td>
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
                      Пока нет ставок по этому рынку
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
          <h2 className="font-medium mb-1">{market.question}</h2>
          {market.resolved ? (
            <div className="mt-3">
              <SideBadge side={market.outcome ?? 'NO'} />
              <p className="text-white/40 text-sm mt-2">Рынок завершён.</p>
            </div>
          ) : (
            <>
              <p className="text-white/40 text-xs mb-3">
                Дедлайн (демо-таймлайн): <CountdownTimer deadline={market.deadline} />
              </p>

              <div className="h-2 rounded-full bg-rose-500/30 overflow-hidden mb-1">
                <div className="h-full bg-emerald-500" style={{ width: `${odds.yesPct * 100}%` }} />
              </div>
              <div className="flex justify-between text-xs text-white/50 mb-4">
                <span>ЗА {formatPct(odds.yesPct)}</span>
                <span>ПРОТИВ {formatPct(odds.noPct)}</span>
              </div>

              {user ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSide('YES')}
                      className={`py-2 rounded-lg text-sm font-medium border transition-colors ${side === 'YES' ? 'bg-emerald-500 text-black border-emerald-500' : 'border-white/10 text-white/60 hover:border-emerald-400/50'}`}
                    >
                      ЗА
                    </button>
                    <button
                      onClick={() => setSide('NO')}
                      className={`py-2 rounded-lg text-sm font-medium border transition-colors ${side === 'NO' ? 'bg-rose-500 text-black border-rose-500' : 'border-white/10 text-white/60 hover:border-rose-400/50'}`}
                    >
                      ПРОТИВ
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs text-white/40 mb-1">Сумма, mUSD (баланс {formatUsd(balance)})</label>
                    <input
                      type="number"
                      min={1}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
                    />
                  </div>

                  <p className="text-xs text-white/40">
                    Потенциальная выплата: <span className="text-white/70">{formatUsd(potentialPayout || 0)}</span> (parimutuel,
                    зависит от итогового пула)
                  </p>

                  <button
                    onClick={onBet}
                    className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-medium py-2 text-sm transition-colors"
                  >
                    Поставить {side === 'YES' ? 'ЗА' : 'ПРОТИВ'}
                  </button>

                  {feedback && <p className="text-xs text-white/50">{feedback}</p>}

                  {(user.role === 'admin' || user.id === market.createdBy) && (
                    <button
                      onClick={() => forceResolve(marketId)}
                      className="w-full rounded-lg border border-dashed border-white/15 text-white/40 hover:text-white/70 hover:border-white/30 py-1.5 text-xs transition-colors"
                    >
                      ⏩ Завершить рынок сейчас (демо)
                    </button>
                  )}
                </div>
              ) : (
                <Link to="/login" className="block text-center text-sm text-emerald-400 hover:underline">
                  Войдите, чтобы делать ставки
                </Link>
              )}
            </>
          )}
        </div>

        {user && myPositions.length > 0 && (
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
            <h2 className="font-medium mb-3">Ваши ставки здесь</h2>
            <div className="space-y-2">
              {myPositions.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <SideBadge side={p.side} />
                  <span className="font-mono">{formatUsd(p.amount)}</span>
                  <span className="text-white/40 text-xs">
                    {p.settled ? (p.payout ? `+${formatUsd(p.payout)}` : 'проигрыш') : 'в игре'}
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
