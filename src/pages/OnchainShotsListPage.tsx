import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { useSignedAction } from '@/chain/gameServer'
import { SHOT_RULES, shotPhaseLabel, useShots, type Shot } from '@/chain/shots'
import { useApprovedRaceAssets } from '@/chain/useApprovedRaceAssets'
import type { ApprovedRaceAsset } from '@/chain/assetRaces'
import { CoinPicker, COIN_BODIES, HowItWorksStrip } from '@/components/GamePickers'
import { GhostCoin } from '@/components/DuelExtras'
import { useLivePrices } from '@/chain/livePrices'
import { life } from '@/lib/life'
import { PxSprite } from '@/retro/Sprite'
import { coinBlueGrin, coinGreen, coinOrangeGrin, coinPinkGrin, coinPurple, coinPurpleGrin } from '@/retro/spriteData'
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

const STEPS = [
  { sprite: coinOrangeGrin, title: 'Join a room', timing: 'FREE', body: 'One coin per room. Joining costs nothing; up to 10 players.' },
  { sprite: coinPinkGrin, title: 'Press Ready', timing: 'LOBBY', body: 'Once more than half (and at least two) are ready, the match starts for them.' },
  { sprite: coinBlueGrin, title: 'Aim and lock', timing: '30 SEC', body: 'Call the price it ends on and set your stake. Nobody sees your shot until the start.' },
  { sprite: coinPurple, title: 'Closest half wins', timing: '1-60 MIN', body: 'The sharper the shot and the bigger the stake, the bigger your share of the rest.' },
]

const NUMBERS = [
  { big: '2-10', label: 'players per room', sprite: coinOrangeGrin },
  { big: '0.005-1', label: 'SOL stake, your choice', sprite: coinBlueGrin },
  { big: '30 sec', label: 'to aim and lock', sprite: coinPinkGrin },
  { big: '2%', label: 'only from winnings', sprite: coinPurpleGrin },
]

const shortPrice = (raw: bigint, decimals: number) => `$${Number(Number(formatUnits(raw, decimals)).toPrecision(4))}`

/** A room-shaped empty state: ten seats, a few faded coins waiting in them. */
function EmptyRoom({ onOpen, label }: { onOpen: () => void; label: string }) {
  return (
    <div className="rx-raised" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20, padding: 20, background: CREAM, color: INK }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 48px)', gap: 8 }} aria-hidden="true">
        {Array.from({ length: SHOT_RULES.maxPlayers }, (_, i) => (
          <span key={i} style={{ width: 48, height: 48, display: 'grid', placeItems: 'center', border: `3px dashed rgba(27,19,64,0.3)` }}>
            {i % 3 === 0 && <GhostCoin seed={i + 11} size={34} />}
          </span>
        ))}
      </div>
      <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ fontFamily: PIXEL, fontSize: 12 }}>NO OPEN ROOMS YET</span>
        <span style={{ fontSize: 17, fontWeight: 600, opacity: 0.8 }}>Open one, pick a coin and send the link to friends - the room waits for them.</span>
        <button type="button" onClick={onOpen} className="rx-btn rx-btn-pink" style={{ padding: '12px 18px', fontFamily: PIXEL, fontSize: 11, color: CREAM }}>{label}</button>
      </div>
    </div>
  )
}

/** Coins to aim at, with live prices: a tap opens the room form with it picked. */
function QuickCoins({ assets, onPick }: { assets: ApprovedRaceAsset[]; onPick: (a: ApprovedRaceAsset) => void }) {
  const live = useLivePrices()
  // Crypto first (BTC, SOL…), then memes, then PumpSwap coins.
  const rank = (a: ApprovedRaceAsset) => (a.category === 2 ? 0 : a.source === 'pumpswap' ? 2 : 1)
  const priced = assets.filter((a) => live.assets[a.symbol]).sort((a, b) => rank(a) - rank(b)).slice(0, 12)
  if (priced.length === 0) return null
  return (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
      {priced.map((a, i) => {
        const p = live.assets[a.symbol]
        return (
          <button key={a.assetId} type="button" onClick={() => onPick(a)} className="rx-plate rx-hop-host" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#FFFFFF', color: INK, cursor: 'pointer', textAlign: 'left', minWidth: 0 }}>
            <span className="rx-life-idle" style={life(i + 41, 1, 1.2, 2.6)}><CoinFighter body={COIN_BODIES[i % COIN_BODIES.length]} logoUrl={assetIconUrl(a.symbol) ?? a.logoUrl} symbol={a.symbol} size={30} /></span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.symbol}</span>
              <span style={{ display: 'block', fontSize: 12, opacity: 0.65 }}>{p ? shortPrice(p.raw, p.decimals) : '…'}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pickable = useMemo(() => assets.filter((a) => a.category !== 0), [assets])
  const open = shots.filter((s) => s.status === 'open')
  const playing = shots.filter((s) => s.status === 'aim' || s.status === 'live')
  const finished = shots.filter((s) => s.status === 'resolved').slice(0, 9)

  function openForm() {
    if (!publicKey) return login.start()
    setCreating(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function create() {
    if (!coin) return
    setError(null)
    setBusy(true)
    try {
      const room = await act<{ id: number }>({ action: 'shot-create', asset: coin.symbol, duration })
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
          : !isLoading && <EmptyRoom onOpen={openForm} label={publicKey ? '+ OPEN THE FIRST ROOM' : prophetWalletStore.hasWallet() ? 'LOG IN TO PLAY' : 'CREATE ACCOUNT'} />}
        {finished.length > 0 && (<><h2 style={h2}>JUST FINISHED</h2><div style={grid}>{finished.map((s) => <RoomCard key={s.id} shot={s} />)}</div></>)}

        <h2 style={h2}>PICK A COIN TO AIM AT</h2>
        <QuickCoins assets={pickable} onPick={(a) => { setCoin(a); openForm() }} />

        <h2 style={{ ...h2, marginTop: 40, marginBottom: 24 }}>HOW A ROOM GOES</h2>
        <HowItWorksStrip accent={ARENA_BLUE} steps={STEPS} />

        <h2 style={{ ...h2, marginTop: 40 }}>THE RULES IN NUMBERS</h2>
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
          {NUMBERS.map((n, i) => (
            <div key={n.big} className="rx-raised" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, background: CREAM, color: INK }}>
              <span className="rx-life-idle" style={life(61 + i, 1, 1.3, 2.9)}><PxSprite data={n.sprite} width={44} height={47} /></span>
              <div>
                <div style={{ fontFamily: PIXEL, fontSize: 18, textShadow: `3px 3px 0 ${i % 2 ? YELLOW : ARENA_BLUE}` }}>{n.big}</div>
                <div style={{ fontSize: 15, fontWeight: 700, opacity: 0.75 }}>{n.label}</div>
              </div>
            </div>
          ))}
        </div>
        <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', gap: 28, marginTop: 36 }}>
          {[coinGreen, coinOrangeGrin, coinBlueGrin, coinPinkGrin, coinPurpleGrin].map((s, i) => (
            <span key={i} className="rx-life-idle" style={life(81 + i, 1, 1.1, 2.7)}><PxSprite data={s} width={36} height={38} /></span>
          ))}
        </div>
        {login.modal}
      </div>
    </div>
  )
}
