import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { zeroAddress } from 'viem'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { useAccount, useChainId, useReadContracts, useSwitchChain, useWriteContract } from 'wagmi'
import { assetRaceChain, wagmiConfig } from '@/chain/config'
import {
  PRICE_ARENA_ADDRESS,
  PRICE_ARENA_ASSETS,
  PRICE_ARENA_DURATIONS,
  arenaDurationLabel,
  categoryForArenaMode,
  priceArenaAbi,
  type PriceArenaMode,
} from '@/chain/priceArena'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { TokenLogo } from '@/components/TokenLogo'
import { shortTxError } from '@/lib/format'

export function OnchainCreateArenaPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const mode: PriceArenaMode = params.get('mode') === 'memes' ? 'memes' : 'stocks'
  const category = categoryForArenaMode(mode)
  const catalog = useMemo(() => PRICE_ARENA_ASSETS.filter((asset) => asset.category === category), [category])
  const readAddress = PRICE_ARENA_ADDRESS ?? zeroAddress
  const configQueries = useReadContracts({
    contracts: catalog.map((asset) => ({ address: readAddress, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'approvedAssets', args: [asset.assetId] }) as const),
    query: { enabled: !!PRICE_ARENA_ADDRESS },
  })
  const assets = catalog.filter((_, index) => configQueries.data?.[index]?.status === 'success' && configQueries.data[index].result[4])
  const [title, setTitle] = useState('')
  const [assetId, setAssetId] = useState('')
  const [duration, setDuration] = useState<bigint>(300n)
  const [txLabel, setTxLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const selected = assets.find((asset) => asset.assetId === assetId) ?? assets[0]
  const titleBytes = new TextEncoder().encode(title.trim()).length
  const valid = !!selected && titleBytes > 0 && titleBytes <= 64

  function selectMode(next: PriceArenaMode) {
    setAssetId('')
    setParams(next === 'memes' ? { mode: 'memes' } : {})
  }

  async function create() {
    if (!PRICE_ARENA_ADDRESS || !selected || !valid) return
    setError(null)
    try {
      setTxLabel('Confirm arena creation…')
      const hash = await writeContractAsync({ address: PRICE_ARENA_ADDRESS, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'createArena', args: [selected.assetId, category, duration, title.trim()] })
      setTxLabel('Waiting for confirmation…')
      await waitForTransactionReceipt(wagmiConfig, { hash, chainId: assetRaceChain.id })
      navigate(`/onchain/arenas${mode === 'memes' ? '?mode=memes' : ''}`)
    } catch (cause) {
      setTxLabel(null)
      setError(shortTxError(cause))
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link to={`/onchain/arenas${mode === 'memes' ? '?mode=memes' : ''}`} className="text-sm text-white/40 hover:text-white">← All arenas</Link>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className={`text-sm font-bold ${mode === 'memes' ? 'text-[#F2A65A]' : 'text-[#B3A7FA]'}`}>Create Price Arena</p><h1 className="mt-1 font-display text-3xl font-bold">Set the stage.</h1><p className="mt-2 text-sm text-white/50">The lobby lasts 10 minutes. The selected game duration starts only after the lobby closes.</p></div>
        <div className="flex gap-1.5">{(['stocks', 'memes'] as const).map((item) => <button key={item} onClick={() => selectMode(item)} className={`rounded-full px-4 py-1.5 text-sm font-bold ${mode === item ? (item === 'memes' ? 'bg-[#F2A65A] text-[#3b2416]' : 'bg-[#f7f1e3] text-[#241a33]') : 'text-white/50'}`}>{item === 'stocks' ? 'Stocks' : 'Memes'}</button>)}</div>
      </div>

      {!PRICE_ARENA_ADDRESS ? <div className="mt-6 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5 text-amber-100">Deploy and configure Price Arena before creating games.</div> : (
        <div className="mt-6 space-y-6 rounded-3xl border border-white/5 bg-[#241b2f] p-6 sm:p-8">
          <label className="block"><span className="mb-2 block text-sm font-bold text-white/60">Arena title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={64} placeholder={mode === 'memes' ? 'Meme price showdown' : 'NVDA closing shot'} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-[#8B7CF7]/50" /><span className="mt-1 block text-right text-xs text-white/30">{titleBytes} / 64 bytes</span></label>
          <div><div className="mb-2 text-sm font-bold text-white/60">Asset</div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{assets.map((asset) => <button key={asset.assetId} onClick={() => setAssetId(asset.assetId)} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left ${selected?.assetId === asset.assetId ? (mode === 'memes' ? 'border-[#F2A65A] bg-[#F2A65A]/10' : 'border-[#8B7CF7] bg-[#8B7CF7]/10') : 'border-white/5 bg-white/[0.03]'}`}><TokenLogo ticker={asset.symbol} className="h-10 w-10 rounded-xl" /><div><div className="font-bold">{asset.symbol}</div><div className="text-xs text-white/35">{asset.name}</div></div></button>)}</div>{assets.length === 0 && <p className="py-5 text-sm text-white/40">Loading configured assets…</p>}</div>
          <div><div className="mb-2 text-sm font-bold text-white/60">Game duration</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{PRICE_ARENA_DURATIONS.map((seconds) => <button key={seconds.toString()} onClick={() => setDuration(seconds)} className={`rounded-xl border px-3 py-3 text-sm font-bold ${duration === seconds ? 'border-[#8B7CF7] bg-[#8B7CF7]/15 text-[#B3A7FA]' : 'border-white/5 bg-white/[0.03] text-white/50'}`}>{arenaDurationLabel(seconds)}</button>)}</div></div>
          <div className="rounded-xl border border-[#8B7CF7]/20 bg-[#8B7CF7]/10 p-4 text-xs leading-relaxed text-[#B3A7FA]">Lobby: 10 minutes · players: 2–20 · stake: $1–$50 paid as native ETH · closest 50% win · 2% fee from the losing pool only.</div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          {!isConnected ? <WalletOptionsList /> : chainId !== assetRaceChain.id ? <button onClick={() => switchChain({ chainId: assetRaceChain.id })} disabled={isSwitching} className="w-full rounded-xl bg-[#F2A65A] py-3 font-bold text-[#3b2416]">Switch to {assetRaceChain.name}</button> : <button onClick={create} disabled={!address || !valid || !!txLabel} className="w-full rounded-xl bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] py-3 font-bold disabled:opacity-40">{txLabel ?? 'Create Price Arena'}</button>}
        </div>
      )}
    </div>
  )
}
