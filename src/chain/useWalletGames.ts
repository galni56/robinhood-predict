import { useMemo } from 'react'
import type { PublicKey } from '@solana/web3.js'
import {
  ASSET_RACE_STATUS,
  payoutFor,
  positionFor,
  type AssetRacePosition,
  type AssetRaceViewModel,
  type RacePayout,
} from '@/chain/assetRaces'
import { PRICE_ARENA_STATUS, type PriceArenaEntry, type PriceArenaViewModel } from '@/chain/priceArena'
import { useServerWallet } from '@/chain/gameServer'
import { useAssetRaces } from '@/chain/useAssetRaces'
import { usePriceArenas } from '@/chain/usePriceArenas'

/** Where the wallet's stake stands: still playing, paid, being paid, lost. */
export type WalletGameOutcome = 'playing' | 'paid' | 'paying' | 'refunded' | 'refunding' | 'lost'

export interface WalletRacePosition {
  race: AssetRaceViewModel
  position: AssetRacePosition
  payout?: RacePayout
  outcome: WalletGameOutcome
  /** Payout or refund amount (0 for a loss or while playing). */
  amount: bigint
  inPlay: boolean
}

export interface WalletArenaEntry {
  arena: PriceArenaViewModel
  entry: PriceArenaEntry
  payout?: RacePayout
  outcome: WalletGameOutcome
  amount: bigint
  inPlay: boolean
}

function outcomeOf(final: boolean, payout?: RacePayout): Pick<WalletRacePosition, 'outcome' | 'amount' | 'inPlay'> {
  if (!final) return { outcome: 'playing', amount: 0n, inPlay: true }
  if (!payout) return { outcome: 'lost', amount: 0n, inPlay: false }
  const done = payout.status === 'done'
  if (payout.kind === 'refund') return { outcome: done ? 'refunded' : 'refunding', amount: payout.amount, inPlay: false }
  return { outcome: done ? 'paid' : 'paying', amount: payout.amount, inPlay: false }
}

/** The wallet's race positions and arena entries with their payouts, and
 * the creator fees the game server sent it. */
export function useWalletGames(wallet?: PublicKey | null) {
  const { races, isLoading: racesLoading, error: racesError, refetch: refetchRaces } = useAssetRaces()
  const { arenas, isLoading: arenasLoading, error: arenasError, refetch: refetchArenas } = usePriceArenas()
  const owner = wallet?.toBase58()
  const history = useServerWallet(owner)

  const racePositions = useMemo<WalletRacePosition[]>(() => (owner ? races.flatMap((race) => {
    const position = positionFor(race, owner)
    if (!position) return []
    const final = race.status === ASSET_RACE_STATUS.RESOLVED || race.status === ASSET_RACE_STATUS.CANCELLED || race.status === ASSET_RACE_STATUS.VOID
    const payout = payoutFor(race, owner)
    return [{ race, position, payout, ...outcomeOf(final, payout) }]
  }) : []), [owner, races])

  const arenaEntries = useMemo<WalletArenaEntry[]>(() => (owner ? arenas.flatMap((arena) => {
    const entry = arena.entries.find((item) => item.player === owner)
    if (!entry) return []
    const payout = arena.payouts.find((p) => p.wallet === owner && (p.kind === 'win' || p.kind === 'refund'))
    return [{ arena, entry, payout, ...outcomeOf(arena.status !== PRICE_ARENA_STATUS.OPEN, payout) }]
  }) : []), [arenas, owner])

  const creatorEarnings = useMemo(() => {
    const paid = (history.data?.payouts ?? []).filter((p) => p.kind === 'creator')
    if (paid.length === 0) return undefined
    const sum = (rows: typeof paid) => rows.reduce((total, p) => total + BigInt(p.amount), 0n)
    return { pending: sum(paid.filter((p) => p.status !== 'done')), totalEarned: sum(paid.filter((p) => p.status === 'done')) }
  }, [history.data])

  return {
    racePositions,
    arenaEntries,
    creatorEarnings,
    isLoading: !!owner && (racesLoading || arenasLoading),
    error: racesError ?? arenasError,
    refetch: async () => { await Promise.all([refetchRaces(), refetchArenas(), history.refetch()]) },
  }
}
