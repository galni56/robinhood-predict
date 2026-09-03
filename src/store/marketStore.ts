import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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

const HISTORY_LIMIT = 180
const SEED_LIQUIDITY = 400
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
  ) => { ok: true; id: string } | { ok: false; error: string }
  placeBet: (
    user: User,
    marketId: string,
    side: MarketSide,
    amount: number,
  ) => { ok: true } | { ok: false; error: string }
  checkResolutions: () => void
  forceResolve: (marketId: string) => void
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

function makeMarket(symbol: string, target: number, deadline: number, createdBy: string): PredictionMarket {
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
    outcome: null,
    poolYes: SEED_LIQUIDITY,
    poolNo: SEED_LIQUIDITY,
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
        const { prices, markets } = get()
        const nextPrices = { ...prices }
        const nextHistory: Record<string, PricePoint[]> = {}
        for (const t of TOKENS) {
          if (nextPrices[t.symbol] == null) nextPrices[t.symbol] = t.startPrice
          nextHistory[t.symbol] = [{ t: Date.now(), price: nextPrices[t.symbol] }]
        }

        // Demo bootstrap: seed a starter market for every token that doesn't
        // have one yet, so the app isn't empty before any curator has
        // created one. Tops up rather than a one-time check, so re-running
        // this on an existing (persisted) session fills in any tokens added
        // since — it never touches markets that already exist.
        const nextMarkets = { ...markets }
        const symbolsWithMarket = new Set(Object.values(nextMarkets).map((m) => m.symbol))
        const missing = TOKENS.filter((t) => !symbolsWithMarket.has(t.symbol))
        missing.forEach((t, i) => {
          const preset = DURATION_PRESETS[i % DURATION_PRESETS.length]
          const target = defaultTargetFor(t.startPrice)
          const m = makeMarket(t.symbol, target, Date.now() + preset.ms, SYSTEM_CREATOR)
          nextMarkets[m.id] = m
        })

        set({ prices: nextPrices, history: nextHistory, markets: nextMarkets })
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

      createMarket: (creator, symbol, targetPrice, durationMs) => {
        if (creator.role !== 'admin') return { ok: false, error: 'Только куратор может создавать рынки' }
        const token = TOKENS.find((t) => t.symbol === symbol)
        if (!token) return { ok: false, error: 'Токен не найден' }
        if (!(targetPrice > 0)) return { ok: false, error: 'Целевая цена должна быть больше нуля' }

        const m = makeMarket(symbol, targetPrice, Date.now() + durationMs, creator.id)
        set((s) => ({ markets: { ...s.markets, [m.id]: m } }))
        return { ok: true, id: m.id }
      },

      placeBet: (user, marketId, side, amount) => {
        if (amount <= 0) return { ok: false, error: 'Сумма ставки должна быть больше нуля' }
        const market = get().markets[marketId]
        if (!market) return { ok: false, error: 'Рынок не найден' }
        if (market.resolved) return { ok: false, error: 'Рынок уже завершён' }
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
        const due = Object.values(get().markets).filter((m) => !m.resolved && m.deadline <= now)
        for (const m of due) get().forceResolve(m.id)
      },

      forceResolve: (marketId) => {
        const market = get().markets[marketId]
        if (!market || market.resolved) return
        const price = get().prices[market.symbol] ?? 0
        const outcome: MarketSide = price >= market.target ? 'YES' : 'NO'
        const token = TOKENS.find((t) => t.symbol === market.symbol)
        const winningPool = outcome === 'YES' ? market.poolYes : market.poolNo
        const totalPool = market.poolYes + market.poolNo

        const myPositions = get().positions.filter((p) => p.marketId === marketId && !p.settled)
        const settledPositions = [...get().positions]

        for (const pos of myPositions) {
          const idx = settledPositions.findIndex((p) => p.id === pos.id)
          if (pos.side === outcome && winningPool > 0) {
            const payout = Number(((pos.amount / winningPool) * totalPool).toFixed(2))
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
