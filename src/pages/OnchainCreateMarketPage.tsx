import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { formatUnits, parseUnits } from 'viem'
import { useAccount, useChainId, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { robinhoodMainnet, wagmiConfig } from '@/chain/config'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import {
  ALLOWLISTED_FEEDS,
  PREDICTION_MARKET_ADDRESS,
  aggregatorV3Abi,
  feedAddressForTicker,
  predictionMarketAbi,
  recommendedMinDeviationUsd,
  recommendedTargetRange,
} from '@/chain/contracts'
import { formatUsd, shortTxError } from '@/lib/format'

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
  const feedPrice = useReadContract({
    address: feedAddress,
    abi: aggregatorV3Abi,
    functionName: 'latestRoundData',
  })
  const currentPriceUsd =
    feedPrice.data && feedDecimals.data != null ? Number(formatUnits(feedPrice.data[1], feedDecimals.data)) : null

  // Pre-fill the target with the live price whenever the ticker changes (not
  // on every price poll, or the user's own edits would keep getting
  // clobbered) — a sensible starting point instead of an arbitrary number.
  const prefilledFor = useRef<string | null>(null)
  useEffect(() => {
    if (currentPriceUsd != null && prefilledFor.current !== feedAddress) {
      setTarget(currentPriceUsd.toFixed(2))
      prefilledFor.current = feedAddress
    }
  }, [feedAddress, currentPriceUsd])

  const onRightChain = chainId === robinhoodMainnet.id
  const durationSeconds = DURATION_PRESETS[durationIdx].seconds
  const [minRange, maxRange] = currentPriceUsd != null ? recommendedTargetRange(currentPriceUsd, durationSeconds) : [null, null]
  const minGapUsd = currentPriceUsd != null ? recommendedMinDeviationUsd(currentPriceUsd) : null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const targetNum = Number(target)
    if (!(targetNum > 0)) {
      setError('Target price must be greater than 0')
      return
    }
    if (minRange != null && maxRange != null && (targetNum < minRange || targetNum > maxRange)) {
      setError(`Target price must be between ${formatUsd(minRange)} and ${formatUsd(maxRange)} for this duration`)
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
      setError(shortTxError(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">Create an on-chain market</h1>
      <p className="text-white/50 text-sm mb-6">
        A real transaction on mainnet. Target price must sit a reasonable distance from the current price — the
        further out the deadline, the wider that band. YES/NO pools start at $0 — if only one side has bets by the
        deadline, the market cancels and money is refunded in full. Betting currency is USDG only for now — ETH
        support is planned for a future update. Want another token supported? Let us know what you'd like next.
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
          <div className="flex items-baseline justify-between mb-1.5">
            <label className="text-sm text-white/60">Target price, $</label>
            {currentPriceUsd != null && <span className="text-[11px] text-white/40">now {formatUsd(currentPriceUsd)}</span>}
          </div>
          <input
            type="number"
            min={minRange != null ? minRange.toFixed(2) : 0}
            max={maxRange != null ? maxRange.toFixed(2) : undefined}
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
          {minRange != null && maxRange != null && minGapUsd != null && (
            <p className="text-[11px] text-white/30 mt-1.5">
              Allowed for this duration: {formatUsd(minRange)}–{formatUsd(maxRange)}, at least {formatUsd(minGapUsd)} away
              from the current price. Enforced on-chain — the transaction will revert outside this range.
            </p>
          )}
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
