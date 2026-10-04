import { assetRaceCatalog, assetIdHexForSymbol, type AssetRaceCategoryName } from '@/chain/assetRaceRegistry'
import { payoutFromServer, type RacePayout } from '@/chain/assetRaces'
import type { ServerArena } from '@/chain/gameServer'

// Price Arena view model on top of the game server's arena (same fields as the
// former program account). The server stores status only (open / resolved /
// cancelled); lobby versus live is derived from the arena's start time.

export const PRICE_ARENA_CATEGORY = { STOCK: 0, MEME: 1, CRYPTO: 2 } as const
// UNKNOWN: a status variant this build does not know (program upgraded ahead
// of the frontend). Fails closed: no gate matches it, so no actions render.
export const PRICE_ARENA_STATUS = { OPEN: 0, RESOLVED: 1, CANCELLED: 2, UNKNOWN: 99 } as const
export const PRICE_ARENA_PHASE = { LOBBY: 0, RUNNING: 1, RESOLVED: 2, CANCELLED: 3 } as const
export const PRICE_ARENA_CANCEL_REASON = {
  NONE: 0,
  INSUFFICIENT_PARTICIPANTS: 1,
  STALE_DEADLINE_PRICE: 2,
  RESOLUTION_WINDOW_EXPIRED: 3,
} as const
// Mirrors ARENA.durations and ARENA.maxParticipants in
// scripts/solana/game-server/rules.mjs.
export const PRICE_ARENA_DURATIONS = [60n, 300n, 900n, 3600n] as const
export const PRICE_ARENA_MAX_PARTICIPANTS = 10
export type PriceArenaMode = 'stocks' | 'memes' | 'crypto'

export interface PriceArenaAsset {
  assetId: string
  symbol: string
  name: string
  category: number
  categoryName: AssetRaceCategoryName
  quoteSymbol: 'USD'
  pool: string
  priceUrl?: string
  logoUrl?: string
}

const categoryCodeForName = (name: AssetRaceCategoryName) => (
  name === 'MEME' ? PRICE_ARENA_CATEGORY.MEME : name === 'CRYPTO' ? PRICE_ARENA_CATEGORY.CRYPTO : PRICE_ARENA_CATEGORY.STOCK
)

const CATALOG_ASSETS = assetRaceCatalog.map((asset) => ({
  assetId: asset.assetId,
  symbol: asset.symbol,
  name: asset.displayName,
  category: categoryCodeForName(asset.category),
  categoryName: asset.category,
  quoteSymbol: 'USD' as const,
  pool: asset.pool,
  priceUrl: asset.priceUrl,
  logoUrl: asset.logoUrl,
  enabled: asset.enabled,
}))

// Every reviewed asset, so past arenas keep their names and links.
const ASSET_BY_POOL = new Map<string, PriceArenaAsset>(CATALOG_ASSETS.map((asset) => [asset.pool, asset]))

export function priceArenaAssetForPool(pool?: string) {
  return pool ? ASSET_BY_POOL.get(pool) : undefined
}

export function categoryForArenaMode(mode: PriceArenaMode) {
  if (mode === 'memes') return PRICE_ARENA_CATEGORY.MEME
  if (mode === 'crypto') return PRICE_ARENA_CATEGORY.CRYPTO
  return PRICE_ARENA_CATEGORY.STOCK
}

export function modeForArenaCategory(category: number): PriceArenaMode {
  if (category === PRICE_ARENA_CATEGORY.MEME) return 'memes'
  if (category === PRICE_ARENA_CATEGORY.CRYPTO) return 'crypto'
  return 'stocks'
}

export function arenaDurationLabel(seconds: bigint | number) {
  const value = BigInt(seconds)
  if (value === 3600n) return '1 hour'
  return `${value / 60n} min`
}

export function arenaPhaseLabel(phase: number) {
  if (phase === PRICE_ARENA_PHASE.LOBBY) return 'Lobby'
  if (phase === PRICE_ARENA_PHASE.RUNNING) return 'Live'
  if (phase === PRICE_ARENA_PHASE.RESOLVED) return 'Finished'
  return 'Cancelled'
}

export interface PriceArenaEntry {
  player: string
  prediction: bigint
  stake: bigint
  predictionUpdatedAt: bigint
  predictionSeq: number
  payout: bigint
  /** 1-based final rank; 0 until resolved. */
  rank: number
  accuracyMultiplierBp: number
  exists: boolean
  settled: boolean
}

export interface PriceArenaViewModel {
  id: bigint
  address: string
  assetId: string
  symbol: string
  priceSource: string
  creator: string
  stakeMint: string
  priceDecimals: number
  category: number
  status: number
  cancelReason: number
  createdAt: bigint
  startsAt: bigint
  deadline: bigint
  resolvedAt: bigint
  duration: number
  participantCount: number
  winnerCount: number
  feeBp: number
  minStake: bigint
  maxStake: bigint
  totalPool: bigint
  finalPrice: bigint
  finalUpdatedAt: bigint
  protocolFee: bigint
  creatorFee: bigint
  remainingLiability: bigint
  title: string
  entries: PriceArenaEntry[]
  payouts: RacePayout[]
  /** Calls shown as prices or market caps (display only). */
  unit: 'price' | 'cap'
  asset?: PriceArenaAsset
}

const big = (value: string | number) => BigInt(value)
const STATUS_CODES: Record<string, number> = { open: 0, resolved: 1, cancelled: 2 }
const CANCEL_CODES: Record<string, number> = {
  none: 0,
  insufficientParticipants: 1,
  staleDeadlinePrice: 2,
  resolutionWindowExpired: 3,
}
const CATEGORY_CODES: Record<string, number> = { stock: 0, meme: 1, crypto: 2 }

/** A view model joined with the clock-dependent phase. The base model holds
 * only account state; pages add `phase` with the cluster-anchored clock so a
 * cached decode can never serve a stale LOBBY/RUNNING. */
export type PriceArenaWithPhase = PriceArenaViewModel & { phase: number }

export function arenaPhase(status: number, startsAt: bigint, nowSec: number) {
  if (status === PRICE_ARENA_STATUS.RESOLVED) return PRICE_ARENA_PHASE.RESOLVED
  if (status === PRICE_ARENA_STATUS.CANCELLED) return PRICE_ARENA_PHASE.CANCELLED
  return BigInt(Math.floor(nowSec)) < startsAt ? PRICE_ARENA_PHASE.LOBBY : PRICE_ARENA_PHASE.RUNNING
}

export function arenaFromServer(a: ServerArena): PriceArenaViewModel {
  const status = STATUS_CODES[a.status] ?? PRICE_ARENA_STATUS.UNKNOWN
  const startsAt = big(a.startsAt)
  const priceSource = a.priceSource
  const asset = priceArenaAssetForPool(priceSource)
  const symbol = asset?.symbol ?? a.symbol
  const paid = new Set(a.payouts.filter((p) => p.status === 'done' && (p.kind === 'win' || p.kind === 'refund')).map((p) => p.wallet))
  return {
    id: big(a.id),
    address: a.address,
    assetId: asset?.assetId ?? assetIdHexForSymbol(symbol),
    symbol,
    priceSource,
    creator: a.creator,
    stakeMint: a.stakeMint,
    priceDecimals: a.priceDecimals,
    category: CATEGORY_CODES[a.category] ?? 0,
    status,
    cancelReason: CANCEL_CODES[a.cancelReason] ?? 0,
    createdAt: big(a.createdAt),
    startsAt,
    deadline: big(a.deadline),
    resolvedAt: big(a.resolvedAt),
    duration: a.duration,
    participantCount: a.entries.length,
    winnerCount: a.winnerCount,
    feeBp: a.feeBp,
    minStake: big(a.minStake),
    maxStake: big(a.maxStake),
    totalPool: big(a.totalPool),
    finalPrice: big(a.finalPrice),
    finalUpdatedAt: big(a.finalPriceTime),
    protocolFee: big(a.protocolFee),
    creatorFee: big(a.creatorFee),
    remainingLiability: big(a.remainingLiability),
    title: a.title,
    entries: a.entries.map((entry) => ({
      player: entry.player,
      prediction: big(entry.prediction),
      stake: big(entry.stake),
      predictionUpdatedAt: big(entry.predictionUpdatedAt),
      predictionSeq: entry.predictionSeq,
      payout: big(entry.payout),
      rank: entry.rank,
      accuracyMultiplierBp: entry.accuracyMultiplierBp,
      exists: true,
      // Paid out or refunded; a losing entry has nothing to settle.
      settled: paid.has(entry.player) || (status === PRICE_ARENA_STATUS.RESOLVED && big(entry.payout) === 0n),
    })),
    payouts: a.payouts.map(payoutFromServer),
    unit: a.unit === 'cap' ? 'cap' : 'price',
    asset,
  }
}
