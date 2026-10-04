import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import type { ApprovedRaceAsset, AssetRaceMode } from '@/chain/assetRaces'
import { categoryForRaceMode } from '@/chain/assetRaces'
import { useSignedAction } from '@/chain/gameServer'
import { useApprovedRaceAssets } from '@/chain/useApprovedRaceAssets'
import { ClusterBanner } from '@/components/ClusterBanner'
import { FilterChips, GAME_MODE_CHIP_OPTIONS } from '@/components/FilterChips'
import { CoinPicker, GridPreview, HowItWorksStrip } from '@/components/GamePickers'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { shortTxError } from '@/lib/format'
import { DriftingCloud } from '@/retro/landingFx'
import { CREAM, INK, SKY, YELLOW } from '@/retro/scene'
import { coinBlueGrin, coinOrangeGrin, coinPinkGrin, logoCoin } from '@/retro/spriteData'

const PIXEL = "'Press Start 2P', 'Courier New', monospace"
const CATEGORY_NAMES = ['stock', 'meme', 'crypto'] as const

function durationLabel(seconds: bigint) {
  if (seconds % 3600n === 0n) return `${seconds / 3600n} hour${seconds === 3600n ? '' : 's'}`
  if (seconds % 60n === 0n) return `${seconds / 60n} min`
  return `${seconds}s`
}

export function OnchainCreateRacePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const mode: AssetRaceMode = searchParams.get('mode') === 'crypto' ? 'crypto' : 'memes'
  const category = categoryForRaceMode(mode)
  const queryClient = useQueryClient()
  const { publicKey, connected } = useWallet()
  const act = useSignedAction()
  const { assets, durations } = useApprovedRaceAssets()
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState<bigint>(0n)
  const [selected, setSelected] = useState<ApprovedRaceAsset[]>([])
  // How the race shows its numbers; memes default to market cap.
  const [unitChoice, setUnitChoice] = useState<'cap' | 'price' | null>(null)
  const unit = unitChoice ?? (mode === 'memes' ? 'cap' : 'price')
  const [txLabel, setTxLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedDuration = duration || durations[0] || 0n
  const normalizedTitle = title.trim()
  const titleBytes = new TextEncoder().encode(normalizedTitle).length
  const validTitle = titleBytes > 0 && titleBytes <= 64
  const visibleAssets = assets.filter((asset) => asset.category === category)

  function selectMode(nextMode: AssetRaceMode) {
    setSelected([])
    setSearchParams(nextMode === 'memes' ? {} : { mode: nextMode })
  }

  function toggleAsset(asset: ApprovedRaceAsset) {
    setSelected((current) => (current.some((item) => item.assetId === asset.assetId)
      ? current.filter((item) => item.assetId !== asset.assetId)
      : current.length < 6 ? [...current, asset] : current))
  }

  async function createRace() {
    setError(null)
    try {
      if (!publicKey || !validTitle || selectedDuration === 0n) return
      // A signed message, not a transaction: creating a race is free.
      setTxLabel('Sign in wallet…')
      const created = await act<{ id: number }>({
        action: 'create-race',
        title: normalizedTitle,
        category: CATEGORY_NAMES[category],
        duration: Number(selectedDuration),
        assets: selected.map((asset) => asset.symbol),
        unit,
      })
      await queryClient.invalidateQueries({ queryKey: ['game-state'] })
      navigate(`/onchain/races/${created.id}`)
    } catch (cause) {
      setTxLabel(null)
      setError(shortTxError(cause, 'create-race'))
    }
  }

  const label = { display: 'block', marginBottom: 8, fontFamily: PIXEL, fontSize: 11 } as const

  return (
    <div style={{ position: 'relative', minHeight: '100%', background: SKY, color: INK, fontFamily: "'Pixelify Sans', 'Courier New', monospace", overflow: 'hidden' }}>
      <DriftingCloud width={120} top={40} duration={80} delay={20} />
      <DriftingCloud width={80} top={160} duration={60} delay={45} />
      <div className="mx-auto max-w-[1200px] px-4 py-6" style={{ position: 'relative' }}>
        <ClusterBanner className="mb-4" />
        <Link to={`/onchain/races${mode === 'memes' ? '' : `?mode=${mode}`}`} style={{ fontSize: 16, fontWeight: 700 }}>← All races</Link>

        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <h1 style={{ margin: 0, fontFamily: PIXEL, fontSize: 'clamp(18px, 2.4vw, 30px)', fontWeight: 400, lineHeight: 1.4, textShadow: `4px 4px 0 ${YELLOW}` }}>
            BUILD THE STARTING GRID
          </h1>
          <FilterChips size="sm" options={GAME_MODE_CHIP_OPTIONS} value={mode} onChange={selectMode} />
        </div>

        <div style={{ marginTop: 24, display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <GridPreview coins={selected} />
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              Pick up to six coins now; during the lobby every other wallet may add one more. Creating is free - your wallet just signs.
            </p>
          </div>

          <div className="rx-raised" style={{ background: CREAM, padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={label} htmlFor="race-title">RACE TITLE</label>
              <input
                id="race-title"
                value={title}
                maxLength={64}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={mode === 'crypto' ? 'BTC vs ETH' : 'Meme showdown'}
                className="rx-input w-full px-3.5 font-medium"
                style={{ height: 52 }}
              />
            </div>

            <div>
              <span style={label}>RACE BY</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(['cap', 'price'] as const).map((choice) => (
                  <button key={choice} type="button" onClick={() => setUnitChoice(choice)} className={`rx-btn ${unit === choice ? 'rx-btn-yellow' : 'rx-btn-white'}`} style={{ padding: '10px 16px', fontSize: 15, fontWeight: 700 }}>
                    {choice === 'cap' ? 'Market cap' : 'Price'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span style={label}>DURATION</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {durations.map((seconds) => (
                  <button
                    key={seconds.toString()}
                    type="button"
                    onClick={() => setDuration(seconds)}
                    className={`rx-btn ${selectedDuration === seconds ? 'rx-btn-yellow' : 'rx-btn-white'}`}
                    style={{ padding: '10px 16px', fontSize: 15, fontWeight: 700 }}
                  >
                    {durationLabel(seconds)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={label}>COINS</span>
                <span style={{ fontFamily: PIXEL, fontSize: 10 }}>{selected.length} / 6</span>
              </div>
              <CoinPicker assets={visibleAssets} selected={selected.map((a) => a.assetId)} onToggle={toggleAsset} max={6} />
            </div>

            {error && <p style={{ margin: 0, color: '#C2245A', fontWeight: 600 }}>{error}</p>}
            {!connected ? <WalletOptionsList tone="race" /> : (
              <button
                onClick={createRace}
                disabled={!publicKey || !validTitle || selectedDuration === 0n || !!txLabel}
                className="rx-btn rx-btn-yellow w-full"
                style={{ minHeight: 60, fontFamily: PIXEL, fontSize: 13 }}
              >
                {txLabel ?? (validTitle ? 'START THE LOBBY' : 'NAME YOUR RACE')}
              </button>
            )}
          </div>
        </div>

        <h2 style={{ margin: '48px 0 24px', fontFamily: PIXEL, fontSize: 16, fontWeight: 400 }}>HOW A RACE GOES</h2>
        <HowItWorksStrip
          steps={[
            { sprite: logoCoin, title: 'Lobby', timing: '10 MIN', body: 'The grid fills up: you and other wallets add coins.' },
            { sprite: coinOrangeGrin, title: 'Betting', timing: '10 MIN', body: 'Players back one coin with $1-$50 in SOL.' },
            { sprite: coinPinkGrin, title: 'The race', timing: durationLabel(selectedDuration || 300n).toUpperCase(), body: 'Biggest % price gain wins. Prices are signed at start and finish.' },
            { sprite: coinBlueGrin, title: 'Paid out', timing: 'AUTOMATIC', body: 'Winners split the losing pools, straight to their wallets.' },
          ]}
        />
      </div>
    </div>
  )
}
