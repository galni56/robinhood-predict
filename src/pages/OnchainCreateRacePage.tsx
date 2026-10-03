import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { PublicKey } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'
import type { ApprovedRaceAsset, AssetRaceMode } from '@/chain/assetRaces'
import { categoryForRaceMode } from '@/chain/assetRaces'
import { CRYPTO_ASSETS_ENABLED } from '@/chain/features'
import { createCommunityRaceInstructions } from '@/chain/gameTx'
import { useApprovedRaceAssets } from '@/chain/useApprovedRaceAssets'
import { useGameConfig } from '@/chain/useGameConfig'
import { ClusterBanner } from '@/components/ClusterBanner'
import { StakeCurrencySelect } from '@/components/StakeCurrencySelect'
import { CompactAssetSelector } from '@/components/CompactAssetSelector'
import { GameLifecycleGuide } from '@/components/GameLifecycleGuide'
import { GameModeMotion } from '@/components/GameModeMotion'
import { FilterChips, GAME_MODE_CHIP_OPTIONS } from '@/components/FilterChips'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { NATIVE_SOL } from '@/solana/config'
import { assetIdFromSymbol } from '@/solana/pda'
import { usePrograms } from '@/solana/programs'
import { TxUnconfirmedError, useSendInstructions } from '@/solana/tx'
import { shortTxError } from '@/lib/format'

function durationLabel(seconds: bigint) {
  if (seconds % 3600n === 0n) return `${seconds / 3600n} hour${seconds === 3600n ? '' : 's'}`
  if (seconds % 60n === 0n) return `${seconds / 60n} min`
  return `${seconds}s`
}

export function OnchainCreateRacePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedMode = searchParams.get('mode')
  const mode: AssetRaceMode = requestedMode === 'memes' || (CRYPTO_ASSETS_ENABLED && requestedMode === 'crypto')
    ? requestedMode
    : 'stocks'
  const category = categoryForRaceMode(mode)
  const queryClient = useQueryClient()
  const { publicKey, connected } = useWallet()
  const { games } = usePrograms()
  const send = useSendInstructions()
  const { assets, durations, isLoading, error: registryError } = useApprovedRaceAssets()
  const config = useGameConfig()
  const policy = config.data?.communityPolicy
  const minutes = (seconds?: bigint) => (seconds != null ? durationLabel(seconds) : '…')
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState<bigint>(0n)
  const [selected, setSelected] = useState<ApprovedRaceAsset[]>([])
  const [stakeMint, setStakeMint] = useState(NATIVE_SOL.toBase58())
  const [txLabel, setTxLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedDuration = duration || durations[0] || 0n
  const normalizedTitle = title.trim()
  const titleBytes = new TextEncoder().encode(normalizedTitle).length
  const validTitle = titleBytes > 0 && titleBytes <= 64
  const visibleAssets = assets.filter((asset) => asset.category === category)

  function selectMode(nextMode: AssetRaceMode) {
    setSelected([])
    setSearchParams(nextMode === 'stocks' ? {} : { mode: nextMode })
  }

  function toggleAsset(asset: ApprovedRaceAsset) {
    setSelected((current) => {
      const exists = current.some((item) => item.assetId.toLowerCase() === asset.assetId.toLowerCase())
      return exists ? current.filter((item) => item.assetId !== asset.assetId) : current.length < 6 ? [...current, asset] : current
    })
  }

  async function createRace() {
    setError(null)
    try {
      if (!publicKey || !validTitle || selectedDuration === 0n) return
      setTxLabel('Preparing Community Race…')
      const { raceId, instructions } = await createCommunityRaceInstructions(games, {
        creator: publicKey,
        title: normalizedTitle,
        category,
        raceDuration: selectedDuration,
        stakeMint: new PublicKey(stakeMint),
        assetIds: selected.map((asset) => assetIdFromSymbol(asset.symbol)),
      })
      await send(instructions, {
        onPhase: (phase) => setTxLabel(phase === 'signing' ? 'Confirm race creation in wallet…' : 'Waiting for race confirmation…'),
      })
      await queryClient.invalidateQueries({ queryKey: ['history'] })
      navigate(`/onchain/races/${raceId}`)
    } catch (cause) {
      setTxLabel(null)
      setError(shortTxError(cause, 'create-race'))
      if (cause instanceof TxUnconfirmedError) void queryClient.invalidateQueries({ queryKey: ['history'] })
    }
  }

  return (
    <div className={`mx-auto max-w-[1280px] px-4 py-5 lg:min-h-[calc(100dvh-104px)] ${mode === 'memes' ? 'asset-race-meme' : ''}`}>
      <ClusterBanner className="mb-4" />
      <Link to={`/onchain/races${mode === 'stocks' ? '' : `?mode=${mode}`}`} className="text-sm text-white/40 transition-colors hover:text-white/70">← All races</Link>

      <div className="mt-4 grid min-w-0 items-stretch gap-6 lg:min-h-[calc(100dvh-180px)] lg:grid-cols-[440px_1fr] xl:gap-8">
        <div className="flex min-w-0 flex-col">
          <p className="mb-1 text-sm font-bold text-[#F2A65A]">
            Create a community {mode === 'memes' ? 'meme' : mode === 'crypto' ? 'crypto' : 'stock'} race
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {mode === 'memes' ? 'Assemble the meme pack' : mode === 'crypto' ? 'Race the blue chips' : 'Build the starting grid'}
          </h1>
          <div className="mt-3 flex gap-1.5">
            <FilterChips size="sm" options={GAME_MODE_CHIP_OPTIONS} value={mode} onChange={selectMode} />
          </div>

          <div className="mt-4 flex-1">
            <GameLifecycleGuide
              className="lg:h-full"
              tone="race"
              eyebrow={`${selectedDuration > 0n ? durationLabel(selectedDuration) : 'Choose a duration'} race · full lifecycle`}
              title="From lobby to finish line"
              intro="Creating a race places no bet. It costs about 0.009 SOL of rent for the race account, which is not refunded, plus a small network fee. The creator defines the category and duration; the protocol fixes every later phase."
              stages={[
                {
                  title: 'Build the grid',
                  timing: `Lobby · ${minutes(policy?.lobbyDuration)}`,
                  body: `The creator may add up to six approved ${mode === 'memes' ? 'memes' : mode === 'crypto' ? 'crypto assets' : 'stocks'}. During the lobby, other wallets may add one approved asset each. At least two assets must be present when the lobby closes.`,
                },
                {
                  title: 'Back one contender',
                  timing: `Betting · ${minutes(policy?.bettingDuration)}`,
                  body: 'Choose one asset and enter $1–$50 in USD or SOL; the wallet sends SOL directly to the race account. You may add to that same position while betting is open, but cannot switch assets. Your first bet also pays a small refundable deposit for your position account.',
                },
                {
                  title: 'Lock the starting prices',
                  timing: 'At betting close',
                  body: `Only assets with funded pools become active. At least two must be active or the race cancels. The starting price is the signed pool price at the last block before the betting cutoff; its proof has a ${minutes(policy?.startGrace)} submission grace period.`,
                },
                {
                  title: 'Run the race',
                  timing: selectedDuration > 0n ? durationLabel(selectedDuration) : durations.map(durationLabel).join(', ') || '…',
                  body: 'Live rankings compare each active asset by percentage return from the shared starting snapshot. The displayed leaderboard can move, but the scheduled finish time cannot.',
                },
                {
                  title: 'Fix the finish and settle',
                  timing: `${minutes(policy?.resolutionGrace)} proof grace`,
                  body: 'The finish snapshot belongs to the scheduled end. Highest return wins - even if every return is negative, the least-negative asset leads. An exact top tie voids the race.',
                },
                {
                  title: 'Claim or refund',
                  timing: 'After settlement',
                  body: 'Winning positions claim principal plus their stake-proportional share of losing pools, minus a 2% fee on that profit only. Cancelled or void races return each position in full.',
                },
              ]}
              note="If a required start or finish proof misses its grace period, the contract moves to a refundable terminal state instead of accepting a late substitute price."
            />
          </div>
        </div>

        {config.data?.communityPolicyConfigured === false ? (
          <div className="h-full rounded-xl border border-amber-400/25 bg-amber-400/10 p-5 text-sm text-amber-100">
            Community races are not enabled on this deployment yet.
          </div>
        ) : registryError ? (
          <div className="h-full rounded-xl border border-rose-500/25 bg-rose-500/10 p-5 text-sm text-rose-300">Could not read the approved Race registry.</div>
        ) : (
          <div className="flex h-full min-w-0 flex-col gap-4 rounded-3xl border border-white/5 bg-[#241b2f] p-5 sm:p-6">
          <div>
            <label className="mb-2 block text-sm font-bold text-white/60">Race title</label>
            <input
              value={title}
              maxLength={64}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={mode === 'crypto' ? 'BTC vs ETH' : mode === 'memes' ? 'Meme showdown' : 'AI stock battle'}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 font-medium outline-none transition-colors focus:border-[#F2A65A]/50"
            />
            <div className={`mt-1 text-right text-[11px] font-medium ${titleBytes > 64 ? 'text-rose-400' : 'text-white/30'}`}>{titleBytes} / 64 bytes</div>
          </div>

          <div>
            <StakeCurrencySelect value={stakeMint} onChange={setStakeMint} tone="race" />
            <label className="mb-2 mt-4 block text-sm font-bold text-white/60">Race duration</label>
            <select
              value={selectedDuration.toString()}
              onChange={(event) => setDuration(BigInt(event.target.value))}
              className="w-full rounded-xl border border-white/10 bg-[#1e1728] px-3.5 py-2.5 font-medium outline-none focus:border-[#F2A65A]/50"
            >
              {durations.map((seconds) => <option key={seconds.toString()} value={seconds.toString()}>{durationLabel(seconds)}</option>)}
            </select>
            <p className="mt-1.5 text-xs font-medium text-white/35">Only protocol-approved presets are available.</p>
          </div>

          <div>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-white/60">Initial assets · optional</div>
                <p className="mt-1 text-xs font-medium text-white/35">Approved registry assets only. Minimum two are needed when the lobby closes.</p>
              </div>
              <span className="shrink-0 rounded-full bg-[#F2A65A]/15 px-2.5 py-1 text-xs font-bold text-[#F2A65A]">{selected.length} / 6</span>
            </div>
            {isLoading ? <p className="py-8 text-center text-sm text-white/35">Loading approved assets…</p> : (
              <CompactAssetSelector
                assets={visibleAssets.map((asset) => ({
                  id: asset.assetId,
                  symbol: asset.symbol,
                  name: asset.name,
                  logoUrl: asset.logoUrl,
                  priceUrl: asset.priceUrl,
                }))}
                selectedIds={selected.map((asset) => asset.assetId)}
                onSelect={(id) => {
                  const asset = visibleAssets.find((item) => item.assetId.toLowerCase() === id.toLowerCase())
                  if (asset) toggleAsset(asset)
                }}
                tone="race"
                multiple
                maxSelected={6}
              />
            )}
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          {!connected ? <WalletOptionsList tone="race" /> : (
            <button
              onClick={createRace}
              disabled={!publicKey || !validTitle || selectedDuration === 0n || !!txLabel}
              className="w-full rounded-xl bg-gradient-to-r from-[#F2A65A] to-[#ED8F3A] py-3 text-sm font-bold text-[#3b2416] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {txLabel ?? `Create ${mode === 'memes' ? 'meme' : mode === 'crypto' ? 'crypto' : 'stock'} race`}
            </button>
          )}

          <GameModeMotion
            mode="race"
            assets={(selected.length > 0 ? selected : visibleAssets.slice(0, 3)).map((asset) => ({
              symbol: asset.symbol,
              logoUrl: asset.logoUrl,
            }))}
            className="mt-auto"
          />

          </div>
        )}
      </div>
    </div>
  )
}
