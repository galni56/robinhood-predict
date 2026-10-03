import { useMemo } from 'react'
import type { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { usePrograms } from '@/solana/programs'
import { creatorEarningsPda } from '@/solana/pda'
import { NATIVE_SOL } from '@/solana/config'
import {
  ASSET_RACE_STATUS,
  resolvedPositionPayout,
  type AssetRacePosition,
  type AssetRaceViewModel,
} from '@/chain/assetRaces'
import { PRICE_ARENA_STATUS, type PriceArenaEntry, type PriceArenaViewModel } from '@/chain/priceArena'
import { useAssetRaces } from '@/chain/useAssetRaces'
import { usePriceArenas } from '@/chain/usePriceArenas'

// Position account layout: 8-byte discriminator, race (32), owner (32).
const POSITION_OWNER_OFFSET = 40

export type WalletGameAction = 'claim' | 'refund' | 'closeLosing' | 'none'

export interface WalletRacePosition {
  race: AssetRaceViewModel
  position: AssetRacePosition
  action: WalletGameAction
  /** What the action returns (payout, refund); 0 for a losing close. */
  amount: bigint
  inPlay: boolean
}

export interface WalletArenaEntry {
  arena: PriceArenaViewModel
  entry: PriceArenaEntry
  action: WalletGameAction
  amount: bigint
  inPlay: boolean
}

function raceAction(race: AssetRaceViewModel, position: AssetRacePosition): Pick<WalletRacePosition, 'action' | 'amount' | 'inPlay'> {
  if (race.status === ASSET_RACE_STATUS.RESOLVED) {
    return position.assetIndex === race.winningAssetIndex
      ? { action: 'claim', amount: resolvedPositionPayout(race, position), inPlay: false }
      : { action: 'closeLosing', amount: 0n, inPlay: false }
  }
  if (race.status === ASSET_RACE_STATUS.CANCELLED || race.status === ASSET_RACE_STATUS.VOID) {
    return { action: 'refund', amount: position.stake, inPlay: false }
  }
  return { action: 'none', amount: 0n, inPlay: true }
}

function arenaAction(arena: PriceArenaViewModel, entry: PriceArenaEntry): Pick<WalletArenaEntry, 'action' | 'amount' | 'inPlay'> {
  if (arena.status === PRICE_ARENA_STATUS.OPEN) return { action: 'none', amount: 0n, inPlay: true }
  if (entry.settled) return { action: 'none', amount: 0n, inPlay: false }
  if (arena.status === PRICE_ARENA_STATUS.CANCELLED) return { action: 'refund', amount: entry.stake, inPlay: false }
  return entry.payout > 0n ? { action: 'claim', amount: entry.payout, inPlay: false } : { action: 'none', amount: 0n, inPlay: false }
}

/** The wallet's open race positions (accounts close on claim/refund), its
 * arena entries, and its SOL creator earnings. */
export function useWalletGames(wallet?: PublicKey | null) {
  const { games } = usePrograms()
  const { races, isLoading: racesLoading } = useAssetRaces()
  const { arenas, isLoading: arenasLoading } = usePriceArenas()
  const owner = wallet?.toBase58()

  const positions = useQuery({
    queryKey: ['wallet-positions', games.programId.toBase58(), owner],
    queryFn: () => games.account.position.all([{ memcmp: { offset: POSITION_OWNER_OFFSET, bytes: owner! } }]),
    enabled: !!owner,
    refetchInterval: 15_000,
  })
  const earnings = useQuery({
    queryKey: ['creator-earnings', games.programId.toBase58(), owner],
    queryFn: async () => {
      const account = await games.account.creatorEarnings.fetchNullable(creatorEarningsPda(NATIVE_SOL, wallet!))
      return account ? { amount: BigInt(account.amount.toString()), totalEarned: BigInt(account.totalEarned.toString()) } : null
    },
    enabled: !!owner,
    refetchInterval: 30_000,
  })

  const racePositions = useMemo<WalletRacePosition[]>(() => {
    const byAddress = new Map(races.map((race) => [race.address, race]))
    return (positions.data ?? []).flatMap(({ account }) => {
      const race = byAddress.get(account.race.toBase58())
      if (!race) return []
      const position: AssetRacePosition = { stake: BigInt(account.stake.toString()), assetIndex: account.assetIndex, exists: true, settled: false }
      return [{ race, position, ...raceAction(race, position) }]
    }).sort((a, b) => (a.race.id > b.race.id ? -1 : 1))
  }, [positions.data, races])

  const arenaEntries = useMemo<WalletArenaEntry[]>(() => (owner ? arenas.flatMap((arena) => {
    const entry = arena.entries.find((item) => item.player === owner)
    return entry ? [{ arena, entry, ...arenaAction(arena, entry) }] : []
  }) : []), [arenas, owner])

  return {
    racePositions,
    arenaEntries,
    creatorEarnings: earnings.data ?? undefined,
    isLoading: !!owner && (positions.isLoading || racesLoading || arenasLoading),
    error: positions.error ?? earnings.error,
    refetch: async () => { await Promise.all([positions.refetch(), earnings.refetch()]) },
  }
}
