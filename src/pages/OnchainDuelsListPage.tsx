import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { prophetWalletStore } from '@/solana/prophetWallet'
import { usePlatformLogin } from '@/components/WalletAccountModals'
import { useSignedAction } from '@/chain/gameServer'
import { DUEL_GROUP_LABELS, DUEL_RULES, duelPhaseLabel, durationLabel, useDuels, type Duel, type DuelGroup } from '@/chain/duels'
import { useLivePrices } from '@/chain/livePrices'
import { assetIconUrl } from '@/lib/assetIcons'
import { formatUnits, shortTxError } from '@/lib/format'
import { CoinFighter, DriftingCloud } from '@/retro/landingFx'
import { CREAM, INK, PINK, ROAD, SKY, YELLOW, PIXEL } from '@/retro/scene'
import { life, seeded } from '@/lib/life'
import { COIN_BODIES } from '@/components/GamePickers'
import { CategoryBadge, DuelNumbers, DuelSteps, PracticeLap } from '@/components/DuelExtras'

const sol = (raw: bigint) => `${Number(Number(formatUnits(raw, 9)).toPrecision(3))} SOL`

/** Card accents for open lobbies (race orange family, then the brand yellow and pink). */
const ACCENTS = ['#ED8F3A', '#FFD23F', '#F2A65A', '#FF5C8A']
const GREEN = '#8BE89A'

/** An empty lobby: a little start line where a coin jogs in place and the six seats pulse. */
function OpenLobbyScene({ duel }: { duel: Duel }) {
  const seed = duel.id + 1
  const body = COIN_BODIES[Math.floor(seeded(seed, 9) * COIN_BODIES.length)]
  return (
    <>
      <div style={{ position: 'relative', height: 64, background: ROAD, overflow: 'hidden', boxShadow: `inset 0 0 0 3px ${INK}` }}>
        <div className="rx-life-road" style={{ position: 'absolute', left: 0, right: 0, top: 30, height: 4, background: `repeating-linear-gradient(90deg, rgba(255,246,223,0.45) 0 18px, transparent 18px 36px)`, ...life(seed, 1, 1.4, 3.2) }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 14, width: 16, background: `repeating-conic-gradient(${INK} 0% 25%, ${CREAM} 0% 50%) 0 0 / 16px 16px` }} />
        <span className="rx-life-idle" style={{ position: 'absolute', left: 12, top: 10, ...life(seed, 2, 1.1, 2.6) }}>
          <CoinFighter body={body} symbol="?" size={40} />
        </span>
        <span className="rx-plate rx-life-peek" style={{ position: 'absolute', left: 62, top: 14, background: CREAM, fontFamily: PIXEL, fontSize: 8, padding: '6px 7px', ...life(seed, 3, 2.4, 4.6) }}>YOUR COIN?</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }} aria-hidden="true">
        {Array.from({ length: DUEL_RULES.maxRacers }, (_, i) => (
          <span key={i} className="rx-life-seat" style={{ flex: 1, height: 22, border: `3px dashed ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: PIXEL, fontSize: 9, ...life(seed * 7 + i, 4, 1.2, 2.8) }}>+</span>
        ))}
      </div>
    </>
  )
}

function LobbyCard({ duel }: { duel: Duel }) {
  const live = useLivePrices()
  const usd = live.solUsd && duel.stake > 0n ? (Number(duel.stake) / 1e9) * (Number(live.solUsd.priceRaw) / 10 ** live.solUsd.decimals) : null
  const empty = duel.racers.length === 0
  const hot = duel.status === 'ready' || duel.status === 'starting' || duel.status === 'running'
  const seed = duel.id + 1
  const accent = ACCENTS[duel.id % ACCENTS.length]
  const chipBg = hot ? PINK : empty ? GREEN : duel.status === 'resolved' ? '#FFFFFF' : YELLOW
  return (
    <Link to={`/onchain/duel/${duel.id}`} className="rx-raised rx-hop-host rx-lobby" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px 16px', background: CREAM, color: INK, textDecoration: 'none', overflow: 'hidden' }}>
      {/* Moving stripe band: each card has its own color, speed and phase. */}
      <div className={duel.status === 'resolved' ? undefined : 'rx-life-stripes'} style={{ height: 10, margin: '0 -16px', background: `repeating-linear-gradient(90deg, ${accent} 0 10px, ${INK} 10px 20px)`, ...life(seed, 5, 1.6, 4) }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: PIXEL, fontSize: 11 }}>{duel.title}</span>
          <CategoryBadge category={duel.category} />
        </span>
        <span className={hot || empty ? 'rx-life-blink' : undefined} style={{ fontFamily: PIXEL, fontSize: 8, padding: '5px 7px', border: `2px solid ${INK}`, background: chipBg, ...life(seed, 6, hot ? 0.8 : 1.4, hot ? 1.3 : 2.6) }}>{empty ? 'OPEN' : duelPhaseLabel(duel)}</span>
      </div>
      {empty ? <OpenLobbyScene duel={duel} /> : (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, minHeight: 62 }}>
          {duel.racers.map((r, i) => (
            <span key={r.seat} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span className={duel.status === 'running' ? 'rx-life-bob' : duel.status === 'resolved' ? undefined : 'rx-life-idle'} style={life(seed * 13 + r.seat, 7, duel.status === 'running' ? 0.3 : 1.2, duel.status === 'running' ? 0.55 : 2.6)}>
                <CoinFighter body={COIN_BODIES[i % COIN_BODIES.length]} logoUrl={assetIconUrl(r.symbol)} symbol={r.symbol} size={40} />
              </span>
              <span style={{ fontFamily: PIXEL, fontSize: 7 }}>{r.symbol}</span>
            </span>
          ))}
          {duel.status === 'open' && Array.from({ length: Math.min(2, DUEL_RULES.maxRacers - duel.racers.length) }, (_, i) => (
            <span key={`seat${i}`} className="rx-life-seat" style={{ width: 40, height: 42, border: `3px dashed ${INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: PIXEL, fontSize: 12, ...life(seed * 5 + i, 8, 1.2, 2.6) }}>+</span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', fontSize: 14, fontWeight: 700 }}>
        {empty ? (
          <>
            <span style={{ opacity: 0.7 }}>Crypto, memes, PumpSwap or HasteFun coins · $1-$50</span>
            <span style={{ marginLeft: 'auto', fontFamily: PIXEL, fontSize: 9 }}>JOIN &gt;</span>
          </>
        ) : (
          <>
            <span>Stake {usd ? `$${usd.toFixed(usd < 10 ? 2 : 0)}` : sol(duel.stake)}</span>
            <span>{durationLabel(duel.duration)}</span>
            {duel.pot > 0n && <span>Pot {sol(duel.pot)}</span>}
          </>
        )}
      </div>
    </Link>
  )
}

/** Open lobbies shown at once: the server keeps this many waiting (DUEL.emptyLobbies). */
const OPEN_LOBBIES_SHOWN = 4

/** Coin duels: four open lobbies always wait; anyone can open another. */
export function OnchainDuelsListPage() {
  const { duels, isLoading, offline } = useDuels()
  const { connected } = useWallet()
  const login = usePlatformLogin()
  const act = useSignedAction()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const live = duels.filter((d) => !['resolved', 'void', 'cancelled'].includes(d.status))
  // Lobby type filter; 'all' (the default) shows the page as it always was.
  const [kind, setKind] = useState<'all' | DuelGroup>('all')
  const ofKind = (d: Duel) => kind === 'all' || d.category === kind
  const active = live.filter((d) => d.racers.length > 0 && ofKind(d)).sort((a, b) => b.racers.length - a.racers.length)
  // The oldest open lobbies first, so the same four stay put between refreshes.
  const empty = live.filter((d) => d.racers.length === 0).sort((a, b) => a.id - b.id).slice(0, OPEN_LOBBIES_SHOWN)
  const finished = duels.filter((d) => d.status === 'resolved' && ofKind(d)).slice(0, 6)

  async function createLobby() {
    setError(null)
    // Every empty lobby is the same: take a free one instead of opening another.
    if (empty.length > 0) return navigate(`/onchain/duel/${empty[0].id}`)
    setPending(true)
    try {
      const created = await act<{ id: number }>({ action: 'duel-create' })
      navigate(`/onchain/duel/${created.id}`)
    } catch (cause) {
      setError(shortTxError(cause, 'duel-create'))
    } finally {
      setPending(false)
    }
  }

  const grid = { display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' } as const
  const h2 = { margin: '36px 0 16px', fontFamily: PIXEL, fontSize: 14, fontWeight: 400 } as const
  return (
    <div style={{ position: 'relative', minHeight: '100%', background: SKY, color: INK, fontFamily: "'HasteFun Digits', 'Pixelify Sans', 'Courier New', monospace", overflow: 'hidden' }}>
      <DriftingCloud width={120} top={50} duration={80} delay={15} />
      <div className="mx-auto max-w-[1200px] px-4 py-8" style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: PIXEL, fontSize: 'clamp(18px, 2.6vw, 32px)', fontWeight: 400, lineHeight: 1.4, textShadow: `4px 4px 0 ${YELLOW}` }}>COIN DUELS</h1>
            <p style={{ margin: '8px 0 0', maxWidth: 640, fontSize: 18, fontWeight: 600 }}>
              Bring your coin, match the stake, hit READY. The coin that grows the most wins the pot. Watching? Back a racer and cheer.
            </p>
          </div>
          {connected
            ? <button type="button" onClick={createLobby} disabled={pending} className="rx-btn rx-btn-yellow" style={{ padding: '14px 20px', fontFamily: PIXEL, fontSize: 12 }}>{pending ? 'SIGNING…' : '+ NEW LOBBY'}</button>
            : <button type="button" onClick={login.start} className="rx-btn rx-btn-pink" style={{ padding: '14px 20px', fontFamily: PIXEL, fontSize: 12 }}>{prophetWalletStore.hasWallet() ? 'LOG IN TO PLAY' : 'CREATE ACCOUNT'}</button>}
        </div>
        {login.modal}
        {error && <p style={{ color: '#C2245A', fontWeight: 700 }}>{error}</p>}
        {offline && <p className="rx-plate" style={{ display: 'inline-block', marginTop: 16, background: CREAM, padding: '8px 12px', fontWeight: 700 }}>The game server is taking a break - lobbies open again shortly.</p>}

        {isLoading && duels.length === 0 ? <p style={{ marginTop: 32 }}>Loading lobbies…</p> : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 24 }}>
              {([['all', 'All'], ['crypto', 'Crypto'], ['meme', 'Memes'], ['pumpswap', 'PumpSwap'], ['prophet', 'Made on HasteFun']] as const).map(([k, text]) => (
                <button key={k} type="button" onClick={() => setKind(k)} className={`rx-btn ${kind === k ? 'rx-btn-yellow' : 'rx-btn-white'}`} style={{ padding: '8px 14px', fontSize: 14, fontWeight: 700 }}>{text}</button>
              ))}
            </div>
            {kind !== 'all' && active.length === 0 && <p style={{ fontWeight: 700 }}>No live {DUEL_GROUP_LABELS[kind]} lobby right now - open one below and pick a {DUEL_GROUP_LABELS[kind]} coin.</p>}
            {active.length > 0 && (<><h2 style={h2}>LIVE LOBBIES</h2><div style={grid}>{active.map((d) => <LobbyCard key={d.id} duel={d} />)}</div></>)}
            <h2 style={h2}>OPEN LOBBIES · PICK ONE</h2>
            <div style={{ ...grid, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))' }}>{empty.map((d) => <LobbyCard key={d.id} duel={d} />)}</div>
            {empty.length === 0 && <p>The lobbies are being set up… refresh in a moment.</p>}
            {finished.length > 0 && (<><h2 style={h2}>JUST FINISHED</h2><div style={grid}>{finished.map((d) => <LobbyCard key={d.id} duel={d} />)}</div></>)}
          </>
        )}

        <h2 style={{ ...h2, marginTop: 56 }}>HOW A DUEL GOES</h2>
        <DuelSteps />

        <h2 style={{ ...h2, marginTop: 48 }}>THE NUMBERS</h2>
        <DuelNumbers />
      </div>

      <PracticeLap />
    </div>
  )
}
