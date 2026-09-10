import { type FormEvent, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { parseUnits } from 'viem'
import { useAccount, useChainId, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { robinhoodMainnet, wagmiConfig } from '@/chain/config'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { ALLOWLISTED_FEEDS, PREDICTION_MARKET_ADDRESS, aggregatorV3Abi, feedAddressForTicker, predictionMarketAbi } from '@/chain/contracts'
import { formatUsd } from '@/lib/format'

const MAX_TARGET_PRICE_USD = 500

const DURATION_PRESETS = [
  { label: '1 hour', seconds: 60 * 60 },
  { label: '24 hours', seconds: 24 * 60 * 60 },
  { label: '7 days', seconds: 7 * 24 * 60 * 60 },
] as const

export function OnchainCreateMarketPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()

  // Arriving from a "Create Prediction" button on a specific token's card
  // (e.g. /onchain/create?feed=NVDA) preselects that ticker; otherwise
  // default to the first allowlisted one.
  const preselected = feedAddressForTicker(searchParams.get('feed') ?? '')
  const [feedAddress, setFeedAddress] = useState(preselected ?? ALLOWLISTED_FEEDS[0].address)
  const [target, setTarget] = useState('400')
  const [durationIdx, setDurationIdx] = useState(1)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const feedDecimals = useReadContract({
    address: feedAddress,
    abi: aggregatorV3Abi,
    functionName: 'decimals',
  })

  const onRightChain = chainId === robinhoodMainnet.id

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const targetNum = Number(target)
    if (!(targetNum > 0) || targetNum > MAX_TARGET_PRICE_USD) {
      setError(`Target price must be greater than 0 and no more than ${formatUsd(MAX_TARGET_PRICE_USD, 0)}`)
      return
    }
    if (feedDecimals.data == null) {
      setError("Couldn't read the feed's decimals() — try again")
      return
    }

    try {
      setPending(true)
      const targetScaled = parseUnits(target, feedDecimals.data)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DURATION_PRESETS[durationIdx].seconds)

      const hash = await writeContractAsync({
        address: PREDICTION_MARKET_ADDRESS,
        abi: predictionMarketAbi,
        functionName: 'createMarket',
        args: [feedAddress, targetScaled, deadline, 0n, 0n],
      })
      await waitForTransactionReceipt(wagmiConfig, { hash })

      navigate('/onchain')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">Create an on-chain market</h1>
      <p className="text-white/50 text-sm mb-6">
        A real transaction on mainnet. Target price can't exceed {formatUsd(MAX_TARGET_PRICE_USD, 0)}. YES/NO pools
        start at $0 — if only one side has bets by the deadline, the market cancels and money is refunded in full.
      </p>

      <form onSubmit={onSubmit} className="bg-[#12121c]/95 border border-white/10 rounded-2xl p-6 space-y-5">
        <div>
          <label className="block text-sm text-white/60 mb-1.5">Price feed</label>
          <div className="grid grid-cols-3 gap-2">
            {ALLOWLISTED_FEEDS.map((f) => (
              <button
                type="button"
                key={f.ticker}
                onClick={() => setFeedAddress(f.address)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold border transition-colors ${
                  feedAddress === f.address
                    ? 'bg-[#C6FF3D]/15 border-[#C6FF3D]/50 text-[#C6FF3D]'
                    : 'border-white/10 text-white/60 hover:border-white/30 hover:text-white'
                }`}
              >
                {f.ticker}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-white/30 mt-1">
            Only allowlisted feeds can settle a market — only the contract owner can add more.
          </p>
        </div>

        <div>
          <label className="block text-sm text-white/60 mb-1.5">Target price, $ (max {formatUsd(MAX_TARGET_PRICE_USD, 0)})</label>
          <input
            type="number"
            min={1}
            max={MAX_TARGET_PRICE_USD}
            step="0.01"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm font-mono outline-none focus:border-[#C6FF3D]/60 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm text-white/60 mb-1.5">Deadline</label>
          <div className="grid grid-cols-3 gap-2">
            {DURATION_PRESETS.map((d, i) => (
              <button
                type="button"
                key={d.label}
                onClick={() => setDurationIdx(i)}
                className={`rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                  durationIdx === i
                    ? 'bg-[#C6FF3D]/15 border-[#C6FF3D]/50 text-[#C6FF3D]'
                    : 'border-white/10 text-white/60 hover:border-white/30 hover:text-white'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-rose-400 text-sm bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{error}</p>}

        {!isConnected ? (
          <div className="pt-1 border-t border-white/10">
            <p className="text-white/40 text-xs mb-2 mt-4">Connect a wallet to create this market:</p>
            <WalletOptionsList />
          </div>
        ) : !onRightChain ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200 flex items-center justify-between gap-3">
            Wrong network.
            <button
              type="button"
              onClick={() => switchChain({ chainId: robinhoodMainnet.id })}
              disabled={isSwitching}
              className="shrink-0 rounded-md bg-amber-500 text-black px-3 py-1 text-xs font-medium disabled:opacity-50"
            >
              Switch network
            </button>
          </div>
        ) : (
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-full bg-gradient-to-r from-[#C6FF3D] to-[#8FBF1F] hover:brightness-110 text-black font-semibold py-2.5 text-sm transition-all disabled:opacity-50 shadow-[0_0_20px_-6px_rgba(198,255,61,0.7)]"
          >
            {pending ? 'Confirm in wallet…' : 'Create market'}
          </button>
        )}
      </form>
    </div>
  )
}
