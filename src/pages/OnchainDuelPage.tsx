import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { quoteUsdCents, usdCentsToLamports, stakeQuoteErrorMessage } from '@/chain/stakeQuote'
import { DUEL_RULES, cheerRacer, duelPhaseLabel, duelStake, durationLabel, useDuel, useNowSeconds, type Duel, type DuelRacer } from '@/chain/duels'
import { reportDepositSafely, useGameServerConfig, useSignedAction } from '@/chain/gameServer'
import { stakeInstructions } from '@/chain/gameTx'
import { marketCapUsd, useLivePrices } from '@/chain/livePrices'
import { useApprovedRaceAssets } from '@/chain/useApprovedRaceAssets'
import { calculateReturnWad, formatReturnWad, type ApprovedRaceAsset } from '@/chain/assetRaces'
import { AddressLabel } from '@/components/AddressLabel'
import { CoinPicker, COIN_BODIES } from '@/components/GamePickers'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { assetIconUrl } from '@/lib/assetIcons'
import { formatCompactUsd, formatUnits, shortTxError } from '@/lib/format'
import { useSendInstructions, TxUnconfirmedError } from '@/solana/tx'
import { explorerUrl } from '@/solana/config'
import { CoinFighter } from '@/retro/landingFx'
import { PxSprite } from '@/retro/Sprite'
import { CREAM, INK, PINK, ROAD, SKY, YELLOW, PIXEL } from '@/retro/scene'
import { crown } from '@/retro/spriteData'

// Pixel fonts have no emoji; the firework uses the system emoji font.
const EMOJI = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif"
const STAKE_PRESETS = [100n, 500n, 1_000n, 2_500n, 5_000n]
const BACK_PRESETS = [100n, 500n, 1_000n, 2_500n, 5_000n, 10_000n]
const sol = (raw: bigint) => `${Number(Number(formatUnits(raw, 9)).toPrecision(4))} SOL`
const clock = (seconds: number) => `${Math.max(0, Math.floor(seconds / 60))}:${String(Math.max(0, Math.floor(seconds % 60))).padStart(2, '0')}`

function Burst({ id }: { id: number }) {
  const colors = [PINK, YELLOW, '#4DB5FF', '#5FD46E', '#A77BFF']
  return (
    <span key={id} aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '30%', pointerEvents: 'none' }}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="rx-fx-burst" style={{ position: 'absolute', width: 8, height: 8, background: colors[i % colors.length], boxShadow: `0 0 0 2px ${INK}`, ['--rx-a' as string]: `${i * 36}deg` }} />
      ))}
    </span>
  )
}

/** The track: lanes per racer; during the race coins move by their live gain. */
function DuelTrack({ duel, onCheer, bursts }: { duel: Duel; onCheer: (seat: number) => void; bursts: Record<number, number> }) {
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
  const position = (ret: bigint) => (!running && !final ? 4 : span === 0n ? 40 : 8 + Number(((ret - min) * 1000n) / span) / 1000 * 74)
  const lanes = Math.max(duel.racers.length, 2)
  return (
    <div className="rx-raised" style={{ position: 'relative', background: ROAD, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, bottom: 0, right: '6%', width: 24, background: `repeating-conic-gradient(${INK} 0% 25%, ${CREAM} 0% 50%) 0 0 / 24px 24px` }} />
      {Array.from({ length: lanes }, (_, i) => {
        const r = duel.racers[i]
        const ret = returns[i] ?? 0n
        return (
          <div key={i} style={{ position: 'relative', height: 'clamp(64px, 10vw, 84px)', borderTop: i ? '2px dashed rgba(255,246,223,0.25)' : 'none' }}>
            {r ? (
              <>
                <button type="button" onClick={() => onCheer(r.seat)} title="Cheer" className="rx-btn rx-btn-white" style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', zIndex: 2, padding: '6px 8px', fontSize: 13, fontWeight: 700, margin: 0 }}>
                  <span style={{ fontFamily: EMOJI }}>🎆</span> {r.cheers}
                </button>
                <div style={{ position: 'absolute', top: 6, left: `calc(70px + ${position(ret)}% * 0.8)`, transition: 'left 1.2s steps(6)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ position: 'relative', animation: running ? 'rx-bob 0.4s steps(1) infinite' : undefined }}>
                    {final && duel.winnerSeat === r.seat && <span style={{ position: 'absolute', left: '26%', top: -14 }}><PxSprite data={crown} width={26} height={15} /></span>}
                    {bursts[r.seat] ? <Burst id={bursts[r.seat]} /> : null}
                    <CoinFighter body={COIN_BODIES[i % COIN_BODIES.length]} logoUrl={assetIconUrl(r.symbol)} symbol={r.symbol} size={48} />
                  </div>
                  <span className="rx-plate" style={{ fontFamily: PIXEL, fontSize: 9, background: CREAM, padding: '5px 6px', whiteSpace: 'nowrap' }}>
                    {r.symbol}{(running || final) ? ` ${formatReturnWad(ret)}` : ''}
                  </span>
                </div>
              </>
            ) : (
              <span style={{ position: 'absolute', left: 80, top: '50%', transform: 'translateY(-50%)', color: CREAM, opacity: 0.5, fontFamily: PIXEL, fontSize: 9 }}>WAITING FOR A RACER…</span>
            )}
          </div>
        )
      })}
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
  const send = useSendInstructions()
  const act = useSignedAction()
  const config = useGameServerConfig()
  const live = useLivePrices({ enabled: duel != null && duel.status !== 'resolved' && duel.status !== 'void' })
  const { assets } = useApprovedRaceAssets()
  const now = useNowSeconds()
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
  const [bursts, setBursts] = useState<Record<number, number>>({})

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
    const gameWallet = config.data?.gameWallet
    if (!publicKey || !gameWallet || id == null) throw new Error('The game server is not reachable right now')
    const signature = await send(stakeInstructions({ player: publicKey, gameWallet, lamports, memo: duelStake(id, seat) }))
    const message = await reportDepositSafely(signature)
    if (message) setError(message)
  }

  function cheer(seat: number) {
    setBursts((b) => ({ ...b, [seat]: Date.now() }))
    void cheerRacer(id!, seat).then(() => refetch())
  }

  if (id == null) return <p style={{ padding: 48, fontFamily: PIXEL }}>INVALID LOBBY</p>
  const label = { display: 'block', marginBottom: 8, fontFamily: PIXEL, fontSize: 10 } as const
  const choice = (active: boolean) => `rx-btn ${active ? 'rx-btn-yellow' : 'rx-btn-white'}`
  const usd = (cents: bigint) => `$${Number(cents) / 100}`
  const stakeLamports = live.solUsd ? usdCentsToLamports(stakeCents, live.solUsd.priceRaw, live.solUsd.decimals) : null
  const valueOf = (r: DuelRacer, raw: bigint) => {
    const p = live.assets[r.symbol]
    if (duel?.unit === 'cap' && p?.supply) return formatCompactUsd(marketCapUsd({ ...p, raw }) ?? 0)
    return raw > 0n ? `$${Number(Number(formatUnits(raw, r.priceDecimals)).toPrecision(4))}` : '-'
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
                {duel.category === 'meme' ? 'Memes' : 'Crypto'} · stake {sol(duel.stake)} · {durationLabel(duel.duration)} · by {duel.unit === 'cap' ? 'market cap' : 'price'} · pot {sol(duel.pot)}
              </p>
            )}

            <div style={{ marginTop: 16 }}>
              <DuelTrack duel={duel} onCheer={cheer} bursts={bursts} />
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
                        <div style={{ fontWeight: 700, fontSize: 17 }}>{r.symbol}{r.wallet === me ? ' (you)' : ''}</div>
                        <div style={{ fontSize: 13, opacity: 0.6 }}><AddressLabel address={r.wallet} /> · backed {sol(r.backed)} by {r.backers}</div>
                        {(duel.status === 'running' || duel.status === 'resolved') && r.startPrice > 0n && <div style={{ fontSize: 12, opacity: 0.6 }}>start {valueOf(r, r.startPrice)}{r.endPrice > 0n ? ` → ${valueOf(r, r.endPrice)}` : ''}</div>}
                      </div>
                      <span style={{ fontFamily: PIXEL, fontSize: 8, padding: '5px 6px', border: `2px solid ${INK}`, background: st.bg, whiteSpace: 'nowrap' }}>{st.text}</span>
                    </div>
                  )
                })}
              </div>

              {/* actions */}
              <div className="rx-raised" style={{ background: CREAM, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {notice && <p style={{ margin: 0, fontWeight: 700 }}>{notice}</p>}
                {error && <p style={{ margin: 0, color: '#C2245A', fontWeight: 700 }}>{error}</p>}
                {!connected ? <WalletOptionsList tone="race" /> : duel.status === 'resolved' || duel.status === 'void' ? (
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
                ) : mine ? (
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
                  ) : <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>The race is on - go {mine.symbol}! <span style={{ fontFamily: EMOJI }}>🎆</span></p>
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
                            <div><span style={label}>SHOW</span><div style={{ display: 'flex', gap: 4 }}>{(['cap', 'price'] as const).map((u) => <button key={u} type="button" onClick={() => setUnit(u)} className={choice(unit === u)} style={{ padding: '8px 12px', fontWeight: 700 }}>{u === 'cap' ? 'Market cap' : 'Price'}</button>)}</div></div>
                          </>
                        )}
                        <button
                          type="button"
                          disabled={!coin || !!busy || (duel.racers.length === 0 && !stakeLamports)}
                          onClick={() => run('join', async () => {
                            await act({
                              action: 'duel-join', duel: id, asset: coin!.symbol,
                              ...(duel.racers.length === 0 ? { stake: stakeLamports!.toString(), duration: durations.includes(duration) ? duration : durations[0], unit } : {}),
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
                        <button type="button" disabled={!backSeat || !live.solUsd || !!busy} onClick={() => run('back', () => transfer(quoteUsdCents(backCents, live.solUsd!), backSeat!))} className="rx-btn rx-btn-pink w-full" style={{ minHeight: 52, fontFamily: PIXEL, fontSize: 11 }}>
                          {busy === 'back' ? 'SENDING…' : backSeat ? `BACK ${duel.racers.find((r) => r.seat === backSeat)?.symbol} WITH ${usd(backCents)}` : 'PICK A RACER'}
                        </button>
                        {myBacking.length > 0 && <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>You backed {duel.racers.find((r) => r.seat === myBacking[0].seat)?.symbol} with {sol(myBacking.reduce((s, b) => s + b.amount, 0n))}.</p>}
                        <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>If your racer wins you get your money back plus 70% of what was bet on the others (pro rata), minus 2% of the win. Racers cannot back.</p>
                      </fieldset>
                    )}
                    {!open && <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{duel.status === 'running' ? <>The race is on! Cheer for your coin <span style={{ fontFamily: EMOJI }}>🎆</span></> : 'Starting…'}</p>}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
