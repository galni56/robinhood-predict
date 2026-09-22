import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { formatUnits, parseUnits } from 'viem'
import { useAccount, useChainId, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { simulateContract, waitForTransactionReceipt } from 'wagmi/actions'
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
import { readSnapshotPrice, useFeedSnapshot } from '@/chain/feedCache'
import { formatUsd, shortTxError } from '@/lib/format'

const DURATION_PRESETS = [
  { label: '1 hour', seconds: 60 * 60 },
  { label: '24 hours', seconds: 24 * 60 * 60 },
  { label: '7 days', seconds: 7 * 24 * 60 * 60 },
] as const

export function OnchainCreateMarketPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { address, isConnected } = useAccount()
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

  // feedDecimals is also read directly on-chain (not just from the
  // snapshot below) because it feeds parseUnits() for the actual
  // createMarket transaction at submit time -- real-money-adjacent values
  // stay on the authoritative on-chain path. The snapshot only drives the
  // displayed/prefilled current price, which can safely lag a couple of
  // seconds behind the chain.
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
  const feedSnapshot = useFeedSnapshot()
  const currentPriceUsd =
    readSnapshotPrice(feedSnapshot.data, feedAddress) ??
    (feedPrice.data && feedDecimals.data != null ? Number(formatUnits(feedPrice.data[1], feedDecimals.data)) : null)

  // Pre-fill the target 3% above the live price whenever the ticker changes
  // (not on every price poll, or the user's own edits would keep getting
  // clobbered). The live price itself is rejected on-chain (must be >=2% away),
  // and 3% sits inside the allowed band for every duration preset.
  const prefilledFor = useRef<string | null>(null)
  useEffect(() => {
    if (currentPriceUsd != null && prefilledFor.current !== feedAddress) {
      setTarget((currentPriceUsd * 1.03).toFixed(2))
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
    if (currentPriceUsd != null && minGapUsd != null && Math.abs(targetNum - currentPriceUsd) < minGapUsd) {
      setError(
        `Target is too close to the current price (${formatUsd(currentPriceUsd)}). It must be at least ${formatUsd(minGapUsd)} above or below it.`,
      )
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
      const request = {
        address: PREDICTION_MARKET_ADDRESS,
        abi: predictionMarketAbi,
        functionName: 'createMarket',
        args: [feedAddress, targetScaled, deadline, 0n, 0n],
      } as const

      // Dry-run against the node first: it returns the contract's real revert
      // reason (e.g. "target too far from current price"), which the wallet
      // often hides behind a generic "likely to fail" warning.
      await simulateContract(wagmiConfig, { ...request, account: address, chainId: robinhoodMainnet.id })

      const hash = await writeContractAsync(request)
      await waitForTransactionReceipt(wagmiConfig, { hash })

      navigate('/onchain')
    } catch (err) {
      setError(shortTxError(err))
    } finally {
      setPending(false)
    }
  }

  const selectedTicker = ALLOWLISTED_FEEDS.find((f) => f.address === feedAddress)?.ticker ?? '…'
  const targetNumPreview = Number(target)

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-8">
      <div className="grid lg:grid-cols-[400px_1fr] gap-10 items-start">
        <div className="lg:sticky lg:top-24">
          <p className="text-sm font-bold text-[#B3A7FA] mb-1">Make a market</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-2">Ask the next big question</h1>
          <p className="text-white/50 text-sm mb-6">
            A real transaction on mainnet. Target price must sit a reasonable distance from the current price — the
            further out the deadline, the wider that band. YES/NO pools start at $0 — if only one side has bets by the
            deadline, the market cancels and money is refunded in full. Betting currency is USDG only for now — ETH
            support is planned for a future update. Want another token supported? Let us know what you'd like next.
          </p>

          {/* Live preview: the question this form is about to put on the board */}
          <div className="rounded-3xl bg-[#e7e1f8] text-[#241a33] px-6 py-6 flex items-center gap-4">
            <img
              src={`${import.meta.env.BASE_URL}brand/mascot-small.png`}
              alt=""
              className="w-14 shrink-0"
              style={{ animation: 'mascot-float 5s ease-in-out infinite' }}
            />
            <div>
              <p className="text-[11px] font-bold text-[#241a33]/50 mb-0.5">Your question</p>
              <p className="font-display text-2xl font-bold leading-snug">
                Will {selectedTicker} reach {targetNumPreview > 0 ? formatUsd(targetNumPreview) : '…'} in{' '}
                {DURATION_PRESETS[durationIdx].label}?
              </p>
            </div>
          </div>
        </div>

      <form onSubmit={onSubmit} className="bg-[#241b2f] border border-white/5 rounded-3xl p-6 sm:p-8 space-y-6">
        <div>
          <label className="block text-sm font-bold text-white/60 mb-2">Price feed</label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {ALLOWLISTED_FEEDS.map((f) => (
              <button
                type="button"
                key={f.ticker}
                onClick={() => setFeedAddress(f.address)}
                className={`rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
                  feedAddress === f.address
                    ? 'bg-[#8B7CF7] text-[#f7f1e3]'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                {f.ticker}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-white/30 mt-1.5">
            Only allowlisted feeds can settle a market — only the contract owner can add more.
          </p>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <label className="text-sm font-bold text-white/60">Target price, $</label>
            {currentPriceUsd != null && <span className="text-[11px] font-bold text-[#B3A7FA]">now {formatUsd(currentPriceUsd)}</span>}
          </div>
          <input
            type="number"
            min={minRange != null ? minRange.toFixed(2) : 0}
            max={maxRange != null ? maxRange.toFixed(2) : undefined}
            step="0.01"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5 text-sm font-mono outline-none focus:border-[#8B7CF7]/60 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-white/60 mb-2">Deadline</label>
          <div className="grid grid-cols-3 gap-2">
            {DURATION_PRESETS.map((d, i) => (
              <button
                type="button"
                key={d.label}
                onClick={() => setDurationIdx(i)}
                className={`rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
                  durationIdx === i ? 'bg-[#F2A65A] text-[#3b2416]' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
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

        {error && <p className="text-rose-400 text-sm bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">{error}</p>}

        {!isConnected ? (
          <div className="pt-1 border-t border-white/10">
            <p className="text-white/40 text-xs font-bold mb-2 mt-4">Connect a wallet to create this market:</p>
            <WalletOptionsList />
          </div>
        ) : !onRightChain ? (
          <div className="rounded-2xl border border-[#F2A65A]/30 bg-[#F2A65A]/10 p-3 text-sm text-[#F2A65A] flex items-center justify-between gap-3">
            Wrong network.
            <button
              type="button"
              onClick={() => switchChain({ chainId: robinhoodMainnet.id })}
              disabled={isSwitching}
              className="shrink-0 rounded-full bg-[#F2A65A] text-[#3b2416] px-3.5 py-1 text-xs font-bold disabled:opacity-50"
            >
              Switch network
            </button>
          </div>
        ) : (
          <button
            type="submit"
            disabled={pending}
            className="w-full inline-flex items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] hover:brightness-110 text-white font-bold py-3 text-sm transition-all disabled:opacity-50 shadow-[0_14px_36px_-12px_rgba(106,90,224,0.8)]"
          >
            {pending ? 'Confirm in wallet…' : 'Create market'}
            {!pending && <span className="w-6 h-6 rounded-full bg-white/20 grid place-items-center text-xs">↗</span>}
          </button>
        )}
      </form>
      </div>
    </div>
  )
}
