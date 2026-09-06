import type { ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { AddressPill, SideBadge } from '@/components/Pills'
import { formatPct, formatUsd, timeAgo } from '@/lib/format'
import { TOKEN_BY_SYMBOL } from '@/market/tokens'
import { useAuthStore } from '@/store/authStore'
import { useMarketStore } from '@/store/marketStore'

export function PublicProfilePage() {
  const { userId = '' } = useParams()
  const user = useAuthStore((s) => s.userById(userId))
  const markets = useMarketStore((s) => s.markets)
  // Stable function references — called below, not inside the selector (see
  // note in MarketDetailPage.tsx for why that matters).
  const statsForUser = useMarketStore((s) => s.statsForUser)
  const positionsForUser = useMarketStore((s) => s.positionsForUser)

  if (!user) return <Navigate to="/markets" replace />

  const stats = statsForUser(userId)
  const positions = positionsForUser(userId)

  const recentSettled = positions
    .filter((p) => p.settled)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Avatar name={user.displayName} color={user.avatarColor} size={64} />
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            {user.displayName}
            {user.role === 'admin' && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30">
                curator
              </span>
            )}
          </h1>
          <p className="text-white/40 text-sm">On the platform since {new Date(user.createdAt).toLocaleDateString()}</p>
          <AddressPill address={user.walletAddress} to={`/explorer/address/${user.walletAddress}`} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Win rate" value={stats.totalBets > 0 ? formatPct(stats.winRate) : '—'} />
        <Stat label="Win streak" value={stats.currentStreak > 0 ? `${stats.currentStreak} 🔥` : '—'} />
        <Stat label="Total bets" value={String(stats.totalBets)} />
        <Stat
          label="Net P&L"
          value={
            <span className={stats.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {stats.netProfit >= 0 ? '+' : ''}
              {formatUsd(stats.netProfit)}
            </span>
          }
        />
      </div>

      <div className="bg-[#12121c]/95 border border-white/10 rounded-xl p-4">
        <h2 className="font-medium mb-3">Recent settled bets</h2>
        <div className="space-y-2">
          {recentSettled.map((p) => {
            const market = markets[p.marketId]
            const token = market ? TOKEN_BY_SYMBOL.get(market.symbol) : undefined
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-3 text-sm bg-black/20 border border-white/5 rounded-lg px-3 py-2">
                <Link to={`/markets/${p.marketId}`} className="font-medium hover:text-emerald-400 min-w-16">
                  {token?.symbol ?? '—'}
                </Link>
                <SideBadge side={p.side} />
                <span className="font-mono">{formatUsd(p.amount)}</span>
                <span className="text-white/30 text-xs">{timeAgo(p.createdAt)}</span>
                <span className="ml-auto text-xs">
                  {p.payout ? <span className="text-emerald-400">+{formatUsd(p.payout)}</span> : <span className="text-rose-400">lost</span>}
                </span>
              </div>
            )
          })}
          {recentSettled.length === 0 && <p className="text-white/30 text-sm text-center py-6">No settled bets yet</p>}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-[#12121c]/95 border border-white/10 rounded-xl p-4">
      <div className="text-white/40 text-xs mb-1">{label}</div>
      <div className="font-mono font-medium">{value}</div>
    </div>
  )
}
