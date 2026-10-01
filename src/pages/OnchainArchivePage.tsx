import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { formatEther, formatUnits } from 'viem'
import { CancelledBadge, SideBadge } from '@/components/Pills'
import { PriceSourceLink } from '@/components/PriceSourceLink'
import { TokenLogo } from '@/components/TokenLogo'
import {
  ASSET_RACE_CATEGORY,
  ASSET_RACE_STATUS,
  assetRaceStatusLabel,
  formatStakeRaw,
  type AssetRaceViewModel,
} from '@/chain/assetRaces'
import { priceSourceUrlForAssetId, priceSourceUrlForSymbol } from '@/chain/assetRaceRegistry'
import { isPlayedCancellation } from '@/chain/gameVisibility'
import { MarketSideOnchain, MarketStatusOnchain } from '@/chain/contracts'
import {
  useAssetRaceArchivePage,
  usePredictionArchivePage,
  usePriceArenaArchivePage,
  type PredictionArchiveMarket,
} from '@/chain/useGameArchive'
import { tickerForPredictionAssetId } from '@/chain/predictionMarketAssets'
import {
  PRICE_ARENA_CATEGORY,
  PRICE_ARENA_PHASE,
  arenaPhaseLabel,
  type PriceArenaViewModel,
} from '@/chain/priceArena'
import { useTokenLogos } from '@/chain/robinhoodApi'
import { formatCompactEth, formatUsd, timeAgo } from '@/lib/format'

type ArchiveMode = 'markets' | 'races' | 'arenas'

const archiveModes: { key: ArchiveMode; label: string; accent: string }[] = [
  { key: 'markets', label: 'Prediction Markets', accent: '#8B7CF7' },
  { key: 'races', label: 'Asset Races', accent: '#F2A65A' },
  { key: 'arenas', label: 'Price Arena', accent: '#7A9FF0' },
]

function MarketArchiveCard({ market }: { market: PredictionArchiveMarket }) {
  const logos = useTokenLogos()
  const ticker = tickerForPredictionAssetId(market.assetId) ?? '…'
  const targetUsd = Number(formatUnits(market.targetPrice, market.priceDecimals))
  const totalPool = market.poolYes + market.poolNo
  const yesPct = totalPool > 0n ? Number((market.poolYes * 10_000n) / totalPool) / 100 : 50
  const cancelled = market.status === MarketStatusOnchain.Cancelled

  return (
    <article className="rounded-2xl border border-white/5 bg-[#241b2f] p-4 transition-colors hover:border-[#8B7CF7]/40">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <Link to={`/onchain/${market.id}`} className="flex min-w-0 items-center gap-3">
          <TokenLogo ticker={ticker} logoUrl={logos.get(ticker)} className="h-10 w-10 rounded-xl" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-lg font-bold">{ticker}</span>
              <span className="text-xs text-white/35">Market #{market.id.toString()}</span>
            </div>
            <p className="truncate text-sm text-white/55">At or above {formatUsd(targetUsd)} at deadline?</p>
          </div>
        </Link>
        {cancelled ? <CancelledBadge /> : <SideBadge side={market.outcome === MarketSideOnchain.YES ? 'YES' : 'NO'} />}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-black/10 p-3 text-xs">
        <div><div className="text-white/30">Pool split</div><div className="mt-1 font-mono">{yesPct.toFixed(1)}% / {(100 - yesPct).toFixed(1)}%</div></div>
        <div className="min-w-0"><div className="text-white/30">Pool</div><div title={`${formatEther(totalPool)} ETH`} className="mt-1 truncate font-mono">{formatCompactEth(totalPool)}</div></div>
        <div className="text-right"><div className="text-white/30">Closed</div><div className="mt-1">{timeAgo(Number(market.deadline) * 1_000)}</div></div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <PriceSourceLink href={priceSourceUrlForSymbol(ticker)} symbol={ticker} tone="market" className="bg-[#8B7CF7]/10 px-2.5 py-1" />
        <Link to={`/onchain/${market.id}`} className="text-sm font-bold text-[#B3A7FA]">View result →</Link>
      </div>
    </article>
  )
}

function RaceArchiveCard({ race }: { race: AssetRaceViewModel }) {
  const terminalTime = race.resolvedAt || race.raceEndTime || race.bettingEndTime
  const category = race.category === ASSET_RACE_CATEGORY.MEME ? 'Meme' : 'Stock'
  return (
    <article className="rounded-2xl border border-white/5 bg-[#241b2f] p-4 transition-colors hover:border-[#F2A65A]/40">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#F2A65A]">{category} race · #{race.id.toString()}</div>
          <Link to={`/onchain/races/${race.id}`} className="mt-1 block truncate font-display text-lg font-bold hover:text-[#F2A65A]">
            {race.title || race.assets.map((asset) => asset.symbol).join(' · ')}
          </Link>
        </div>
        <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-xs font-bold text-white/55">{assetRaceStatusLabel(race.status)}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {race.assets.map((asset) => (
          <span key={asset.assetIndex} className="inline-flex items-center gap-1.5 rounded-full bg-white/5 py-1 pl-1 pr-2.5 text-xs font-bold">
            <TokenLogo ticker={asset.symbol} className="h-5 w-5 rounded-md" />{asset.symbol}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {race.assets.map((asset) => (
          <PriceSourceLink key={asset.assetIndex} href={priceSourceUrlForAssetId(asset.assetId)} symbol={asset.symbol} tone="race" label={`${asset.symbol} chart`} className="bg-[#F2A65A]/10 px-2.5 py-1 text-[10px]" />
        ))}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3 border-t border-white/5 pt-3 text-xs">
        <div><div className="text-white/30">Final pool</div><div title={`${formatEther(race.totalPool)} ETH`} className="mt-1 font-mono">{formatStakeRaw(race.totalPool)} ETH</div></div>
        <div className="text-right text-white/40">{terminalTime > 0n ? timeAgo(Number(terminalTime) * 1_000) : 'Terminal'}</div>
        <Link to={`/onchain/races/${race.id}`} className="shrink-0 text-sm font-bold text-[#F2A65A]">View result →</Link>
      </div>
    </article>
  )
}

function ArenaArchiveCard({ arena }: { arena: PriceArenaViewModel }) {
  const terminalTime = arena.resolvedAt || arena.deadline
  const category = arena.category === PRICE_ARENA_CATEGORY.MEME ? 'Meme' : 'Stock'
  return (
    <article className="rounded-2xl border border-white/5 bg-[#241b2f] p-4 transition-colors hover:border-[#7A9FF0]/45">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TokenLogo ticker={arena.asset?.symbol} className="h-10 w-10 rounded-xl" />
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#B7CEFF]">{category} arena · #{arena.id.toString()}</div>
            <Link to={`/onchain/arenas/${arena.id}`} className="mt-1 block truncate font-display text-lg font-bold hover:text-[#B7CEFF]">{arena.title}</Link>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-xs font-bold text-white/55">{arenaPhaseLabel(arena.phase)}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-black/10 p-3 text-xs">
        <div><div className="text-white/30">Asset</div><div className="mt-1 font-bold">{arena.asset?.symbol ?? '-'}</div></div>
        <div><div className="text-white/30">Players</div><div className="mt-1 font-mono">{arena.participantCount}</div></div>
        <div className="min-w-0 text-right"><div className="text-white/30">Pool</div><div title={`${formatEther(arena.totalPool)} ETH`} className="mt-1 truncate font-mono">{formatCompactEth(arena.totalPool)}</div></div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <PriceSourceLink href={arena.asset?.priceUrl} symbol={arena.asset?.symbol} tone="arena" className="bg-[#7A9FF0]/10 px-2.5 py-1" />
        <span className="text-xs text-white/35">{terminalTime > 0n ? timeAgo(Number(terminalTime) * 1_000) : 'Terminal'}</span>
        <Link to={`/onchain/arenas/${arena.id}`} className="shrink-0 text-sm font-bold text-[#B7CEFF]">View result →</Link>
      </div>
    </article>
  )
}

export function OnchainArchivePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedMode = searchParams.get('mode')
  const mode: ArchiveMode = requestedMode === 'races' || requestedMode === 'arenas' ? requestedMode : 'markets'
  const [page, setPage] = useState(0)
  const markets = usePredictionArchivePage(page, mode === 'markets', true)
  const races = useAssetRaceArchivePage(page, mode === 'races', true)
  const arenas = usePriceArenaArchivePage(page, mode === 'arenas', true)
  const historyCounts = {
    markets: markets.historyCount,
    races: races.historyCount,
    arenas: arenas.historyCount,
  }
  const active = mode === 'markets' ? markets : mode === 'races' ? races : arenas

  // Auto-seeded games routinely cancel without ever attracting a player.
  // They remain onchain and addressable by ID, but add no useful history for
  // users. Keep cancelled entries only when at least one real stake reached
  // the pool; resolved/void games always remain part of the archive.
  const terminalMarkets = markets.items.filter((market) => (
    market.status === MarketStatusOnchain.Resolved
    || isPlayedCancellation(market.status, MarketStatusOnchain.Cancelled, market.poolYes + market.poolNo)
  ))
  const terminalRaces = races.items.filter((race) => (
    race.status === ASSET_RACE_STATUS.RESOLVED
    || race.status === ASSET_RACE_STATUS.VOID
    || isPlayedCancellation(race.status, ASSET_RACE_STATUS.CANCELLED, race.totalPool)
  ))
  const terminalArenas = arenas.items.filter((arena) => (
    arena.phase === PRICE_ARENA_PHASE.RESOLVED
    || isPlayedCancellation(arena.phase, PRICE_ARENA_PHASE.CANCELLED, arena.totalPool)
  ))
  const visibleCount = mode === 'markets' ? terminalMarkets.length : mode === 'races' ? terminalRaces.length : terminalArenas.length
  const accent = archiveModes.find((item) => item.key === mode)!.accent

  return (
    <div className="mx-auto max-w-6xl space-y-7 px-4 py-8">
      <header className="max-w-3xl">
        <p className="mb-1 text-sm font-bold text-[#B3A7FA]">The onchain record</p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Every finished game, one archive.</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/50">
          Browse resolved, cancelled and void Prediction Markets, Asset Races and Price Arenas directly from their contracts. Played history is indexed from contract events and rendered twelve games at a time.
        </p>
        <Link to="/onchain/legacy" className="mt-3 inline-flex text-sm font-bold text-[#B3A7FA] hover:text-white">
          Open funded V1 markets for claim or refund →
        </Link>
      </header>

      <nav className="grid gap-2 sm:grid-cols-3" aria-label="Archive products">
        {archiveModes.map((item) => (
          <button
            key={item.key}
            onClick={() => {
              setSearchParams(item.key === 'markets' ? {} : { mode: item.key })
              setPage(0)
            }}
            className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${mode === item.key ? 'border-white/20 bg-[#2d223a]' : 'border-white/5 bg-[#241b2f] text-white/55 hover:border-white/15 hover:text-white'}`}
          >
            <span className="font-display font-bold" style={mode === item.key ? { color: item.accent } : undefined}>{item.label}</span>
            <span className="rounded-full bg-white/5 px-2.5 py-1 font-mono text-xs">
              {historyCounts[item.key]} played
            </span>
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 bg-[#1f1829] px-4 py-3 text-xs text-white/45">
        <span>Newest played games first · empty cancellations stay hidden</span>
        <span className="font-mono">Page {page + 1} / {active.pageCount}{active.ids.length > 0 ? ` · IDs ${active.ids.at(-1)}–${active.ids[0]}` : ''}</span>
      </div>

      {active.isLoading ? (
        <p className="py-16 text-center text-sm text-white/40">Loading contract history…</p>
      ) : active.error ? (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-5 text-sm text-rose-300">Could not read this contract history. Try the page again.</div>
      ) : visibleCount === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-[#241b2f]/50 px-5 py-14 text-center">
          <p className="font-display text-xl font-bold">No played games yet.</p>
          <p className="mt-2 text-sm text-white/40">Resolved games and cancellations with real stakes will appear here automatically.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {mode === 'markets' && terminalMarkets.map((market) => <MarketArchiveCard key={market.id.toString()} market={market} />)}
          {mode === 'races' && terminalRaces.map((race) => <RaceArchiveCard key={race.id.toString()} race={race} />)}
          {mode === 'arenas' && terminalArenas.map((arena) => <ArenaArchiveCard key={arena.id.toString()} arena={arena} />)}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-5">
        <button disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} className="rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/65 disabled:cursor-not-allowed disabled:opacity-30">← Newer</button>
        <span className="h-1.5 w-20 rounded-full" style={{ backgroundColor: accent }} />
        <button disabled={page + 1 >= active.pageCount} onClick={() => setPage((current) => current + 1)} className="rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/65 disabled:cursor-not-allowed disabled:opacity-30">Older →</button>
      </div>
    </div>
  )
}
