import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { formatUsd } from '@/lib/format'
import { mockAddress } from '@/lib/hash'
import { stepPrice } from '@/market/priceEngine'
import { TOKENS } from '@/market/tokens'
import { useAuthStore } from '@/store/authStore'
import { useChainStore } from '@/store/chainStore'
import type { MarketSide, PredictionMarket, PricePoint, Position, User, UserStats } from '@/types'

// A real "week" would make the demo boring — compress the resolution
// window so the game is actually playable in one sitting. This is clearly
// surfaced in the UI as a demo timeline, not a real deadline.
export const DURATION_PRESETS = [
  { label: 'Спринт (демо: 2 мин)', ms: 2 * 60 * 1000 },
  { label: 'Неделя (демо: 5 мин)', ms: 5 * 60 * 1000 },
  { label: 'Месяц (демо: 15 мин)', ms: 15 * 60 * 1000 },
] as const

/** Business rule from the product spec: no market can target above this. */
export const MAX_TARGET_PRICE = 500

/** Mirrors the contract's `MAX_SEED_LIQUIDITY_USD` — the most house/admin
 * seed liquidity (both sides combined) a market can launch with. */
export const MAX_SEED_LIQUIDITY = 50

/** Mirrors the contract's protocol fee, in basis points, taken only from the
 * losing pool's contribution to a winner's payout — never from principal. */
export const PROTOCOL_FEE_BP = 200
const BP_DENOMINATOR = 10_000

const HISTORY_LIMIT = 180
// Demo-seeded markets are "house" markets too — capped the same as an admin's
// own seed liquidity, split evenly so they open at 50/50 odds.
const SEED_LIQUIDITY = MAX_SEED_LIQUIDITY / 2
const SYSTEM_CREATOR = 'system'

interface MarketState {
  prices: Record<string, number>
  history: Record<string, PricePoint[]>
  markets: Record<string, PredictionMarket>
  positions: Position[]

  init: () => void
  tick: () => void
  createMarket: (
    creator: User,
    symbol: string,
    targetPrice: number,
    durationMs: number,
    /** Owner/admin-only house seed liquidity, both sides combined capped at
     * `MAX_SEED_LIQUIDITY`. Omit (or all-zero) for a normal permissionless
     * market that opens at 0/0 pools. */
    seed?: { yes: number; no: number },
  ) => { ok: true; id: string } | { ok: false; error: string }
  placeBet: (
    user: User,
    marketId: string,
    side: MarketSide,
    amount: number,
  ) => { ok: true } | { ok: false; error: string }
  checkResolutions: () => void
  forceResolve: (marketId: string) => void
  /** Seeds a fresh open (system-created) market for `symbol` if it doesn't
   * already have one. Used both at startup and right after a market
   * resolves, so the demo never runs dry without needing a manual re-seed
   * or a page refresh. */
  ensureOpenMarket: (symbol: string) => void
  oddsFor: (marketId: string) => { yesPct: number; noPct: number; totalPool: number }
  positionsForUser: (userId: string) => Position[]
  marketsForSymbol: (symbol: string) => PredictionMarket[]
  statsForUser: (userId: string) => UserStats
}

/** A flat "$100 target" is meaningless once a token's own price is already
 * above 100 (e.g. NVDA, TSLA) — the market would resolve YES on day one with
 * no real prediction happening. Scale the demo-seeded target relative to
 * each token's own starting price instead, rounded to a "nice" number, while
 * keeping the original "$100 by the deadline" flavor for cheaper tokens. */
function defaultTargetFor(startPrice: number): number {
  const raw = startPrice < 60 ? 100 : startPrice * 1.25
  const step = raw < 100 ? 5 : 10
  return Math.ceil(raw / step) * step
}

function makeMarket(
  symbol: string,
  target: number,
  deadline: number,
  createdBy: string,
  poolYes = 0,
  poolNo = 0,
): PredictionMarket {
  const now = Date.now()
  return {
    id: mockAddress(`market:${symbol}:${now}:${Math.random()}`),
    symbol,
    question: `Достигнет ли ${symbol} цены $${target} до дедлайна?`,
    target,
    createdAt: now,
    createdBy,
    deadline,
    resolved: false,
    cancelled: false,
    outcome: null,
    poolYes,
    poolNo,
  }
}

export const useMarketStore = create<MarketState>()(
  persist(
    (set, get) => ({
      prices: {},
      history: {},
      markets: {},
      positions: [],

      init: () => {
        const { prices } = get()
        const nextPrices = { ...prices }
        const nextHistory: Record<string, PricePoint[]> = {}
        for (const t of TOKENS) {
          if (nextPrices[t.symbol] == null) nextPrices[t.symbol] = t.startPrice
          nextHistory[t.symbol] = [{ t: Date.now(), price: nextPrices[t.symbol] }]
        }

        set({ prices: nextPrices, history: nextHistory })

        // Demo bootstrap: every token should have one open (unresolved)
        // market at all times, so the demo never runs dry — this tops up on
        // every load (existing open markets are left untouched) and again
        // right after each resolution (see checkResolutions below).
        for (const t of TOKENS) get().ensureOpenMarket(t.symbol)
      },

      ensureOpenMarket: (symbol) => {
        const hasOpenMarket = Object.values(get().markets).some((m) => m.symbol === symbol && !m.resolved)
        if (hasOpenMarket) return
        const token = TOKENS.find((t) => t.symbol === symbol)
        if (!token) return
        const price = get().prices[symbol] ?? token.startPrice
        // A token already trading above the $500 cap can't have a meaningful
        // "will it reach $X" market under that cap — skip auto-seeding one
        // rather than spawn something that's already trivially resolved.
        if (price >= MAX_TARGET_PRICE) return
        const target = Math.min(defaultTargetFor(price), MAX_TARGET_PRICE)
        // Always the longest preset ("месяц") — the shorter ones stay
        // available for a curator who deliberately wants a fast-resolving
        // market, but auto-seeded ones shouldn't churn every couple minutes.
        const preset = DURATION_PRESETS[DURATION_PRESETS.length - 1]
        const m = makeMarket(symbol, target, Date.now() + preset.ms, SYSTEM_CREATOR, SEED_LIQUIDITY, SEED_LIQUIDITY)
        set((s) => ({ markets: { ...s.markets, [m.id]: m } }))
      },

      tick: () => {
        const { prices, history } = get()
        const nextPrices = { ...prices }
        const nextHistory = { ...history }
        for (const t of TOKENS) {
          const next = stepPrice(nextPrices[t.symbol] ?? t.startPrice)
          nextPrices[t.symbol] = next
          const series = [...(nextHistory[t.symbol] ?? []), { t: Date.now(), price: next }]
          nextHistory[t.symbol] = series.slice(-HISTORY_LIMIT)
        }
        set({ prices: nextPrices, history: nextHistory })
      },

      createMarket: (creator, symbol, targetPrice, durationMs, seed) => {
        // Permissionless: any logged-in user can create a market (not just
        // curators). `role` still matters elsewhere (e.g. force-resolving
        // someone else's market, and here for seed liquidity) — just not for
        // creation itself.
        const token = TOKENS.find((t) => t.symbol === symbol)
        if (!token) return { ok: false, error: 'Токен не найден' }
        if (!(targetPrice > 0)) return { ok: false, error: 'Целевая цена должна быть больше нуля' }
        if (targetPrice > MAX_TARGET_PRICE) {
          return { ok: false, error: `Целевая цена не может быть больше ${formatUsd(MAX_TARGET_PRICE, 0)}` }
        }

        let poolYes = 0
        let poolNo = 0
        if (seed && (seed.yes > 0 || seed.no > 0)) {
          if (creator.role !== 'admin') {
            return { ok: false, error: 'Начальная ликвидность доступна только администратору' }
          }
          if (seed.yes < 0 || seed.no < 0) {
            return { ok: false, error: 'Начальная ликвидность не может быть отрицательной' }
          }
          if (seed.yes + seed.no > MAX_SEED_LIQUIDITY) {
            return { ok: false, error: `Начальная ликвидность не может превышать ${formatUsd(MAX_SEED_LIQUIDITY, 0)}` }
          }
          poolYes = seed.yes
          poolNo = seed.no
        }

        const m = makeMarket(symbol, targetPrice, Date.now() + durationMs, creator.id, poolYes, poolNo)
        set((s) => ({ markets: { ...s.markets, [m.id]: m } }))
        return { ok: true, id: m.id }
      },

      placeBet: (user, marketId, side, amount) => {
        if (amount <= 0) return { ok: false, error: 'Сумма ставки должна быть больше нуля' }
        const market = get().markets[marketId]
        if (!market) return { ok: false, error: 'Рынок не найден' }
        if (market.resolved) return { ok: false, error: 'Рынок уже завершён' }
        if (market.cancelled) return { ok: false, error: 'Рынок отменён' }
        // One bet per side per market — mirrors the contract's `bet()` rule.
        const alreadyBetThisSide = get().positions.some((p) => p.marketId === marketId && p.userId === user.id && p.side === side)
        if (alreadyBetThisSide) {
          return { ok: false, error: `Вы уже ставили ${side === 'YES' ? 'ЗА' : 'ПРОТИВ'} в этом рынке` }
        }
        const balance = useChainStore.getState().balanceOf(user.walletAddress)
        if (balance < amount) return { ok: false, error: 'Недостаточно mUSD на кошельке' }

        const token = TOKENS.find((t) => t.symbol === market.symbol)
        if (!token) return { ok: false, error: 'Токен не найден' }

        const txHash = useChainStore.getState().submitTx({
          from: user.walletAddress,
          to: token.contractAddress,
          type: 'BET',
          amount,
          marketId,
          side,
          memo: `${side === 'YES' ? 'Ставка ЗА' : 'Ставка ПРОТИВ'}: ${market.symbol} достигнет $${market.target}`,
        })

        const position: Position = {
          id: mockAddress(`position:${txHash}`),
          userId: user.id,
          marketId,
          side,
          amount,
          txHash,
          createdAt: Date.now(),
          settled: false,
          payout: null,
        }

        set((s) => ({
          positions: [...s.positions, position],
          markets: {
            ...s.markets,
            [marketId]: {
              ...s.markets[marketId],
              poolYes: s.markets[marketId].poolYes + (side === 'YES' ? amount : 0),
              poolNo: s.markets[marketId].poolNo + (side === 'NO' ? amount : 0),
            },
          },
        }))

        return { ok: true }
      },

      checkResolutions: () => {
        const now = Date.now()
        const due = Object.values(get().markets).filter((m) => !m.resolved && !m.cancelled && m.deadline <= now)
        for (const m of due) get().forceResolve(m.id)
      },

      forceResolve: (marketId) => {
        const market = get().markets[marketId]
        if (!market || market.resolved || market.cancelled) return

        // One-sided market: no genuine two-sided prediction happened (and if
        // the empty side would've "won" there'd be no losing pool to pay a
        // winner from anyway). Cancel and refund whoever did bet in full —
        // mirrors the contract's `resolve()` short-circuit exactly.
        if (market.poolYes === 0 || market.poolNo === 0) {
          const myPositions = get().positions.filter((p) => p.marketId === marketId && !p.settled)
          const settledPositions = [...get().positions]
          for (const pos of myPositions) {
            const idx = settledPositions.findIndex((p) => p.id === pos.id)
            settledPositions[idx] = { ...pos, settled: true, payout: pos.amount, refunded: true }
          }
          set((s) => ({
            markets: { ...s.markets, [marketId]: { ...market, cancelled: true } },
            positions: settledPositions,
          }))
          get().ensureOpenMarket(market.symbol)
          return
        }

        const price = get().prices[market.symbol] ?? 0
        const outcome: MarketSide = price >= market.target ? 'YES' : 'NO'
        const token = TOKENS.find((t) => t.symbol === market.symbol)
        const winningPool = outcome === 'YES' ? market.poolYes : market.poolNo
        const losingPool = outcome === 'YES' ? market.poolNo : market.poolYes

        const myPositions = get().positions.filter((p) => p.marketId === marketId && !p.settled)
        const settledPositions = [...get().positions]

        for (const pos of myPositions) {
          const idx = settledPositions.findIndex((p) => p.id === pos.id)
          if (pos.side === outcome) {
            // Parimutuel, fee taken only from the losing pool's share —
            // principal always comes back in full. Mirrors the contract's
            // `claim()` formula exactly (see contracts/src/PredictionMarket.sol).
            const winnings = (pos.amount * losingPool * (BP_DENOMINATOR - PROTOCOL_FEE_BP)) / (winningPool * BP_DENOMINATOR)
            const payout = Number((pos.amount + winnings).toFixed(2))
            const owner = useAuthStore.getState().users.find((u) => u.id === pos.userId)
            if (token && owner) {
              useChainStore.getState().submitTx({
                from: token.contractAddress,
                to: owner.walletAddress,
                type: 'SETTLEMENT',
                amount: payout,
                marketId,
                side: outcome,
                memo: `Выплата по рынку ${market.symbol}: ${outcome === 'YES' ? 'ЗА' : 'ПРОТИВ'} выиграло`,
              })
            }
            settledPositions[idx] = { ...pos, settled: true, payout }
          } else {
            settledPositions[idx] = { ...pos, settled: true, payout: 0 }
          }
        }

        set((s) => ({
          markets: { ...s.markets, [marketId]: { ...market, resolved: true, outcome } },
          positions: settledPositions,
        }))

        get().ensureOpenMarket(market.symbol) // keep the demo alive — spawn the next one right away
      },

      oddsFor: (marketId) => {
        const m = get().markets[marketId]
        if (!m) return { yesPct: 0.5, noPct: 0.5, totalPool: 0 }
        const total = m.poolYes + m.poolNo
        if (total === 0) return { yesPct: 0.5, noPct: 0.5, totalPool: 0 }
        return { yesPct: m.poolYes / total, noPct: m.poolNo / total, totalPool: total }
      },

      positionsForUser: (userId) => get().positions.filter((p) => p.userId === userId),

      marketsForSymbol: (symbol) => Object.values(get().markets).filter((m) => m.symbol === symbol),

      statsForUser: (userId) => {
        const positions = get()
          .positions.filter((p) => p.userId === userId)
          .sort((a, b) => b.createdAt - a.createdAt)

        const settled = positions.filter((p) => p.settled)
        const wins = settled.filter((p) => (p.payout ?? 0) > 0)
        const losses = settled.filter((p) => (p.payout ?? 0) === 0)
        const totalWagered = positions.reduce((sum, p) => sum + p.amount, 0)
        const totalWon = settled.reduce((sum, p) => sum + (p.payout ?? 0), 0)

        let currentStreak = 0
        for (const p of settled) {
          if ((p.payout ?? 0) > 0) currentStreak++
          else break
        }

        return {
          totalBets: positions.length,
          wins: wins.length,
          losses: losses.length,
          pending: positions.length - settled.length,
          winRate: settled.length > 0 ? wins.length / settled.length : 0,
          totalWagered,
          totalWon,
          netProfit: totalWon - totalWagered,
          currentStreak,
        }
      },
    }),
    {
      name: 'rhchain-mock-market',
      partialize: (s) => ({ prices: s.prices, markets: s.markets, positions: s.positions }),
    },
  ),
)
