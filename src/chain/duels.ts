import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { convertRows, getJson, useGameState, type ServerPayout } from '@/chain/gameServer'
import { GAME_SERVER_URL } from '@/solana/services'

// Coin duels (scripts/solana/game-server/duel.mjs): every racer brings one
// coin, pays the lobby's stake and presses "ready"; spectators back a racer.
// Server JSON: amounts are lamport strings, times unix seconds.

export interface ServerDuelRacer {
  seat: number
  wallet: string
  symbol: string
  priceSource: string
  priceDecimals: number
  joinedAt: number
  paid: boolean
  paidAmount: string
  ready: boolean
  readyDeadline: number
  prepared: boolean
  cheers: number
  startPrice: string
  endPrice: string
  returnValue: string
}

export interface ServerDuel {
  kind: 'duel'
  id: number
  address: string
  status: 'open' | 'ready' | 'starting' | 'running' | 'resolved' | 'void' | 'cancelled'
  creator: string | null
  title: string
  createdAt: number
  category: 'meme' | 'crypto' | null
  unit: 'price' | 'cap'
  stake: string
  duration: number
  racers: ServerDuelRacer[]
  backers: { wallet: string; seat: number; amount: string; at: number }[]
  startTime: number
  endTime: number
  resolvedAt: number
  winnerSeat: number
  cancelReason: string | null
  payouts: ServerPayout[]
}

export interface DuelRacer {
  seat: number
  wallet: string
  symbol: string
  priceSource: string
  priceDecimals: number
  joinedAt: number
  paid: boolean
  ready: boolean
  readyDeadline: number
  prepared: boolean
  cheers: number
  startPrice: bigint
  endPrice: bigint
  returnValue: bigint
  /** Spectator money on this racer. */
  backed: bigint
  backers: number
}

export interface Duel {
  id: number
  status: ServerDuel['status']
  creator: string | null
  title: string
  category: 'meme' | 'crypto' | null
  unit: 'price' | 'cap'
  stake: bigint
  duration: number
  racers: DuelRacer[]
  backers: { wallet: string; seat: number; amount: bigint }[]
  startTime: number
  endTime: number
  winnerSeat: number
  cancelReason: string | null
  payouts: { wallet: string; kind: string; amount: bigint; status: string; signature: string | null }[]
  /** Racers' stakes plus spectators' money. */
  pot: bigint
}

export const DUEL_RULES = {
  minRacers: 2,
  maxRacers: 6,
  payWindow: 120,
  readyWindow: 60,
  prepareExtra: 15,
  // Owner, 2026-10-06: memes up to 15 min, crypto up to 30 min.
  durations: { meme: [60, 180, 300, 900], crypto: [300, 900, 1800] },
  backCapUsdCents: 10_000n,
}

export function duelFromServer(d: ServerDuel): Duel {
  const backers = d.backers.map((b) => ({ wallet: b.wallet, seat: b.seat, amount: BigInt(b.amount) }))
  const racers = d.racers.map((r) => {
    const mine = backers.filter((b) => b.seat === r.seat)
    return {
      ...r,
      startPrice: BigInt(r.startPrice),
      endPrice: BigInt(r.endPrice),
      returnValue: BigInt(r.returnValue),
      backed: mine.reduce((sum, b) => sum + b.amount, 0n),
      backers: new Set(mine.map((b) => b.wallet)).size,
    }
  })
  const stakes = d.racers.filter((r) => r.paid).reduce((sum, r) => sum + BigInt(r.paidAmount), 0n)
  return {
    id: d.id,
    status: d.status,
    creator: d.creator,
    title: d.title,
    category: d.category,
    unit: d.unit,
    stake: BigInt(d.stake),
    duration: d.duration,
    racers,
    backers,
    startTime: d.startTime,
    endTime: d.endTime,
    winnerSeat: d.winnerSeat,
    cancelReason: d.cancelReason,
    payouts: d.payouts.map((p) => ({ ...p, amount: BigInt(p.amount) })),
    pot: stakes + backers.reduce((sum, b) => sum + b.amount, 0n),
  }
}

export const duelStake = (id: number | bigint, seat = 0) => `prophet:duel:${id}:${seat}`

export function duelPhaseLabel(duel: Duel) {
  if (duel.status === 'open') return duel.racers.length === 0 ? 'EMPTY' : `WAITING ${duel.racers.length}/${DUEL_RULES.maxRacers}`
  if (duel.status === 'ready') return 'READY CHECK'
  if (duel.status === 'starting') return 'STARTING'
  if (duel.status === 'running') return 'RACING'
  if (duel.status === 'resolved') return 'FINISHED'
  return 'CANCELLED'
}

export function durationLabel(seconds: number) {
  return seconds >= 3600 ? `${seconds / 3600}h` : `${seconds / 60} min`
}

/** Four open lobbies to show while the game server is offline (never empty). */
const OFFLINE_LOBBIES: Duel[] = Array.from({ length: 4 }, (_, i) => ({
  id: i + 1, status: 'open', creator: null, title: `Duel #${i + 1}`, category: null, unit: 'price', stake: 0n, duration: 0,
  racers: [], backers: [], startTime: 0, endTime: 0, winnerSeat: 0, cancelReason: null, payouts: [], pot: 0n,
}))

/** Every duel lobby, newest first. `offline`: the server is not answering. */
export function useDuels() {
  const state = useGameState()
  const served = (state.data as { duels?: ServerDuel[] } | undefined)?.duels
  const duels = useMemo(() => convertRows(served, duelFromServer, 'duel').sort((a, b) => b.id - a.id), [served])
  const offline = !served && !state.isLoading
  return { duels: offline ? OFFLINE_LOBBIES : duels, offline, isLoading: state.isLoading && GAME_SERVER_URL != null, error: state.error }
}

/** One duel, polled every 2 seconds while it is not final. */
export function useDuel(id: number | null) {
  const query = useQuery({
    queryKey: ['duel', id],
    queryFn: async () => duelFromServer(await getJson<ServerDuel>(`/games/duel/${id}`)),
    enabled: id != null && GAME_SERVER_URL != null,
    refetchInterval: (q) => {
      const d = q.state.data
      return d && (d.status === 'resolved' || d.status === 'void') && d.payouts.every((p) => p.status === 'done') ? 20_000 : 2_000
    },
  })
  return { duel: query.data, isLoading: query.isLoading, error: query.error, refetch: query.refetch }
}

/** A free cheer. Best effort: offline, rate limited or refused all just
 * return null - a cheer is never worth an error on screen. */
export async function cheerRacer(duelId: number, seat: number) {
  if (GAME_SERVER_URL == null) return null
  try {
    const response = await fetch(`${GAME_SERVER_URL}/cheer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ duel: duelId, seat }) })
    return response.ok ? ((await response.json()) as { cheers: number }).cheers : null
  } catch {
    return null
  }
}

