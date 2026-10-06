import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { quoteUsdCents, usdCentsToLamports, stakeQuoteErrorMessage } from '@/chain/stakeQuote'
import { DUEL_RULES, cheerRacer, duelPhaseLabel, duelStake, durationLabel, useDuel, type Duel, type DuelRacer } from '@/chain/duels'
import { useSignedAction } from '@/chain/gameServer'
import { useServerNowMs } from '@/chain/serverClock'
import { marketCapUsd, useLivePrices } from '@/chain/livePrices'
import { useApprovedRaceAssets } from '@/chain/useApprovedRaceAssets'
import { calculateReturnWad, formatReturnAdaptive, type ApprovedRaceAsset } from '@/chain/assetRaces'
import { AddressLabel } from '@/components/AddressLabel'
import { CoinPicker, COIN_BODIES } from '@/components/GamePickers'
import { CoinsToBring, DuelNumbers, GhostCoin, PracticeLap } from '@/components/DuelExtras'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { assetIconUrl } from '@/lib/assetIcons'
import { formatCompactUsd, formatUnits, shortTxError } from '@/lib/format'
import { life, seeded } from '@/lib/life'
import { TxUnconfirmedError } from '@/solana/tx'
import { useStakeTransfer } from '@/solana/stake'
import { explorerUrl } from '@/solana/config'
import { CoinFighter } from '@/retro/landingFx'
import { PxSprite } from '@/retro/Sprite'
import { CREAM, INK, PINK, ROAD, SKY, YELLOW, PIXEL } from '@/retro/scene'
import { crown } from '@/retro/spriteData'

// Pixel fonts have no emoji; the cheer thumb uses the system emoji font.
const EMOJI = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif"
const STAKE_PRESETS = [100n, 500n, 1_000n, 2_500n, 5_000n]
const BACK_PRESETS = [100n, 500n, 1_000n, 2_500n, 5_000n, 10_000n]
/** A number in plain digits (never 3e-8), rounded to `significant` digits. */
const plain = (n: number, significant: number) => n.toLocaleString('en-US', { maximumSignificantDigits: significant, useGrouping: false })
const sol = (raw: bigint) => `${Number(Number(formatUnits(raw, 9)).toPrecision(4))} SOL`
const clock = (seconds: number) => `${Math.max(0, Math.floor(seconds / 60))}:${String(Math.max(0, Math.floor(seconds % 60))).padStart(2, '0')}`

/** Bursts playing at once per racer; clicks beyond this wait until one ends. */
const MAX_BURSTS = 5
const BURST_MS = 1100
const CONFETTI = [PINK, YELLOW, '#4DB5FF', '#5FD46E', '#A77BFF', '#FF9F40', '#FFFFFF']

/** Pixel confetti: 2-3 px squares fly up and out, then fall; every burst scatters differently. */
function Burst({ id }: { id: number }) {
  return (
    <span aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '25%', pointerEvents: 'none', zIndex: 3 }}>
      {Array.from({ length: 16 }, (_, i) => {
        const angle = seeded(id, i) * Math.PI * 2
        const reach = 18 + seeded(id, i + 40) * 34
        const size = seeded(id, i + 80) < 0.5 ? 2 : 3
        return (
          <span
            key={i}
            className="rx-fx-confetti-pop"
            style={{
              position: 'absolute', width: size, height: size, background: CONFETTI[Math.floor(seeded(id, i + 120) * CONFETTI.length)],
              ['--rx-dx' as string]: `${(Math.cos(angle) * reach).toFixed(1)}px`,
              ['--rx-dy' as string]: `${(Math.sin(angle) * reach - 14).toFixed(1)}px`,
              animationDuration: `${BURST_MS - Math.round(seeded(id, i + 160) * 300)}ms`,
            }}
          />
        )
      })}
    </span>
  )
}

/**
 * A spectator's bet, shown at the top of the panel in every phase: whom they
 * backed and with how much, what a win would pay, then the result.
 */
function YourBet({ duel, me, sending }: { duel: Duel; me: string; sending: { seat: number; at: number } | null }) {
  const mine = duel.backers.filter((b) => b.wallet === me)
  // Remembers that this viewer had a bet here, so a refund after the racer left is explained to them only.
  const [hadBet, setHadBet] = useState(false)
  useEffect(() => {
    if (mine.length > 0 || sending) setHadBet(true)
  }, [mine.length, sending])
  const pendingSeat = mine.length === 0 && sending ? sending.seat : null
  // The racer we backed left or was kicked: the server dropped our bet and
  // queued it back, so say so instead of silently losing the card.
  const refunded = duel.payouts.filter((p) => p.wallet === me && p.kind === 'refund' && !duel.racers.some((r) => r.wallet === me))
  if (hadBet && mine.length === 0 && pendingSeat == null && refunded.length > 0 && (duel.status === 'open' || duel.status === 'ready')) {
    const total = refunded.reduce((sum, p) => sum + p.amount, 0n)
    return (
      <div className="rx-plate" style={{ background: '#FFFFFF', padding: '12px 14px' }}>
        <div style={{ fontFamily: PIXEL, fontSize: 10, marginBottom: 4 }}>YOUR BET · RETURNED</div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Your racer left the lobby, so your {sol(total)} {refunded.every((p) => p.status === 'done') ? 'is back in your account' : 'is on its way back'}.</div>
      </div>
    )
  }
  if (mine.length === 0 && pendingSeat == null) return null
  const seat = mine[0]?.seat ?? pendingSeat!
  const racer = duel.racers.find((r) => r.seat === seat)
  const amount = mine.reduce((sum, b) => sum + b.amount, 0n)
  // What a win pays now: the stake back plus 70% of the money on the other
  // racers, pro rata among this racer's backers, minus 2% of the gain.
  const onSeat = duel.backers.filter((b) => b.seat === seat).reduce((sum, b) => sum + b.amount, 0n)
  const onOthers = duel.backers.filter((b) => b.seat !== seat).reduce((sum, b) => sum + b.amount, 0n)
  const gain = onSeat > 0n ? (onOthers * 7_000n / 10_000n) * amount / onSeat : 0n
  const ifWin = amount + gain - (gain * 200n) / 10_000n
  const paidOut = duel.payouts.filter((p) => p.wallet === me && (p.kind === 'win' || p.kind === 'refund')).reduce((sum, p) => sum + p.amount, 0n)
  const status = mine.length === 0 ? 'Sent - confirming on chain…'
    : duel.status === 'resolved' ? (duel.winnerSeat === seat ? `${racer?.symbol} won! You get ${sol(paidOut || ifWin)}.` : `${racer?.symbol} did not win this time.`)
      : duel.status === 'void' || duel.status === 'cancelled' ? 'No race - your bet goes back in full.'
        : duel.status === 'running' ? `Racing! If ${racer?.symbol} wins you get ≈ ${sol(ifWin)}.`
          : `If ${racer?.symbol} wins you get ≈ ${sol(ifWin)}${gain === 0n ? ' (more once others back the rivals)' : ''}.`
  const won = duel.status === 'resolved' && duel.winnerSeat === seat
  return (
    <div className="rx-plate" style={{ background: won ? '#8BE89A' : YELLOW, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
      {racer && <CoinFighter body={COIN_BODIES[duel.racers.indexOf(racer) % COIN_BODIES.length]} logoUrl={assetIconUrl(racer.symbol)} symbol={racer.symbol} size={40} />}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: PIXEL, fontSize: 10, marginBottom: 4 }}>YOUR BET · {racer?.symbol ?? '…'}{mine.length > 0 ? ` · ${sol(amount)}` : ''}</div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{status}</div>
        {(duel.status === 'open' || duel.status === 'ready') && mine.length > 0 && (
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>If {racer?.symbol} leaves or is kicked before the start, your bet comes back in full.</div>
        )}
      </div>
    </div>
  )
}

function DuelTrack({ duel, onCheer, bursts, pickedSeat, me }: { duel: Duel; onCheer: (seat: number) => void; bursts: Record<number, number[]>; pickedSeat?: number; me?: string }) {
  const live = useLivePrices({ enabled: duel.status === 'running' || duel.status === 'starting' })
  const running = duel.status === 'running'
  const final = duel.status === 'resolved'
  const returns = duel.racers.map((r) => {
    if (final) return r.returnValue
    if (!running || r.startPrice === 0n) return 0n
    const p = live.assets[r.symbol]
    return p && p.decimals === r.priceDecimals ? calculateReturnWad(r.startPrice, p.raw) : 0n
  })
  const max = returns.reduce((a, b) => (b > a ? b : a), returns[0] ?? 0n)
  const min = returns.reduce((a, b) => (b < a ? b : a), returns[0] ?? 0n)
  const span = max - min
  // 0 = start line, 1 = finish: the leader runs up to the finish line, the rest by their return.
  const progress = (ret: bigint) => (!running && !final ? 0 : span === 0n ? 0.45 : 0.05 + (Number(((ret - min) * 1000n) / span) / 1000) * 0.95)
  // While the lobby fills, all six places are shown; once it starts only the racers.
  const filling = duel.status === 'open' || duel.status === 'ready'
  const lanes = filling ? DUEL_RULES.maxRacers : Math.max(duel.racers.length, 2)
  const firstFree = duel.racers.length
  return (
    <div className="rx-raised" style={{ position: 'relative', background: ROAD, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, right: '6%', width: 24, background: `repeating-conic-gradient(${INK} 0% 25%, ${CREAM} 0% 50%) 0 0 / 24px 24px` }} />
      {Array.from({ length: lanes }, (_, i) => {
        const r = duel.racers[i]
        const ret = returns[i] ?? 0n
        return (
          <div key={i} style={{ position: 'relative', height: r ? 'clamp(64px, 10vw, 84px)' : 56, borderTop: i ? '2px dashed rgba(255,246,223,0.25)' : 'none' }}>
            {/* Lane markings rush past while racing, each lane at its own speed; before the start they drift slowly. */}
            {!final && <div className="rx-life-road" style={{ position: 'absolute', left: 0, right: 0, bottom: 10, height: 3, background: 'repeating-linear-gradient(90deg, rgba(255,246,223,0.22) 0 18px, transparent 18px 36px)', ...life(duel.id * 11 + i, 1, running ? 0.35 : 3, running ? 0.7 : 6) }} />}
            {r ? (
              <>
                <button type="button" onClick={() => onCheer(r.seat)} title="Cheer" className="rx-btn rx-btn-white" style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', zIndex: 2, padding: '6px 8px', fontSize: 13, fontWeight: 700, margin: 0 }}>
                  <span style={{ fontFamily: EMOJI, fontSize: 18, verticalAlign: 'middle' }}>👍</span> {r.cheers}
                </button>
                {/* The coin and its label are shifted back by their own width as they near the finish, so they never leave the track (phones). */}
                <div style={{ position: 'absolute', top: 6, left: `calc(70px + (100% - 120px) * ${progress(ret)})`, transform: `translateX(${-progress(ret) * 100}%)`, transition: 'left 1.2s steps(6), transform 1.2s steps(6)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* Racing: a quick bob; waiting: jogging in place. Every lane has its own tempo and phase. */}
                  <div className={running ? 'rx-life-bob' : final ? undefined : 'rx-life-idle'} style={{ position: 'relative', ...life(duel.id * 11 + r.seat, 2, running ? 0.3 : 1.1, running ? 0.55 : 2.6) }}>
                    {final && duel.winnerSeat === r.seat && <span style={{ position: 'absolute', left: '26%', top: -14 }}><PxSprite data={crown} width={26} height={15} /></span>}
                    {r.wallet === me && <span className="rx-plate" style={{ position: 'absolute', left: '50%', top: final && duel.winnerSeat === r.seat ? 6 : -4, transform: 'translateX(-50%)', zIndex: 3, fontFamily: PIXEL, fontSize: 8, lineHeight: 1, color: CREAM, background: PINK, padding: '3px 5px', whiteSpace: 'nowrap' }}>YOU</span>}
                    {(bursts[r.seat] ?? []).map((burstId) => <Burst key={burstId} id={burstId} />)}
                    <CoinFighter body={COIN_BODIES[i % COIN_BODIES.length]} logoUrl={assetIconUrl(r.symbol)} symbol={r.symbol} size={48} />
                  </div>
                  <span className="rx-plate" style={{ fontFamily: PIXEL, fontSize: 9, background: r.wallet === me ? PINK : CREAM, color: r.wallet === me ? CREAM : INK, padding: '5px 6px', whiteSpace: 'nowrap' }}>
                    {r.symbol}{(running || final) ? ` ${formatReturnAdaptive(ret)}` : ''}{pickedSeat === r.seat ? ' · YOUR PICK' : ''}
                  </span>
                </div>
              </>
            ) : (
              <>
                {/* A faded coin keeps changing: what could race here. */}
                <span style={{ position: 'absolute', left: 16, top: '50%', marginTop: -22 }}><GhostCoin seed={duel.id * 11 + i} /></span>
                <span className="rx-life-blink" style={{ position: 'absolute', left: 72, top: '50%', transform: 'translateY(-50%)', color: CREAM, opacity: 0.7, fontFamily: PIXEL, fontSize: 9, ...life(duel.id * 11 + i, 4, 1.4, 2.4) }}>{filling && i === firstFree ? 'YOUR COIN HERE · JOIN >' : 'WAITING FOR A RACER…'}</span>
              </>
            )}
          </div>
        )
      })}
      {(final || duel.status === 'void') && <FinishBanner duel={duel} me={me} />}
    </div>
  )
}

/** Over the finished track: race over, who won (or why it was cancelled). */
function FinishBanner({ duel, me }: { duel: Duel; me?: string }) {
  const winner = duel.status === 'resolved' ? duel.racers.find((r) => r.seat === duel.winnerSeat) : undefined
  const youWon = winner != null && winner.wallet === me
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, background: 'rgba(27, 19, 64, 0.45)', pointerEvents: 'none' }}>
      <div className="rx-raised" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '16px 22px', background: winner ? YELLOW : CREAM, color: INK, textAlign: 'center', maxWidth: '100%' }}>
        <span style={{ fontFamily: PIXEL, fontSize: 'clamp(11px, 1.6vw, 14px)' }}>{winner ? 'RACE OVER' : 'RACE CANCELLED'}</span>
        {winner ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <PxSprite data={crown} width={26} height={15} />
            <span style={{ fontFamily: PIXEL, fontSize: 'clamp(13px, 2.2vw, 20px)' }}>{winner.symbol} WINS</span>
            <span style={{ fontSize: 22, fontWeight: 700 }}>{formatReturnAdaptive(winner.returnValue)}</span>
          </span>
        ) : (
          <span style={{ fontSize: 18, fontWeight: 700 }}>No winner this time - every stake goes back.</span>
        )}
        {youWon && <span className="rx-plate" style={{ fontFamily: PIXEL, fontSize: 10, color: CREAM, background: PINK, padding: '5px 8px' }}>YOU WON!</span>}
      </div>
    </div>
  )
}

function racerStatus(duel: Duel, r: DuelRacer, now: number) {
  if (!r.paid) return { text: `PAYING ${clock(r.joinedAt + DUEL_RULES.payWindow - now)}`, bg: '#FFFFFF' }
  if (duel.status === 'open') return { text: 'PAID', bg: YELLOW }
  if (duel.status === 'ready') {
    if (r.ready) return { text: 'READY ✓', bg: '#8BE89A' }
    if (r.readyDeadline > 0) return { text: `${r.prepared ? 'PREPARING ' : ''}${clock(r.readyDeadline - now)}`, bg: PINK }
    return { text: 'PAID', bg: YELLOW }
  }
  if (duel.status === 'resolved') return duel.winnerSeat === r.seat ? { text: 'WINNER', bg: YELLOW } : { text: 'LOST', bg: '#FFFFFF' }
  return { text: duel.status === 'running' ? 'RACING' : duel.status.toUpperCase(), bg: '#FFFFFF' }
}

export function OnchainDuelPage() {
  const params = useParams()
  const id = /^\d+$/.test(params.duelId ?? '') ? Number(params.duelId) : null
  const { duel, isLoading, refetch } = useDuel(id)
  const { publicKey, connected } = useWallet()
  const me = publicKey?.toBase58()
  const stake = useStakeTransfer()
  const act = useSignedAction()
  // A finished market-cap duel still needs the coins' supply to show caps.
  const live = useLivePrices({ enabled: duel != null && ((duel.status !== 'resolved' && duel.status !== 'void') || duel.unit === 'cap') })
  // Market cap only for memes: crypto here is bridged, and its Solana supply is not the coin's real cap.
  const capShown = duel?.unit === 'cap' && duel.category === 'meme'
  const { assets } = useApprovedRaceAssets()
  const now = useServerNowMs() / 1000
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [coin, setCoin] = useState<ApprovedRaceAsset | null>(null)
  const [stakeCents, setStakeCents] = useState(500n)
  const [duration, setDuration] = useState(0)
  const [unit, setUnit] = useState<'cap' | 'price'>('cap')
  const [backSeat, setBackSeat] = useState<number | null>(null)
  const [backCents, setBackCents] = useState(500n)
  // A bet transfer that landed but the server has not applied yet.
  const [backSent, setBackSent] = useState<{ seat: number; at: number } | null>(null)
  // Active confetti bursts per racer seat (ids), at most MAX_BURSTS at a time.
  const [bursts, setBursts] = useState<Record<number, number[]>>({})
  const burstSeq = useRef(0)
  const seenCheers = useRef<Record<number, number> | null>(null)
  const ownCheers = useRef<Record<number, number>>({})

  const mine = duel && me ? duel.racers.find((r) => r.wallet === me) : undefined
  const myBacking = duel && me ? duel.backers.filter((b) => b.wallet === me) : []
  const open = duel && (duel.status === 'open' || duel.status === 'ready')
  const timerRunning = !!duel?.racers.some((r) => r.ready)
  const category = duel?.category ?? (coin ? (coin.category === 1 ? 'meme' : 'crypto') : null)
  const durations = category ? DUEL_RULES.durations[category] : DUEL_RULES.durations.meme
  const pickable = useMemo(() => assets.filter((a) => (duel?.category ? (duel.category === 'meme' ? a.category === 1 : a.category === 2) : a.category !== 0) && !duel?.racers.some((r) => r.symbol === a.symbol)), [assets, duel])

  async function run(label: string, fn: () => Promise<void>) {
    setError(null)
    setNotice(null)
    setBusy(label)
    try {
      await fn()
      await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ['game-state'] })])
    } catch (cause) {
      setError(stakeQuoteErrorMessage(cause) ?? shortTxError(cause, 'duel'))
      // The transfer may have landed: show the real state, never invite a
      // second payment.
      if (cause instanceof TxUnconfirmedError) void Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ['game-state'] })])
    } finally {
      setBusy(null)
    }
  }

  async function transfer(lamports: bigint, seat: number) {
    if (id == null) return
    const message = await stake(lamports, duelStake(id, seat))
    if (message) setError(message)
  }

  /** Starts one confetti burst on a seat; false when MAX_BURSTS are already playing there. */
  function spawnBurst(seat: number, active: Record<number, number[]>) {
    if ((active[seat] ?? []).length >= MAX_BURSTS) return false
    const burstId = ++burstSeq.current + Date.now()
    setBursts((b) => ({ ...b, [seat]: [...(b[seat] ?? []), burstId] }))
    setTimeout(() => setBursts((b) => ({ ...b, [seat]: (b[seat] ?? []).filter((x) => x !== burstId) })), BURST_MS)
    return true
  }

  function cheer(seat: number) {
    // A sixth click while five bursts play is ignored (not sent either).
    if (!spawnBurst(seat, bursts)) return
    ownCheers.current[seat] = (ownCheers.current[seat] ?? 0) + 1
    void cheerRacer(id!, seat).then(() => refetch())
  }

  // Other people's cheers: when a racer's counter grows by more than our own
  // clicks, play bursts for them too (up to three per refresh).
  const cheerCounts = duel ? duel.racers.map((r) => `${r.seat}:${r.cheers}`).join(',') : ''
  useEffect(() => {
    if (!duel) return
    const previous = seenCheers.current
    seenCheers.current = Object.fromEntries(duel.racers.map((r) => [r.seat, r.cheers]))
    if (!previous) return
    for (const r of duel.racers) {
      const delta = r.cheers - (previous[r.seat] ?? r.cheers)
      if (delta <= 0) continue
      const own = Math.min(delta, ownCheers.current[r.seat] ?? 0)
      ownCheers.current[r.seat] = (ownCheers.current[r.seat] ?? 0) - own
      const fromOthers = Math.min(3, delta - own)
      for (let k = 0; k < fromOthers; k++) setTimeout(() => setBursts((b) => {
        if ((b[r.seat] ?? []).length >= MAX_BURSTS) return b
        const burstId = ++burstSeq.current + Date.now()
        setTimeout(() => setBursts((x) => ({ ...x, [r.seat]: (x[r.seat] ?? []).filter((y) => y !== burstId) })), BURST_MS)
        return { ...b, [r.seat]: [...(b[r.seat] ?? []), burstId] }
      }), k * 180)
    }
  }, [cheerCounts]) // eslint-disable-line react-hooks/exhaustive-deps

  if (id == null) return <p style={{ padding: 48, fontFamily: PIXEL }}>INVALID LOBBY</p>
  const label = { display: 'block', marginBottom: 8, fontFamily: PIXEL, fontSize: 10 } as const
  const choice = (active: boolean) => `rx-btn ${active ? 'rx-btn-yellow' : 'rx-btn-white'}`
  const usd = (cents: bigint) => `$${Number(cents) / 100}`
  const stakeLamports = live.solUsd ? usdCentsToLamports(stakeCents, live.solUsd.priceRaw, live.solUsd.decimals) : null
  const valueOf = (r: DuelRacer, raw: bigint) => {
    const p = live.assets[r.symbol]
    if (capShown && p?.supply) return formatCompactUsd(marketCapUsd({ ...p, raw }) ?? 0)
    // Six significant digits: a one-minute race can move only the last ones.
    return raw > 0n ? `$${plain(Number(formatUnits(raw, r.priceDecimals)), 6)}` : '-'
  }
  /** Start -> now (racing, live) or -> end (finished), with the change in % and in $ (price or cap). */
  const moveOf = (r: DuelRacer) => {
    if (!duel || r.startPrice === 0n) return null
    const p = live.assets[r.symbol]
    const now = r.endPrice > 0n ? r.endPrice : duel.status === 'running' && p && p.decimals === r.priceDecimals ? p.raw : 0n
    if (now === 0n) return `start ${valueOf(r, r.startPrice)}`
    const diff = now - r.startPrice
    let delta: string
    if (capShown && p?.supply) {
      const d = (marketCapUsd({ ...p, raw: now }) ?? 0) - (marketCapUsd({ ...p, raw: r.startPrice }) ?? 0)
      delta = `${d >= 0 ? '+' : '-'}${formatCompactUsd(Math.abs(d))}`
    } else {
      const d = Number(formatUnits(diff < 0n ? -diff : diff, r.priceDecimals))
      delta = `${diff >= 0n ? '+' : '-'}$${plain(d, 3)}`
    }
    return `${valueOf(r, r.startPrice)} → ${r.endPrice > 0n ? '' : 'now '}${valueOf(r, now)} · ${formatReturnAdaptive(calculateReturnWad(r.startPrice, now))} (${delta})`
  }

  return (
    <div style={{ minHeight: '100%', background: SKY, color: INK, fontFamily: "'Pixelify Sans', 'Courier New', monospace" }}>
      <div className="mx-auto max-w-[1200px] px-4 py-6">
        <Link to="/onchain/races" style={{ fontSize: 16, fontWeight: 700 }}>← All lobbies</Link>
        {isLoading || !duel ? <p className="rx-plate" style={{ display: 'inline-block', marginTop: 32, background: CREAM, padding: '10px 14px', fontWeight: 700 }}>{isLoading ? 'Loading lobby…' : 'This lobby opens when the game server is back online.'}</p> : (
          <>
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <h1 style={{ margin: 0, fontFamily: PIXEL, fontSize: 'clamp(16px, 2.2vw, 26px)', fontWeight: 400, lineHeight: 1.4, textShadow: `4px 4px 0 ${YELLOW}` }}>{duel.title.toUpperCase()}</h1>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="rx-plate" style={{ fontFamily: PIXEL, fontSize: 10, background: CREAM, padding: '8px 10px' }}>{duelPhaseLabel(duel)}</span>
                {duel.status === 'running' && <span className="rx-plate" style={{ fontFamily: PIXEL, fontSize: 12, background: PINK, padding: '8px 10px' }}>{clock(duel.endTime - now)}</span>}
                {duel.status === 'starting' && <span className="rx-plate" style={{ fontFamily: PIXEL, fontSize: 10, background: PINK, padding: '8px 10px', animation: 'rx-blink 0.6s steps(1) infinite' }}>GO!</span>}
              </div>
            </div>
            {duel.category && (
              <p style={{ margin: '8px 0 0', fontSize: 16, fontWeight: 700 }}>
                {duel.category === 'meme' ? 'Memes' : 'Crypto'} · stake {sol(duel.stake)} · {durationLabel(duel.duration)} · by {capShown ? 'market cap' : 'price'} · pot {sol(duel.pot)}
              </p>
            )}

            <div style={{ marginTop: 16 }}>
              <DuelTrack duel={duel} onCheer={cheer} bursts={bursts} pickedSeat={myBacking[0]?.seat} me={me} />
            </div>

            <div style={{ marginTop: 24, display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'start' }}>
              {/* racers */}
              <div className="rx-raised" style={{ background: CREAM, padding: 16 }}>
                <span style={label}>RACERS {duel.racers.length}/{DUEL_RULES.maxRacers}</span>
                {duel.racers.length === 0 && <p style={{ margin: 0, fontWeight: 600, opacity: 0.7 }}>Empty lobby. Be the first: your coin, your stake, your rules.</p>}
                {duel.racers.map((r, i) => {
                  const st = racerStatus(duel, r, now)
                  return (
                    <div key={r.seat} className="rx-hop-host" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? `2px solid rgba(27,19,64,0.1)` : 'none' }}>
                      <CoinFighter body={COIN_BODIES[i % COIN_BODIES.length]} logoUrl={assetIconUrl(r.symbol)} symbol={r.symbol} size={40} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 17 }}>{r.symbol}{r.wallet === me ? ' (you)' : ''}{myBacking.some((b) => b.seat === r.seat) && <span style={{ marginLeft: 8, background: YELLOW, border: `2px solid ${INK}`, fontFamily: PIXEL, fontSize: 8, padding: '3px 5px', verticalAlign: 'middle' }}>YOUR PICK</span>}</div>
                        <div style={{ fontSize: 13, opacity: 0.6 }}><AddressLabel address={r.wallet} />{r.backers > 0 && <> · backed {sol(r.backed)} by {r.backers}</>}</div>
                        {(duel.status === 'running' || duel.status === 'resolved') && r.startPrice > 0n && <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.75 }}>{moveOf(r)}</div>}
                      </div>
                      <span style={{ fontFamily: PIXEL, fontSize: 8, padding: '5px 6px', border: `2px solid ${INK}`, background: st.bg, whiteSpace: 'nowrap' }}>{st.text}</span>
                    </div>
                  )
                })}
              </div>

              {/* actions */}
              <div className="rx-raised" style={{ background: CREAM, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {me && <YourBet duel={duel} me={me} sending={backSent} />}
                {notice && <p style={{ margin: 0, fontWeight: 700 }}>{notice}</p>}
                {error && <p style={{ margin: 0, color: '#C2245A', fontWeight: 700 }}>{error}</p>}
                {duel.status === 'resolved' || duel.status === 'void' ? (
                  <div>
                    <span style={label}>{duel.status === 'resolved' ? 'PAYOUTS' : 'REFUNDS'}</span>
                    {duel.status === 'void' && <p style={{ margin: '0 0 8px', fontWeight: 600 }}>No winner this time ({duel.cancelReason === 'topTie' ? 'a tie at the top' : 'no price'}): every stake goes back.</p>}
                    {duel.payouts.filter((p) => p.kind === 'win' || p.kind === 'refund').map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 15, fontWeight: 600, padding: '4px 0' }}>
                        <AddressLabel address={p.wallet} />
                        {p.signature ? <a href={explorerUrl('tx', p.signature)} target="_blank" rel="noreferrer">{sol(p.amount)} ↗</a> : <span>{sol(p.amount)} · sending…</span>}
                      </div>
                    ))}
                  </div>
                ) : !connected ? <WalletOptionsList tone="race" /> : mine ? (
                  !mine.paid ? (
                    <>
                      <span style={label}>PAY YOUR STAKE · {clock(mine.joinedAt + DUEL_RULES.payWindow - now)} LEFT</span>
                      <button type="button" disabled={!!busy} onClick={() => run('pay', () => transfer(duel.stake, 0))} className="rx-btn rx-btn-yellow w-full" style={{ minHeight: 56, fontFamily: PIXEL, fontSize: 12 }}>{busy === 'pay' ? 'SENDING…' : `PAY ${sol(duel.stake)}`}</button>
                      <button type="button" disabled={!!busy} onClick={() => run('leave', async () => { await act({ action: 'duel-leave', duel: id }) })} className="rx-btn rx-btn-white" style={{ padding: '10px 14px', fontWeight: 700 }}>Leave lobby</button>
                    </>
                  ) : duel.status === 'open' ? (
                    <>
                      <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Paid. Waiting for a rival to pay…</p>
                      <button type="button" disabled={!!busy} onClick={() => run('leave', async () => { await act({ action: 'duel-leave', duel: id }); setNotice('Left - your stake is on its way back.') })} className="rx-btn rx-btn-white" style={{ padding: '10px 14px', fontWeight: 700 }}>Leave and get the stake back</button>
                    </>
                  ) : duel.status === 'ready' ? (
                    mine.ready ? (
                      <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>You are READY. Waiting for {duel.racers.filter((r) => !r.ready).map((r) => r.symbol).join(', ')}…</p>
                    ) : (
                      <>
                        <span style={label}>{timerRunning ? `READY CHECK · ${clock(mine.readyDeadline - now)} LEFT` : 'EVERYONE PAID - WHO IS READY?'}</span>
                        <button type="button" disabled={!!busy} onClick={() => run('ready', async () => { await act({ action: 'duel-ready', duel: id }) })} className="rx-btn rx-btn-pink w-full" style={{ minHeight: 72, fontFamily: PIXEL, fontSize: 18, animation: timerRunning ? 'rx-blink 0.8s steps(1) infinite' : undefined }}>{busy === 'ready' ? 'SIGN…' : 'READY!'}</button>
                        {timerRunning && !mine.prepared && <button type="button" disabled={!!busy} onClick={() => run('prepare', async () => { await act({ action: 'duel-prepare', duel: id }) })} className="rx-btn rx-btn-white" style={{ padding: '10px 14px', fontWeight: 700 }}>Preparing… (+{DUEL_RULES.prepareExtra}s, once)</button>}
                        {!timerRunning && <button type="button" disabled={!!busy} onClick={() => run('leave', async () => { await act({ action: 'duel-leave', duel: id }); setNotice('Left - your stake is on its way back.') })} className="rx-btn rx-btn-white" style={{ padding: '10px 14px', fontWeight: 700 }}>Leave with the full stake (nobody is ready yet)</button>}
                        <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>Once someone is ready, the others have one minute. Missing it costs 10% of the stake (20% if spectators backed you), shared by those who stayed.</p>
                      </>
                    )
                  ) : <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>The race is on - go {mine.symbol}! <span style={{ fontFamily: EMOJI }}>👍</span></p>
                ) : (
                  <>
                    {open && duel.racers.length < DUEL_RULES.maxRacers && myBacking.length === 0 && (
                      <fieldset disabled={!!busy} style={{ display: 'flex', flexDirection: 'column', gap: 12, border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                        <span style={label}>{duel.racers.length === 0 ? 'START THIS LOBBY WITH YOUR COIN' : 'JOIN WITH YOUR COIN'}</span>
                        <CoinPicker assets={pickable} selected={coin ? [coin.assetId] : []} onToggle={(a) => setCoin(coin?.assetId === a.assetId ? null : a)} max={1} />
                        {duel.racers.length === 0 && (
                          <>
                            <div><span style={label}>STAKE (EVERY RACER PAYS THE SAME)</span><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{STAKE_PRESETS.map((c) => <button key={String(c)} type="button" onClick={() => setStakeCents(c)} className={choice(stakeCents === c)} style={{ padding: '8px 12px', fontWeight: 700 }}>{usd(c)}</button>)}</div></div>
                            <div><span style={label}>RACE LENGTH</span><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{durations.map((s) => <button key={s} type="button" onClick={() => setDuration(s)} className={choice((duration || durations[0]) === s)} style={{ padding: '8px 12px', fontWeight: 700 }}>{durationLabel(s)}</button>)}</div></div>
                            {category !== 'crypto' && <div><span style={label}>SHOW</span><div style={{ display: 'flex', gap: 4 }}>{(['cap', 'price'] as const).map((u) => <button key={u} type="button" onClick={() => setUnit(u)} className={choice(unit === u)} style={{ padding: '8px 12px', fontWeight: 700 }}>{u === 'cap' ? 'Market cap' : 'Price'}</button>)}</div></div>}
                          </>
                        )}
                        <button
                          type="button"
                          disabled={!coin || !!busy || (duel.racers.length === 0 && !stakeLamports)}
                          onClick={() => run('join', async () => {
                            await act({
                              action: 'duel-join', duel: id, asset: coin!.symbol,
                              ...(duel.racers.length === 0 ? { stake: stakeLamports!.toString(), duration: durations.includes(duration) ? duration : durations[0], unit: category === 'crypto' ? 'price' : unit } : {}),
                            })
                            setCoin(null)
                            setNotice('You are in! Now pay your stake.')
                          })}
                          className="rx-btn rx-btn-yellow w-full"
                          style={{ minHeight: 56, fontFamily: PIXEL, fontSize: 12 }}
                        >
                          {busy === 'join' ? 'SIGNING…' : coin ? `ENTER WITH ${coin.symbol}` : 'PICK A COIN'}
                        </button>
                      </fieldset>
                    )}
                    {open && duel.racers.some((r) => r.paid) && (
                      <fieldset disabled={!!busy} style={{ display: 'flex', flexDirection: 'column', gap: 10, border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                        <span style={label}>BACK A RACER · UP TO $100</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{duel.racers.filter((r) => r.paid && (myBacking.length === 0 || myBacking[0].seat === r.seat)).map((r) => <button key={r.seat} type="button" onClick={() => setBackSeat(r.seat)} className={choice(backSeat === r.seat)} style={{ padding: '8px 12px', fontWeight: 700 }}>{r.symbol}</button>)}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{BACK_PRESETS.map((c) => <button key={String(c)} type="button" onClick={() => setBackCents(c)} className={choice(backCents === c)} style={{ padding: '8px 12px', fontWeight: 700 }}>{usd(c)}</button>)}</div>
                        <button type="button" disabled={!backSeat || !live.solUsd || !!busy} onClick={() => run('back', async () => { const seat = backSeat!; await transfer(quoteUsdCents(backCents, live.solUsd!), seat); setBackSent({ seat, at: Date.now() }) })} className="rx-btn rx-btn-pink w-full" style={{ minHeight: 52, fontFamily: PIXEL, fontSize: 11 }}>
                          {busy === 'back' ? 'SENDING…' : backSeat ? `BACK ${duel.racers.find((r) => r.seat === backSeat)?.symbol} WITH ${usd(backCents)}` : 'PICK A RACER'}
                        </button>
                        <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>If your racer wins you get your money back plus 70% of what was bet on the others (pro rata), minus 2% of the win. If your racer leaves or is kicked before the start, your bet comes back in full. Racers cannot back.</p>
                      </fieldset>
                    )}
                    {!open && myBacking.length === 0 && <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{duel.status === 'running' ? <>The race is on! Cheer for your favourite <span style={{ fontFamily: EMOJI }}>👍</span></> : 'Starting…'}</p>}
                  </>
                )}
              </div>
            </div>

            {open && (
              <div style={{ marginTop: 24 }}>
                <CoinsToBring
                  assets={assets}
                  taken={duel.racers.map((r) => r.symbol)}
                  category={duel.category}
                  // Picking fills the join form; spectators and racers already in only look.
                  onPick={connected && !mine && duel.racers.length < DUEL_RULES.maxRacers ? (a) => { setCoin(a); window.scrollTo({ top: 0, behavior: 'smooth' }) } : undefined}
                />
              </div>
            )}
            <h2 style={{ margin: '40px 0 16px', fontFamily: PIXEL, fontSize: 14, fontWeight: 400 }}>THE NUMBERS</h2>
            <DuelNumbers />
          </>
        )}
      </div>
      {/* The practice heat would only confuse next to a real race. */}
      {duel && duel.status !== 'running' && duel.status !== 'starting' && <PracticeLap />}
    </div>
  )
}
