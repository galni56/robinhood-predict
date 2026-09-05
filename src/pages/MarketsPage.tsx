import { Link } from 'react-router-dom'
import { Sparkline } from '@/components/PriceChart'
import { AddressPill, AwaitingCounterBetsBadge } from '@/components/Pills'
import { CountdownTimer } from '@/components/CountdownTimer'
import { formatPct, formatUsd } from '@/lib/format'
import { TOKEN_BY_SYMBOL } from '@/market/tokens'
import { useMarketStore } from '@/store/marketStore'

export function MarketsPage() {
  const prices = useMarketStore((s) => s.prices)
  const history = useMarketStore((s) => s.history)
  const markets = useMarketStore((s) => s.markets)
  const oddsFor = useMarketStore((s) => s.oddsFor)

  // Open markets only — resolved/cancelled ones live in /archive so this
  // list doesn't fill up with finished stuff over time.
  const list = Object.values(markets)
    .filter((m) => !m.resolved && !m.cancelled)
    .sort((a, b) => a.deadline - b.deadline)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Prediction-рынки токенизированных акций</h1>
          <p className="text-white/50 text-sm mt-1">
            Дойдёт ли цена токена до целевой отметки к дедлайну? Ставь ЗА или ПРОТИВ — сделка уходит в мок-блокчейн.
          </p>
        </div>
        <Link
          to="/markets/create"
          className="shrink-0 text-sm px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-medium transition-colors"
        >
          + Создать рынок
        </Link>
      </div>

      {list.length === 0 && (
        <div className="text-center py-16 text-white/40 text-sm">
          Пока нет открытых рынков.{' '}
          <Link to="/markets/create" className="text-emerald-400 hover:underline">
            Создать первый
          </Link>
          {' · '}
          <Link to="/archive" className="text-emerald-400 hover:underline">
            посмотреть архив
          </Link>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((market) => {
          const token = TOKEN_BY_SYMBOL.get(market.symbol)
          if (!token) return null
          const price = prices[token.symbol] ?? token.startPrice
          const series = history[token.symbol] ?? []
          const odds = oddsFor(market.id)
          const change = series.length > 1 ? (price - series[0].price) / series[0].price : 0
          const awaitingCounterBets = market.poolYes === 0 || market.poolNo === 0

          return (
            <Link
              key={market.id}
              to={`/markets/${market.id}`}
              className="group bg-white/[0.03] border border-white/10 rounded-xl p-4 hover:border-white/25 hover:bg-white/[0.05] transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    {token.symbol}
                    {awaitingCounterBets && <AwaitingCounterBetsBadge />}
                  </div>
                  <div className="text-white/40 text-xs">{token.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-medium">{formatUsd(price)}</div>
                  <div className={change >= 0 ? 'text-xs text-emerald-400' : 'text-xs text-rose-400'}>
                    {change >= 0 ? '+' : ''}
                    {formatPct(change)}
                  </div>
                </div>
              </div>

              <p className="text-xs text-white/50 mb-2">Цель: ${market.target}</p>
              <Sparkline data={series} color={change >= 0 ? '#34d399' : '#fb7185'} />

              <div className="mt-3 flex items-center justify-between text-xs">
                <AddressPill address={token.contractAddress} label="контракт" />
                <span className="text-white/40">
                  ⏱ <CountdownTimer deadline={market.deadline} />
                </span>
              </div>

              <div className="mt-3">
                <div className="h-1.5 rounded-full bg-rose-500/30 overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${odds.yesPct * 100}%` }} />
                </div>
                <div className="flex justify-between text-[11px] text-white/40 mt-1">
                  <span>ЗА {formatPct(odds.yesPct)}</span>
                  <span>ПРОТИВ {formatPct(odds.noPct)}</span>
                </div>
              </div>

              {awaitingCounterBets && (
                <p className="mt-2 text-[11px] text-amber-400/80">
                  Ставка будет возвращена в 100% объёме, если напротив никто не поставит.
                </p>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
