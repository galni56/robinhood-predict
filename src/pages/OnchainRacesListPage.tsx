import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { isLocalAssetRace } from '@/chain/config'
import {
  ASSET_RACE_CONFIG_ERROR,
  ASSET_RACE_CATEGORY,
  ASSET_RACE_ORIGIN,
  ASSET_RACE_STATUS,
  ASSET_RACE_TOKEN_LABEL,
  assetRaceStatusLabel,
  formatPoolShare,
  formatStakeRaw,
  type AssetRaceViewModel,
  type AssetRaceMode,
} from '@/chain/assetRaces'
import { useAssetRaces } from '@/chain/useAssetRaces'
import { useAssetRaceClock } from '@/chain/useAssetRaceClock'
import { AddressLabel } from '@/components/AddressLabel'
import { ClockIcon } from '@/components/icons'
import { GameActivitySidebar } from '@/components/GameActivitySidebar'
import { TokenLogo } from '@/components/TokenLogo'
import { formatCountdown } from '@/lib/format'

const FILTERS = ['ALL', 'LOBBY', 'BETTING', 'RUNNING', 'FINISHED'] as const
type RaceFilter = (typeof FILTERS)[number]

function filterLabel(filter: RaceFilter) {
  return filter.charAt(0) + filter.slice(1).toLowerCase()
}

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
  if (status === ASSET_RACE_STATUS.BETTING) return 'bg-[#8B7CF7]/15 text-[#B3A7FA]'
  if (status === ASSET_RACE_STATUS.RUNNING) return 'bg-[#F2A65A]/15 text-[#F2A65A]'
  if (status === ASSET_RACE_STATUS.LOBBY) return 'bg-[#f7f1e3]/10 text-[#f7f1e3]/80'
  return 'bg-white/10 text-white/50'
}

function RaceCard({ race, nowMs, tokenDecimals }: { race: AssetRaceViewModel; nowMs: number; tokenDecimals: number }) {
  const topBacked = [...race.assets].sort((a, b) => (a.pool > b.pool ? -1 : a.pool < b.pool ? 1 : 0))[0]
  const platform = race.origin === ASSET_RACE_ORIGIN.PLATFORM
  const meme = race.category === ASSET_RACE_CATEGORY.MEME
  const accentText = meme ? 'text-[#F2A65A]' : 'text-[#B3A7FA]'
  return (
    <Link
      to={`/onchain/races/${race.id}`}
      className={`group flex flex-col rounded-3xl border border-white/5 bg-[#241b2f] p-5 transition-all hover:-translate-y-0.5 ${
        meme
          ? 'hover:border-[#F2A65A]/40 hover:shadow-[0_24px_50px_-30px_rgba(237,143,58,0.7)]'
          : 'hover:border-[#8B7CF7]/40 hover:shadow-[0_24px_50px_-30px_rgba(106,90,224,0.7)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
            <span className={`rounded-full px-2.5 py-1 ${platform ? (meme ? 'bg-[#F2A65A]/15 text-[#F2A65A]' : 'bg-[#8B7CF7]/15 text-[#B3A7FA]') : 'bg-white/5 text-white/50'}`}>
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
                · by <AddressLabel address={race.creator} link={!isLocalAssetRace} className="text-white/50" />
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

      {race.status !== ASSET_RACE_STATUS.LOBBY && (
        <div className="mt-4 space-y-2">
          {race.assets.map((asset) => (
            <div key={asset.assetIndex} className="grid grid-cols-[5rem_1fr_auto] items-center gap-2 text-xs">
              <span className="flex items-center gap-1.5 font-bold"><TokenLogo ticker={asset.symbol} className="h-5 w-5 rounded-md" />{asset.symbol}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                <div
                  className={`h-full rounded-full ${meme ? 'bg-[#F2A65A]' : 'bg-[#8B7CF7]'}`}
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
        <span className={`inline-flex shrink-0 items-center gap-1.5 text-sm font-bold ${accentText}`}>
          {raceCta(race.status)}
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </span>
      </div>
    </Link>
  )
}

export function OnchainRacesListPage() {
  const { races, isPreview, tokenDecimals, isLoading, error } = useAssetRaces()
  const [searchParams, setSearchParams] = useSearchParams()
  const mode: AssetRaceMode = searchParams.get('mode') === 'memes' ? 'memes' : 'stocks'
  const category = mode === 'memes' ? ASSET_RACE_CATEGORY.MEME : ASSET_RACE_CATEGORY.STOCK
  const [filter, setFilter] = useState<RaceFilter>('ALL')
  const raceNowMs = useAssetRaceClock()

  const filtered = races.filter((race) => {
    if (race.category !== category) return false
    if (filter === 'ALL') return true
    if (filter === 'LOBBY') return race.status === ASSET_RACE_STATUS.LOBBY
    if (filter === 'BETTING') return race.status === ASSET_RACE_STATUS.BETTING
    if (filter === 'RUNNING') return race.status === ASSET_RACE_STATUS.RUNNING
    return race.status === ASSET_RACE_STATUS.RESOLVED || race.status === ASSET_RACE_STATUS.CANCELLED || race.status === ASSET_RACE_STATUS.VOID
  })
  const featured = filtered.filter((race) => race.origin === ASSET_RACE_ORIGIN.PLATFORM)
  const community = filtered
    .filter((race) => race.origin === ASSET_RACE_ORIGIN.COMMUNITY)
    .sort((a, b) => (a.totalPool > b.totalPool ? -1 : a.totalPool < b.totalPool ? 1 : Number(b.id - a.id)))
  const modeRaceCount = races.filter((race) => race.category === category).length

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8">
      {isPreview ? (
        <div className="mb-6 rounded-2xl border border-[#F2A65A]/25 bg-[#F2A65A]/10 px-4 py-3 text-sm font-medium text-[#F2A65A]">
          Preview data - AssetRace is not deployed or configured, so these cards are local examples and cannot send transactions.
          {ASSET_RACE_CONFIG_ERROR && <span className="mt-1 block text-rose-300">{ASSET_RACE_CONFIG_ERROR}</span>}
        </div>
      ) : (
        <div className="mb-6 rounded-2xl border border-[#8B7CF7]/25 bg-[#8B7CF7]/10 px-4 py-3 text-sm font-medium text-[#B3A7FA]">
          {isLocalAssetRace
            ? 'Local test network - races use Anvil and local ETH, no real funds.'
            : `Races are read from the configured contract. Live prices are display-only; settlement stays onchain. Pools use ${ASSET_RACE_TOKEN_LABEL}.`}
        </div>
      )}

      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className={`mb-1 text-sm font-bold ${mode === 'memes' ? 'text-[#F2A65A]' : 'text-[#B3A7FA]'}`}>
            Prophet races · {modeRaceCount} {isPreview ? 'preview' : mode === 'memes' ? 'meme' : 'stock'} race{modeRaceCount === 1 ? '' : 's'}
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {mode === 'memes' ? 'Pick the meme that moons.' : 'Back the fastest asset.'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/50">
            {mode === 'memes'
              ? 'Curated demo memes. The same transparent P0 to P1 race engine, with more chaos in the paint.'
              : 'Featured races concentrate liquidity. Community races let wallets assemble an approved Stock Token grid before betting begins.'}
          </p>
        </div>
        <Link
          to={`/onchain/races/create${mode === 'memes' ? '?mode=memes' : ''}`}
          className={`inline-flex shrink-0 items-center gap-2.5 rounded-full py-2 pl-5 pr-2 text-sm font-bold text-white transition-all hover:brightness-110 ${
            mode === 'memes'
              ? 'bg-gradient-to-r from-[#F2A65A] to-[#ED8F3A] text-[#3b2416] shadow-[0_10px_28px_-10px_rgba(237,143,58,0.8)]'
              : 'bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] shadow-[0_10px_28px_-10px_rgba(106,90,224,0.8)]'
          }`}
        >
          Create {mode === 'memes' ? 'meme' : 'stock'} race
          <span className={`grid h-7 w-7 place-items-center rounded-full text-xs ${mode === 'memes' ? 'bg-[#3b2416]/15' : 'bg-white/20'}`}>↗</span>
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-y-3">
        <div className="flex gap-1.5">
          {(['stocks', 'memes'] as const).map((item) => (
            <button
              key={item}
              onClick={() => setSearchParams(item === 'memes' ? { mode: 'memes' } : {})}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
                mode === item
                  ? item === 'memes'
                    ? 'bg-[#F2A65A] text-[#3b2416]'
                    : 'bg-[#f7f1e3] text-[#241a33]'
                  : 'text-white/50 hover:bg-white/5 hover:text-white'
              }`}
            >
              {item === 'stocks' ? 'Stocks' : 'Memes'}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                filter === item ? 'bg-[#8B7CF7] text-[#f7f1e3]' : 'text-white/50 hover:bg-white/5 hover:text-white'
              }`}
            >
              {filterLabel(item)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-6">
        <main className="min-w-0 flex-1">
      {isLoading ? (
        <p className="py-16 text-center text-sm text-white/40">Loading races…</p>
      ) : error && featured.length === 0 && community.length === 0 ? (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-5 text-sm text-rose-300">Could not read the AssetRace contract.</div>
      ) : featured.length === 0 && community.length === 0 ? (
        <p className="py-16 text-center text-sm text-white/35">No {mode === 'memes' ? 'meme' : 'stock'} races match this filter.</p>
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
          <GameActivitySidebar
            kind="race"
            symbolFor={(gameId, assetIndex) => races.find((race) => race.id === gameId)?.assets.find((asset) => asset.assetIndex === assetIndex)?.symbol}
          />
        </aside>
      </div>
    </div>
  )
}
