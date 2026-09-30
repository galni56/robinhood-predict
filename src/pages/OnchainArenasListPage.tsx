import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { formatEther } from 'viem'
import { useAssetRaceClock } from '@/chain/useAssetRaceClock'
import { isPlayedCancellation, isVisibleInAll } from '@/chain/gameVisibility'
import { usePriceArenas } from '@/chain/usePriceArenas'
import {
  PRICE_ARENA_CATEGORY,
  PRICE_ARENA_CONFIG_ERROR,
  PRICE_ARENA_PHASE,
  arenaDurationLabel,
  arenaPhaseLabel,
  type PriceArenaMode,
  type PriceArenaViewModel,
} from '@/chain/priceArena'
import { AddressLabel } from '@/components/AddressLabel'
import { GameActivitySidebar } from '@/components/GameActivitySidebar'
import { PriceSourceLink } from '@/components/PriceSourceLink'
import { TokenLogo } from '@/components/TokenLogo'
import { formatCompactEth, formatCountdown } from '@/lib/format'

const FILTERS = ['ALL', 'LOBBY', 'LIVE', 'FINISHED', 'CANCELLED'] as const

function countdown(arena: PriceArenaViewModel, nowMs: number) {
  if (!nowMs) return '…'
  const target = arena.phase === PRICE_ARENA_PHASE.LOBBY ? arena.startsAt : arena.phase === PRICE_ARENA_PHASE.RUNNING ? arena.deadline : 0n
  return target > 0n && Number(target) * 1_000 > nowMs ? formatCountdown(Number(target) * 1_000 - nowMs) : arenaPhaseLabel(arena.phase)
}

function ArenaCard({ arena, nowMs }: { arena: PriceArenaViewModel; nowMs: number }) {
  const navigate = useNavigate()
  const meme = arena.category === PRICE_ARENA_CATEGORY.MEME
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
      className="group cursor-pointer rounded-3xl border border-[#7A9FF0]/15 bg-[#241b2f] p-5 transition-all hover:-translate-y-0.5 hover:border-[#B7CEFF]/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#B7CEFF]">{meme ? 'Meme Arena' : 'Stock Arena'} · #{arena.id.toString()}</div>
          <h2 className="mt-2 font-display text-xl font-bold">{arena.title}</h2>
          <p className="mt-1 text-xs text-white/35">by <AddressLabel address={arena.creator} className="text-white/50" /></p>
        </div>
        <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-bold text-white/60">{arenaPhaseLabel(arena.phase)}</span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 rounded-2xl bg-black/10 p-3 text-sm">
        <div className="min-w-0"><div className="text-xs text-white/30">Asset</div><div className="mt-1 flex min-w-0 items-center gap-2 font-bold"><TokenLogo ticker={arena.asset?.symbol} className="h-7 w-7 shrink-0 rounded-lg" /><span className="truncate">{arena.asset?.symbol ?? '—'}</span></div></div>
        <div className="min-w-0"><div className="text-xs text-white/30">Players</div><div className="mt-1 truncate font-mono font-bold tabular-nums">{arena.participantCount} / 20</div></div>
        <div className="min-w-0"><div className="text-xs text-white/30">Prize pool</div><div title={`${formatEther(arena.totalPool)} ETH`} className="mt-1 truncate font-mono text-[0.78rem] font-bold tabular-nums">{formatCompactEth(arena.totalPool, 3)}</div></div>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-white/40">{arenaDurationLabel(arena.duration)} round · {countdown(arena, nowMs)}</span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PriceSourceLink
            href={arena.asset?.priceUrl}
            symbol={arena.asset?.symbol}
            tone="arena"
            className="bg-[#7A9FF0]/10 px-2.5 py-1"
          />
          <span className="font-bold text-[#B7CEFF]">Open arena →</span>
        </div>
      </div>
    </div>
  )
}

export function OnchainArenasListPage() {
  const { arenas, isConfigured, isLoading, error } = usePriceArenas()
  const [params, setParams] = useSearchParams()
  const mode: PriceArenaMode = params.get('mode') === 'memes' ? 'memes' : 'stocks'
  const category = mode === 'memes' ? PRICE_ARENA_CATEGORY.MEME : PRICE_ARENA_CATEGORY.STOCK
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL')
  const nowMs = useAssetRaceClock()
  const visible = arenas.filter((arena) => arena.category === category && (
    filter === 'ALL' ? isVisibleInAll(arena.phase, PRICE_ARENA_PHASE.CANCELLED, arena.totalPool)
      : filter === 'LOBBY' ? arena.phase === PRICE_ARENA_PHASE.LOBBY
        : filter === 'LIVE' ? arena.phase === PRICE_ARENA_PHASE.RUNNING
          : filter === 'FINISHED' ? arena.phase === PRICE_ARENA_PHASE.RESOLVED
            : isPlayedCancellation(arena.phase, PRICE_ARENA_PHASE.CANCELLED, arena.totalPool)
  ))

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="text-sm font-bold text-[#B7CEFF]">Price Arena · closest price wins</p>
          <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">Name the final price.</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/50">Predictions stay hidden in the lobby. When the round starts, the board goes live and the closest half shares the losing half’s pool.</p>
        </div>
        <Link to={`/onchain/arenas/create${mode === 'memes' ? '?mode=memes' : ''}`} className="rounded-full bg-[#7A9FF0] px-5 py-3 text-sm font-bold text-[#152447] transition-colors hover:bg-[#8EB1F8]">+ Create {mode === 'memes' ? 'meme' : 'stock'} arena</Link>
      </div>

      {!isConfigured && <div className="mt-6 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">Price Arena is not configured in this build. {PRICE_ARENA_CONFIG_ERROR}</div>}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(['stocks', 'memes'] as const).map((item) => <button key={item} onClick={() => setParams(item === 'memes' ? { mode: 'memes' } : {})} className={`rounded-full px-4 py-1.5 text-sm font-bold ${mode === item ? (item === 'memes' ? 'bg-[#F2A65A] text-[#3b2416]' : 'bg-[#f7f1e3] text-[#241a33]') : 'text-white/50 hover:bg-white/5'}`}>{item === 'stocks' ? 'Stocks' : 'Memes'}</button>)}
        </div>
        <div className="flex gap-1.5">{FILTERS.map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${filter === item ? 'bg-[#7A9FF0] text-[#152447]' : 'text-white/50 hover:bg-white/5'}`}>{item.charAt(0) + item.slice(1).toLowerCase()}</button>)}</div>
      </div>

      <div className="mt-6 flex items-start gap-6">
        <main className="min-w-0 flex-1">
          {isLoading ? <p className="py-20 text-center text-white/40">Loading arenas…</p>
            : error && visible.length === 0 ? <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-5 text-rose-300">Could not read Price Arena.</div>
              : visible.length === 0 ? <p className="py-20 text-center text-white/35">No {mode} arenas yet.</p>
                : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{visible.map((arena) => <ArenaCard key={arena.id.toString()} arena={arena} nowMs={nowMs} />)}</div>}
        </main>
        <aside className="sticky top-20 hidden w-72 shrink-0 lg:block">
          <GameActivitySidebar kind="arena" />
        </aside>
      </div>
    </div>
  )
}
