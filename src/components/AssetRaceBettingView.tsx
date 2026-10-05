import type { StakeInputUnit } from '@/chain/stakeQuote'
import { StakeAmountInput } from '@/components/StakeAmountInput'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { PriceSourceLink } from '@/components/PriceSourceLink'
import { priceSourceUrlForAssetId } from '@/chain/assetRaceRegistry'
import { formatCompactUsd, formatCountdown, formatUnits, formatUsdPrice } from '@/lib/format'
import { PxSprite } from '@/retro/Sprite'
import { coinSkin } from '@/retro/coins'
import { CREAM, INK } from '@/retro/scene'
import { PIXEL } from '@/retro/race'
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
  onBet,
  txLabel,
  error,
  nowMs,
  tokenDecimals,
  tokenLabel,
  amountRaw,
  exactAmount,
  equivalentUsd,
  quoteReady,
  usdQuoted = true,
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
  onBet: () => void
  txLabel: string | null
  error: string | null
  nowMs: number
  tokenDecimals: number
  tokenLabel: string
  amountRaw: bigint
  /** Exact amount the wallet will send, in `tokenLabel` units. */
  exactAmount: string | null
  equivalentUsd: string | null
  quoteReady: boolean
  /** SOL stakes are entered in USD or SOL; SPL stakes only in their token. */
  usdQuoted?: boolean
}) {
  const meme = race.category === ASSET_RACE_CATEGORY.MEME
  const crypto = race.category === ASSET_RACE_CATEGORY.CRYPTO
  const accentText = 'text-[#B8860B]'
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
        <div className="rx-raised" style={{ background: CREAM, color: INK, padding: 20 }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 style={{ margin: 0, fontFamily: PIXEL, fontSize: 14, fontWeight: 400, lineHeight: 1.4 }}>WHO ARE YOU BACKING?</h2>
              <p className="mt-2" style={{ fontSize: 18, fontWeight: 500, opacity: 0.7 }}>{meme ? 'Pick the meme with the strongest sprint.' : crypto ? 'Pick the strongest mover.' : 'Pick the stock with the strongest sprint.'}</p>
            </div>
            <div className="text-right">
              <span style={{ fontFamily: PIXEL, fontSize: 18, lineHeight: 1, color: '#FFD23F', background: INK, padding: '10px 12px', display: 'inline-block' }}>
                {nowMs > 0 ? formatCountdown(Number(race.bettingEndTime) * 1_000 - nowMs) : '…'}
              </span>
              <div className="mt-2" style={{ fontSize: 16, fontWeight: 600, opacity: 0.7 }}>betting closes</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {race.assets.map((asset) => {
            const selectedNow = selectedAssetIndex === asset.assetIndex
            const unavailable = lockedIndex != null && lockedIndex !== asset.assetIndex
            return (
              <div
                key={asset.assetIndex}
                className="rx-raised overflow-hidden"
                style={{ background: selectedNow ? '#FFD23F' : '#FFFFFF', color: INK }}
              >
                <button
                  type="button"
                  disabled={unavailable}
                  onClick={() => setSelectedAssetIndex(asset.assetIndex)}
                  className="w-full p-4 text-left disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-3" style={{ fontFamily: PIXEL, fontSize: 14 }}><PxSprite data={coinSkin(asset.symbol, asset.assetIndex).sprite} width={40} height={43} />{asset.symbol}</span>
                    {selectedNow && <span style={{ fontFamily: "'Pixelify Sans', monospace", fontSize: 16, fontWeight: 700, color: '#FFD23F', background: INK, padding: '4px 8px' }}>picked</span>}
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, opacity: 0.6 }}>Backing pool</div>
                      <div className="font-mono text-sm">
                        {formatStakeRaw(asset.pool, tokenDecimals)} {tokenLabel}
                      </div>
                    </div>
                    {asset.livePrice != null && (
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, opacity: 0.6 }}>{race.unit === 'cap' && asset.liveMarketCapUsd != null ? 'Market cap' : 'Price'}</div>
                        <div
                          title={race.unit === 'cap' && asset.liveMarketCapUsd != null ? `Price ${formatUsdPrice(Number(formatUnits(asset.livePrice, asset.liveDecimals ?? asset.expectedDecimals)))}` : undefined}
                          className="font-mono text-sm" style={{ color: '#B8860B' }}
                        >
                          {race.unit === 'cap' && asset.liveMarketCapUsd != null
                            ? formatCompactUsd(asset.liveMarketCapUsd)
                            : formatUsdPrice(Number(formatUnits(asset.livePrice, asset.liveDecimals ?? asset.expectedDecimals)))}
                        </div>
                      </div>
                    )}
                    <div className="font-mono text-sm" style={{ opacity: 0.6 }}>{formatPoolShare(asset.pool, race.totalPool)}</div>
                  </div>
                </button>
                <PriceSourceLink
                  href={priceSourceUrlForAssetId(asset.assetId)}
                  symbol={asset.symbol}
                  tone="race"
                  className="w-full rounded-none border-t-4 border-[#1B1340]/10 px-4 py-2.5"
                />
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-4 lg:sticky lg:top-24">
        <div className="rx-raised space-y-4 p-5" style={{ background: CREAM, color: INK }}>
          <div className="flex items-center justify-between gap-3">
            <h3 style={{ margin: 0, fontFamily: PIXEL, fontSize: 14, fontWeight: 400, lineHeight: 1.4 }}>YOUR BET</h3>
            {selected && (
              <span className="inline-flex items-center gap-2" style={{ fontFamily: PIXEL, fontSize: 11 }}>
                <PxSprite data={coinSkin(selected.symbol, selected.assetIndex).sprite} width={24} height={26} />{selected.symbol}
              </span>
            )}
          </div>

          {position?.exists && (
            <p style={{ margin: 0, fontSize: 17, fontWeight: 500, opacity: 0.8 }}>
              Your pick is locked to <b className={accentText}>{race.assets[position.assetIndex]?.symbol}</b> with a current stake of{' '}
              <b className="font-mono text-[#1B1340]/80">
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
              tone="race"
              token={usdQuoted ? undefined : { symbol: tokenLabel, native: false }}
            />
            <p className="mt-2" style={{ fontSize: 15, fontWeight: 500, opacity: 0.7 }}>
              {exactAmount
                ? usdQuoted && inputUnit === 'SOL'
                  ? `Wallet will send exactly ${exactAmount} SOL · about ${equivalentUsd} at the displayed rate.`
                  : `Wallet will send exactly ${exactAmount} ${tokenLabel}`
                : !usdQuoted
                  ? `Enter a stake in ${tokenLabel}.`
                  : quoteReady
                    ? `Enter a stake worth $1–$50 in ${inputUnit}.`
                    : 'SOL/USD rate unavailable or stale.'}
            </p>
            <div className="mt-1.5 flex flex-wrap justify-between gap-2" style={{ fontSize: 14, fontWeight: 500, opacity: 0.55 }}>
              <span>
                Min first stake {formatStakeRaw(race.minStake, tokenDecimals)} {tokenLabel}
              </span>
              <span>
                Max cumulative {formatStakeRaw(race.maxStakePerWallet, tokenDecimals)} {tokenLabel}
              </span>
            </div>
          </div>

          <div className="rx-plate px-4 py-3" style={{ background: '#FFFFFF' }}>
            <div style={{ fontSize: 15, fontWeight: 600, opacity: 0.6 }}>
              {position?.exists && amountRaw > 0n ? 'Estimated total return after top-up' : 'Estimated total return'} if{' '}
              {selected?.symbol ?? 'selected asset'} wins
            </div>
            <div className="mt-1" style={{ fontFamily: PIXEL, fontSize: 18 }}>
              {formatStakeRaw(estimate, tokenDecimals)} {tokenLabel}
            </div>
            <div className="mt-1 space-y-0.5" style={{ fontSize: 14, fontWeight: 500, opacity: 0.55 }}>
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
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500, opacity: 0.6 }}>
              Wallet balance: {formatStakeRaw(balance, tokenDecimals)} {tokenLabel}
            </p>
          )}
          {belowMinimum && <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#B8860B' }}>The first stake is below this race's minimum.</p>}
          {exceedsMax && <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#C2245A' }}>This would exceed your cumulative maximum stake.</p>}
          {error && <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#C2245A' }}>{error}</p>}

          {!isConnected ? (
            <WalletOptionsList tone="race" />
          ) : (
            <button
              onClick={onBet}
              disabled={!bettingOpen || amountRaw <= 0n || belowMinimum || exceedsMax || !!txLabel}
              className="rx-btn rx-btn-yellow w-full"
              style={{ minHeight: 64, fontFamily: PIXEL, fontSize: 14 }}
            >
              {txLabel ?? (position?.exists ? `TOP UP ${selected?.symbol}` : `BET ON ${selected?.symbol}`)}
            </button>
          )}

          <p className="leading-relaxed" style={{ fontSize: 14, fontWeight: 500, opacity: 0.55 }}>
            Crowd backing is not a probability. The estimated payout is not guaranteed; pool distribution may change until betting closes.
          </p>
        </div>
      </div>
    </div>
  )
}
