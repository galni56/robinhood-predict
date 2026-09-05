import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CancelledBadge, SideBadge } from '@/components/Pills'
import { formatPct, formatUsd, timeAgo } from '@/lib/format'
import { TOKEN_BY_SYMBOL } from '@/market/tokens'
import { useMarketStore } from '@/store/marketStore'
import type { MarketSide } from '@/types'

type OutcomeFilter = 'ALL' | MarketSide | 'CANCELLED'

export function ArchivePage() {
  const markets = useMarketStore((s) => s.markets)
  const oddsFor = useMarketStore((s) => s.oddsFor)
  const [query, setQuery] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('ALL')

  const q = query.trim().toLowerCase()
  const resolved = Object.values(markets)
    .filter((m) => m.resolved || m.cancelled)
    .filter((m) => {
      if (outcomeFilter === 'ALL') return true
      if (outcomeFilter === 'CANCELLED') return m.cancelled
      return m.outcome === outcomeFilter
    })
    .filter((m) => !q || m.symbol.toLowerCase().includes(q) || m.question.toLowerCase().includes(q))
    .sort((a, b) => b.deadline - a.deadline)

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Архив завершённых рынков</h1>
        <p className="text-white/50 text-sm mt-1">Дедлайн прошёл — рынок зарезолвился, здесь его исход и итоговые коэффициенты.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по тикеру или вопросу…"
          className="flex-1 min-w-48 rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
        />
        <div className="flex gap-1">
          {(['ALL', 'YES', 'NO', 'CANCELLED'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setOutcomeFilter(f)}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                outcomeFilter === f
                  ? 'bg-white/10 border-white/20 text-white'
                  : 'border-white/10 text-white/50 hover:text-white hover:border-white/30'
              }`}
            >
              {f === 'ALL' ? 'Все' : f === 'YES' ? 'ЗА выиграло' : f === 'NO' ? 'ПРОТИВ выиграло' : 'Отменённые'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {resolved.map((m) => {
          const token = TOKEN_BY_SYMBOL.get(m.symbol)
          const odds = oddsFor(m.id)
          return (
            <Link
              key={m.id}
              to={`/markets/${m.id}`}
              className="flex flex-wrap items-center gap-3 text-sm bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 rounded-lg px-4 py-3 transition-colors"
            >
              <span className="font-semibold min-w-16">{token?.symbol ?? m.symbol}</span>
              <span className="text-white/50 flex-1 min-w-40">{m.question}</span>
              {m.cancelled ? <CancelledBadge /> : <SideBadge side={m.outcome ?? 'NO'} />}
              <span className="text-white/40 text-xs w-28 text-right">
                {formatPct(odds.yesPct)} / {formatPct(odds.noPct)}
              </span>
              <span className="text-white/40 text-xs w-24 text-right">пул {formatUsd(odds.totalPool, 0)}</span>
              <span className="text-white/30 text-xs w-20 text-right">{timeAgo(m.deadline)}</span>
            </Link>
          )
        })}
        {resolved.length === 0 && (
          <p className="text-white/30 text-sm text-center py-12">
            {q || outcomeFilter !== 'ALL' ? 'Ничего не найдено по этим фильтрам' : 'Пока нет завершённых рынков'}
          </p>
        )}
      </div>
    </div>
  )
}
