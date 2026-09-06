import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { formatPct, formatUsd } from '@/lib/format'
import { useAuthStore } from '@/store/authStore'
import { useChainStore } from '@/store/chainStore'
import { PROTOCOL_FEE_BP, currentWeightBp, useMarketStore } from '@/store/marketStore'
import type { MarketSide } from '@/types'

const BP_DENOMINATOR = 10_000

/** The actual bet-placing widget: side toggle, amount, payout preview,
 * submit. Used inline on the market detail page and inside `BetModal` for
 * the quick-bet popup from the markets list — same rules either way (one
 * bet per side, betting-window cutoff, early-bet weight bonus). When the
 * viewer isn't logged in, shows a login prompt that forwards `marketId`/
 * `side` via router state so `/login` can bounce them right back here with
 * this exact bet ready to go. */
export function BetForm({ marketId, initialSide = 'YES' }: { marketId: string; initialSide?: MarketSide }) {
  const user = useAuthStore((s) => s.currentUser())
  const market = useMarketStore((s) => s.markets[marketId])
  const positionsForUser = useMarketStore((s) => s.positionsForUser)
  const allPositions = useMarketStore((s) => s.positions)
  const placeBet = useMarketStore((s) => s.placeBet)
  const forceResolve = useMarketStore((s) => s.forceResolve)
  const balance = useChainStore((s) => (user ? s.balanceOf(user.walletAddress) : 0))
  const location = useLocation()
  const navigate = useNavigate()

  const [side, setSide] = useState<MarketSide>(initialSide)
  const [amount, setAmount] = useState('50')
  const [feedback, setFeedback] = useState<string | null>(null)

  if (!market) return null

  if (market.cancelled || market.resolved) {
    return <p className="text-white/40 text-sm">{market.cancelled ? 'Рынок отменён — ставки закрыты.' : 'Рынок уже завершён.'}</p>
  }

  const positions = positionsForUser(user?.id ?? '')
  const myPositions = positions.filter((p) => p.marketId === marketId)
  const allMarketPositions = allPositions.filter((p) => p.marketId === marketId)
  const hasBetYes = myPositions.some((p) => p.side === 'YES')
  const hasBetNo = myPositions.some((p) => p.side === 'NO')
  const sideAlreadyBet = side === 'YES' ? hasBetYes : hasBetNo
  const bothSidesUsed = hasBetYes && hasBetNo

  const liveWeightBp = currentWeightBp(market.createdAt, market.deadline, Date.now())
  const bettingClosed = liveWeightBp == null

  // Mirrors the contract's exact claim() formula, including the early-bet
  // weight applied to this hypothetical bet if placed right now.
  const existingWeightedPool = (targetSide: MarketSide) =>
    allMarketPositions
      .filter((p) => p.side === targetSide)
      .reduce((sum, p) => sum + (p.amount * (p.weightBp ?? BP_DENOMINATOR)) / BP_DENOMINATOR, 0)

  const betAmount = Number(amount) || 0
  const weightedBetAmount = liveWeightBp != null ? (betAmount * liveWeightBp) / BP_DENOMINATOR : 0
  const weightedWinningPoolAfterBet = existingWeightedPool(side) + weightedBetAmount
  const losingPoolAfterBet = side === 'YES' ? market.poolNo : market.poolYes
  const winnings =
    betAmount > 0 && weightedWinningPoolAfterBet > 0
      ? (weightedBetAmount * losingPoolAfterBet * (BP_DENOMINATOR - PROTOCOL_FEE_BP)) / (weightedWinningPoolAfterBet * BP_DENOMINATOR)
      : 0
  const potentialPayout = betAmount + winnings

  function onBet() {
    if (!user) return
    if (bettingClosed) {
      setFeedback('Ставки на этот рынок уже закрыты')
      return
    }
    const result = placeBet(user, marketId, side, Number(amount))
    setFeedback(result.ok ? `Ставка на ${side === 'YES' ? 'ЗА' : 'ПРОТИВ'} отправлена в mempool ✅` : result.error)
  }

  if (!user) {
    return (
      <button
        onClick={() => navigate('/login', { state: { from: location, reopenBet: { marketId, side } } })}
        className="w-full text-center text-sm font-medium text-violet-200 rounded-xl border border-violet-400/30 bg-violet-500/15 hover:bg-violet-500/25 py-2.5 transition-colors"
      >
        Войдите, чтобы поставить {side === 'YES' ? 'ЗА' : 'ПРОТИВ'}
      </button>
    )
  }

  if (bettingClosed) {
    return <p className="text-xs text-white/40">Ставки на этот рынок закрыты — ждём дедлайна, чтобы можно было зарезолвить.</p>
  }

  if (bothSidesUsed) {
    return <p className="text-xs text-white/40">Вы уже поставили и ЗА, и ПРОТИВ в этом рынке — по одной ставке на сторону, больше нельзя.</p>
  }

  return (
    <div className="space-y-3">
      {liveWeightBp != null && (
        <p className="text-[11px] text-emerald-400/80">
          Бонус за раннюю ставку прямо сейчас: {(liveWeightBp / BP_DENOMINATOR).toFixed(2)}x — чем раньше поставишь, тем больше.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setSide('YES')}
          disabled={hasBetYes}
          className={`py-2 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            side === 'YES'
              ? 'bg-emerald-400 text-black border-emerald-400 shadow-[0_0_16px_-2px_rgba(45,216,136,0.7)]'
              : 'border-white/10 text-white/60 hover:border-emerald-400/50'
          }`}
        >
          ЗА{hasBetYes ? ' ✓' : ''}
        </button>
        <button
          onClick={() => setSide('NO')}
          disabled={hasBetNo}
          className={`py-2 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            side === 'NO'
              ? 'bg-rose-400 text-black border-rose-400 shadow-[0_0_16px_-2px_rgba(255,85,119,0.7)]'
              : 'border-white/10 text-white/60 hover:border-rose-400/50'
          }`}
        >
          ПРОТИВ{hasBetNo ? ' ✓' : ''}
        </button>
      </div>

      {sideAlreadyBet ? (
        <p className="text-xs text-amber-400/80">Вы уже поставили {side === 'YES' ? 'ЗА' : 'ПРОТИВ'} в этом рынке — выберите другую сторону.</p>
      ) : (
        <>
          <div>
            <label className="block text-xs text-white/40 mb-1">Сумма, mUSD (баланс {formatUsd(balance)})</label>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-violet-400/60"
            />
          </div>

          <p className="text-xs text-white/40">
            Потенциальная выплата: <span className="text-white/70">{formatUsd(potentialPayout || 0)}</span>{' '}
            (parimutuel минус {formatPct(PROTOCOL_FEE_BP / BP_DENOMINATOR, 0)} комиссии протокола с выигранной части, зависит
            от итогового пула)
          </p>

          <button
            onClick={onBet}
            className={`w-full rounded-xl font-semibold py-2.5 text-sm transition-colors ${
              side === 'YES' ? 'bg-emerald-400 hover:bg-emerald-300 text-black' : 'bg-rose-400 hover:bg-rose-300 text-black'
            }`}
          >
            Поставить {side === 'YES' ? 'ЗА' : 'ПРОТИВ'}
          </button>
        </>
      )}

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
  )
}
