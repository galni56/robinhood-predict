import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { CRYPTO_ASSETS_ENABLED } from '@/chain/features'
import {
  PRICE_ARENA_DURATIONS,
  PRICE_ARENA_MAX_PARTICIPANTS,
  arenaDurationLabel,
  categoryForArenaMode,
  type PriceArenaMode,
} from '@/chain/priceArena'
import { useSignedAction } from '@/chain/gameServer'
import { useApprovedRaceAssets } from '@/chain/useApprovedRaceAssets'
import { ClusterBanner } from '@/components/ClusterBanner'
import { CompactAssetSelector } from '@/components/CompactAssetSelector'
import { FilterChips, GAME_MODE_CHIP_OPTIONS } from '@/components/FilterChips'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { GameLifecycleGuide } from '@/components/GameLifecycleGuide'
import { shortTxError } from '@/lib/format'

export function OnchainCreateArenaPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const requestedMode = params.get('mode')
  const mode: PriceArenaMode = requestedMode === 'memes' || (CRYPTO_ASSETS_ENABLED && requestedMode === 'crypto')
    ? requestedMode
    : 'stocks'
  const category = categoryForArenaMode(mode)
  const approved = useApprovedRaceAssets()
  const assets = approved.assets.filter((asset) => asset.category === category)
  const [title, setTitle] = useState('')
  const [assetId, setAssetId] = useState('')
  const [duration, setDuration] = useState<bigint>(300n)
  const [txLabel, setTxLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { publicKey, connected } = useWallet()
  const act = useSignedAction()
  const selected = assets.find((asset) => asset.assetId === assetId) ?? assets[0]
  const titleBytes = new TextEncoder().encode(title.trim()).length
  const valid = !!selected && titleBytes > 0 && titleBytes <= 64
  const maxWinners = Math.floor(PRICE_ARENA_MAX_PARTICIPANTS / 2)

  function selectMode(next: PriceArenaMode) {
    setAssetId('')
    setParams(next === 'stocks' ? {} : { mode: next })
  }

  async function create() {
    if (!publicKey || !selected || !valid) return
    setError(null)
    try {
      // A signed message, not a transaction: creating an arena is free.
      setTxLabel('Sign arena creation in wallet…')
      const created = await act<{ id: number }>({ action: 'create-arena', title: title.trim(), asset: selected.symbol, duration: Number(duration) })
      await queryClient.invalidateQueries({ queryKey: ['game-state'] })
      navigate(`/onchain/arenas/${created.id}`)
    } catch (cause) {
      setTxLabel(null)
      setError(shortTxError(cause, 'create-arena'))
    }
  }

  return (
    <div style={{ minHeight: '100%', background: '#4B37B0', color: '#FFF6DF', fontFamily: "'Pixelify Sans', 'Courier New', monospace" }}>
    <div className="mx-auto max-w-[1280px] px-4 py-5">
      <ClusterBanner className="mb-4" />
      <Link to={`/onchain/arenas${mode === 'stocks' ? '' : `?mode=${mode}`}`} className="text-sm text-[#1B1340]/55 hover:text-[#1B1340]">← All arenas</Link>
      <div className="mt-4 grid min-w-0 items-stretch gap-6 lg:min-h-[calc(100dvh-180px)] lg:grid-cols-[440px_1fr] xl:gap-8">
        <div className="flex min-w-0 flex-col">
          <p className="text-sm font-bold text-[#1F7FD1]">Create Price Arena</p>
          <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">Set the stage.</h1>
          <div className="mt-3 flex gap-1.5">
            <FilterChips size="sm" options={GAME_MODE_CHIP_OPTIONS} value={mode} onChange={selectMode} />
          </div>

          <div className="mt-4 flex-1">
            <GameLifecycleGuide
              className="lg:h-full"
              tone="arena"
              eyebrow={`${arenaDurationLabel(duration)} arena · full lifecycle`}
              title="From forecast to final ranking"
              intro="Creating an arena is free (your wallet signs a message) and does not enter a forecast. The 10-minute lobby begins at once; the selected game duration follows it. The creator earns half of the 2% fee."
              stages={[
                {
                  title: 'Players enter forecasts',
                  timing: 'Lobby · 10 min',
                  body: `Between 2 and ${PRICE_ARENA_MAX_PARTICIPANTS} wallets submit an exact final USD price and stake $1-$50, entered in USD or SOL. The wallet sends SOL to the Prophet game wallet. During the lobby, a player may change the prediction (free, a signed message) and add stake, but cannot reduce or withdraw it.`,
                },
                {
                  title: 'Forecasts stay off the board',
                  timing: 'During the lobby',
                  body: 'Predictions are hidden from the arena board until the lobby closes, reducing copycat play. The stake transaction carries the prediction in a public memo, so a determined reader can still look it up.',
                },
                {
                  title: 'The game runs',
                  timing: arenaDurationLabel(duration),
                  body: 'The lobby closes automatically: no new players, prediction changes or top-ups are accepted. Forecasts become visible and the game counts down to its fixed deadline.',
                },
                {
                  title: 'The deadline price ranks everyone',
                  timing: 'At the fixed finish',
                  body: `Settlement uses the signed price of the reviewed pool at the last block before the deadline. The closest floor(player count ÷ 2) forecasts win - one winner with 2–3 players and up to ${maxWinners} with ${PRICE_ARENA_MAX_PARTICIPANTS}. Equal errors are ordered by who set their final prediction first.`,
                },
                {
                  title: 'Paid to your wallet',
                  timing: 'After settlement',
                  body: 'Winners receive their stake plus an accuracy-and-stake-weighted share of the losing pool, straight to their wallet; the 2% fee applies only to that losing-pool profit. Fewer than two players or no valid deadline price cancels the arena and sends every stake back.',
                },
              ]}
              note={`Selected schedule: 10-minute lobby, then a ${arenaDurationLabel(duration)} game. The closest forecast can receive up to 3× the accuracy weight used to divide the losing pool.`}
            />
          </div>
        </div>

        <div className="rx-raised flex h-full min-w-0 flex-col gap-4 bg-[#FFF6DF] p-5 text-[#1B1340] sm:p-6">
          <label className="block"><span className="mb-2 block text-[#1B1340]" style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 11 }}>Arena title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={64} placeholder={mode === 'memes' ? 'Meme price showdown' : mode === 'crypto' ? 'SOL closing shot' : 'NVDAx closing shot'} className="w-full rounded-none border border-[#1B1340]/15 bg-[#1B1340]/5 px-4 py-3 outline-none focus:border-[#6bcbf4]/50" /><span className="mt-1 block text-right text-xs text-[#1B1340]/50">{titleBytes} / 64 bytes</span></label>
          <div>
            <div className="mb-2 text-sm font-bold text-[#1B1340]/70">Asset</div>
            {approved.error ? <p className="py-5 text-sm text-[#C2245A]">Could not read the approved assets.</p>
              : assets.length > 0 ? (
                <CompactAssetSelector
                  assets={assets.map((asset) => ({
                    id: asset.assetId,
                    symbol: asset.symbol,
                    name: asset.name,
                    logoUrl: asset.logoUrl,
                    priceUrl: asset.priceUrl,
                  }))}
                  selectedIds={selected ? [selected.assetId] : []}
                  onSelect={setAssetId}
                  tone="arena"
                />
              ) : <p className="py-5 text-sm text-[#1B1340]/55">{approved.isLoading ? 'Loading approved assets…' : 'No approved assets in this category yet.'}</p>}
          </div>
          <div><div className="mb-2 text-sm font-bold text-[#1B1340]/70">Game duration</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{PRICE_ARENA_DURATIONS.map((seconds) => <button key={seconds.toString()} onClick={() => setDuration(seconds)} className={`rounded-none border px-3 py-3 text-sm font-bold ${duration === seconds ? 'border-[#6bcbf4] bg-[#6bcbf4]/15 text-[#1F7FD1]' : 'border-[#1B1340]/12 bg-white/[0.03] text-[#1B1340]/60'}`}>{arenaDurationLabel(seconds)}</button>)}</div></div>
          {error && <p className="text-sm text-[#C2245A]">{error}</p>}
          {!connected ? <WalletOptionsList tone="arena" /> : <button onClick={create} disabled={!publicKey || !valid || !!txLabel} className="w-full rounded-none bg-gradient-to-r from-[#8ddaf8] to-[#6bcbf4] py-3 font-bold text-[#191330] disabled:opacity-40">{txLabel ?? 'Create Price Arena'}</button>}
        </div>
      </div>
    </div>
    </div>
  )
}
