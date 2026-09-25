import { assetRaceChain } from '@/chain/config'
import type { StakeInputUnit } from '@/chain/ethUsd'
import { ClockIcon } from '@/components/icons'
import { StakeAmountInput } from '@/components/StakeAmountInput'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { TokenLogo } from '@/components/TokenLogo'
import { formatCountdown } from '@/lib/format'
import {
  ASSET_RACE_CATEGORY,
  estimateRacePayout,
  formatPoolShare,
  formatStakeRaw,
  type AssetRacePosition,
  type AssetRaceViewModel,
} from '@/chain/assetRaces'

export function AssetRaceBettingView({
  race,
  position,
  selectedAssetIndex,
  setSelectedAssetIndex,
  amount,
  setAmount,
  inputUnit,
  setInputUnit,
  balance,
  isConnected,
  onRightChain,
  isSwitching,
  onSwitchChain,
  onBet,
  txLabel,
  error,
  nowMs,
  tokenDecimals,
  tokenLabel,
  amountRaw,
  exactEth,
  equivalentUsd,
  quoteReady,
}: {
  race: AssetRaceViewModel
  position?: AssetRacePosition
  selectedAssetIndex: number
  setSelectedAssetIndex: (value: number) => void
  amount: string
  setAmount: (value: string) => void
  inputUnit: StakeInputUnit
  setInputUnit: (value: StakeInputUnit) => void
  balance?: bigint
  isConnected: boolean
  onRightChain: boolean
  isSwitching: boolean
  onSwitchChain: () => void
  onBet: () => void
  txLabel: string | null
  error: string | null
  nowMs: number
  tokenDecimals: number
  tokenLabel: string
  amountRaw: bigint
  exactEth: string | null
  equivalentUsd: string | null
  quoteReady: boolean
}) {
  const meme = race.category === ASSET_RACE_CATEGORY.MEME
  const accentText = meme ? 'text-[#F2A65A]' : 'text-[#B3A7FA]'
  const selected = race.assets[selectedAssetIndex]
  const existingStake = position?.exists ? position.stake : 0n
  const estimate = selected
    ? estimateRacePayout(selected.pool, race.totalPool, existingStake, amountRaw, race.feeBp)
    : 0n
  const stakeAfterAction = existingStake + amountRaw
  const estimatedProfit = estimate > stakeAfterAction ? estimate - stakeAfterAction : 0n
  const bettingOpen = nowMs >= Number(race.bettingStartTime) * 1_000 && nowMs < Number(race.bettingEndTime) * 1_000
  const lockedIndex = position?.exists ? position.assetIndex : null
  const exceedsMax = existingStake + amountRaw > race.maxStakePerWallet
  const belowMinimum = !position?.exists && amountRaw > 0n && amountRaw < race.minStake

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_400px]">
      <div className="space-y-5">
        <div className="rounded-3xl border border-white/5 bg-[#241b2f] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className={`text-sm font-bold ${accentText}`}>Pick your front-runner</p>
              <h2 className="mt-1 font-display text-2xl font-bold">{meme ? 'Meme sprint' : 'Stock sprint'}</h2>
              <p className="mt-1 max-w-xl text-sm text-white/45">Choose the asset with the highest return over the race window.</p>
            </div>
            <div className="text-right">
              <div className="inline-flex items-center gap-2 font-mono text-2xl font-bold">
                <ClockIcon className="h-5 w-5 text-white/35" />
                {nowMs > 0 ? formatCountdown(Number(race.bettingEndTime) * 1_000 - nowMs) : '…'}
              </div>
              <div className="mt-0.5 text-xs font-bold text-white/35">betting closes</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {race.assets.map((asset) => {
            const selectedNow = selectedAssetIndex === asset.assetIndex
            const unavailable = lockedIndex != null && lockedIndex !== asset.assetIndex
            return (
              <button
                key={asset.assetIndex}
                type="button"
                disabled={unavailable}
                onClick={() => setSelectedAssetIndex(asset.assetIndex)}
                className={`rounded-2xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
                  selectedNow
                    ? meme
                      ? 'border-[#F2A65A]/60 bg-[#F2A65A]/10'
                      : 'border-[#8B7CF7]/60 bg-[#8B7CF7]/10'
                    : 'border-white/5 bg-[#241b2f] hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-display text-lg font-bold"><TokenLogo ticker={asset.symbol} className="h-9 w-9 rounded-xl" />{asset.symbol}</span>
                  {selectedNow && <span className={`text-xs font-bold ${accentText}`}>Selected</span>}
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-white/30">Backing pool</div>
                    <div className="font-mono text-sm">
                      {formatStakeRaw(asset.pool, tokenDecimals)} {tokenLabel}
                    </div>
                  </div>
                  <div className="font-mono text-sm text-white/55">{formatPoolShare(asset.pool, race.totalPool)}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-4 lg:sticky lg:top-24">
        <div className="space-y-4 rounded-3xl border border-white/5 bg-[#241b2f] p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-bold">Your bet</h3>
            {selected && (
              <span className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs font-bold ${meme ? 'bg-[#F2A65A]/15 text-[#F2A65A]' : 'bg-[#8B7CF7]/15 text-[#B3A7FA]'}`}>
                <TokenLogo ticker={selected.symbol} className="h-5 w-5 rounded-md" />{selected.symbol}
              </span>
            )}
          </div>

          {position?.exists && (
            <p className="text-sm text-white/55">
              Your pick is locked to <b className={accentText}>{race.assets[position.assetIndex]?.symbol}</b> with a current stake of{' '}
              <b className="font-mono text-white/80">
                {formatStakeRaw(existingStake, tokenDecimals)} {tokenLabel}
              </b>
              . You can top up this asset only.
            </p>
          )}

          <div>
            <StakeAmountInput
              id="race-stake"
              label={position?.exists ? 'Additional stake' : 'Stake'}
              value={amount}
              inputUnit={inputUnit}
              onChange={setAmount}
              onInputUnitChange={setInputUnit}
              disabled={!!txLabel}
            />
            <p className="mt-2 text-xs font-medium text-white/45">
              {exactEth
                ? inputUnit === 'ETH'
                  ? `Wallet will send exactly ${exactEth} ETH · about ${equivalentUsd} at the displayed quote.`
                  : `Wallet will send exactly ${exactEth} ETH`
                : quoteReady
                  ? `Enter a stake worth $1–$50 in ${inputUnit}.`
                  : 'ETH/USD quote unavailable or stale.'}
            </p>
            <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[11px] font-medium text-white/30">
              <span>
                Min first stake {formatStakeRaw(race.minStake, tokenDecimals)} {tokenLabel}
              </span>
              <span>
                Max cumulative {formatStakeRaw(race.maxStakePerWallet, tokenDecimals)} {tokenLabel}
              </span>
            </div>
          </div>

          <div className="rounded-2xl bg-white/5 px-4 py-3">
            <div className="text-xs font-bold text-white/35">
              {position?.exists && amountRaw > 0n ? 'Estimated total return after top-up' : 'Estimated total return'} if{' '}
              {selected?.symbol ?? 'selected asset'} wins
            </div>
            <div className={`mt-1 font-display text-2xl font-bold ${accentText}`}>
              {formatStakeRaw(estimate, tokenDecimals)} {tokenLabel}
            </div>
            <div className="mt-1 space-y-0.5 text-[11px] font-medium text-white/35">
              {position?.exists && amountRaw > 0n && (
                <div>
                  Current {formatStakeRaw(existingStake, tokenDecimals)} + top-up {formatStakeRaw(amountRaw, tokenDecimals)} ={' '}
                  {formatStakeRaw(stakeAfterAction, tokenDecimals)} {tokenLabel} staked
                </div>
              )}
              {stakeAfterAction > 0n && (
                <div>
                  Includes stake · estimated profit {formatStakeRaw(estimatedProfit, tokenDecimals)} {tokenLabel}
                </div>
              )}
            </div>
          </div>

          {balance != null && (
            <p className="text-xs font-medium text-white/40">
              Wallet balance: {formatStakeRaw(balance, tokenDecimals)} {tokenLabel}
            </p>
          )}
          {belowMinimum && <p className="text-xs font-bold text-[#F2A65A]">The first stake is below this race's minimum.</p>}
          {exceedsMax && <p className="text-xs font-bold text-rose-400">This would exceed your cumulative maximum stake.</p>}
          {error && <p className="text-sm text-rose-400">{error}</p>}

          {race.source === 'preview' ? (
            <button disabled className="w-full rounded-xl bg-white/10 py-3 text-sm font-bold text-white/45">
              Preview only - no transaction will be sent
            </button>
          ) : !isConnected ? (
            <WalletOptionsList />
          ) : !onRightChain ? (
            <button
              onClick={onSwitchChain}
              disabled={isSwitching}
              className="w-full rounded-full bg-[#F2A65A] py-3 text-sm font-bold text-[#3b2416] disabled:opacity-50"
            >
              {isSwitching ? 'Switching…' : `Switch to ${assetRaceChain.name}`}
            </button>
          ) : (
            <button
              onClick={onBet}
              disabled={!bettingOpen || amountRaw <= 0n || belowMinimum || exceedsMax || !!txLabel}
              className="w-full rounded-xl bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] py-3 text-sm font-bold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {txLabel ?? (position?.exists ? `Top up ${selected?.symbol}` : `Bet on ${selected?.symbol}`)}
            </button>
          )}

          <p className="text-[11px] leading-relaxed text-white/30">
            Crowd backing is not a probability. The estimated payout is not guaranteed; pool distribution may change until betting closes.
          </p>
        </div>
      </div>
    </div>
  )
}
