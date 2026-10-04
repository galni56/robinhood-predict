import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { useSignedAction } from '@/chain/gameServer'
import { DUEL_RULES, duelPhaseLabel, durationLabel, useDuels, type Duel } from '@/chain/duels'
import { useLivePrices } from '@/chain/livePrices'
import { assetIconUrl } from '@/lib/assetIcons'
import { formatUnits, shortTxError } from '@/lib/format'
import { CoinFighter, DriftingCloud } from '@/retro/landingFx'
import { CREAM, INK, PINK, SKY, YELLOW } from '@/retro/scene'
import { COIN_BODIES } from '@/components/GamePickers'

const PIXEL = "'Press Start 2P', 'Courier New', monospace"
const sol = (raw: bigint) => `${Number(Number(formatUnits(raw, 9)).toPrecision(3))} SOL`

function LobbyCard({ duel }: { duel: Duel }) {
  const live = useLivePrices()
  const usd = live.solUsd && duel.stake > 0n ? (Number(duel.stake) / 1e9) * (Number(live.solUsd.priceRaw) / 10 ** live.solUsd.decimals) : null
  const empty = duel.racers.length === 0
  const hot = duel.status === 'ready' || duel.status === 'starting' || duel.status === 'running'
  return (
    <Link to={`/onchain/duel/${duel.id}`} className="rx-raised rx-hop-host" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: CREAM, color: INK, textDecoration: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: PIXEL, fontSize: 11 }}>{duel.title}</span>
        <span style={{ fontFamily: PIXEL, fontSize: 8, padding: '5px 7px', border: `2px solid ${INK}`, background: hot ? PINK : empty ? '#FFFFFF' : YELLOW, animation: hot ? 'rx-blink 1s steps(1) infinite' : undefined }}>{duelPhaseLabel(duel)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, minHeight: 62 }}>
        {empty ? (
          <span style={{ fontSize: 16, fontWeight: 700, opacity: 0.6 }}>Bring your coin and set the rules →</span>
        ) : duel.racers.map((r, i) => (
          <span key={r.seat} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <CoinFighter body={COIN_BODIES[i % COIN_BODIES.length]} logoUrl={assetIconUrl(r.symbol)} symbol={r.symbol} size={40} />
            <span style={{ fontFamily: PIXEL, fontSize: 7 }}>{r.symbol}</span>
          </span>
        ))}
        {!empty && duel.racers.length < DUEL_RULES.maxRacers && duel.status === 'open' && (
          <span style={{ width: 40, height: 42, border: `3px dashed ${INK}`, opacity: 0.35, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: PIXEL, fontSize: 12 }}>+</span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 14, fontWeight: 700 }}>
        {empty ? <span style={{ opacity: 0.6 }}>Memes or crypto · stake $1-$50</span> : (
          <>
            <span>Stake {usd ? `$${usd.toFixed(usd < 10 ? 2 : 0)}` : sol(duel.stake)}</span>
            <span>{durationLabel(duel.duration)}</span>
            <span>{duel.category === 'meme' ? 'Memes' : 'Crypto'}</span>
            {duel.pot > 0n && <span>Pot {sol(duel.pot)}</span>}
          </>
        )}
      </div>
    </Link>
  )
}

/** Coin duels: ten empty lobbies always wait; anyone can open another. */
export function OnchainDuelsListPage() {
  const { duels, isLoading, offline } = useDuels()
  const { connected } = useWallet()
  const act = useSignedAction()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const live = duels.filter((d) => !['resolved', 'void', 'cancelled'].includes(d.status))
  const active = live.filter((d) => d.racers.length > 0).sort((a, b) => b.racers.length - a.racers.length)
  const empty = live.filter((d) => d.racers.length === 0)
  const finished = duels.filter((d) => d.status === 'resolved').slice(0, 6)

  async function createLobby() {
    setError(null)
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
    <div style={{ position: 'relative', minHeight: '100%', background: SKY, color: INK, fontFamily: "'Pixelify Sans', 'Courier New', monospace", overflow: 'hidden' }}>
      <DriftingCloud width={120} top={50} duration={80} delay={15} />
      <div className="mx-auto max-w-[1200px] px-4 py-8" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: PIXEL, fontSize: 'clamp(18px, 2.6vw, 32px)', fontWeight: 400, lineHeight: 1.4, textShadow: `4px 4px 0 ${YELLOW}` }}>COIN DUELS</h1>
            <p style={{ margin: '8px 0 0', maxWidth: 640, fontSize: 18, fontWeight: 600 }}>
              Bring your coin, match the stake, hit READY. The coin that grows the most wins the pot. Watching? Back a racer and cheer.
            </p>
          </div>
          {connected
            ? <button type="button" onClick={createLobby} disabled={pending} className="rx-btn rx-btn-yellow" style={{ padding: '14px 20px', fontFamily: PIXEL, fontSize: 12 }}>{pending ? 'SIGN IN WALLET…' : '+ NEW LOBBY'}</button>
            : <span style={{ fontWeight: 700, opacity: 0.7 }}>Connect a wallet to open your own lobby</span>}
        </div>
        {error && <p style={{ color: '#C2245A', fontWeight: 700 }}>{error}</p>}
        {offline && <p className="rx-plate" style={{ display: 'inline-block', marginTop: 16, background: CREAM, padding: '8px 12px', fontWeight: 700 }}>The game server is taking a break - lobbies open again shortly.</p>}

        {isLoading && duels.length === 0 ? <p style={{ marginTop: 32 }}>Loading lobbies…</p> : (
          <>
            {active.length > 0 && (<><h2 style={h2}>LIVE LOBBIES</h2><div style={grid}>{active.map((d) => <LobbyCard key={d.id} duel={d} />)}</div></>)}
            <h2 style={h2}>EMPTY LOBBIES · PICK ONE</h2>
            <div style={grid}>{empty.map((d) => <LobbyCard key={d.id} duel={d} />)}</div>
            {empty.length === 0 && <p>The lobbies are being set up… refresh in a moment.</p>}
            {finished.length > 0 && (<><h2 style={h2}>JUST FINISHED</h2><div style={grid}>{finished.map((d) => <LobbyCard key={d.id} duel={d} />)}</div></>)}
          </>
        )}
      </div>
    </div>
  )
}
