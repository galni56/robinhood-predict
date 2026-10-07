import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { useSignedAction } from '@/chain/gameServer'
import { SHOT_RULES, shotPhaseLabel, useShots, type Shot } from '@/chain/shots'
import { useApprovedRaceAssets } from '@/chain/useApprovedRaceAssets'
import type { ApprovedRaceAsset } from '@/chain/assetRaces'
import { CoinPicker, COIN_BODIES } from '@/components/GamePickers'
import { GameBalancePanel } from '@/components/GameBalancePanel'
import { usePlatformLogin } from '@/components/WalletAccountModals'
import { prophetWalletStore } from '@/solana/prophetWallet'
import { assetIconUrl } from '@/lib/assetIcons'
import { formatUnits, shortTxError } from '@/lib/format'
import { CoinFighter } from '@/retro/landingFx'
import { CREAM, INK, PINK, PIXEL, YELLOW } from '@/retro/scene'

// Price Shot rooms: one coin each; join, press Ready, aim, lock, watch.

const NIGHT = '#4B37B0'
const ARENA_BLUE = '#7A9FF0'
const sol = (raw: bigint) => `${Number(Number(formatUnits(raw, 9)).toPrecision(3))} SOL`
const durationLabel = (s: number) => (s >= 3600 ? `${s / 3600} h` : `${s / 60} min`)
const h2 = { margin: '28px 0 12px', fontFamily: PIXEL, fontSize: 12, fontWeight: 400 } as const
const grid = { display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 270px), 1fr))' } as const

function RoomCard({ shot }: { shot: Shot }) {
  const ready = shot.players.filter((p) => p.ready).length
  const hot = shot.status === 'aim' || shot.status === 'live'
  return (
    <Link to={`/onchain/shot/${shot.id}`} className="rx-raised rx-hop-host" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, background: CREAM, color: INK, textDecoration: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <CoinFighter body={COIN_BODIES[shot.id % COIN_BODIES.length]} logoUrl={assetIconUrl(shot.symbol)} symbol={shot.symbol} size={40} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: PIXEL, fontSize: 11 }}>{shot.symbol}</span>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600, opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shot.title}</span>
          </span>
        </span>
        <span className="rx-plate" style={{ flexShrink: 0, fontFamily: PIXEL, fontSize: 8, padding: '5px 7px', background: hot ? PINK : shot.status === 'open' ? '#8BE89A' : '#FFFFFF', color: hot ? CREAM : INK }}>{shotPhaseLabel(shot)}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 15, fontWeight: 700 }}>
        <span>{durationLabel(shot.duration)}</span>
        <span>{shot.status === 'open' ? `${ready} ready of ${shot.players.length}` : `${shot.entries.length} shots`}</span>
        {shot.totalPool > 0n && <span>bank {sol(shot.totalPool)}</span>}
      </div>
      {shot.status === 'open' && (
        <div style={{ display: 'flex', gap: 4 }} aria-hidden="true">
          {Array.from({ length: SHOT_RULES.maxPlayers }, (_, i) => (
            <span key={i} style={{ flex: 1, height: 10, background: i < ready ? '#45BF5C' : i < shot.players.length ? YELLOW : 'transparent', border: `2px solid ${INK}` }} />
          ))}
        </div>
      )}
    </Link>
  )
}

export function OnchainShotsListPage() {
  const { shots, isLoading, offline } = useShots()
  const { publicKey } = useWallet()
  const login = usePlatformLogin()
  const act = useSignedAction()
  const navigate = useNavigate()
  const { assets } = useApprovedRaceAssets()
  const [params] = useSearchParams()
  const wanted = params.get('asset')
  const [creating, setCreating] = useState(wanted != null)
  const [picked, setCoin] = useState<ApprovedRaceAsset | null>(null)
  // "Arena" on a PumpSwap coin opens the form with that coin picked.
  const coin = picked ?? (wanted ? assets.find((a) => a.symbol === wanted) ?? null : null)
  const [duration, setDuration] = useState(300)
  const [unit, setUnit] = useState<'price' | 'cap'>('cap')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pickable = useMemo(() => assets.filter((a) => a.category !== 0), [assets])
  const open = shots.filter((s) => s.status === 'open')
  const playing = shots.filter((s) => s.status === 'aim' || s.status === 'live')
  const finished = shots.filter((s) => s.status === 'resolved').slice(0, 9)

  async function create() {
    if (!coin) return
    setError(null)
    setBusy(true)
    try {
      const memes = coin.category === 1
      const room = await act<{ id: number }>({ action: 'shot-create', asset: coin.symbol, duration, unit: memes ? unit : 'price' })
      navigate(`/onchain/shot/${room.id}`)
    } catch (cause) {
      setError(shortTxError(cause, 'shot-create'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100%', background: NIGHT, color: CREAM, fontFamily: "'Pixelify Sans', 'Courier New', monospace" }}>
      <div className="mx-auto max-w-[1200px] px-4 py-8">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ maxWidth: 640 }}>
            <h1 style={{ margin: 0, fontFamily: PIXEL, fontSize: 'clamp(18px, 2.6vw, 32px)', fontWeight: 400, lineHeight: 1.4, textShadow: `4px 4px 0 ${ARENA_BLUE}` }}>PRICE SHOT</h1>
            <p style={{ margin: '8px 0 0', fontSize: 19, fontWeight: 600 }}>One coin per room. Press Ready, aim at the price it ends on, lock your shot. The closest half split the rest - the sharper the shot and the bigger the stake, the bigger the win.</p>
          </div>
          {publicKey
            ? <button type="button" onClick={() => setCreating((v) => !v)} className="rx-btn rx-btn-yellow" style={{ padding: '14px 20px', fontFamily: PIXEL, fontSize: 12 }}>{creating ? 'CLOSE' : '+ NEW ROOM'}</button>
            : <button type="button" onClick={login.start} className="rx-btn rx-btn-pink" style={{ padding: '14px 20px', fontFamily: PIXEL, fontSize: 12, color: CREAM }}>{prophetWalletStore.hasWallet() ? 'LOG IN TO PLAY' : 'CREATE ACCOUNT'}</button>}
        </div>

        {publicKey && <div style={{ marginTop: 18, maxWidth: 520 }}><GameBalancePanel /></div>}

        {creating && (
          <div className="rx-raised" style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14, padding: 20, background: CREAM, color: INK }}>
            <span style={{ fontFamily: PIXEL, fontSize: 10 }}>COIN</span>
            <CoinPicker assets={pickable} selected={coin ? [coin.assetId] : []} onToggle={(a) => setCoin(coin?.assetId === a.assetId ? null : a)} max={1} accent={ARENA_BLUE} />
            <span style={{ fontFamily: PIXEL, fontSize: 10 }}>MATCH LENGTH</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {SHOT_RULES.durations.map((s) => <button key={s} type="button" onClick={() => setDuration(s)} className={`rx-btn ${duration === s ? 'rx-btn-yellow' : 'rx-btn-white'}`} style={{ padding: '8px 12px', fontWeight: 700 }}>{durationLabel(s)}</button>)}
            </div>
            {coin?.category === 1 && (
              <>
                <span style={{ fontFamily: PIXEL, fontSize: 10 }}>PLAYERS CALL</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['cap', 'price'] as const).map((u) => <button key={u} type="button" onClick={() => setUnit(u)} className={`rx-btn ${unit === u ? 'rx-btn-yellow' : 'rx-btn-white'}`} style={{ padding: '8px 12px', fontWeight: 700 }}>{u === 'cap' ? 'Market cap' : 'Price'}</button>)}
                </div>
              </>
            )}
            <button type="button" disabled={!coin || busy} onClick={create} className="rx-btn rx-btn-pink" style={{ minHeight: 56, fontFamily: PIXEL, fontSize: 12, color: CREAM }}>{busy ? 'SIGNING…' : coin ? `OPEN A ${coin.symbol} ROOM` : 'PICK A COIN'}</button>
            {error && <span style={{ fontWeight: 700, color: '#C2245A' }}>{error}</span>}
          </div>
        )}

        {offline && <p className="rx-plate" style={{ display: 'inline-block', marginTop: 18, background: CREAM, color: INK, padding: '10px 14px', fontWeight: 700 }}>The game server is taking a break - rooms open again shortly.</p>}
        {isLoading && <p style={{ marginTop: 18, fontWeight: 700 }}>Loading rooms…</p>}

        {playing.length > 0 && (<><h2 style={h2}>IN PLAY</h2><div style={grid}>{playing.map((s) => <RoomCard key={s.id} shot={s} />)}</div></>)}
        <h2 style={h2}>OPEN ROOMS</h2>
        {open.length > 0
          ? <div style={grid}>{open.map((s) => <RoomCard key={s.id} shot={s} />)}</div>
          : !isLoading && <p style={{ margin: 0, fontSize: 18, fontWeight: 600, opacity: 0.85 }}>No open rooms yet - open one and invite friends.</p>}
        {finished.length > 0 && (<><h2 style={h2}>JUST FINISHED</h2><div style={grid}>{finished.map((s) => <RoomCard key={s.id} shot={s} />)}</div></>)}
        {login.modal}
      </div>
    </div>
  )
}
