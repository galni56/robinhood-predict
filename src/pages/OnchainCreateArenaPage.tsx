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
import { CompactAssetSelector } from '@/components/CompactAssetSelector'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { GameLifecycleGuide } from '@/components/GameLifecycleGuide'
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
    <div className="mx-auto max-w-[1280px] px-4 py-5 lg:min-h-[calc(100dvh-104px)]">
      <Link to={`/onchain/arenas${mode === 'memes' ? '?mode=memes' : ''}`} className="text-sm text-white/40 hover:text-white">← All arenas</Link>
      <div className="mt-4 grid min-w-0 items-stretch gap-6 lg:min-h-[calc(100dvh-180px)] lg:grid-cols-[440px_1fr] xl:gap-8">
        <div className="flex min-w-0 flex-col">
          <p className="text-sm font-bold text-[#B7CEFF]">Create Price Arena</p>
          <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">Set the stage.</h1>
          <div className="mt-3 flex gap-1.5">
            {(['stocks', 'memes'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => selectMode(item)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${mode === item ? (item === 'memes' ? 'bg-[#F2A65A] text-[#3b2416]' : 'bg-[#f7f1e3] text-[#241a33]') : 'text-white/50 hover:bg-white/5 hover:text-white'}`}
              >
                {item === 'stocks' ? 'Stocks' : 'Memes'}
              </button>
            ))}
          </div>

          <div className="mt-4 flex-1">
            <GameLifecycleGuide
              className="lg:h-full"
              tone="arena"
              eyebrow={`${arenaDurationLabel(duration)} arena · full lifecycle`}
              title="From forecast to final ranking"
              intro="Creating an arena costs gas but does not enter a forecast. The 10-minute lobby begins when the creation transaction confirms; the selected game duration follows it."
              stages={[
                {
                  title: 'Players enter forecasts',
                  timing: 'Lobby · 10 min',
                  body: `Between 2 and 20 wallets submit an exact final price and enter $1–$50 in USD or ETH. ${mode === 'memes' ? 'Meme prices are forecast in ETH.' : 'Tokenized-stock prices are forecast in the displayed dollar quote.'} The wallet sends native ETH directly. During the lobby, a player may change the prediction and add stake, but cannot reduce or withdraw it.`,
                },
                {
                  title: 'Forecasts stay off the board',
                  timing: 'During the lobby',
                  body: 'Predictions are hidden from the arena leaderboard and public arena getter until the lobby closes, reducing copycat play. Like every blockchain transaction, submitted calldata can still be inspected onchain.',
                },
                {
                  title: 'The game runs',
                  timing: arenaDurationLabel(duration),
                  body: 'The lobby closes automatically: no new players, prediction changes or top-ups are accepted. Forecasts become visible and the game counts down to its fixed deadline without a separate start transaction.',
                },
                {
                  title: 'The deadline price ranks everyone',
                  timing: 'At the fixed finish',
                  body: 'Settlement uses the last valid onchain price strictly before the deadline. The closest floor(player count ÷ 2) forecasts win—one winner with 2–3 players and up to 10 with 20. Equal errors are ordered by the earlier most-recent prediction update, then wallet address.',
                },
                {
                  title: 'Claim or receive a refund',
                  timing: 'After settlement',
                  body: 'Winners recover principal plus an accuracy-and-stake-weighted share of the losing pool; the 2% fee applies only to that losing-pool profit. Fewer than two players or an invalid deadline price cancels the arena and unlocks full refunds.',
                },
              ]}
              note={`Selected schedule: 10-minute lobby, then a ${arenaDurationLabel(duration)} game. The closest forecast can receive up to 3× the accuracy weight used to divide the losing pool.`}
            />
          </div>
        </div>

      {!PRICE_ARENA_ADDRESS ? <div className="h-full rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5 text-amber-100">Deploy and configure Price Arena before creating games.</div> : (
        <div className="h-full min-w-0 space-y-4 rounded-3xl border border-white/5 bg-[#241b2f] p-5 sm:p-6">
          <label className="block"><span className="mb-2 block text-sm font-bold text-white/60">Arena title</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={64} placeholder={mode === 'memes' ? 'Meme price showdown' : 'NVDA closing shot'} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-[#7A9FF0]/50" /><span className="mt-1 block text-right text-xs text-white/30">{titleBytes} / 64 bytes</span></label>
          <div>
            <div className="mb-2 text-sm font-bold text-white/60">Asset</div>
            {assets.length > 0 ? (
              <CompactAssetSelector
                assets={assets.map((asset) => ({ id: asset.assetId, symbol: asset.symbol, name: asset.name }))}
                selectedIds={selected ? [selected.assetId] : []}
                onSelect={setAssetId}
                tone="arena"
              />
            ) : <p className="py-5 text-sm text-white/40">Loading configured assets…</p>}
          </div>
          <div><div className="mb-2 text-sm font-bold text-white/60">Game duration</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{PRICE_ARENA_DURATIONS.map((seconds) => <button key={seconds.toString()} onClick={() => setDuration(seconds)} className={`rounded-xl border px-3 py-3 text-sm font-bold ${duration === seconds ? 'border-[#7A9FF0] bg-[#7A9FF0]/15 text-[#B7CEFF]' : 'border-white/5 bg-white/[0.03] text-white/50'}`}>{arenaDurationLabel(seconds)}</button>)}</div></div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          {!isConnected ? <WalletOptionsList tone="arena" /> : chainId !== assetRaceChain.id ? <button onClick={() => switchChain({ chainId: assetRaceChain.id })} disabled={isSwitching} className="w-full rounded-xl bg-[#7A9FF0] py-3 font-bold text-[#152447] hover:bg-[#8EB1F8]">Switch to {assetRaceChain.name}</button> : <button onClick={create} disabled={!address || !valid || !!txLabel} className="w-full rounded-xl bg-gradient-to-r from-[#8EB1F8] to-[#7A9FF0] py-3 font-bold text-[#152447] disabled:opacity-40">{txLabel ?? 'Create Price Arena'}</button>}
        </div>
      )}
      </div>
    </div>
  )
}
