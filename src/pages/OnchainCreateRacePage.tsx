import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { useAccount, useChainId, useSwitchChain, useWriteContract } from 'wagmi'
import type { ApprovedRaceAsset, AssetRaceMode } from '@/chain/assetRaces'
import { ASSET_RACE_ADDRESS, assetRaceAbi, categoryForRaceMode } from '@/chain/assetRaces'
import { assetRaceChain, isLocalAssetRace, wagmiConfig } from '@/chain/config'
import { useApprovedRaceAssets } from '@/chain/useApprovedRaceAssets'
import { AssetRaceAssetPicker } from '@/components/AssetRaceAssetPicker'
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
    <div className={`mx-auto max-w-4xl px-4 py-8 ${mode === 'memes' ? 'asset-race-meme' : ''}`}>
      <Link to={`/onchain/races${mode === 'memes' ? '?mode=memes' : ''}`} className="text-sm text-white/40 transition-colors hover:text-white/70">← All races</Link>

      <div className="mt-5 grid grid-cols-2 rounded-2xl border border-white/10 bg-black/30 p-1.5">
        {(['stocks', 'memes'] as const).map((item) => <button key={item} type="button" onClick={() => selectMode(item)} className={`rounded-xl px-5 py-3 text-sm font-black tracking-[0.16em] transition-all ${mode === item ? item === 'memes' ? 'bg-gradient-to-r from-fuchsia-500 to-orange-400 text-white' : 'bg-[#8B7CF7] text-black' : 'text-white/40 hover:text-white'}`}>{item === 'stocks' ? '📈 STOCKS' : '🚀 MEMES'}</button>)}
      </div>

      <div className={`mt-5 rounded-2xl border p-5 sm:p-7 ${mode === 'memes' ? 'border-fuchsia-300/25 bg-gradient-to-br from-[#2a153b]/95 to-[#321715]/90' : 'border-[#8B7CF7]/25 bg-[#11170e]/90'}`}>
        <div className={`text-xs font-black tracking-[0.22em] ${mode === 'memes' ? 'text-orange-200' : 'text-[#8B7CF7]'}`}>CREATE COMMUNITY {mode === 'memes' ? 'MEME' : 'STOCK'} RACE</div>
        <h1 className="mt-2 text-3xl font-black">{mode === 'memes' ? 'Assemble the meme pack. 🚀' : 'Build the starting grid.'}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/50">
          Name the race, choose an approved duration, and optionally seed the Lobby with approved {mode === 'memes' ? 'Meme assets' : 'Stock Tokens'}. Other wallets can add one approved asset each before the list locks.
        </p>
        {isLocalAssetRace && <p className="mt-3 text-xs font-bold text-[#8B7CF7]">LOCAL TEST NETWORK · NO REAL FUNDS</p>}
      </div>

      {!ASSET_RACE_ADDRESS ? (
        <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/10 p-5 text-sm text-amber-100">
          Community creation needs a configured AssetRace contract. Preview mode cannot send transactions.
        </div>
      ) : registryError ? (
        <div className="mt-5 rounded-xl border border-rose-500/25 bg-rose-500/10 p-5 text-sm text-rose-300">Could not read the approved Race registry.</div>
      ) : (
        <div className="mt-5 space-y-5 rounded-2xl border border-white/10 bg-[#241b2f]/95 p-5 sm:p-7">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-white/45">Race title</label>
            <input
              value={title}
              maxLength={64}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="AI STOCK BATTLE"
              className="w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 outline-none transition-colors focus:border-[#8B7CF7]/50"
            />
            <div className={`mt-1 text-right text-[10px] ${titleBytes > 64 ? 'text-rose-400' : 'text-white/30'}`}>{titleBytes} / 64 bytes</div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-white/45">Race duration</label>
            <select
              value={selectedDuration.toString()}
              onChange={(event) => setDuration(BigInt(event.target.value))}
              className="w-full rounded-lg border border-white/10 bg-[#1e1728] px-3 py-2.5 outline-none focus:border-[#8B7CF7]/50"
            >
              {durations.map((seconds) => <option key={seconds.toString()} value={seconds.toString()}>{durationLabel(seconds)}</option>)}
            </select>
            <p className="mt-1 text-xs text-white/35">Only protocol-approved presets are available.</p>
          </div>

          <div>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-white/45">Initial assets · optional</div>
                <p className="mt-1 text-xs text-white/35">Approved registry assets only. Minimum two are needed when the Lobby closes.</p>
              </div>
              <span className="shrink-0 whitespace-nowrap font-mono text-sm font-bold text-[#8B7CF7]">{selected.length} / 6</span>
            </div>
            {selected.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {selected.map((asset) => (
                  <button key={asset.assetId} type="button" onClick={() => toggleAsset(asset)} className="rounded-full border border-[#8B7CF7]/25 bg-[#8B7CF7]/10 px-3 py-1 text-xs font-bold text-[#8B7CF7]">
                    {asset.symbol} ×
                  </button>
                ))}
              </div>
            )}
            {isLoading ? <p className="py-8 text-center text-sm text-white/35">Loading approved assets…</p> : (
              <AssetRaceAssetPicker assets={visibleAssets} selectedIds={selected.map((asset) => asset.assetId)} onSelect={toggleAsset} category={category} />
            )}
          </div>

          <div className="rounded-lg border border-sky-400/20 bg-sky-400/5 px-3 py-2 text-xs text-sky-100/75">
            No betting occurs during Lobby. Fees, stake limits, oracle configuration, grace periods, and settlement remain protocol-controlled.
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}

          {!isConnected ? <WalletOptionsList /> : !onRightChain ? (
            <button onClick={() => switchChain({ chainId: assetRaceChain.id })} disabled={isSwitching} className="w-full rounded-lg bg-amber-400 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {isSwitching ? 'Switching…' : `Switch to ${assetRaceChain.name}`}
            </button>
          ) : (
            <button
              onClick={createRace}
              disabled={!address || !validTitle || selectedDuration === 0n || !!txLabel}
              className="w-full rounded-lg bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] py-2.5 text-sm font-bold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {txLabel ?? `CREATE ${mode === 'memes' ? 'MEME' : 'STOCK'} RACE → LOBBY`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
