import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { convertRows, getJson, useGameState, type ServerPayout } from '@/chain/gameServer'
import { GAME_SERVER_URL } from '@/solana/services'

// Price Shot (the new arena): rooms from the game server, the player's game
// balance, and the room phases. Rules live in scripts/solana/game-server/shot.mjs.

export type ShotStatus = 'open' | 'aim' | 'live' | 'resolved' | 'cancelled'

export interface ServerShot {
  id: number
  status: ShotStatus
  cancelReason: string
  creator: string
  title: string
  symbol: string
  priceSource: string
  priceDecimals: number
  category: string
  unit: 'price' | 'cap'
  duration: number
  createdAt: number
  players: { wallet: string; ready: boolean; joinedAt: number }[]
  aimEndsAt: number
  deadline: number
  resolvedAt: number
  feeBp: number
  minStake: string
  maxStake: string
  entries: { player: string; prediction: string; stake: string; lockedAt: number; predictionSeq: number; payout: string; rank: number; accuracyMultiplierBp: number }[]
  totalPool: string
  finalPrice: string
  winnerCount: number
  payouts?: ServerPayout[]
}

export interface ShotEntry {
  player: string
  /** 0 while hidden (before the match starts). */
  prediction: bigint
  stake: bigint
  lockedAt: number
  predictionSeq: number
  payout: bigint
  rank: number
}

export interface Shot {
  id: number
  status: ShotStatus
  cancelReason: string
  creator: string
  title: string
  symbol: string
  priceSource: string
  priceDecimals: number
  category: string
  unit: 'price' | 'cap'
  duration: number
  createdAt: number
  players: { wallet: string; ready: boolean }[]
  aimEndsAt: number
  deadline: number
  minStake: bigint
  maxStake: bigint
  entries: ShotEntry[]
  totalPool: bigint
  finalPrice: bigint
  winnerCount: number
}

export const SHOT_RULES = { minPlayers: 2, maxPlayers: 10, aimSeconds: 30, lockGrace: 15, durations: [60, 300, 900, 3600] }
/** A Price Shot stake: a transfer to the game wallet with this memo (the price was sent signed). */
export const shotMemo = (id: number) => `prophet:shot:${id}:0`

export function shotFromServer(s: ServerShot): Shot {
  return {
    id: s.id,
    status: s.status,
    cancelReason: s.cancelReason,
    creator: s.creator,
    title: s.title,
    symbol: s.symbol,
    priceSource: s.priceSource,
    priceDecimals: s.priceDecimals,
    category: s.category,
    unit: s.unit,
    duration: s.duration,
    createdAt: s.createdAt,
    players: s.players.map((p) => ({ wallet: p.wallet, ready: p.ready })),
    aimEndsAt: s.aimEndsAt,
    deadline: s.deadline,
    minStake: BigInt(s.minStake),
    maxStake: BigInt(s.maxStake),
    entries: s.entries.map((e) => ({ player: e.player, prediction: BigInt(e.prediction), stake: BigInt(e.stake), lockedAt: e.lockedAt, predictionSeq: e.predictionSeq, payout: BigInt(e.payout), rank: e.rank })),
    totalPool: BigInt(s.totalPool),
    finalPrice: BigInt(s.finalPrice),
    winnerCount: s.winnerCount,
  }
}

/** Every room, newest first. */
export function useShots() {
  const state = useGameState()
  const served = (state.data as { shots?: ServerShot[] } | undefined)?.shots
  const shots = useMemo(() => convertRows(served, shotFromServer, 'shot').sort((a, b) => b.id - a.id), [served])
  return { shots, isLoading: state.isLoading && GAME_SERVER_URL != null, offline: !served && !state.isLoading, error: state.error }
}

/** One room, polled every second while a phase is running. */
export function useShot(id: number | null) {
  const query = useQuery({
    queryKey: ['shot', id],
    queryFn: async () => shotFromServer(await getJson<ServerShot>(`/games/shot/${id}`)),
    enabled: id != null && GAME_SERVER_URL != null,
    refetchInterval: (q) => {
      const s = q.state.data
      return s && (s.status === 'resolved' || s.status === 'cancelled') ? 30_000 : 1_000
    },
  })
  return { shot: query.data, isLoading: query.isLoading, error: query.error, refetch: query.refetch }
}

/** Rank of every locked shot against a price (closest first, earlier lock wins ties). */
export function provisionalOrder(entries: ShotEntry[], price: bigint) {
  const error = (e: ShotEntry) => (e.prediction > price ? e.prediction - price : price - e.prediction)
  return [...entries].sort((a, b) => {
    const ea = error(a)
    const eb = error(b)
    return ea !== eb ? (ea < eb ? -1 : 1) : a.predictionSeq - b.predictionSeq
  })
}

/** True once the aim is over and locked shots' stakes are still confirming. */
export const shotConfirming = (shot: Shot, nowSec: number) => shot.status === 'aim' && nowSec >= shot.aimEndsAt

export function shotPhaseLabel(shot: Shot, nowSec = Date.now() / 1000) {
  if (shot.status === 'open') return `WAITING ${shot.players.length}/${SHOT_RULES.maxPlayers}`
  if (shot.status === 'aim') return shotConfirming(shot, nowSec) ? 'CONFIRMING SHOTS' : 'AIM'
  if (shot.status === 'live') return 'LIVE'
  if (shot.status === 'resolved') return 'FINISHED'
  return 'CANCELLED'
}

export const CANCEL_REASON: Record<string, string> = {
  notEnoughShots: 'Fewer than two players locked a shot in time.',
  staleDeadlinePrice: 'No fresh price at the final bell.',
  resolutionWindowExpired: 'The result could not be recorded in time.',
  idleRoom: 'Nobody joined this room.',
}
