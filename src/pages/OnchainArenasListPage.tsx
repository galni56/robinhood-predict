import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAssetRaceClock } from '@/chain/useAssetRaceClock'
import { isPlayedCancellation, isVisibleInAll } from '@/chain/gameVisibility'
import { CRYPTO_ASSETS_ENABLED } from '@/chain/features'
import { usePriceArenas } from '@/chain/usePriceArenas'
import {
  PRICE_ARENA_CATEGORY,
  PRICE_ARENA_MAX_PARTICIPANTS,
  PRICE_ARENA_PHASE,
  arenaDurationLabel,
  arenaPhase,
  arenaPhaseLabel,
  type PriceArenaMode,
  type PriceArenaWithPhase,
} from '@/chain/priceArena'
import { AddressLabel } from '@/components/AddressLabel'
import { ClusterBanner } from '@/components/ClusterBanner'
import { FilterChips, GAME_MODE_CHIP_OPTIONS } from '@/components/FilterChips'
import { GameActivitySidebar } from '@/components/GameActivitySidebar'
import { GameListLoadingGrid } from '@/components/GameListLoadingGrid'
import { PriceSourceLink } from '@/components/PriceSourceLink'
import { TokenLogo } from '@/components/TokenLogo'
import { formatCountdown } from '@/lib/format'
import { formatStakeAmount, formatStakeExact, useStakeToken } from '@/solana/stakeTokens'

const FILTERS = ['ALL', 'LOBBY', 'LIVE', 'FINISHED', 'CANCELLED'] as const
const FILTER_OPTIONS = FILTERS.map((filter) => ({ key: filter, label: filter.charAt(0) + filter.slice(1).toLowerCase() }))

function countdown(arena: PriceArenaWithPhase, nowMs: number) {
  if (!nowMs) return '…'
  const target = arena.phase === PRICE_ARENA_PHASE.LOBBY ? arena.startsAt : arena.phase === PRICE_ARENA_PHASE.RUNNING ? arena.deadline : 0n
  if (target > 0n && Number(target) * 1_000 > nowMs) return formatCountdown(Number(target) * 1_000 - nowMs)
  return arena.phase === PRICE_ARENA_PHASE.RUNNING ? 'Awaiting settlement' : arenaPhaseLabel(arena.phase)
}

function displayPhase(arena: PriceArenaWithPhase, nowMs: number) {
  return arena.phase === PRICE_ARENA_PHASE.RUNNING && Number(arena.deadline) * 1_000 <= nowMs
    ? 'Settling'
    : arenaPhaseLabel(arena.phase)
}

function ArenaCard({ arena, nowMs }: { arena: PriceArenaWithPhase; nowMs: number }) {
  const navigate = useNavigate()
  const meme = arena.category === PRICE_ARENA_CATEGORY.MEME
  const crypto = arena.category === PRICE_ARENA_CATEGORY.CRYPTO
  const token = useStakeToken(arena.stakeMint)
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open ${arena.title}`}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a, button')) return
        navigate(`/onchain/arenas/${arena.id}`)
      }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          navigate(`/onchain/arenas/${arena.id}`)
        }
      }}
      className="group cursor-pointer border-[3px] border-[#191330] bg-[#221c40] p-5 text-[#fbf3e2] shadow-[5px_5px_0_#191330] transition-all hover:-translate-y-1 hover:shadow-[7px_7px_0_#191330]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="px-font text-[8px] text-[#6bcbf4]">{meme ? 'Meme Arena' : crypto ? 'Crypto Arena' : 'Stock Arena'} · #{arena.id.toString()}</div>
          <h2 className="mt-2 font-display text-xl font-bold">{arena.title}</h2>
          <p className="mt-1 text-xs text-white/35">by <AddressLabel address={arena.creator} className="text-white/50" /></p>
        </div>
        <span className="px-font border-2 border-[#191330] bg-[#6bcbf4] px-1.5 py-1 text-[7px] text-[#191330]">{displayPhase(arena, nowMs)}</span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 border-2 border-[#fbf3e2]/15 bg-[#191330]/40 p-3 text-sm">
        <div className="min-w-0"><div className="text-xs text-white/30">Asset</div><div className="mt-1 flex min-w-0 items-center gap-2 font-bold"><TokenLogo ticker={arena.symbol} className="h-7 w-7 shrink-0 rounded-lg" /><span className="truncate">{arena.symbol}</span></div></div>
        <div className="min-w-0"><div className="text-xs text-white/30">Players</div><div className="mt-1 truncate font-mono font-bold tabular-nums">{arena.participantCount} / {PRICE_ARENA_MAX_PARTICIPANTS}</div></div>
        <div className="min-w-0"><div className="text-xs text-white/30">Prize pool</div><div title={formatStakeExact(arena.totalPool, token)} className="mt-1 truncate font-mono text-[0.78rem] font-bold tabular-nums">{formatStakeAmount(arena.totalPool, token, 3)}</div></div>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-white/40">{arenaDurationLabel(arena.duration)} round · {countdown(arena, nowMs)}</span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PriceSourceLink
            href={arena.asset?.priceUrl}
            symbol={arena.symbol}
            tone="arena"
            className="bg-[#6bcbf4]/10 px-2.5 py-1"
          />
          <span className="px-font text-[9px] text-[#6bcbf4]">Open arena →</span>
        </div>
      </div>
    </div>
  )
}

export function OnchainArenasListPage() {
  const { arenas: decoded, isLoading, error } = usePriceArenas()
  const [params, setParams] = useSearchParams()
  const requestedMode = params.get('mode')
  const mode: PriceArenaMode = requestedMode === 'memes' || (CRYPTO_ASSETS_ENABLED && requestedMode === 'crypto')
    ? requestedMode
    : 'stocks'
  const category = mode === 'memes'
    ? PRICE_ARENA_CATEGORY.MEME
    : mode === 'crypto'
      ? PRICE_ARENA_CATEGORY.CRYPTO
      : PRICE_ARENA_CATEGORY.STOCK
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL')
  const terminalFilter = filter === 'FINISHED' || filter === 'CANCELLED'
  const nowMs = useAssetRaceClock()
  // Lobby vs live depends on the clock, not only on account data.
  const arenas = decoded.map((arena) => ({ ...arena, phase: arenaPhase(arena.status, arena.startsAt, nowMs / 1000) }))
  const visible = arenas.filter((arena) => arena.category === category && (
    filter === 'ALL' ? isVisibleInAll(arena.phase, PRICE_ARENA_PHASE.CANCELLED, arena.totalPool)
      : filter === 'LOBBY' ? arena.phase === PRICE_ARENA_PHASE.LOBBY
        : filter === 'LIVE' ? arena.phase === PRICE_ARENA_PHASE.RUNNING
          : filter === 'FINISHED' ? arena.phase === PRICE_ARENA_PHASE.RESOLVED
            : isPlayedCancellation(arena.phase, PRICE_ARENA_PHASE.CANCELLED, arena.totalPool)
  ))

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8">
      <ClusterBanner />
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="px-font text-[9px] text-[#ff4f8b]">Price Arena · closest price wins</p>
          <h1 className="px-font mt-3 text-base leading-relaxed sm:text-xl">Name the final price</h1>
          <p className="mt-3 text-sm font-bold leading-relaxed text-[#191330]/60">Predictions stay hidden in the lobby. When the round starts, the board goes live and the closest half shares the losing half’s pool.</p>
        </div>
        <Link to={`/onchain/arenas/create${mode === 'stocks' ? '' : `?mode=${mode}`}`} className="px-btn px-btn--sm shrink-0 !bg-[#6bcbf4]">+ {mode === 'memes' ? 'meme' : mode === 'crypto' ? 'crypto' : 'stock'} arena</Link>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <FilterChips size="sm" options={GAME_MODE_CHIP_OPTIONS} value={mode} onChange={(item) => setParams(item === 'stocks' ? {} : { mode: item })} />
        <FilterChips options={FILTER_OPTIONS} value={filter} onChange={setFilter} accent="arena" />
      </div>

      {terminalFilter && (
        <div className="mt-4 flex justify-end">
          <Link to="/onchain/archive?mode=arenas" className="px-font text-[9px] text-[#191330]/60 hover:text-[#191330]">
            Open complete Arena history →
          </Link>
        </div>
      )}

      <div className="mt-6 flex items-start gap-6">
        <main className="min-h-[32rem] min-w-0 flex-1">
          {isLoading && visible.length === 0 ? <GameListLoadingGrid accent="blue" />
            : error && visible.length === 0 ? <div className="border-[3px] border-[#191330] bg-[#ff4f8b]/15 p-5 text-sm font-bold text-[#c22957] shadow-[4px_4px_0_#191330]">Could not load arenas. Check your connection and refresh.</div>
              : visible.length === 0 ? <p className="px-font py-20 text-center text-[10px] text-[#191330]/40">No {mode} arenas yet</p>
                : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{visible.map((arena) => <ArenaCard key={arena.id.toString()} arena={arena} nowMs={nowMs} />)}</div>}
        </main>
        <aside className="sticky top-20 hidden w-72 shrink-0 lg:block">
          <GameActivitySidebar kind="arena" />
        </aside>
      </div>
    </div>
  )
}
