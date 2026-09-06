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
    return <p className="text-white/40 text-sm">{market.cancelled ? 'Market cancelled — betting is closed.' : 'Market has already resolved.'}</p>
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
    if (!user) {
      navigate('/login', { state: { from: location, reopenBet: { marketId, side } } })
      return
    }
    if (bettingClosed) {
      setFeedback('Betting on this market is already closed')
      return
    }
    const result = placeBet(user, marketId, side, Number(amount))
    setFeedback(result.ok ? `${side === 'YES' ? 'YES' : 'NO'} bet sent to mempool ✅` : result.error)
  }

  if (bettingClosed) {
    return <p className="text-xs text-white/40">Betting on this market is closed — waiting for the deadline so it can resolve.</p>
  }

  if (bothSidesUsed) {
    return <p className="text-xs text-white/40">You've already bet both YES and NO on this market — one bet per side, no more allowed.</p>
  }

  return (
    <div className="space-y-3">
      {liveWeightBp != null && (
        <p className="text-[11px] text-emerald-400/80">
          Early-bet bonus right now: {(liveWeightBp / BP_DENOMINATOR).toFixed(2)}x — the earlier you bet, the bigger it gets.
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
          YES{hasBetYes ? ' ✓' : ''}
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
          NO{hasBetNo ? ' ✓' : ''}
        </button>
      </div>

      {sideAlreadyBet ? (
        <p className="text-xs text-amber-400/80">You've already bet {side === 'YES' ? 'YES' : 'NO'} on this market — pick the other side.</p>
      ) : (
        <>
          <div>
            <label className="block text-xs text-white/40 mb-1">
              Amount, mUSD{user ? ` (balance ${formatUsd(balance)})` : ''}
            </label>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-violet-400/60"
            />
          </div>

          <p className="text-xs text-white/40">
            Potential payout: <span className="text-white/70">{formatUsd(potentialPayout || 0)}</span>{' '}
            (parimutuel, minus {formatPct(PROTOCOL_FEE_BP / BP_DENOMINATOR, 0)} protocol fee on winnings only — depends on
            the final pool)
          </p>

          <button
            onClick={onBet}
            className={`w-full rounded-xl font-semibold py-2.5 text-sm transition-colors ${
              side === 'YES' ? 'bg-emerald-400 hover:bg-emerald-300 text-black' : 'bg-rose-400 hover:bg-rose-300 text-black'
            }`}
          >
            {user ? `Bet ${side === 'YES' ? 'YES' : 'NO'}` : 'Log in to place this bet'}
          </button>
        </>
      )}

      {feedback && <p className="text-xs text-white/50">{feedback}</p>}

      {user && (user.role === 'admin' || user.id === market.createdBy) && (
        <button
          onClick={() => forceResolve(marketId)}
          className="w-full rounded-lg border border-dashed border-white/15 text-white/40 hover:text-white/70 hover:border-white/30 py-1.5 text-xs transition-colors"
        >
          ⏩ Resolve market now (demo)
        </button>
      )}
    </div>
  )
}
