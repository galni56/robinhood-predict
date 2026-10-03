import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ASSET_RACE_CATEGORY,
  STAKE_DECIMALS,
  ASSET_RACE_ORIGIN,
  ASSET_RACE_STATUS,
  assetRaceStatusLabel,
  formatPoolShare,
  formatStakeRaw,
  type AssetRaceViewModel,
  type AssetRaceMode,
} from '@/chain/assetRaces'
import { useAssetRaces } from '@/chain/useAssetRaces'
import { useAssetRaceClock } from '@/chain/useAssetRaceClock'
import { isPlayedCancellation, isVisibleInAll } from '@/chain/gameVisibility'
import { CRYPTO_ASSETS_ENABLED } from '@/chain/features'
import { priceSourceUrlForAssetId } from '@/chain/assetRaceRegistry'
import { AddressLabel } from '@/components/AddressLabel'
import { FilterChips, GAME_MODE_CHIP_OPTIONS } from '@/components/FilterChips'
import { ClusterBanner } from '@/components/ClusterBanner'
import { ClockIcon } from '@/components/icons'
import { GameActivitySidebar } from '@/components/GameActivitySidebar'
import { GameListLoadingGrid } from '@/components/GameListLoadingGrid'
import { PriceSourceLink } from '@/components/PriceSourceLink'
import { TokenLogo } from '@/components/TokenLogo'
import { formatCountdown } from '@/lib/format'

const FILTERS = ['ALL', 'LOBBY', 'BETTING', 'RUNNING', 'FINISHED', 'CANCELLED'] as const
type RaceFilter = (typeof FILTERS)[number]

function filterLabel(filter: RaceFilter) {
  return filter.charAt(0) + filter.slice(1).toLowerCase()
}

const FILTER_OPTIONS = FILTERS.map((filter) => ({ key: filter, label: filterLabel(filter) }))

function raceTargetTime(race: AssetRaceViewModel) {
  if (race.status === ASSET_RACE_STATUS.LOBBY) return race.lobbyEndTime
  if (race.status === ASSET_RACE_STATUS.BETTING) return race.bettingEndTime
  if (race.status === ASSET_RACE_STATUS.RUNNING) return race.raceEndTime
  return 0n
}

function raceCta(status: number) {
  if (status === ASSET_RACE_STATUS.LOBBY) return 'View lobby'
  if (status === ASSET_RACE_STATUS.BETTING) return 'Bet now'
  if (status === ASSET_RACE_STATUS.RUNNING) return 'Watch race'
  return 'View results'
}

function raceClock(race: AssetRaceViewModel, nowMs: number) {
  const target = raceTargetTime(race)
  if (target === 0n) return 'finished'
  if (nowMs === 0) return '…'
  if (Number(target) * 1_000 > nowMs) return formatCountdown(Number(target) * 1_000 - nowMs)
  if (race.status === ASSET_RACE_STATUS.LOBBY) return 'ready'
  if (race.status === ASSET_RACE_STATUS.BETTING) return 'closed'
  return 'resolve'
}

function statusChipClass(status: number) {
  if (status === ASSET_RACE_STATUS.BETTING) return 'bg-[#F2A65A]/15 text-[#F2A65A]'
  if (status === ASSET_RACE_STATUS.RUNNING) return 'bg-[#F2A65A]/15 text-[#F2A65A]'
  if (status === ASSET_RACE_STATUS.LOBBY) return 'bg-[#f7f1e3]/10 text-[#f7f1e3]/80'
  return 'bg-white/10 text-white/50'
}

function RaceCard({ race, nowMs, tokenDecimals }: { race: AssetRaceViewModel; nowMs: number; tokenDecimals: number }) {
  const navigate = useNavigate()
  const topBacked = [...race.assets].sort((a, b) => (a.pool > b.pool ? -1 : a.pool < b.pool ? 1 : 0))[0]
  const platform = race.origin === ASSET_RACE_ORIGIN.PLATFORM
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open ${race.title || `race #${race.id.toString()}`}`}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a, button')) return
        navigate(`/onchain/races/${race.id}`)
      }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          navigate(`/onchain/races/${race.id}`)
        }
      }}
      className="group flex cursor-pointer flex-col rounded-3xl border border-white/5 bg-[#241b2f] p-5 transition-all hover:-translate-y-0.5 hover:border-[#F2A65A]/40 hover:shadow-[0_24px_50px_-30px_rgba(237,143,58,0.7)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
            <span className={`rounded-full px-2.5 py-1 ${platform ? 'bg-[#F2A65A]/15 text-[#F2A65A]' : 'bg-white/5 text-white/50'}`}>
              {platform ? 'Featured' : 'Community'}
            </span>
            <span className={`rounded-full px-2.5 py-1 ${statusChipClass(race.status)}`}>{assetRaceStatusLabel(race.status)}</span>
          </div>
          <h2 className="mt-2.5 truncate font-display text-xl font-bold leading-snug">
            {race.title || race.assets.map((asset) => asset.symbol).join(' · ')}
          </h2>
          <div className="mt-0.5 text-xs font-medium text-white/35">
            #{race.id.toString()} · {Math.round(Number(race.raceDuration) / 60)}m race
            {!platform && (
              <>
                {' '}
                · by <AddressLabel address={race.creator} className="text-white/50" />
              </>
            )}
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 pt-1 text-xs font-bold text-white/40">
          <ClockIcon className="h-3.5 w-3.5" />
          {raceClock(race, nowMs)}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {race.assets.map((asset) => (
          <span key={asset.assetIndex} className="inline-flex items-center gap-1.5 rounded-full bg-white/5 py-1 pl-1 pr-2.5 text-xs font-bold">
            <TokenLogo ticker={asset.symbol} className="h-5 w-5 rounded-md" />
            {asset.symbol}
          </span>
        ))}
        {race.status === ASSET_RACE_STATUS.LOBBY && (
          <span className="rounded-full border border-dashed border-white/15 px-2.5 py-1 text-xs font-medium text-white/35">
            {race.assets.length} / 6
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Asset price charts">
        {race.assets.map((asset) => (
          <PriceSourceLink
            key={asset.assetIndex}
            href={priceSourceUrlForAssetId(asset.assetId)}
            symbol={asset.symbol}
            tone="race"
            label={`${asset.symbol} chart`}
            className="bg-[#F2A65A]/10 px-2.5 py-1 text-[10px]"
          />
        ))}
      </div>

      {race.status !== ASSET_RACE_STATUS.LOBBY && (
        <div className="mt-4 space-y-2">
          {race.assets.map((asset) => (
            <div key={asset.assetIndex} className="grid grid-cols-[5rem_1fr_auto] items-center gap-2 text-xs">
              <span className="flex items-center gap-1.5 font-bold"><TokenLogo ticker={asset.symbol} className="h-5 w-5 rounded-md" />{asset.symbol}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-[#F2A65A]"
                  style={{ width: formatPoolShare(asset.pool, race.totalPool) }}
                />
              </div>
              <span className="w-14 text-right font-mono text-white/40">{formatPoolShare(asset.pool, race.totalPool)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/5 pt-4 text-xs">
        <span className="truncate font-medium text-white/35">
          {race.status === ASSET_RACE_STATUS.LOBBY
            ? 'Betting has not started'
            : topBacked && race.totalPool > 0n
              ? `${formatStakeRaw(race.totalPool, tokenDecimals)} pool · ${topBacked.symbol} leads the backing`
              : 'Waiting for the first bet'}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-[#F2A65A]">
          {raceCta(race.status)}
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </span>
      </div>
    </div>
  )
}

export function OnchainRacesListPage() {
  const { races, isLoading, error } = useAssetRaces()
  const tokenDecimals = STAKE_DECIMALS
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedMode = searchParams.get('mode')
  const mode: AssetRaceMode = requestedMode === 'memes' || (CRYPTO_ASSETS_ENABLED && requestedMode === 'crypto')
    ? requestedMode
    : 'stocks'
  const category = mode === 'memes'
    ? ASSET_RACE_CATEGORY.MEME
    : mode === 'crypto'
      ? ASSET_RACE_CATEGORY.CRYPTO
      : ASSET_RACE_CATEGORY.STOCK
  const [filter, setFilter] = useState<RaceFilter>('ALL')
  const raceNowMs = useAssetRaceClock()

  const filtered = races.filter((race) => {
    if (race.category !== category) return false
    if (filter === 'ALL') return isVisibleInAll(race.status, ASSET_RACE_STATUS.CANCELLED, race.totalPool)
    if (filter === 'LOBBY') return race.status === ASSET_RACE_STATUS.LOBBY
    if (filter === 'BETTING') return race.status === ASSET_RACE_STATUS.BETTING
    if (filter === 'RUNNING') return race.status === ASSET_RACE_STATUS.RUNNING
    if (filter === 'FINISHED') return race.status === ASSET_RACE_STATUS.RESOLVED
    return race.status === ASSET_RACE_STATUS.VOID
      || isPlayedCancellation(race.status, ASSET_RACE_STATUS.CANCELLED, race.totalPool)
  })
  const featured = filtered.filter((race) => race.origin === ASSET_RACE_ORIGIN.PLATFORM)
  const community = filtered
    .filter((race) => race.origin === ASSET_RACE_ORIGIN.COMMUNITY)
    .sort((a, b) => (a.totalPool > b.totalPool ? -1 : a.totalPool < b.totalPool ? 1 : Number(b.id - a.id)))
  const modeRaceCount = races.filter((race) => race.category === category).length

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8">
      <ClusterBanner />

      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="mb-1 text-sm font-bold text-[#F2A65A]">
            Prophet races · {modeRaceCount} {mode === 'memes' ? 'meme' : mode === 'crypto' ? 'crypto' : 'stock'} race{modeRaceCount === 1 ? '' : 's'}
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {mode === 'memes' ? 'Pick the meme that moons.' : mode === 'crypto' ? 'BTC, SOL or ETH. Back the move.' : 'Back the fastest asset.'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/50">
            {mode === 'memes'
              ? 'Reviewed Solana memes. The same transparent P0 to P1 race engine, with more chaos in the paint.'
              : mode === 'crypto'
                ? 'Race the majors using USD prices from reviewed, liquid Solana DEX pools.'
                : 'Featured races concentrate liquidity. Community races let wallets assemble an approved tokenized-stock grid before betting begins.'}
          </p>
        </div>
        <Link
          to={`/onchain/races/create${mode === 'stocks' ? '' : `?mode=${mode}`}`}
          className="inline-flex shrink-0 items-center gap-2.5 rounded-full bg-gradient-to-r from-[#F2A65A] to-[#ED8F3A] py-2 pl-5 pr-2 text-sm font-bold text-[#3b2416] shadow-[0_10px_28px_-10px_rgba(237,143,58,0.8)] transition-all hover:brightness-110"
        >
          Create {mode === 'memes' ? 'meme' : mode === 'crypto' ? 'crypto' : 'stock'} race
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#3b2416]/15 text-xs">↗</span>
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-y-3">
        <FilterChips
          size="sm"
          options={GAME_MODE_CHIP_OPTIONS}
          value={mode}
          onChange={(item) => setSearchParams(item === 'stocks' ? {} : { mode: item })}
        />
        <FilterChips options={FILTER_OPTIONS} value={filter} onChange={setFilter} accent="race" className="overflow-x-auto pb-1" />
      </div>

      <div className="flex items-start gap-6">
        <main className="min-h-[32rem] min-w-0 flex-1">
      {isLoading && featured.length === 0 && community.length === 0 ? (
        <GameListLoadingGrid accent="orange" />
      ) : error && featured.length === 0 && community.length === 0 ? (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-5 text-sm text-rose-300">Could not read the AssetRace contract.</div>
      ) : featured.length === 0 && community.length === 0 ? (
        <p className="py-16 text-center text-sm text-white/35">No {mode === 'memes' ? 'meme' : mode === 'crypto' ? 'crypto' : 'stock'} races match this filter.</p>
      ) : (
        <div className="space-y-10">
          {featured.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-lg font-bold">
                Featured races <span className="font-sans text-sm font-bold text-white/35">· by Prophet</span>
              </h2>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {featured.map((race) => (
                  <RaceCard key={race.id.toString()} race={race} nowMs={raceNowMs} tokenDecimals={tokenDecimals} />
                ))}
              </div>
            </section>
          )}
          {community.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-lg font-bold">
                Community races <span className="font-sans text-sm font-bold text-white/35">· created by wallets</span>
              </h2>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {community.map((race) => (
                  <RaceCard key={race.id.toString()} race={race} nowMs={raceNowMs} tokenDecimals={tokenDecimals} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <p className="mt-8 text-xs text-white/30">Crowd backing shows pool share, not probability or guaranteed odds.</p>
        </main>
        <aside className="sticky top-20 hidden w-72 shrink-0 lg:block">
          <GameActivitySidebar kind="race" />
        </aside>
      </div>
    </div>
  )
}
