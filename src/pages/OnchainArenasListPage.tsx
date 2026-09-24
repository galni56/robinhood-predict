import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { formatUnits } from 'viem'
import { useAssetRaceClock } from '@/chain/useAssetRaceClock'
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
import { TokenLogo } from '@/components/TokenLogo'
import { formatCountdown } from '@/lib/format'

const FILTERS = ['ALL', 'LOBBY', 'LIVE', 'FINISHED'] as const

function countdown(arena: PriceArenaViewModel, nowMs: number) {
  if (!nowMs) return '…'
  const target = arena.phase === PRICE_ARENA_PHASE.LOBBY ? arena.startsAt : arena.phase === PRICE_ARENA_PHASE.RUNNING ? arena.deadline : 0n
  return target > 0n && Number(target) * 1_000 > nowMs ? formatCountdown(Number(target) * 1_000 - nowMs) : arenaPhaseLabel(arena.phase)
}

function ArenaCard({ arena, nowMs }: { arena: PriceArenaViewModel; nowMs: number }) {
  const meme = arena.category === PRICE_ARENA_CATEGORY.MEME
  return (
    <Link to={`/onchain/arenas/${arena.id}`} className={`group rounded-3xl border bg-[#241b2f] p-5 transition-all hover:-translate-y-0.5 ${meme ? 'border-[#F2A65A]/15 hover:border-[#F2A65A]/50' : 'border-[#8B7CF7]/15 hover:border-[#8B7CF7]/50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`text-xs font-bold uppercase tracking-[0.16em] ${meme ? 'text-[#F2A65A]' : 'text-[#B3A7FA]'}`}>{meme ? 'Meme Arena' : 'Stock Arena'} · #{arena.id.toString()}</div>
          <h2 className="mt-2 font-display text-xl font-bold">{arena.title}</h2>
          <p className="mt-1 text-xs text-white/35">by <AddressLabel address={arena.creator} className="text-white/50" /></p>
        </div>
        <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-bold text-white/60">{arenaPhaseLabel(arena.phase)}</span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 rounded-2xl bg-black/10 p-3 text-sm">
        <div><div className="text-xs text-white/30">Asset</div><div className="mt-1 flex items-center gap-2 font-bold"><TokenLogo ticker={arena.asset?.symbol} className="h-7 w-7 rounded-lg" />{arena.asset?.symbol ?? '—'}</div></div>
        <div><div className="text-xs text-white/30">Players</div><div className="mt-1 font-mono font-bold">{arena.participantCount} / 20</div></div>
        <div><div className="text-xs text-white/30">Prize pool</div><div className="mt-1 font-mono font-bold">{Number(formatUnits(arena.totalPool, 6)).toFixed(2)} USDG</div></div>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-white/40">{arenaDurationLabel(arena.duration)} round · {countdown(arena, nowMs)}</span>
        <span className={`font-bold ${meme ? 'text-[#F2A65A]' : 'text-[#B3A7FA]'}`}>Open arena →</span>
      </div>
    </Link>
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
    filter === 'ALL'
      || (filter === 'LOBBY' && arena.phase === PRICE_ARENA_PHASE.LOBBY)
      || (filter === 'LIVE' && arena.phase === PRICE_ARENA_PHASE.RUNNING)
      || (filter === 'FINISHED' && arena.phase >= PRICE_ARENA_PHASE.RESOLVED)
  ))

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className={`text-sm font-bold ${mode === 'memes' ? 'text-[#F2A65A]' : 'text-[#B3A7FA]'}`}>Price Arena · closest price wins</p>
          <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">Name the final price.</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/50">Predictions stay hidden in the lobby. When the round starts, the board goes live and the closest half shares the losing half’s pool.</p>
        </div>
        <Link to={`/onchain/arenas/create${mode === 'memes' ? '?mode=memes' : ''}`} className={`rounded-full px-5 py-3 text-sm font-bold ${mode === 'memes' ? 'bg-[#F2A65A] text-[#3b2416]' : 'bg-[#8B7CF7] text-white'}`}>+ Create {mode === 'memes' ? 'meme' : 'stock'} arena</Link>
      </div>

      {!isConfigured && <div className="mt-6 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">Price Arena is not deployed in this build yet. {PRICE_ARENA_CONFIG_ERROR}</div>}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(['stocks', 'memes'] as const).map((item) => <button key={item} onClick={() => setParams(item === 'memes' ? { mode: 'memes' } : {})} className={`rounded-full px-4 py-1.5 text-sm font-bold ${mode === item ? (item === 'memes' ? 'bg-[#F2A65A] text-[#3b2416]' : 'bg-[#f7f1e3] text-[#241a33]') : 'text-white/50 hover:bg-white/5'}`}>{item === 'stocks' ? 'Stocks' : 'Memes'}</button>)}
        </div>
        <div className="flex gap-1.5">{FILTERS.map((item) => <button key={item} onClick={() => setFilter(item)} className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${filter === item ? 'bg-[#8B7CF7]' : 'text-white/50 hover:bg-white/5'}`}>{item.charAt(0) + item.slice(1).toLowerCase()}</button>)}</div>
      </div>

      <div className="mt-6 flex items-start gap-6">
        <main className="min-w-0 flex-1">
          {isLoading ? <p className="py-20 text-center text-white/40">Loading arenas…</p>
            : error ? <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-5 text-rose-300">Could not read Price Arena.</div>
              : visible.length === 0 ? <p className="py-20 text-center text-white/35">No {mode} arenas yet.</p>
                : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{visible.map((arena) => <ArenaCard key={arena.id.toString()} arena={arena} nowMs={nowMs} />)}</div>}
        </main>
        <aside className="sticky top-20 hidden w-72 shrink-0 lg:block">
          <GameActivitySidebar kind="arena" symbolFor={(gameId) => arenas.find((arena) => arena.id === gameId)?.asset?.symbol} />
        </aside>
      </div>
    </div>
  )
}
