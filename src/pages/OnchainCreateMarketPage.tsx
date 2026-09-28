import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { formatUnits, parseUnits } from 'viem'
import { useAccount, useChainId, useSwitchChain, useWriteContract } from 'wagmi'
import { simulateContract, waitForTransactionReceipt } from 'wagmi/actions'
import { robinhoodMainnet, wagmiConfig } from '@/chain/config'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { CompactAssetSelector } from '@/components/CompactAssetSelector'
import { GameLifecycleGuide } from '@/components/GameLifecycleGuide'
import { GameModeMotion } from '@/components/GameModeMotion'
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_CONFIGURED,
  predictionMarketAbi,
  recommendedMinDeviationUsd,
  recommendedTargetRange,
  suggestedTargetDeviationBpForDuration,
} from '@/chain/contracts'
import { PREDICTION_MARKET_ASSETS, predictionAssetForTicker } from '@/chain/predictionMarketAssets'
import { useAssetRaceLiveDisplay } from '@/chain/useAssetRaceLiveDisplay'
import { formatUsd, shortTxError } from '@/lib/format'

const DURATION_PRESETS = [
  // The shortest preset includes an allowance for the time spent confirming
  // the transaction in the wallet. Without it, the contract's exact
  // 30-minute minimum could be missed by the time the transaction is mined.
  { label: '30 min', seconds: 30 * 60, submissionBufferSeconds: 2 * 60 },
  { label: '1 hour', seconds: 60 * 60, submissionBufferSeconds: 0 },
  { label: '24 hours', seconds: 24 * 60 * 60, submissionBufferSeconds: 0 },
  { label: '7 days', seconds: 7 * 24 * 60 * 60, submissionBufferSeconds: 0 },
] as const

function compactDuration(seconds: number) {
  const roundedMinutes = Math.round(seconds / 60)
  if (roundedMinutes >= 24 * 60) {
    const days = Math.floor(roundedMinutes / (24 * 60))
    const hours = Math.round((roundedMinutes % (24 * 60)) / 60)
    return `${days}d${hours > 0 ? ` ${hours}h` : ''}`
  }
  if (roundedMinutes >= 60) {
    const hours = Math.round(roundedMinutes / 60)
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }
  return `${roundedMinutes} min`
}

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
  const preselected = predictionAssetForTicker(searchParams.get('feed'))
  const [assetId, setAssetId] = useState(preselected?.assetId ?? PREDICTION_MARKET_ASSETS[0].assetId)
  const [target, setTarget] = useState('400')
  // Keep 24 hours as the default while also offering the contract's exact
  // 30-minute minimum as a permanent short-market option.
  const [durationIdx, setDurationIdx] = useState(2)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedAsset = PREDICTION_MARKET_ASSETS.find((asset) => asset.assetId === assetId) ?? PREDICTION_MARKET_ASSETS[0]
  const durationPreset = DURATION_PRESETS[durationIdx]
  const durationSeconds = durationPreset.seconds
  const live = useAssetRaceLiveDisplay({ enabled: true })
  const livePrice = live.assets[selectedAsset.ticker]
  const currentPriceUsd = livePrice && !livePrice.stale
    ? Number(formatUnits(BigInt(livePrice.priceRaw), livePrice.decimals))
    : null

  // Pre-fill a duration-appropriate target whenever the ticker or duration
  // changes (not on every price poll, or the user's own edits would keep
  // getting clobbered). The range is product guidance enforced by this UI;
  // the contract itself only requires a positive target for an approved asset.
  const prefilledFor = useRef<string | null>(null)
  useEffect(() => {
    const prefillKey = `${assetId}:${durationSeconds}`
    if (currentPriceUsd != null && prefilledFor.current !== prefillKey) {
      const deviation = Number(suggestedTargetDeviationBpForDuration(durationSeconds)) / 10_000
      setTarget((currentPriceUsd * (1 + deviation)).toFixed(2))
      prefilledFor.current = prefillKey
    }
  }, [assetId, currentPriceUsd, durationSeconds])

  const onRightChain = chainId === robinhoodMainnet.id
  const [minRange, maxRange] = currentPriceUsd != null ? recommendedTargetRange(currentPriceUsd, durationSeconds) : [null, null]
  const minGapUsd = currentPriceUsd != null ? recommendedMinDeviationUsd(currentPriceUsd, durationSeconds) : null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!PREDICTION_MARKET_CONFIGURED) {
      setError('The new native ETH PredictionMarket is not configured yet')
      return
    }

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
    if (!livePrice || livePrice.stale) {
      setError("The live onchain stock price isn't ready - try again")
      return
    }

    try {
      setPending(true)
      const targetScaled = parseUnits(target, selectedAsset.decimals)
      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + durationPreset.seconds + durationPreset.submissionBufferSeconds,
      )
      const request = {
        address: PREDICTION_MARKET_ADDRESS,
        abi: predictionMarketAbi,
        functionName: 'createMarket',
        args: [selectedAsset.assetId, targetScaled, deadline, 0n, 0n],
      } as const

      // Dry-run against the node first: it returns the contract's real revert
      // reason (for example an unconfigured asset), which the wallet often
      // hides behind a generic "likely to fail" warning.
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

  const selectedTicker = selectedAsset.ticker
  const targetNumPreview = Number(target)
  const bettingSeconds = Math.floor((durationSeconds * 6_667) / 10_000)
  const lockedSeconds = durationSeconds - bettingSeconds

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-5 lg:min-h-[calc(100dvh-104px)]">
      <div className="grid min-w-0 items-stretch gap-6 lg:min-h-[calc(100dvh-144px)] lg:grid-cols-[440px_1fr] xl:gap-8">
        <div className="flex min-w-0 flex-col">
          <p className="text-sm font-bold text-[#B3A7FA] mb-1">Make a market</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Ask the next big question</h1>

          {/* Live preview: the question this form is about to put on the board */}
          <div className="mt-4 flex items-center gap-4 rounded-3xl bg-[#e7e1f8] px-5 py-5 text-[#241a33]">
            <img
              src={`${import.meta.env.BASE_URL}brand/mascot-small.png`}
              alt=""
              className="w-14 shrink-0"
              style={{ animation: 'mascot-float 5s ease-in-out infinite' }}
            />
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[#241a33]/50 mb-0.5">Your question</p>
              <p className="break-words font-display text-xl font-bold leading-snug sm:text-2xl">
                Will {selectedTicker} be at or above {targetNumPreview > 0 ? formatUsd(targetNumPreview) : '…'} at the{' '}
                {DURATION_PRESETS[durationIdx].label} deadline?
              </p>
            </div>
          </div>

          <div className="mt-4 flex-1">
            <GameLifecycleGuide
              className="lg:h-full"
              tone="market"
              eyebrow={`${durationPreset.label} market · full lifecycle`}
              title="What happens after creation"
              intro="The target and deadline cannot be edited after the creation transaction confirms. Creating the question costs gas, but does not place a stake."
              stages={[
                {
                  title: 'The market opens',
                  timing: 'Immediately',
                  body: 'Players choose YES or NO and enter $1–$50 in USD or ETH. The wallet sends the exact native ETH amount in one transaction—no approval or swap. Each wallet may place one position on each side.',
                },
                {
                  title: 'Betting is open',
                  timing: `First ≈${compactDuration(bettingSeconds)}`,
                  body: 'Betting lasts for the first two-thirds of the market. Winning positions placed earlier receive more weight when the losing pool is divided: the multiplier declines from 2.00× to 0.50×.',
                },
                {
                  title: 'The pools lock',
                  timing: `Final ≈${compactDuration(lockedSeconds)}`,
                  body: 'No new bets are accepted during the final third. The YES and NO pools, participants and target stay visible while the market waits for its fixed deadline.',
                },
                {
                  title: 'The deadline fixes the result',
                  timing: durationPreset.label,
                  body: 'Settlement uses the reviewed onchain stock price from the last Robinhood block strictly before the deadline. A price at or above the target means YES; a lower price means NO.',
                },
                {
                  title: 'Claim or receive a refund',
                  timing: 'After resolution',
                  body: 'A valid market needs funded YES and NO pools and at least two distinct wallets. Winners claim principal plus their weighted share of the losing pool; the 2% fee applies only to that profit. If eligibility or price rules fail, every position can reclaim its full stake.',
                },
              ]}
              note={durationPreset.submissionBufferSeconds > 0
                ? 'The 30-minute preset includes up to 2 extra minutes for wallet confirmation, so its onchain countdown begins near 30–32 minutes.'
                : `Selected schedule: about ${compactDuration(bettingSeconds)} open for bets, then ${compactDuration(lockedSeconds)} locked before the ${durationPreset.label} deadline.`}
            />
          </div>
        </div>

      <form onSubmit={onSubmit} className="flex h-full min-w-0 flex-col gap-5 rounded-3xl border border-white/5 bg-[#241b2f] p-6 sm:p-7">
        <div>
          <label className="block text-sm font-bold text-white/60 mb-2">Tokenized stock</label>
          <CompactAssetSelector
            assets={PREDICTION_MARKET_ASSETS.map((asset) => ({
              id: asset.assetId,
              symbol: asset.ticker,
              name: asset.displayName,
              priceUrl: asset.priceUrl,
            }))}
            selectedIds={[assetId]}
            onSelect={(id) => {
              const next = PREDICTION_MARKET_ASSETS.find((asset) => asset.assetId.toLowerCase() === id.toLowerCase())
              if (next) setAssetId(next.assetId)
            }}
            tone="market"
          />
          <p className="text-[11px] text-white/30 mt-1.5">
            Ten reviewed tokenized stocks have an onchain price source enabled for market settlement.
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DURATION_PRESETS.map((d, i) => (
              <button
                type="button"
                key={d.label}
                onClick={() => setDurationIdx(i)}
                className={`rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
                  durationIdx === i ? 'bg-[#8B7CF7] text-white' : 'bg-white/5 text-white/60 hover:bg-[#8B7CF7]/10 hover:text-white'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          {minRange != null && maxRange != null && minGapUsd != null && (
            <p className="text-[11px] text-white/30 mt-1.5">
              Suggested for this duration: {formatUsd(minRange)}–{formatUsd(maxRange)}, at least {formatUsd(minGapUsd)} away
              from the current pool price. This is UI guidance; asset approval and settlement are enforced on-chain.
            </p>
          )}
          {durationPreset.submissionBufferSeconds > 0 && (
            <p className="text-[11px] text-white/30 mt-1.5">
              Includes up to 2 minutes for wallet confirmation; the on-chain countdown starts near 30–32 minutes.
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
              className="shrink-0 rounded-full bg-[#8B7CF7] px-3.5 py-1 text-xs font-bold text-white disabled:opacity-50"
            >
              Switch network
            </button>
          </div>
        ) : (
          <button
            type="submit"
            disabled={pending || !PREDICTION_MARKET_CONFIGURED}
            className="w-full inline-flex items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] hover:brightness-110 text-white font-bold py-3 text-sm transition-all disabled:opacity-50 shadow-[0_14px_36px_-12px_rgba(106,90,224,0.8)]"
          >
            {pending ? 'Confirm in wallet…' : 'Create market'}
            {!pending && <span className="w-6 h-6 rounded-full bg-white/20 grid place-items-center text-xs">↗</span>}
          </button>
        )}

        <GameModeMotion mode="market" assets={[{ symbol: selectedAsset.ticker }]} className="mt-auto" />
      </form>
      </div>
    </div>
  )
}
