import { useMemo } from 'react'
import { parseUnits } from 'viem'
import { assetRaceChain } from '@/chain/config'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { formatCountdown } from '@/lib/format'
import {
  ASSET_RACE_CATEGORY,
  estimateRacePayout,
  formatPoolShare,
  formatUsdRaw,
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
}: {
  race: AssetRaceViewModel
  position?: AssetRacePosition
  selectedAssetIndex: number
  setSelectedAssetIndex: (value: number) => void
  amount: string
  setAmount: (value: string) => void
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
}) {
  const meme = race.category === ASSET_RACE_CATEGORY.MEME
  const selected = race.assets[selectedAssetIndex]
  const amountRaw = useMemo(() => {
    try {
      return parseUnits(amount || '0', tokenDecimals)
    } catch {
      return 0n
    }
  }, [amount, tokenDecimals])
  const existingStake = position?.exists ? position.stake : 0n
  const estimate = selected
    ? estimateRacePayout(selected.pool, race.totalPool, existingStake, amountRaw, race.feeBp)
    : 0n
  const bettingOpen = nowMs >= Number(race.bettingStartTime) * 1_000 && nowMs < Number(race.bettingEndTime) * 1_000
  const lockedIndex = position?.exists ? position.assetIndex : null
  const exceedsMax = existingStake + amountRaw > race.maxStakePerWallet
  const belowMinimum = !position?.exists && amountRaw > 0n && amountRaw < race.minStake

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl border p-5 ${meme ? 'border-fuchsia-300/30 bg-gradient-to-br from-[#2a153b]/95 to-[#321715]/90' : 'border-[#C6FF3D]/25 bg-[#12160f]/90'}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className={`text-xs font-black tracking-[0.22em] ${meme ? 'text-orange-200' : 'text-[#C6FF3D]'}`}>PICK YOUR FRONT-RUNNER</div>
            <h2 className="mt-2 text-2xl font-black">{meme ? 'Meme rocket launch 🚀' : 'Stock sprint'}</h2>
            <p className="mt-1 max-w-xl text-sm text-white/45">Choose the asset with the highest return over the race window.</p>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-bold">{nowMs > 0 ? formatCountdown(Number(race.bettingEndTime) * 1_000 - nowMs) : '…'}</div>
            <div className="text-[11px] uppercase tracking-wider text-white/35">betting closes</div>
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
              className={`rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
                selectedNow ? meme ? 'border-orange-300/65 bg-gradient-to-br from-fuchsia-400/15 to-orange-300/10 shadow-[0_0_28px_-14px_rgba(244,114,182,0.9)]' : 'border-[#C6FF3D]/65 bg-[#C6FF3D]/10 shadow-[0_0_25px_-16px_rgba(198,255,61,0.9)]' : 'border-white/10 bg-[#12121c]/95 hover:border-white/25'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-black">{asset.symbol}</span>
                {selectedNow && <span className={`text-[10px] font-black tracking-wider ${meme ? 'text-orange-200' : 'text-[#C6FF3D]'}`}>SELECTED</span>}
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div><div className="text-[10px] uppercase text-white/30">Backing pool</div><div className="font-mono text-sm">{formatUsdRaw(asset.pool, tokenDecimals)} {tokenLabel}</div></div>
                <div className="font-mono text-sm text-white/55">{formatPoolShare(asset.pool, race.totalPool)}</div>
              </div>
            </button>
          )
        })}
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#12121c]/95 p-5 space-y-4">
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-100/75">
          Crowd backing is not a probability. Estimated payout is not guaranteed; pool distribution may change until betting closes.
        </div>
        {position?.exists && (
          <p className="text-sm text-white/55">
            Your pick is locked to <b className="text-[#C6FF3D]">{race.assets[position.assetIndex]?.symbol}</b>. You can top up this asset only.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <label className="mb-1 block text-xs text-white/40">Stake in {tokenLabel}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 font-mono outline-none focus:border-[#C6FF3D]/50"
            />
            <div className="mt-1 flex flex-wrap justify-between gap-2 text-[10px] text-white/30">
              <span>Min first stake {formatUsdRaw(race.minStake, tokenDecimals)} {tokenLabel}</span>
              <span>Max cumulative {formatUsdRaw(race.maxStakePerWallet, tokenDecimals)} {tokenLabel}</span>
            </div>
          </div>
          <div className="min-w-48 rounded-lg bg-white/5 px-4 py-2.5">
            <div className="text-[10px] text-white/35">Estimated payout if {selected?.symbol ?? 'selected asset'} wins</div>
            <div className="mt-1 font-mono text-lg font-bold text-[#C6FF3D]">{formatUsdRaw(estimate, tokenDecimals)} {tokenLabel}</div>
          </div>
        </div>

        {balance != null && <p className="text-xs text-white/40">Wallet balance: {formatUsdRaw(balance, tokenDecimals)} {tokenLabel}</p>}
        {belowMinimum && <p className="text-xs text-amber-300">The first stake is below this race’s minimum.</p>}
        {exceedsMax && <p className="text-xs text-rose-400">This would exceed your cumulative maximum stake.</p>}
        {error && <p className="text-sm text-rose-400">{error}</p>}

        {race.source === 'preview' ? (
          <button disabled className="w-full rounded-lg bg-white/10 py-2.5 text-sm font-semibold text-white/45">
            Preview only — no transaction will be sent
          </button>
        ) : !isConnected ? (
          <WalletOptionsList />
        ) : !onRightChain ? (
          <button onClick={onSwitchChain} disabled={isSwitching} className="w-full rounded-lg bg-amber-400 py-2.5 text-sm font-bold text-black disabled:opacity-50">
            {isSwitching ? 'Switching…' : `Switch to ${assetRaceChain.name}`}
          </button>
        ) : (
          <button
            onClick={onBet}
            disabled={!bettingOpen || amountRaw <= 0n || belowMinimum || exceedsMax || !!txLabel}
            className="w-full rounded-lg bg-gradient-to-r from-[#C6FF3D] to-[#8FBF1F] py-2.5 text-sm font-black text-black transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {txLabel ?? (position?.exists ? `Top up ${selected?.symbol}` : `Approve + bet on ${selected?.symbol}`)}
          </button>
        )}
      </div>
    </div>
  )
}
