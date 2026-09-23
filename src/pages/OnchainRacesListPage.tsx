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
  formatUsdRaw,
  type AssetRaceViewModel,
  type AssetRaceMode,
} from '@/chain/assetRaces'
import { useAssetRaces } from '@/chain/useAssetRaces'
import { useAssetRaceClock } from '@/chain/useAssetRaceClock'
import { AddressLabel } from '@/components/AddressLabel'
import { formatCountdown } from '@/lib/format'

const FILTERS = ['ALL', 'LOBBY', 'BETTING', 'RUNNING', 'FINISHED'] as const
type RaceFilter = (typeof FILTERS)[number]

function raceTargetTime(race: AssetRaceViewModel) {
  if (race.status === ASSET_RACE_STATUS.LOBBY) return race.lobbyEndTime
  if (race.status === ASSET_RACE_STATUS.BETTING) return race.bettingEndTime
  if (race.status === ASSET_RACE_STATUS.RUNNING) return race.raceEndTime
  return 0n
}

function raceCta(status: number) {
  if (status === ASSET_RACE_STATUS.LOBBY) return 'VIEW LOBBY'
  if (status === ASSET_RACE_STATUS.BETTING) return 'BET NOW'
  if (status === ASSET_RACE_STATUS.RUNNING) return 'WATCH RACE'
  return 'VIEW RESULTS'
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

function RaceCard({ race, nowMs, tokenDecimals }: { race: AssetRaceViewModel; nowMs: number; tokenDecimals: number }) {
  const topBacked = [...race.assets].sort((a, b) => (a.pool > b.pool ? -1 : a.pool < b.pool ? 1 : 0))[0]
  const platform = race.origin === ASSET_RACE_ORIGIN.PLATFORM
  const meme = race.category === ASSET_RACE_CATEGORY.MEME
  return (
    <Link to={`/onchain/races/${race.id}`} className={`group relative overflow-hidden border p-5 transition-all ${meme ? 'rounded-[1.7rem] border-fuchsia-300/20 bg-gradient-to-br from-[#251338]/95 via-[#171329]/95 to-[#321615]/90 hover:-translate-y-1 hover:border-orange-300/45 hover:shadow-[0_18px_50px_-25px_rgba(244,114,182,0.9)]' : 'rounded-2xl border-white/10 bg-[#241b2f]/95 hover:border-[#8B7CF7]/35 hover:bg-[#171823]/95 hover:shadow-[0_0_35px_-20px_rgba(198,255,61,0.9)]'}`}>
      <div className={`absolute -right-16 -top-20 h-40 w-40 rounded-full blur-3xl ${meme ? 'bg-orange-400/25' : platform ? 'bg-[#8B7CF7]/10' : 'bg-violet-400/10'}`} />
      {meme && <div className="absolute -bottom-4 -left-3 rotate-12 text-5xl opacity-10 transition-transform group-hover:rotate-[-8deg]">🚀</div>}
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={`text-[10px] font-black tracking-[0.18em] ${meme ? 'text-orange-200' : platform ? 'text-[#8B7CF7]' : 'text-violet-300'}`}>
              {platform ? '🔥 FEATURED · PROPHET' : 'COMMUNITY RACE'} · #{race.id.toString()}
            </div>
            <h2 className="mt-1 truncate text-xl font-black">{race.title || race.assets.map((asset) => asset.symbol).join(' · ')}</h2>
            {!platform && <div className="mt-1 text-[11px] text-white/35">Created by <AddressLabel address={race.creator} link={!isLocalAssetRace} className="text-white/55" /></div>}
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black tracking-wider ${race.status === ASSET_RACE_STATUS.RUNNING ? 'bg-[#8B7CF7]/15 text-[#8B7CF7]' : race.status === ASSET_RACE_STATUS.LOBBY ? 'bg-violet-400/15 text-violet-300' : race.status === ASSET_RACE_STATUS.BETTING ? 'bg-sky-400/15 text-sky-300' : 'bg-white/10 text-white/55'}`}>
            {assetRaceStatusLabel(race.status)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {race.assets.map((asset, index) => <span key={asset.assetIndex} className={`px-2 py-1 text-xs font-bold ${meme ? `rounded-full border ${index % 2 ? 'border-orange-300/25 bg-orange-300/10 text-orange-100' : 'border-fuchsia-300/25 bg-fuchsia-300/10 text-fuchsia-100'}` : 'rounded-md bg-white/5'}`}>{asset.symbol}</span>)}
          {race.status === ASSET_RACE_STATUS.LOBBY && <span className="px-1 py-1 font-mono text-xs text-white/35">{race.assets.length} / 6</span>}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <div><div className="text-[10px] uppercase text-white/30">Pool</div><div className="mt-0.5 font-mono text-sm font-bold">{formatUsdRaw(race.totalPool, tokenDecimals)}</div></div>
          <div><div className="text-[10px] uppercase text-white/30">Duration</div><div className="mt-0.5 font-mono text-sm font-bold">{Math.round(Number(race.raceDuration) / 60)}m</div></div>
          <div><div className="text-[10px] uppercase text-white/30">Clock</div><div className="mt-0.5 font-mono text-sm font-bold">{raceClock(race, nowMs)}</div></div>
        </div>

        {race.status !== ASSET_RACE_STATUS.LOBBY && (
          <div className="mt-5 space-y-2">
            {race.assets.map((asset) => (
              <div key={asset.assetIndex} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 text-xs">
                <span className="font-bold">{asset.symbol}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className={`h-full rounded-full ${meme ? 'bg-gradient-to-r from-fuchsia-400 to-orange-300' : 'bg-[#8B7CF7]/70'}`} style={{ width: formatPoolShare(asset.pool, race.totalPool) }} /></div>
                <span className="w-14 text-right font-mono text-white/40">{formatPoolShare(asset.pool, race.totalPool)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs">
          <span className="truncate text-white/35">{race.status === ASSET_RACE_STATUS.LOBBY ? 'Betting has not started' : topBacked && race.totalPool > 0n ? `${topBacked.symbol} has most backing` : 'Waiting for racers'}</span>
          <span className={`shrink-0 font-black tracking-wider ${meme ? 'text-orange-200' : 'text-[#8B7CF7]'}`}>{raceCta(race.status)} →</span>
        </div>
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
    <div className={`mx-auto max-w-[1400px] px-4 py-8 ${mode === 'memes' ? 'asset-race-meme' : ''}`}>
      {isPreview ? (
        <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          <b>DEMO RACES · PREVIEW DATA</b> — AssetRace is not deployed/configured. These cards are local examples and cannot send transactions.
          {ASSET_RACE_CONFIG_ERROR && <span className="mt-1 block text-rose-300">{ASSET_RACE_CONFIG_ERROR}</span>}
        </div>
      ) : (
        <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${isLocalAssetRace ? 'border-[#8B7CF7]/30 bg-[#8B7CF7]/10 text-[#e7ffad]' : 'border-sky-500/30 bg-sky-500/10 text-sky-200'}`}>
          {isLocalAssetRace ? 'LOCAL TEST NETWORK · NO REAL FUNDS — Asset Races use Anvil and fake USDG.' : `Asset Races are read from the configured contract. Live prices are display-only; settlement stays onchain. Pools use ${ASSET_RACE_TOKEN_LABEL}.`}
        </div>
      )}

      <div className="mb-7 grid grid-cols-2 rounded-2xl border border-white/10 bg-black/30 p-1.5 shadow-2xl sm:max-w-xl">
        {(['stocks', 'memes'] as const).map((item) => (
          <button key={item} onClick={() => setSearchParams(item === 'memes' ? { mode: 'memes' } : {})} className={`rounded-xl px-5 py-3 text-sm font-black tracking-[0.16em] transition-all ${mode === item ? item === 'memes' ? 'bg-gradient-to-r from-fuchsia-500 to-orange-400 text-white shadow-lg' : 'bg-[#8B7CF7] text-black shadow-lg' : 'text-white/40 hover:text-white'}`}>
            {item === 'stocks' ? '📈 STOCKS' : '🚀 MEMES'}
          </button>
        ))}
      </div>

      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-2xl">
          <div className={`text-xs font-black tracking-[0.25em] ${mode === 'memes' ? 'text-orange-200' : 'text-[#8B7CF7]'}`}>PROPHET {mode === 'memes' ? 'MEME' : 'STOCK'} RACES</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{mode === 'memes' ? 'Pick the meme that moons.' : 'Back the fastest asset.'}</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/50">{mode === 'memes' ? 'Curated demo memes. Same transparent P0 → P1 race engine, with more chaos in the paint.' : 'Featured races concentrate liquidity. Community races let wallets assemble an approved Stock Token grid before betting begins.'}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to={`/onchain/races/create${mode === 'memes' ? '?mode=memes' : ''}`} className={`rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-all hover:brightness-110 ${mode === 'memes' ? 'bg-gradient-to-r from-fuchsia-400 to-orange-300' : 'bg-[#8B7CF7]'}`}>+ CREATE {mode === 'memes' ? 'MEME' : 'STOCK'} RACE</Link>
          <div className="rounded-xl border border-white/10 bg-[#241b2f]/95 px-4 py-3 text-right">
            <div className="font-mono text-2xl font-bold">{modeRaceCount}</div>
            <div className="text-[10px] uppercase tracking-wider text-white/35">{isPreview ? 'preview races' : `${mode} races`}</div>
          </div>
        </div>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto pb-1">
        {FILTERS.map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${filter === item ? 'border-[#8B7CF7]/35 bg-[#8B7CF7]/10 text-[#8B7CF7]' : 'border-white/10 text-white/45 hover:text-white'}`}>{item}</button>)}
      </div>

      {isLoading ? <p className="py-16 text-center text-sm text-white/40">Loading races…</p> : error ? (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-5 text-sm text-rose-300">Could not read the AssetRace contract.</div>
      ) : featured.length === 0 && community.length === 0 ? <p className="py-16 text-center text-sm text-white/35">No {mode === 'memes' ? 'Meme' : 'Stock'} races match this filter.</p> : (
        <div className="space-y-9">
          {featured.length > 0 && <section><h2 className={`mb-3 text-sm font-black tracking-[0.2em] ${mode === 'memes' ? 'text-orange-200' : 'text-[#8B7CF7]'}`}>FEATURED · PLATFORM RACES</h2><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{featured.map((race) => <RaceCard key={race.id.toString()} race={race} nowMs={raceNowMs} tokenDecimals={tokenDecimals} />)}</div></section>}
          {community.length > 0 && <section><h2 className="mb-3 text-sm font-black tracking-[0.2em] text-violet-300">COMMUNITY RACES</h2><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{community.map((race) => <RaceCard key={race.id.toString()} race={race} nowMs={raceNowMs} tokenDecimals={tokenDecimals} />)}</div></section>}
        </div>
      )}

      <p className="mt-6 text-xs text-white/30">Crowd backing shows pool share, not probability or guaranteed odds.</p>
    </div>
  )
}
