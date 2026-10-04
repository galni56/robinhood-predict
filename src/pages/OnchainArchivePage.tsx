import { Link, useSearchParams } from 'react-router-dom'
import {
  ASSET_RACE_STATUS,
  assetRaceCategoryLabel,
  assetRaceStatusLabel,
  formatReturnWad,
} from '@/chain/assetRaces'
import { isPlayedCancellation } from '@/chain/gameVisibility'
import { PRICE_ARENA_CATEGORY, PRICE_ARENA_STATUS, arenaDurationLabel } from '@/chain/priceArena'
import { useAssetRaces } from '@/chain/useAssetRaces'
import { usePriceArenas } from '@/chain/usePriceArenas'
import { ClusterBanner } from '@/components/ClusterBanner'
import { FilterChips } from '@/components/FilterChips'
import { TokenLogo } from '@/components/TokenLogo'
import { formatUnits, formatUsdPrice } from '@/lib/format'
import { formatStakeAmount, useStakeTokenLookup } from '@/solana/stakeTokens'

type ArchiveMode = 'races' | 'arenas'

const MODE_OPTIONS = [
  { key: 'races', label: 'Asset Races', accent: 'race' },
  { key: 'arenas', label: 'Price Arena', accent: 'arena' },
] as const

function dateLabel(seconds: bigint) {
  return seconds > 0n ? new Date(Number(seconds) * 1000).toLocaleString() : '—'
}

/** Finished games: settled ones, voided races, and cancellations that had
 * real stakes in them (empty cancelled lobbies are not history). */
export function OnchainArchivePage() {
  const [params, setParams] = useSearchParams()
  const mode: ArchiveMode = params.get('mode') === 'arenas' ? 'arenas' : 'races'
  const races = useAssetRaces()
  const arenas = usePriceArenas()
  const tokenOf = useStakeTokenLookup()

  const finishedRaces = races.races.filter((race) => (
    race.status === ASSET_RACE_STATUS.RESOLVED
      || race.status === ASSET_RACE_STATUS.VOID
      || isPlayedCancellation(race.status, ASSET_RACE_STATUS.CANCELLED, race.totalPool)
  ))
  const finishedArenas = arenas.arenas.filter((arena) => (
    arena.status === PRICE_ARENA_STATUS.RESOLVED
      || isPlayedCancellation(arena.status, PRICE_ARENA_STATUS.CANCELLED, arena.totalPool)
  ))
  const loading = mode === 'races' ? races.isLoading : arenas.isLoading
  const loadError = mode === 'races' ? races.error : arenas.error

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8">
      <ClusterBanner />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Archive</h1>
          <p className="mt-2 text-sm text-[#1B1340]/55">Every finished game with its final result. Results are read from the program accounts.</p>
        </div>
        <FilterChips options={MODE_OPTIONS} value={mode} onChange={(next) => setParams(next === 'races' ? {} : { mode: next })} />
      </div>

      <div className="mt-6 space-y-2">
        {loading ? <p className="py-10 text-center text-sm text-[#1B1340]/55">Loading history…</p>
          : loadError ? <p className="py-10 text-center text-sm text-[#C2245A]">Could not load finished games. Refresh to retry.</p>
          : mode === 'races' ? (
            finishedRaces.length === 0 ? <p className="py-10 text-center text-sm text-[#1B1340]/55">No finished races yet.</p>
              : finishedRaces.map((race) => {
                const winner = race.status === ASSET_RACE_STATUS.RESOLVED ? race.assets[race.winningAssetIndex] : undefined
                return (
                  <Link key={race.address} to={`/onchain/races/${race.id}`} className="flex flex-wrap items-center gap-3 rounded-none border border-[#1B1340]/12 bg-[#FFF6DF] px-4 py-3 transition-colors hover:border-[#ffd23f]/40">
                    <div className="flex shrink-0 -space-x-2">
                      {race.assets.slice(0, 4).map((asset) => <TokenLogo key={asset.assetIndex} ticker={asset.symbol} className="h-8 w-8 rounded-none border-2 border-[#221c40]" />)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{race.title || race.assets.map((asset) => asset.symbol).join(' vs ')}</div>
                      <div className="truncate text-xs text-[#B8860B]">{assetRaceCategoryLabel(race.category)} race #{race.id.toString()} · {dateLabel(race.resolvedAt || race.raceEndTime)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold">{winner ? <>{winner.symbol} <span className="font-mono text-emerald-300">{formatReturnWad(winner.returnValue)}</span></> : assetRaceStatusLabel(race.status)}</div>
                      <div className="font-mono text-xs text-[#1B1340]/55">{formatStakeAmount(race.totalPool, tokenOf(race.stakeMint))} pool</div>
                    </div>
                  </Link>
                )
              })
          ) : (
            finishedArenas.length === 0 ? <p className="py-10 text-center text-sm text-[#1B1340]/55">No finished arenas yet.</p>
              : finishedArenas.map((arena) => {
                const resolved = arena.status === PRICE_ARENA_STATUS.RESOLVED
                const category = arena.category === PRICE_ARENA_CATEGORY.MEME ? 'Meme' : arena.category === PRICE_ARENA_CATEGORY.CRYPTO ? 'Crypto' : 'Stock'
                return (
                  <Link key={arena.address} to={`/onchain/arenas/${arena.id}`} className="flex flex-wrap items-center gap-3 rounded-none border border-[#1B1340]/12 bg-[#FFF6DF] px-4 py-3 transition-colors hover:border-[#6bcbf4]/40">
                    <TokenLogo ticker={arena.symbol} className="h-8 w-8 shrink-0 rounded-none" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{arena.title}</div>
                      <div className="truncate text-xs text-[#1F7FD1]">{category} arena #{arena.id.toString()} · {arena.symbol} · {arenaDurationLabel(arena.duration)} · {dateLabel(arena.resolvedAt || arena.deadline)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold">
                        {resolved
                          ? <>Final <span className="font-mono">{formatUsdPrice(Number(formatUnits(arena.finalPrice, arena.priceDecimals)))}</span> · {arena.winnerCount} of {arena.participantCount} won</>
                          : 'Cancelled · refunded'}
                      </div>
                      <div className="font-mono text-xs text-[#1B1340]/55">{formatStakeAmount(arena.totalPool, tokenOf(arena.stakeMint))} pool</div>
                    </div>
                  </Link>
                )
              })
          )}
      </div>
    </div>
  )
}
