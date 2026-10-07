import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { useSignedAction } from '@/chain/gameServer'
import { useLivePrices } from '@/chain/livePrices'
import { useServerNowMs } from '@/chain/serverClock'
import { quoteUsdCents } from '@/chain/stakeQuote'
import { CANCEL_REASON, SHOT_RULES, provisionalOrder, shotPhaseLabel, useGameBalance, useShot, type Shot, type ShotEntry } from '@/chain/shots'
import { AddressLabel } from '@/components/AddressLabel'
import { GameBalancePanel } from '@/components/GameBalancePanel'
import { ShotChart, formatChartValue, type ChartLine } from '@/components/ShotChart'
import { usePlatformLogin } from '@/components/WalletAccountModals'
import { prophetWalletStore } from '@/solana/prophetWallet'
import { assetIconUrl } from '@/lib/assetIcons'
import { formatUnits, shortTxError } from '@/lib/format'
import { CoinFighter } from '@/retro/landingFx'
import { COIN_BODIES, LaunchpadWarning } from '@/components/GamePickers'
import { useApprovedRaceAssets } from '@/chain/useApprovedRaceAssets'
import { CREAM, INK, PINK, PIXEL, YELLOW } from '@/retro/scene'
import { InviteButton } from '@/components/InviteButton'

// Price Shot room: Ready -> Aim (30 s, crosshair + stake, Lock Shot) -> Live
// (everyone's shots, provisional places) -> Results. Stakes come from the game
// balance and winnings go back to it.

const NIGHT = '#4B37B0'
const sol = (raw: bigint) => `${Number(Number(formatUnits(raw, 9)).toPrecision(4))} SOL`
const clock = (seconds: number) => `${Math.max(0, Math.floor(seconds / 60))}:${String(Math.max(0, Math.floor(seconds % 60))).padStart(2, '0')}`
const durationLabel = (s: number) => (s >= 3600 ? `${s / 3600} h` : `${s / 60} min`)
const STAKE_PRESETS = [100n, 500n, 1_000n, 2_500n, 5_000n]
const usd = (cents: bigint) => `$${Number(cents) / 100}`
const label = { display: 'block', marginBottom: 8, fontFamily: PIXEL, fontSize: 10 } as const

/** The player's own locked shot, remembered locally while the server hides it. */
const ownShotKey = (id: number, wallet: string) => `prophet_shot_${id}_${wallet}`
function rememberShot(id: number, wallet: string, value: number) {
  try {
    sessionStorage.setItem(ownShotKey(id, wallet), String(value))
  } catch {
    /* storage blocked: shown again once the match starts */
  }
}
function recallShot(id: number, wallet: string): number | null {
  try {
    const v = Number(sessionStorage.getItem(ownShotKey(id, wallet)))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

export function OnchainShotPage() {
  const params = useParams()
  const id = params.shotId != null && /^\d+$/.test(params.shotId) ? Number(params.shotId) : null
  const { shot, isLoading, refetch } = useShot(id)
  const { publicKey } = useWallet()
  const me = publicKey?.toBase58()
  const act = useSignedAction()
  const login = usePlatformLogin()
  const queryClient = useQueryClient()
  const now = useServerNowMs() / 1000
  // Finished cap rooms still need the coin's supply to show caps.
  const live = useLivePrices({ enabled: shot != null && ((shot.status !== 'resolved' && shot.status !== 'cancelled') || shot.unit === 'cap') })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(name: string, fields: Record<string, unknown>) {
    setError(null)
    setBusy(name)
    try {
      await act(fields)
      await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ['game-balance'] }), queryClient.invalidateQueries({ queryKey: ['game-state'] })])
    } catch (cause) {
      setError(shortTxError(cause, 'shot'))
    } finally {
      setBusy(null)
    }
  }

  if (id == null) return <p style={{ padding: 48, fontFamily: PIXEL }}>INVALID ROOM</p>
  const price = shot ? live.assets[shot.symbol] : undefined
  const livePrice = price ? Number(price.raw) / 10 ** price.decimals : null
  const supply = price?.supply ? Number(price.supply.raw) / 10 ** price.supply.decimals : null
  const unit = shot?.unit === 'cap' && supply ? 'cap' : 'price'

  return (
    <div style={{ minHeight: '100%', background: NIGHT, color: CREAM, fontFamily: "'Pixelify Sans', 'Courier New', monospace" }}>
      <div className="mx-auto max-w-[1200px] px-4 py-6">
        <Link to="/onchain/shots" style={{ fontSize: 16, fontWeight: 700, color: CREAM }}>← All rooms</Link>
        {isLoading || !shot ? <p className="rx-plate" style={{ display: 'inline-block', marginTop: 32, background: CREAM, color: INK, padding: '10px 14px', fontWeight: 700 }}>{isLoading ? 'Loading room…' : 'This room opens when the game server is back online.'}</p> : (
          <>
            <Header shot={shot} now={now} livePrice={livePrice} unit={unit} supply={supply} />
            <div style={{ marginTop: 20, display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                {shot.status === 'open' && <ReadyPanel shot={shot} me={me} busy={busy} run={run} onLogin={login.start} />}
                {shot.status === 'aim' && <AimPanel shot={shot} me={me} now={now} busy={busy} run={run} livePrice={livePrice} unit={unit} supply={supply} solUsd={live.solUsd} />}
                {(shot.status === 'live' || shot.status === 'resolved') && <MatchPanel shot={shot} me={me} now={now} livePrice={livePrice} unit={unit} supply={supply} />}
                {shot.status === 'cancelled' && (
                  <div className="rx-raised" style={{ padding: 20, background: CREAM, color: INK }}>
                    <span style={label}>MATCH CANCELLED</span>
                    <p style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{CANCEL_REASON[shot.cancelReason] ?? 'The match did not happen.'} Every stake is back on its player&apos;s game balance.</p>
                  </div>
                )}
                {error && <p className="rx-plate" style={{ margin: 0, padding: '10px 14px', background: PINK, color: CREAM, fontWeight: 700 }}>{error}</p>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                {me && <GameBalancePanel />}
                <PlayersPanel shot={shot} me={me} />
              </div>
            </div>
          </>
        )}
        {login.modal}
      </div>
    </div>
  )
}

function Header({ shot, now, livePrice, unit, supply }: { shot: Shot; now: number; livePrice: number | null; unit: 'price' | 'cap'; supply: number | null }) {
  const timer = shot.status === 'aim' ? shot.aimEndsAt - now : shot.status === 'live' ? shot.deadline - now : null
  const asset = useApprovedRaceAssets().assets.find((a) => a.symbol === shot.symbol)
  return (
    <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <CoinFighter body={COIN_BODIES[shot.id % COIN_BODIES.length]} logoUrl={assetIconUrl(shot.symbol) ?? asset?.logoUrl} symbol={shot.symbol} size={56} />
        <div>
          <h1 style={{ margin: 0, fontFamily: PIXEL, fontSize: 'clamp(16px, 2.2vw, 24px)', fontWeight: 400, lineHeight: 1.4, textShadow: `4px 4px 0 ${INK}` }}>{shot.title.toUpperCase()}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 700, opacity: 0.85 }}>
            {shot.symbol} · {durationLabel(shot.duration)} match · {unit === 'cap' ? 'by market cap' : 'by price'}{livePrice != null ? ` · now ${formatChartValue(livePrice, unit, supply)}` : ''}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {shot.status === 'open' && <InviteButton path={`/onchain/shot/${shot.id}`} />}
        <span className="rx-plate" style={{ fontFamily: PIXEL, fontSize: 10, background: CREAM, color: INK, padding: '8px 10px' }}>{shotPhaseLabel(shot)}</span>
        {timer != null && <span className="rx-plate" style={{ fontFamily: PIXEL, fontSize: 14, background: shot.status === 'aim' ? PINK : YELLOW, color: shot.status === 'aim' ? CREAM : INK, padding: '8px 10px', animation: shot.status === 'aim' && timer < 10 ? 'rx-blink 0.6s steps(1) infinite' : undefined }}>{clock(timer)}</span>}
      </div>
      {asset?.launchedOnProphet && <div style={{ flexBasis: '100%' }}><LaunchpadWarning /></div>}
    </div>
  )
}

function ReadyPanel({ shot, me, busy, run, onLogin }: { shot: Shot; me?: string; busy: string | null; run: (name: string, fields: Record<string, unknown>) => void; onLogin: () => void }) {
  const mine = me ? shot.players.find((p) => p.wallet === me) : undefined
  const ready = shot.players.filter((p) => p.ready).length
  const needed = Math.max(SHOT_RULES.minPlayers, Math.floor(shot.players.length / 2) + 1)
  return (
    <div className="rx-raised" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20, background: CREAM, color: INK }}>
      <span style={label}>WAITING FOR PLAYERS</span>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
        Ready {ready} of {shot.players.length}. The aim starts once {needed} {needed === 1 ? 'is' : 'are'} ready - more than half the room, at least two. Players who are not ready sit this match out.
      </p>
      {!me ? (
        <button type="button" onClick={onLogin} className="rx-btn rx-btn-pink" style={{ minHeight: 56, fontFamily: PIXEL, fontSize: 12, color: CREAM }}>{prophetWalletStore.hasWallet() ? 'LOG IN TO PLAY' : 'CREATE ACCOUNT'}</button>
      ) : !mine ? (
        <button type="button" disabled={!!busy || shot.players.length >= SHOT_RULES.maxPlayers} onClick={() => run('join', { action: 'shot-join', shot: shot.id })} className="rx-btn rx-btn-yellow" style={{ minHeight: 56, fontFamily: PIXEL, fontSize: 12 }}>{busy === 'join' ? 'SIGNING…' : shot.players.length >= SHOT_RULES.maxPlayers ? 'ROOM FULL' : 'JOIN THE ROOM'}</button>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" disabled={!!busy} onClick={() => run('ready', { action: 'shot-ready', shot: shot.id, ready: !mine.ready })} className={`rx-btn ${mine.ready ? 'rx-btn-white' : 'rx-btn-pink'}`} style={{ flex: 1, minHeight: 64, fontFamily: PIXEL, fontSize: 16, color: mine.ready ? INK : CREAM, animation: mine.ready ? undefined : 'rx-blink 0.9s steps(1) infinite' }}>{busy === 'ready' ? 'SIGN…' : mine.ready ? 'NOT READY' : 'READY!'}</button>
          <button type="button" disabled={!!busy} onClick={() => run('leave', { action: 'shot-leave', shot: shot.id })} className="rx-btn rx-btn-white" style={{ padding: '10px 14px', fontWeight: 700 }}>Leave</button>
        </div>
      )}
      <p style={{ margin: 0, fontSize: 14, opacity: 0.7 }}>Nothing is charged until you lock a shot. Then you have {SHOT_RULES.aimSeconds} seconds to aim at the final price and choose your stake.</p>
    </div>
  )
}

function AimPanel({ shot, me, now, busy, run, livePrice, unit, supply, solUsd }: {
  shot: Shot; me?: string; now: number; busy: string | null; run: (name: string, fields: Record<string, unknown>) => Promise<void>
  livePrice: number | null; unit: 'price' | 'cap'; supply: number | null; solUsd: Parameters<typeof quoteUsdCents>[1] | undefined
}) {
  const inMatch = !!me && shot.players.some((p) => p.wallet === me)
  const locked = !!me && shot.entries.some((e) => e.player === me)
  const balance = useGameBalance(me)
  const [aim, setAim] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [cents, setCents] = useState(500n)
  useEffect(() => {
    if (aim == null && livePrice != null) setAim(Number(livePrice.toPrecision(6)))
  }, [aim, livePrice])
  useEffect(() => {
    if (aim != null) setText(unit === 'cap' && supply ? String(Math.round(aim * supply)) : String(aim))
  }, [aim, unit, supply])

  let lamports: bigint | null = null
  try {
    lamports = solUsd ? quoteUsdCents(cents, solUsd) : null
  } catch {
    lamports = null
  }
  const tooLow = lamports != null && lamports < shot.minStake
  const tooHigh = lamports != null && lamports > shot.maxStake
  const short = lamports != null && balance.data != null && lamports > balance.data.balance
  const own = me ? recallShot(shot.id, me) : null

  async function lock() {
    if (!me || aim == null || lamports == null) return
    const raw = BigInt(Math.round(aim * 10 ** shot.priceDecimals))
    await run('lock', { action: 'shot-lock', shot: shot.id, prediction: raw.toString(), stake: lamports.toString() })
    rememberShot(shot.id, me, aim)
  }

  const lines: ChartLine[] = own != null ? [{ price: own, label: 'YOUR SHOT', mine: true }] : []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ShotChart pool={shot.priceSource} live={livePrice} unit={unit} supply={supply} aim={inMatch && !locked ? { value: aim, onChange: setAim } : null} lines={lines} />
      <div className="rx-raised" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 20, background: CREAM, color: INK }}>
        {!inMatch ? (
          <p style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>The ready players are aiming now. Watch the match start in {Math.max(0, Math.ceil(shot.aimEndsAt - now))} s.</p>
        ) : locked ? (
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Shot locked{own != null ? ` at ${formatChartValue(own, unit, supply)}` : ''}. Waiting for the others - their shots show when the match starts.</p>
        ) : (
          <>
            <span style={label}>AIM: DRAG THE CROSSHAIR OR TYPE YOUR CALL</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700 }}>{unit === 'cap' ? 'Final market cap $' : 'Final price $'}</span>
              <input
                value={text}
                inputMode="decimal"
                onChange={(e) => {
                  setText(e.target.value)
                  const v = Number(e.target.value.replace(',', '.'))
                  if (v > 0) setAim(unit === 'cap' && supply ? v / supply : v)
                }}
                className="rx-input"
                style={{ flex: '1 1 160px', height: 44, padding: '0 10px', fontWeight: 700 }}
              />
            </div>
            <span style={label}>STAKE</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {STAKE_PRESETS.map((c) => <button key={String(c)} type="button" onClick={() => setCents(c)} className={`rx-btn ${cents === c ? 'rx-btn-yellow' : 'rx-btn-white'}`} style={{ padding: '8px 12px', fontWeight: 700 }}>{usd(c)}</button>)}
            </div>
            <span style={{ fontSize: 15, opacity: 0.75 }}>{lamports != null ? `${sol(lamports)} from your game balance` : 'Waiting for the SOL price…'}{short ? ' - not enough, add SOL first' : tooLow ? ' - below the minimum' : tooHigh ? ' - above the maximum' : ''}</span>
            <button type="button" disabled={!!busy || aim == null || lamports == null || short || tooLow || tooHigh} onClick={lock} className="rx-btn rx-btn-pink" style={{ minHeight: 60, fontFamily: PIXEL, fontSize: 15, color: CREAM }}>{busy === 'lock' ? 'LOCKING…' : 'LOCK SHOT'}</button>
          </>
        )}
      </div>
    </div>
  )
}

const valueOf = (shot: Shot, raw: bigint) => Number(raw) / 10 ** shot.priceDecimals

function MatchPanel({ shot, me, now, livePrice, unit, supply }: { shot: Shot; me?: string; now: number; livePrice: number | null; unit: 'price' | 'cap'; supply: number | null }) {
  const final = shot.status === 'resolved'
  const reference = final ? shot.finalPrice : livePrice != null ? BigInt(Math.round(livePrice * 10 ** shot.priceDecimals)) : null
  const order = useMemo(() => (reference != null ? provisionalOrder(shot.entries, reference) : shot.entries), [shot.entries, reference])
  const winners = Math.floor(shot.entries.length / 2)
  const place = (e: ShotEntry) => order.indexOf(e) + 1
  const lines: ChartLine[] = shot.entries.map((e) => ({ price: valueOf(shot, e.prediction), label: e.player === me ? 'YOU' : `#${place(e)}`, mine: e.player === me, hit: place(e) <= winners }))
  const mine = me ? shot.entries.find((e) => e.player === me) : undefined
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {!final && <ShotChart pool={shot.priceSource} live={livePrice} unit={unit} supply={supply} lines={lines} />}
      {final && mine && <ResultCard shot={shot} entry={mine} place={mine.rank || place(mine)} unit={unit} supply={supply} />}
      {final && !mine && (
        <div className="rx-raised" style={{ padding: 20, background: YELLOW, color: INK }}>
          <span style={label}>MATCH OVER</span>
          <span style={{ fontFamily: PIXEL, fontSize: 16 }}>Final {formatChartValue(valueOf(shot, shot.finalPrice), unit, supply)}</span>
        </div>
      )}
      <div className="rx-raised" style={{ padding: 16, background: CREAM, color: INK }}>
        <span style={label}>{final ? 'FINAL STANDINGS' : `PROVISIONAL PLACES · TOP ${winners} WIN`} {!final && reference != null ? `· ENDS IN ${clock(shot.deadline - now)}` : ''}</span>
        {order.map((e, i) => {
          const ref = reference != null ? valueOf(shot, reference) : null
          const distance = ref ? (Math.abs(valueOf(shot, e.prediction) - ref) / ref) * 100 : null
          const win = i < winners
          return (
            <div key={e.player} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: i ? '2px solid rgba(27,19,64,0.1)' : 'none', background: e.player === me ? 'rgba(255,92,138,0.12)' : undefined }}>
              <span style={{ fontFamily: PIXEL, fontSize: 12, color: win ? '#1E7A36' : INK }}>{i + 1}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 700 }}><AddressLabel address={e.player} />{e.player === me ? ' (you)' : ''}</span>
                <span style={{ display: 'block', fontSize: 14, opacity: 0.7 }}>
                  {formatChartValue(valueOf(shot, e.prediction), unit, supply)} · {sol(e.stake)}{distance != null ? ` · off by ${distance.toFixed(2)}%` : ''}
                </span>
              </span>
              <span style={{ fontFamily: PIXEL, fontSize: 10, color: final ? (e.payout > 0n ? '#1E7A36' : '#C2245A') : win ? '#1E7A36' : INK }}>{final ? (e.payout > 0n ? `+${sol(e.payout)}` : 'OUT') : win ? 'IN THE MONEY' : ''}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ResultCard({ shot, entry, place, unit, supply }: { shot: Shot; entry: ShotEntry; place: number; unit: 'price' | 'cap'; supply: number | null }) {
  const me = entry.player
  const balance = useGameBalance(me)
  const final = valueOf(shot, shot.finalPrice)
  const call = valueOf(shot, entry.prediction)
  const won = entry.payout > 0n
  return (
    <div className="rx-raised" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 20, background: won ? YELLOW : CREAM, color: INK }}>
      <span style={{ fontFamily: PIXEL, fontSize: 14 }}>{won ? 'YOU WON!' : 'NOT THIS TIME'}</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, fontSize: 17 }}>
        <Stat name="Final" value={formatChartValue(final, unit, supply)} />
        <Stat name="Your shot" value={formatChartValue(call, unit, supply)} />
        <Stat name="Off by" value={`${((Math.abs(call - final) / final) * 100).toFixed(2)}%`} />
        <Stat name="Place" value={`${place} of ${shot.entries.length}`} />
        <Stat name="Payout" value={won ? `+${sol(entry.payout)}` : '0'} />
        <Stat name="Game balance" value={balance.data ? sol(balance.data.balance) : '…'} />
      </div>
    </div>
  )
}

function Stat({ name, value }: { name: string; value: string }) {
  return (
    <span>
      <span style={{ display: 'block', fontFamily: PIXEL, fontSize: 8, opacity: 0.7 }}>{name.toUpperCase()}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </span>
  )
}

function PlayersPanel({ shot, me }: { shot: Shot; me?: string }) {
  const lockedBy = new Set(shot.entries.map((e) => e.player))
  const people = shot.status === 'open' || shot.status === 'aim' ? shot.players.map((p) => p.wallet) : shot.entries.map((e) => e.player)
  return (
    <div className="rx-raised" style={{ padding: 16, background: CREAM, color: INK }}>
      <span style={label}>PLAYERS {people.length}/{SHOT_RULES.maxPlayers}</span>
      {people.length === 0 && <p style={{ margin: 0, opacity: 0.7, fontWeight: 600 }}>Empty room. Join and press Ready.</p>}
      {people.map((wallet, i) => {
        const p = shot.players.find((x) => x.wallet === wallet)
        const chip = shot.status === 'open' ? (p?.ready ? 'READY' : 'NOT READY') : shot.status === 'aim' ? (lockedBy.has(wallet) ? 'LOCKED' : 'AIMING…') : null
        return (
          <div key={wallet} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: i ? '2px solid rgba(27,19,64,0.1)' : 'none' }}>
            <span style={{ fontWeight: 700, minWidth: 0 }}><AddressLabel address={wallet} />{wallet === me ? ' (you)' : ''}</span>
            {chip && <span className="rx-plate" style={{ fontFamily: PIXEL, fontSize: 8, padding: '5px 7px', background: chip === 'READY' || chip === 'LOCKED' ? '#8BE89A' : '#FFFFFF' }}>{chip}</span>}
          </div>
        )
      })}
      {shot.totalPool > 0n && <p style={{ margin: '10px 0 0', fontWeight: 700 }}>Bank {sol(shot.totalPool)}</p>}
    </div>
  )
}
