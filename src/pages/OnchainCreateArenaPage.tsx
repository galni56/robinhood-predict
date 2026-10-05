import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import type { ApprovedRaceAsset } from '@/chain/assetRaces'
import { PRICE_ARENA_DURATIONS, PRICE_ARENA_MAX_PARTICIPANTS, arenaDurationLabel, categoryForArenaMode, type PriceArenaMode } from '@/chain/priceArena'
import { useSignedAction } from '@/chain/gameServer'
import { useLivePrices, marketCapUsd } from '@/chain/livePrices'
import { useApprovedRaceAssets } from '@/chain/useApprovedRaceAssets'
import { ClusterBanner } from '@/components/ClusterBanner'
import { FilterChips, GAME_MODE_CHIP_OPTIONS } from '@/components/FilterChips'
import { CoinPicker, COIN_BODIES, HowItWorksStrip } from '@/components/GamePickers'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { assetIconUrl } from '@/lib/assetIcons'
import { formatCompactUsd, formatUnits, shortTxError } from '@/lib/format'
import { CoinFighter } from '@/retro/landingFx'
import { CREAM, INK, NIGHT, PINK, Stars, YELLOW } from '@/retro/scene'
import { coinBlueGrin, coinOrangeGrin, coinPinkGrin, logoCoin } from '@/retro/spriteData'

const PIXEL = "'Press Start 2P', 'Courier New', monospace"
const ARENA_BLUE = '#6BCBF4'

/** The ring: the chosen coin in the middle, sample calls floating around it. */
function ArenaPreview({ coin, unit }: { coin?: ApprovedRaceAsset; unit: 'cap' | 'price' }) {
  const live = useLivePrices()
  const price = coin ? live.assets[coin.symbol] : undefined
  const now = price ? (unit === 'cap' ? marketCapUsd(price) : Number(formatUnits(price.raw, price.decimals))) : undefined
  const fmt = (v: number) => (unit === 'cap' ? formatCompactUsd(v) : `$${Number(v.toPrecision(4))}`)
  const calls = now ? [0.93, 1.06, 0.98, 1.12, 1.01].map((k) => fmt(now * k)) : ['?', '?', '?', '?', '?']
  const spots = [[6, 16], [70, 12], [4, 58], [72, 56], [30, 30]]
  return (
    <div className="rx-raised" style={{ position: 'relative', height: 340, background: NIGHT, overflow: 'hidden' }}>
      <Stars stars={[['8%', 24, 4, 1.3], ['21%', 58, 8, 1.9], ['37%', 18, 4, 1.1], ['63%', 30, 8, 1.7], ['78%', 62, 4, 1.4], ['91%', 22, 4, 2.1]]} />
      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', fontFamily: PIXEL, fontSize: 10, color: CREAM }}>
        <span>FIGHT PREVIEW</span>
        <span style={{ color: coin ? '#8BE89A' : YELLOW, animation: coin ? undefined : 'rx-blink 0.8s steps(1) infinite' }}>{coin ? 'READY' : 'PICK A COIN'}</span>
      </div>
      {calls.map((call, i) => (
        <span key={i} className="rx-plate rx-fx-float" style={{ position: 'absolute', left: `${spots[i][0]}%`, top: `${spots[i][1] + 10}%`, fontFamily: PIXEL, fontSize: 10, background: i === 1 ? YELLOW : CREAM, color: INK, padding: '7px 8px', animationDelay: `${i * 0.4}s` }}>
          {call}
        </span>
      ))}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 52, display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', animation: 'rx-bob 0.6s steps(1) infinite' }}>
          <span className="rx-plate" style={{ position: 'absolute', left: '50%', top: -36, transform: 'translateX(-50%)', fontFamily: PIXEL, fontSize: 11, background: PINK, color: INK, padding: '6px 8px', whiteSpace: 'nowrap' }}>
            {coin ? `${coin.symbol} ${unit === 'cap' ? 'CAP' : 'PRICE'} ?` : '???'}
          </span>
          {coin
            ? <CoinFighter body={COIN_BODIES[1]} logoUrl={coin.logoUrl ?? assetIconUrl(coin.symbol)} symbol={coin.symbol} size={96} />
            : <span style={{ display: 'inline-flex', width: 96, height: 102, alignItems: 'center', justifyContent: 'center', border: `4px dashed rgba(255,246,223,0.4)`, color: CREAM, fontFamily: PIXEL, fontSize: 24 }}>?</span>}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 40, background: '#C2245A', backgroundImage: 'repeating-linear-gradient(90deg, rgba(27, 19, 64, 0.4) 0 4px, transparent 4px 56px)', borderTop: `4px solid ${INK}` }} />
    </div>
  )
}

export function OnchainCreateArenaPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const mode: PriceArenaMode = params.get('mode') === 'crypto' ? 'crypto' : 'memes'
  const category = categoryForArenaMode(mode)
  const approved = useApprovedRaceAssets()
  const assets = approved.assets.filter((asset) => asset.category === category)
  const [title, setTitle] = useState('')
  const [assetId, setAssetId] = useState('')
  const [duration, setDuration] = useState<bigint>(300n)
  // How players call the final number; memes default to market cap.
  const [unitChoice, setUnitChoice] = useState<'cap' | 'price' | null>(null)
  const unit = unitChoice ?? (mode === 'memes' ? 'cap' : 'price')
  const [txLabel, setTxLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { publicKey, connected } = useWallet()
  const act = useSignedAction()
  const selected = assets.find((asset) => asset.assetId === assetId)
  const titleBytes = new TextEncoder().encode(title.trim()).length
  const valid = !!selected && titleBytes > 0 && titleBytes <= 64
  const maxWinners = Math.floor(PRICE_ARENA_MAX_PARTICIPANTS / 2)

  function selectMode(next: PriceArenaMode) {
    setAssetId('')
    setParams(next === 'memes' ? {} : { mode: next })
  }

  async function create() {
    if (!publicKey || !selected || !valid) return
    setError(null)
    try {
      // A signed message, not a transaction: creating an arena is free.
      setTxLabel('Signing…')
      const created = await act<{ id: number }>({ action: 'create-arena', title: title.trim(), asset: selected.symbol, duration: Number(duration), unit })
      await queryClient.invalidateQueries({ queryKey: ['game-state'] })
      navigate(`/onchain/arenas/${created.id}`)
    } catch (cause) {
      setTxLabel(null)
      setError(shortTxError(cause, 'create-arena'))
    }
  }

  const label = { display: 'block', marginBottom: 8, fontFamily: PIXEL, fontSize: 11 } as const
  const choice = (active: boolean) => `rx-btn ${active ? 'rx-btn-yellow' : 'rx-btn-white'}`

  return (
    <div style={{ minHeight: '100%', background: '#4B37B0', color: INK, fontFamily: "'Pixelify Sans', 'Courier New', monospace" }}>
      <div className="mx-auto max-w-[1200px] px-4 py-6">
        <ClusterBanner className="mb-4" />
        <Link to={`/onchain/arenas${mode === 'memes' ? '' : `?mode=${mode}`}`} style={{ color: CREAM, fontSize: 16, fontWeight: 700 }}>← All arenas</Link>

        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <h1 style={{ margin: 0, color: CREAM, fontFamily: PIXEL, fontSize: 'clamp(18px, 2.4vw, 30px)', fontWeight: 400, lineHeight: 1.4, textShadow: `4px 4px 0 ${INK}` }}>
            SET UP THE FIGHT
          </h1>
          <FilterChips size="sm" options={GAME_MODE_CHIP_OPTIONS} value={mode} onChange={selectMode} />
        </div>

        <div style={{ marginTop: 24, display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ArenaPreview coin={selected} unit={unit} />
            <p style={{ margin: 0, color: CREAM, fontSize: 16, fontWeight: 600 }}>
              One coin, up to {PRICE_ARENA_MAX_PARTICIPANTS} players. Everyone calls its final {unit === 'cap' ? 'market cap' : 'price'}; the closest half split the bank. Creating is free - your wallet just signs.
            </p>
          </div>

          <div className="rx-raised" style={{ background: CREAM, padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={label} htmlFor="arena-title">ARENA TITLE</label>
              <input id="arena-title" value={title} maxLength={64} onChange={(event) => setTitle(event.target.value)} placeholder={mode === 'crypto' ? 'SOL closing shot' : 'Meme cap showdown'} className="rx-input w-full px-3.5 font-medium" style={{ height: 52 }} />
            </div>

            <div>
              <span style={label}>PLAYERS CALL THE FINAL</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(['cap', 'price'] as const).map((c) => (
                  <button key={c} type="button" onClick={() => setUnitChoice(c)} className={choice(unit === c)} style={{ padding: '10px 16px', fontSize: 15, fontWeight: 700 }}>{c === 'cap' ? 'Market cap' : 'Price'}</button>
                ))}
              </div>
            </div>

            <div>
              <span style={label}>FIGHT LENGTH</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {PRICE_ARENA_DURATIONS.map((seconds) => (
                  <button key={seconds.toString()} type="button" onClick={() => setDuration(seconds)} className={choice(duration === seconds)} style={{ padding: '10px 16px', fontSize: 15, fontWeight: 700 }}>{arenaDurationLabel(seconds)}</button>
                ))}
              </div>
            </div>

            <div>
              <span style={label}>COIN</span>
              <CoinPicker assets={assets} selected={selected ? [selected.assetId] : []} onToggle={(asset) => setAssetId(asset.assetId === assetId ? '' : asset.assetId)} max={1} accent={ARENA_BLUE} />
            </div>

            {error && <p style={{ margin: 0, color: '#C2245A', fontWeight: 600 }}>{error}</p>}
            {!connected ? <WalletOptionsList tone="arena" /> : (
              <button onClick={create} disabled={!publicKey || !valid || !!txLabel} className="rx-btn rx-btn-pink w-full" style={{ minHeight: 60, fontFamily: PIXEL, fontSize: 13 }}>
                {txLabel ?? (!selected ? 'PICK A COIN' : titleBytes === 0 ? 'NAME YOUR ARENA' : 'OPEN THE LOBBY')}
              </button>
            )}
          </div>
        </div>

        <h2 style={{ margin: '48px 0 24px', color: CREAM, fontFamily: PIXEL, fontSize: 16, fontWeight: 400 }}>HOW A FIGHT GOES</h2>
        <HowItWorksStrip
          accent={ARENA_BLUE}
          steps={[
            { sprite: logoCoin, title: 'Lobby', timing: '10 MIN', body: `2-${PRICE_ARENA_MAX_PARTICIPANTS} players call the final ${unit === 'cap' ? 'cap' : 'price'} and stake $1-$50.` },
            { sprite: coinOrangeGrin, title: 'Calls hidden', timing: 'DURING LOBBY', body: 'Nobody sees the other calls until the lobby closes.' },
            { sprite: coinPinkGrin, title: 'The fight', timing: arenaDurationLabel(duration).toUpperCase(), body: 'The live board shows who is closest right now.' },
            { sprite: coinBlueGrin, title: 'Paid out', timing: 'AUTOMATIC', body: `The closest ${maxWinners > 1 ? 'half' : 'call'} split the bank, up to 3x for a near hit.` },
          ]}
        />
      </div>
    </div>
  )
}
