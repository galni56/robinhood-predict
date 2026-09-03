import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { AddressPill, HashPill, SideBadge } from '@/components/Pills'
import { formatPct, formatUsd, timeAgo } from '@/lib/format'
import { TOKEN_BY_SYMBOL } from '@/market/tokens'
import { useAuthStore } from '@/store/authStore'
import { useChainStore } from '@/store/chainStore'
import { useMarketStore } from '@/store/marketStore'
import type { Position, PredictionMarket } from '@/types'

export function PortfolioPage() {
  const user = useAuthStore((s) => s.currentUser())
  const balance = useChainStore((s) => (user ? s.balanceOf(user.walletAddress) : 0))
  const markets = useMarketStore((s) => s.markets)
  // Select the stable function references, call them below in the render
  // body — calling them directly inside the selector would return a new
  // array/object every time and cause an infinite re-render loop (zustand
  // v5 compares selector results by identity).
  const positionsForUser = useMarketStore((s) => s.positionsForUser)
  const statsForUser = useMarketStore((s) => s.statsForUser)

  if (!user) return null

  const positions = positionsForUser(user.id)
  const stats = statsForUser(user.id)

  const openPositions = positions.filter((p) => !p.settled)
  const settledPositions = positions.filter((p) => p.settled)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={user.displayName} color={user.avatarColor} size={44} />
          <div>
            <h1 className="text-2xl font-semibold">{user.displayName}</h1>
            <p className="text-white/50 text-sm">{user.email}</p>
          </div>
        </div>
        <div className="flex gap-2 text-sm">
          <Link to={`/u/${user.id}`} className="px-3 py-1.5 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition-colors">
            Публичный профиль
          </Link>
          <Link to="/settings" className="px-3 py-1.5 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition-colors">
            Настройки
          </Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Баланс" value={formatUsd(balance)} />
        <Stat label="Кошелёк" value={<AddressPill address={user.walletAddress} to={`/explorer/address/${user.walletAddress}`} />} />
        <Stat label="Win rate" value={settledPositions.length > 0 ? formatPct(stats.winRate) : '—'} />
        <Stat label="Текущий стрик" value={stats.currentStreak > 0 ? `${stats.currentStreak} 🔥` : '—'} />
        <Stat label="Всего поставлено" value={formatUsd(stats.totalWagered)} />
        <Stat label="Всего выиграно" value={formatUsd(stats.totalWon)} />
        <Stat label="Чистый P&L" value={<span className={stats.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{stats.netProfit >= 0 ? '+' : ''}{formatUsd(stats.netProfit)}</span>} />
        <Stat label="Всего ставок" value={String(stats.totalBets)} />
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
        <h2 className="font-medium mb-3">Активные ставки ({openPositions.length})</h2>
        <PositionsTable positions={openPositions} markets={markets} empty="Нет открытых ставок — загляните на рынки" />
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
        <h2 className="font-medium mb-3">История ({settledPositions.length})</h2>
        <PositionsTable positions={settledPositions} markets={markets} empty="Пока нет завершённых ставок" />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
      <div className="text-white/40 text-xs mb-1">{label}</div>
      <div className="font-mono font-medium">{value}</div>
    </div>
  )
}

function PositionsTable({
  positions,
  markets,
  empty,
}: {
  positions: Position[]
  markets: Record<string, PredictionMarket>
  empty: string
}) {
  if (positions.length === 0) return <p className="text-white/30 text-sm text-center py-6">{empty}</p>
  return (
    <div className="space-y-2">
      {[...positions]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((p) => {
          const market = markets[p.marketId]
          const token = market ? TOKEN_BY_SYMBOL.get(market.symbol) : undefined
          return (
            <div key={p.id} className="flex flex-wrap items-center gap-3 text-sm bg-black/20 border border-white/5 rounded-lg px-3 py-2">
              <Link to={`/markets/${p.marketId}`} className="font-medium hover:text-emerald-400 min-w-16">
                {token?.symbol ?? '—'}
              </Link>
              <SideBadge side={p.side} />
              <span className="font-mono">{formatUsd(p.amount)}</span>
              <HashPill hash={p.txHash} to={`/explorer/tx/${p.txHash}`} />
              <span className="text-white/30 text-xs">{timeAgo(p.createdAt)}</span>
              <span className="ml-auto text-xs">
                {p.settled ? (
                  p.payout ? (
                    <span className="text-emerald-400">+{formatUsd(p.payout)}</span>
                  ) : (
                    <span className="text-rose-400">проигрыш</span>
                  )
                ) : market?.resolved ? (
                  <span className="text-white/40">ожидает расчёта</span>
                ) : (
                  <span className="text-amber-400">в игре</span>
                )}
              </span>
            </div>
          )
        })}
    </div>
  )
}
