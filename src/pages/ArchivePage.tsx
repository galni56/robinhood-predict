import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CancelledBadge, SideBadge } from '@/components/Pills'
import { formatPct, formatUsd, timeAgo } from '@/lib/format'
import { TOKEN_BY_SYMBOL } from '@/market/tokens'
import { useMarketStore } from '@/store/marketStore'
import type { MarketSide } from '@/types'

type OutcomeFilter = 'ALL' | MarketSide | 'CANCELLED'

const PAGE_SIZE = 20

export function ArchivePage() {
  const markets = useMarketStore((s) => s.markets)
  const oddsFor = useMarketStore((s) => s.oddsFor)
  const [query, setQuery] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('ALL')
  const [page, setPage] = useState(1)

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

  const totalPages = Math.max(1, Math.ceil(resolved.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = resolved.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // A filter/search change can leave `page` past the end of the new,
  // smaller result set — the handlers below reset it to 1 whenever either
  // changes, rather than risk rendering an empty page.
  function updateQuery(v: string) {
    setQuery(v)
    setPage(1)
  }
  function updateOutcomeFilter(v: OutcomeFilter) {
    setOutcomeFilter(v)
    setPage(1)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Archive of settled markets</h1>
        <p className="text-white/50 text-sm mt-1">
          Every market that's already resolved or cancelled — final outcome, odds, and pool size, open to browse
          without an account.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          placeholder="Search by ticker or question…"
          className="flex-1 min-w-48 rounded-lg bg-[#12121c]/95 border border-white/10 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
        />
        <div className="flex gap-1">
          {(['ALL', 'YES', 'NO', 'CANCELLED'] as const).map((f) => (
            <button
              key={f}
              onClick={() => updateOutcomeFilter(f)}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                outcomeFilter === f
                  ? 'bg-white/10 border-white/20 text-white'
                  : 'border-white/10 text-white/50 hover:text-white hover:border-white/30'
              }`}
            >
              {f === 'ALL' ? 'All' : f === 'YES' ? 'YES won' : f === 'NO' ? 'NO won' : 'Cancelled'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {pageItems.map((m) => {
          const token = TOKEN_BY_SYMBOL.get(m.symbol)
          const odds = oddsFor(m.id)
          return (
            <Link
              key={m.id}
              to={`/markets/${m.id}`}
              className="flex flex-wrap items-center gap-3 text-sm bg-[#12121c]/95 hover:bg-[#181829]/95 border border-white/10 rounded-lg px-4 py-3 transition-colors"
            >
              <span className="font-semibold min-w-16">{token?.symbol ?? m.symbol}</span>
              <span className="text-white/50 flex-1 min-w-40">{m.question}</span>
              {m.cancelled ? <CancelledBadge /> : <SideBadge side={m.outcome ?? 'NO'} />}
              <span className="text-white/40 text-xs w-28 text-right">
                {formatPct(odds.yesPct)} / {formatPct(odds.noPct)}
              </span>
              <span className="text-white/40 text-xs w-24 text-right">pool {formatUsd(odds.totalPool, 0)}</span>
              <span className="text-white/30 text-xs w-20 text-right">{timeAgo(m.deadline)}</span>
            </Link>
          )
        })}
        {resolved.length === 0 && (
          <p className="text-white/30 text-sm text-center py-12">
            {q || outcomeFilter !== 'ALL' ? 'Nothing matches these filters' : 'No settled markets yet'}
          </p>
        )}
      </div>

      {resolved.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm pt-2">
          <span className="text-white/40 text-xs">
            {resolved.length} markets · page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
