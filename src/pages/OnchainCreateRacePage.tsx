import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { useAccount, useChainId, useSwitchChain, useWriteContract } from 'wagmi'
import type { ApprovedRaceAsset, AssetRaceMode } from '@/chain/assetRaces'
import { ASSET_RACE_ADDRESS, assetRaceAbi, categoryForRaceMode } from '@/chain/assetRaces'
import { assetRaceChain, isLocalAssetRace, wagmiConfig } from '@/chain/config'
import { useApprovedRaceAssets } from '@/chain/useApprovedRaceAssets'
import { CompactAssetSelector } from '@/components/CompactAssetSelector'
import { GameLifecycleGuide } from '@/components/GameLifecycleGuide'
import { GameModeMotion } from '@/components/GameModeMotion'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { shortTxError } from '@/lib/format'

function durationLabel(seconds: bigint) {
  if (seconds % 3600n === 0n) return `${seconds / 3600n} hour${seconds === 3600n ? '' : 's'}`
  if (seconds % 60n === 0n) return `${seconds / 60n} min`
  return `${seconds}s`
}

export function OnchainCreateRacePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const mode: AssetRaceMode = searchParams.get('mode') === 'memes' ? 'memes' : 'stocks'
  const category = categoryForRaceMode(mode)
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const { assets, durations, isLoading, error: registryError } = useApprovedRaceAssets()
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState<bigint>(0n)
  const [selected, setSelected] = useState<ApprovedRaceAsset[]>([])
  const [txLabel, setTxLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedDuration = duration || durations[0] || 0n
  const normalizedTitle = title.trim()
  const titleBytes = new TextEncoder().encode(normalizedTitle).length
  const validTitle = titleBytes > 0 && titleBytes <= 64
  const onRightChain = chainId === assetRaceChain.id
  const visibleAssets = assets.filter((asset) => asset.category === category)

  function selectMode(nextMode: AssetRaceMode) {
    setSelected([])
    setSearchParams(nextMode === 'memes' ? { mode: 'memes' } : {})
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
      if (!ASSET_RACE_ADDRESS || !validTitle || selectedDuration === 0n) return
      setTxLabel('Confirm Community Race creation…')
      const hash = await writeContractAsync({
        address: ASSET_RACE_ADDRESS,
        chainId: assetRaceChain.id,
        abi: assetRaceAbi,
        functionName: 'createCommunityRace',
        args: [normalizedTitle, category, selectedDuration, selected.map((asset) => asset.assetId)],
      })
      setTxLabel('Waiting for race confirmation…')
      await waitForTransactionReceipt(wagmiConfig, { hash, chainId: assetRaceChain.id })
      navigate(`/onchain/races${mode === 'memes' ? '?mode=memes' : ''}`)
    } catch (cause) {
      setTxLabel(null)
      setError(shortTxError(cause))
    }
  }

  return (
    <div className={`mx-auto max-w-[1280px] px-4 py-5 lg:min-h-[calc(100dvh-104px)] ${mode === 'memes' ? 'asset-race-meme' : ''}`}>
      <Link to={`/onchain/races${mode === 'memes' ? '?mode=memes' : ''}`} className="text-sm text-white/40 transition-colors hover:text-white/70">← All races</Link>

      <div className="mt-4 grid min-w-0 items-stretch gap-6 lg:min-h-[calc(100dvh-180px)] lg:grid-cols-[440px_1fr] xl:gap-8">
        <div className="flex min-w-0 flex-col">
          <p className="mb-1 text-sm font-bold text-[#F2A65A]">
            Create a community {mode === 'memes' ? 'meme' : 'stock'} race
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {mode === 'memes' ? 'Assemble the meme pack' : 'Build the starting grid'}
          </h1>
          {isLocalAssetRace && <p className="mt-2 text-xs font-bold text-[#F2A65A]">Local test network · no real funds</p>}
          <div className="mt-3 flex gap-1.5">
            {(['stocks', 'memes'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => selectMode(item)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
                  mode === item
                    ? item === 'memes'
                      ? 'bg-[#F2A65A] text-[#3b2416]'
                      : 'bg-[#f7f1e3] text-[#241a33]'
                    : 'text-white/50 hover:bg-white/5 hover:text-white'
                }`}
              >
                {item === 'stocks' ? 'Stocks' : 'Memes'}
              </button>
            ))}
          </div>

          <div className="mt-4 flex-1">
            <GameLifecycleGuide
              className="lg:h-full"
              tone="race"
              eyebrow={`${selectedDuration > 0n ? durationLabel(selectedDuration) : 'Choose a duration'} race · full lifecycle`}
              title="From lobby to finish line"
              intro="Creating a race costs gas but places no bet. The creator defines the category and duration; the protocol fixes every later phase."
              stages={[
                {
                  title: 'Build the grid',
                  timing: 'Lobby · 5 min',
                  body: `The creator may add up to six approved ${mode === 'memes' ? 'memes' : 'stocks'}. During the lobby, other wallets may add one approved asset each. At least two assets must be present when the lobby closes.`,
                },
                {
                  title: 'Back one contender',
                  timing: 'Betting · 5 min',
                  body: 'Choose one asset and enter $1–$50 in USD or ETH; the wallet sends native ETH directly. You may add to that same position while betting is open, but cannot switch assets.',
                },
                {
                  title: 'Lock the starting prices',
                  timing: 'At betting close',
                  body: 'Only assets with funded pools become active. At least two must be active or the race cancels. The exact starting snapshot is fixed at the betting cutoff; its proof has a 3-minute submission grace period.',
                },
                {
                  title: 'Run the race',
                  timing: selectedDuration > 0n ? durationLabel(selectedDuration) : '1, 5 or 15 min',
                  body: 'Live rankings compare each active asset by percentage return from the shared starting snapshot. The displayed leaderboard can move, but the scheduled finish time cannot.',
                },
                {
                  title: 'Fix the finish and settle',
                  timing: '5 min proof grace',
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

        {!ASSET_RACE_ADDRESS ? (
          <div className="h-full rounded-xl border border-amber-400/25 bg-amber-400/10 p-5 text-sm text-amber-100">
            Community creation needs a configured AssetRace contract. Preview mode cannot send transactions.
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
              placeholder="AI stock battle"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 font-medium outline-none transition-colors focus:border-[#F2A65A]/50"
            />
            <div className={`mt-1 text-right text-[11px] font-medium ${titleBytes > 64 ? 'text-rose-400' : 'text-white/30'}`}>{titleBytes} / 64 bytes</div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-white/60">Race duration</label>
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

          {!isConnected ? <WalletOptionsList tone="race" /> : !onRightChain ? (
            <button onClick={() => switchChain({ chainId: assetRaceChain.id })} disabled={isSwitching} className="w-full rounded-full bg-[#F2A65A] py-3 text-sm font-bold text-[#3b2416] disabled:opacity-50">
              {isSwitching ? 'Switching…' : `Switch to ${assetRaceChain.name}`}
            </button>
          ) : (
            <button
              onClick={createRace}
              disabled={!address || !validTitle || selectedDuration === 0n || !!txLabel}
              className="w-full rounded-xl bg-gradient-to-r from-[#F2A65A] to-[#ED8F3A] py-3 text-sm font-bold text-[#3b2416] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {txLabel ?? `Create ${mode === 'memes' ? 'meme' : 'stock'} race`}
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
