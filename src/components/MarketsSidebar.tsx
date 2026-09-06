import { Link } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { HashPill, SideBadge } from '@/components/Pills'
import { formatUsd } from '@/lib/format'
import { useAuthStore } from '@/store/authStore'
import { useChainStore } from '@/store/chainStore'
import { useMarketStore } from '@/store/marketStore'

/** Side-rail widgets for the markets list: a top-5 mini leaderboard and a
 * feed of recent bets, biggest first — gives the list some of the
 * ticker-wall energy of a real trading terminal without a full redesign. */
export function MarketsSidebar() {
  const users = useAuthStore((s) => s.users)
  const statsForUser = useMarketStore((s) => s.statsForUser)
  const txs = useChainStore((s) => s.txs)

  const leaderboard = users
    .map((u) => ({ user: u, stats: statsForUser(u.id) }))
    .filter((r) => r.stats.totalBets > 0)
    .sort((a, b) => b.stats.netProfit - a.stats.netProfit)
    .slice(0, 5)

  const recentBets = Object.values(txs)
    .filter((t) => t.type === 'BET')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8)

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-[#12121c]/95 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold flex items-center gap-1.5">🏆 Лидерборд</h2>
          <Link to="/leaderboard" className="text-xs text-violet-300/80 hover:text-violet-200">
            все →
          </Link>
        </div>
        <div className="space-y-1">
          {leaderboard.map((r, i) => (
            <Link
              key={r.user.id}
              to={`/u/${r.user.id}`}
              className="flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors"
            >
              <span className="w-4 text-white/30 text-xs font-mono text-center">{i + 1}</span>
              <Avatar name={r.user.displayName} color={r.user.avatarColor} size={22} />
              <span className="truncate flex-1">{r.user.displayName}</span>
              <span className={`font-mono text-xs ${r.stats.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {r.stats.netProfit >= 0 ? '+' : ''}
                {formatUsd(r.stats.netProfit, 0)}
              </span>
            </Link>
          ))}
          {leaderboard.length === 0 && <p className="text-white/30 text-xs text-center py-4">Пока никто не ставил</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#12121c]/95 p-4">
        <h2 className="text-sm font-bold flex items-center gap-1.5 mb-3">⚡ Последние ставки</h2>
        <div className="space-y-1.5">
          {recentBets.map((tx) => (
            <div key={tx.hash} className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-lg bg-black/20">
              <div className="flex items-center gap-1.5 min-w-0">
                {tx.side && <SideBadge side={tx.side} />}
                <HashPill hash={tx.hash} to={`/explorer/tx/${tx.hash}`} />
              </div>
              <span className="font-mono text-white/70 shrink-0">{formatUsd(tx.amount, 0)}</span>
            </div>
          ))}
          {recentBets.length === 0 && <p className="text-white/30 text-xs text-center py-4">Пока нет ставок</p>}
        </div>
      </div>
    </div>
  )
}
