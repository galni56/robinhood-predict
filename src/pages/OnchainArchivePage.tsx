import { Link, useSearchParams } from 'react-router-dom'
import { DUEL_GROUP_LABELS, durationLabel, useDuels, type Duel, type DuelRacer } from '@/chain/duels'
import { useShots, type Shot } from '@/chain/shots'
import { useApprovedRaceAssets } from '@/chain/useApprovedRaceAssets'
import { COIN_BODIES } from '@/components/GamePickers'
import { FilterChips } from '@/components/FilterChips'
import { assetIconUrl } from '@/lib/assetIcons'
import { formatUnits } from '@/lib/format'
import { CoinFighter } from '@/retro/landingFx'

type ArchiveMode = 'races' | 'arenas'

const MODE_OPTIONS = [
  { key: 'races', label: 'Haste', accent: 'race' },
  { key: 'arenas', label: 'Shot', accent: 'arena' },
] as const

const sol = (raw: bigint) => `${Number(Number(formatUnits(raw, 9)).toPrecision(4))} SOL`
const dateLabel = (seconds: number) => (seconds > 0 ? new Date(seconds * 1000).toLocaleString() : '—')
const price = (raw: bigint, decimals: number) => `$${Number(Number(formatUnits(raw, decimals)).toPrecision(5))}`

function move(r: DuelRacer) {
  if (r.startPrice <= 0n || r.endPrice <= 0n) return null
  const pct = (Number(r.endPrice - r.startPrice) / Number(r.startPrice)) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(Math.abs(pct) < 0.1 ? 3 : 2)}%`
}

/** Finished games from the game server: resolved ones, and refunds that had real money in them. */
export function OnchainArchivePage() {
  const [params, setParams] = useSearchParams()
  const mode: ArchiveMode = params.get('mode') === 'arenas' ? 'arenas' : 'races'
  const duels = useDuels()
  const shots = useShots()
  const { assets } = useApprovedRaceAssets()
  const logoOf = (symbol: string) => assetIconUrl(symbol) ?? assets.find((a) => a.symbol === symbol)?.logoUrl

  const finishedRaces = duels.offline ? [] : duels.duels.filter((d) => d.status === 'resolved' || ((d.status === 'void' || d.status === 'cancelled') && d.pot > 0n))
  const finishedShots = shots.shots.filter((s) => s.status === 'resolved' || (s.status === 'cancelled' && s.totalPool > 0n))
  const loading = mode === 'races' ? duels.isLoading : shots.isLoading
  const offline = mode === 'races' ? duels.offline : shots.offline

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Archive</h1>
          <p className="mt-2 text-sm text-[#1B1340]/55">Every finished game with its final result, settled on signed on-chain prices.</p>
        </div>
        <FilterChips options={MODE_OPTIONS} value={mode} onChange={(next) => setParams(next === 'races' ? {} : { mode: next })} />
      </div>

      <div className="mt-6 space-y-2">
        {loading ? <p className="py-10 text-center text-sm text-[#1B1340]/55">Loading history…</p>
          : offline ? <p className="py-10 text-center text-sm text-[#1B1340]/55">The game server is taking a break - the archive is back shortly.</p>
          : mode === 'races' ? (
            finishedRaces.length === 0 ? <Empty text="No finished races yet." to="/onchain/races" cta="Start a race" />
              : finishedRaces.map((duel) => <RaceRow key={duel.id} duel={duel} logoOf={logoOf} />)
          ) : (
            finishedShots.length === 0 ? <Empty text="No finished Shot matches yet." to="/onchain/shots" cta="Open a room" />
              : finishedShots.map((shot) => <ShotRow key={shot.id} shot={shot} logoOf={logoOf} />)
          )}
      </div>
    </div>
  )
}

function Empty({ text, to, cta }: { text: string; to: string; cta: string }) {
  return (
    <div className="py-10 text-center text-sm text-[#1B1340]/55">
      {text} <Link to={to} className="font-bold text-[#C2245A] hover:underline">{cta} →</Link>
    </div>
  )
}

function RaceRow({ duel, logoOf }: { duel: Duel; logoOf: (symbol: string) => string | undefined }) {
  const winner = duel.status === 'resolved' ? duel.racers.find((r) => r.seat === duel.winnerSeat) : undefined
  const winMove = winner ? move(winner) : null
  return (
    <Link to={`/onchain/duel/${duel.id}`} className="flex flex-wrap items-center gap-3 rounded-none border border-[#1B1340]/12 bg-[#FFF6DF] px-4 py-3 transition-colors hover:border-[#ED8F3A]/60">
      <div className="flex shrink-0 -space-x-1">
        {duel.racers.slice(0, 6).map((r, i) => <CoinFighter key={r.seat} body={COIN_BODIES[i % COIN_BODIES.length]} logoUrl={logoOf(r.symbol)} symbol={r.symbol} size={30} />)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">{duel.racers.map((r) => r.symbol).join(' vs ')}</div>
        <div className="truncate text-xs text-[#B8560B]">
          {duel.title}{duel.category ? ` · ${DUEL_GROUP_LABELS[duel.category]}` : ''} · {durationLabel(duel.duration)} · {dateLabel(duel.endTime || duel.startTime)}
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold">
          {winner ? <>🏁 {winner.symbol}{winMove && <span className="font-mono text-[#1E7A36]"> {winMove}</span>}</> : 'Refunded'}
        </div>
        <div className="font-mono text-xs text-[#1B1340]/55">{sol(duel.pot)} pot</div>
      </div>
    </Link>
  )
}

function ShotRow({ shot, logoOf }: { shot: Shot; logoOf: (symbol: string) => string | undefined }) {
  const resolved = shot.status === 'resolved'
  const winners = shot.entries.filter((e) => e.payout > 0n).length
  return (
    <Link to={`/onchain/shot/${shot.id}`} className="flex flex-wrap items-center gap-3 rounded-none border border-[#1B1340]/12 bg-[#FFF6DF] px-4 py-3 transition-colors hover:border-[#7A9FF0]/60">
      <CoinFighter body={COIN_BODIES[shot.id % COIN_BODIES.length]} logoUrl={logoOf(shot.symbol)} symbol={shot.symbol} size={30} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">{shot.title}</div>
        <div className="truncate text-xs text-[#1F5FD1]">Room #{shot.id} · {shot.symbol} · {durationLabel(shot.duration)} · {dateLabel(shot.deadline || shot.createdAt)}</div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold">
          {resolved ? <>Final <span className="font-mono">{price(shot.finalPrice, shot.priceDecimals)}</span> · {winners} of {shot.entries.length} won</> : 'Cancelled · refunded'}
        </div>
        <div className="font-mono text-xs text-[#1B1340]/55">{sol(shot.totalPool)} bank</div>
      </div>
    </Link>
  )
}
