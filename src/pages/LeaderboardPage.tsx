import { Link } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { formatPct, formatUsd } from '@/lib/format'
import { useAuthStore } from '@/store/authStore'
import { useMarketStore } from '@/store/marketStore'

export function LeaderboardPage() {
  const user = useAuthStore((s) => s.currentUser())
  const users = useAuthStore((s) => s.users)
  const statsForUser = useMarketStore((s) => s.statsForUser)

  const rows = users
    .map((u) => ({ user: u, stats: statsForUser(u.id) }))
    .filter((r) => r.stats.totalBets > 0)
    .sort((a, b) => b.stats.netProfit - a.stats.netProfit)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Leaderboard</h1>
        <p className="text-white/50 text-sm mt-1">
          Ranked by net P&amp;L among everyone who's placed at least one bet — open to any visitor, no account
          required to look.
        </p>
      </div>

      {!user && (
        <div className="bg-gradient-to-r from-violet-500/15 to-fuchsia-500/10 border border-violet-400/20 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-white/70">Want your name on this board? Sign up, place a bet, and climb it.</p>
          <div className="flex gap-2 shrink-0">
            <Link
              to="/login"
              className="text-sm px-3 py-1.5 rounded-lg border border-white/15 text-white/70 hover:text-white hover:border-white/30 transition-colors"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:brightness-110 text-white font-semibold transition-all"
            >
              Sign up
            </Link>
          </div>
        </div>
      )}

      <div className="bg-[#12121c]/95 border border-white/10 rounded-xl p-4">
        <div className="space-y-2">
          {rows.map((r, i) => (
            <Link
              key={r.user.id}
              to={`/u/${r.user.id}`}
              className="flex items-center gap-3 text-sm bg-black/20 hover:bg-black/30 border border-white/5 rounded-lg px-3 py-2.5 transition-colors"
            >
              <span className="w-6 text-white/30 text-center font-mono">{i + 1}</span>
              <Avatar name={r.user.displayName} color={r.user.avatarColor} size={32} />
              <span className="font-medium">{r.user.displayName}</span>
              {r.stats.currentStreak > 1 && <span className="text-xs">{r.stats.currentStreak}🔥</span>}
              <span className="ml-auto text-white/40 text-xs">{formatPct(r.stats.winRate)} win rate</span>
              <span className={`font-mono w-24 text-right ${r.stats.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {r.stats.netProfit >= 0 ? '+' : ''}
                {formatUsd(r.stats.netProfit)}
              </span>
            </Link>
          ))}
          {rows.length === 0 && (
            <div className="text-center py-10">
              <p className="text-white/40 text-sm mb-3">No one's on the board yet — place the first bet and take the top spot.</p>
              <Link to="/markets" className="text-violet-300 hover:underline text-sm">
                Browse markets →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
