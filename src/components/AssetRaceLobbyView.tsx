import { useState } from 'react'
import { priceSourceUrlForAssetId } from '@/chain/assetRaceRegistry'
import { useApprovedRaceAssets } from '@/chain/useApprovedRaceAssets'
import { AddressLabel } from '@/components/AddressLabel'
import { AssetRaceAssetPicker } from '@/components/AssetRaceAssetPicker'
import { PriceSourceLink } from '@/components/PriceSourceLink'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { TokenLogo } from '@/components/TokenLogo'
import { formatCountdown } from '@/lib/format'
import { ASSET_RACE_CATEGORY, type ApprovedRaceAsset, type AssetRaceViewModel } from '@/chain/assetRaces'

export function AssetRaceLobbyView({
  race,
  nowMs,
  isConnected,
  hasAddedAsset,
  onAddAsset,
  txLabel,
  error,
}: {
  race: AssetRaceViewModel
  nowMs: number
  isConnected: boolean
  hasAddedAsset: boolean
  /** Receives the asset symbol - the game server keys assets by symbol. */
  onAddAsset: (symbol: string) => void
  txLabel: string | null
  error: string | null
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [pendingAsset, setPendingAsset] = useState<ApprovedRaceAsset | null>(null)
  const { assets: approvedAssets, isLoading } = useApprovedRaceAssets()
  const meme = race.category === ASSET_RACE_CATEGORY.MEME
  const crypto = race.category === ASSET_RACE_CATEGORY.CRYPTO
  const lobbyOpen = nowMs > 0 && nowMs < Number(race.lobbyEndTime) * 1_000
  const raceFull = race.assets.length >= 6
  const selectable = approvedAssets.filter((approved) =>
    approved.category === race.category &&
    !race.assets.some((candidate) => candidate.assetId.toLowerCase() === approved.assetId.toLowerCase()),
  )

  return (
    <div className="space-y-5">
      <div className="rounded-none border border-[#1B1340]/12 bg-[#FFF6DF] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[#B8860B]">Community race · lobby</p>
            <h2 className="mt-1 font-display text-2xl font-bold">The grid is being assembled</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#1B1340]/60">
              You may add one approved asset, or simply wait. Betting starts after the lobby closes, and the asset list
              cannot change after that.
            </p>
            <p className="mt-3 text-xs font-medium text-[#1B1340]/55">Created by <AddressLabel address={race.creator} className="font-bold text-[#1B1340]/75" /></p>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-bold">{nowMs > 0 ? formatCountdown(Number(race.lobbyEndTime) * 1_000 - nowMs) : '…'}</div>
            <div className="mt-0.5 text-xs font-bold text-[#1B1340]/55">lobby closes</div>
          </div>
        </div>
      </div>

      <div className="rounded-none border border-[#1B1340]/12 bg-[#FFF6DF] p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold">Starting grid</h3>
          <span className="shrink-0 rounded-full bg-[#ffd23f]/15 px-2.5 py-1 text-xs font-bold text-[#B8860B]">
            {race.assets.length} / 6 assets
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {race.assets.map((asset) => (
            <div key={asset.assetIndex} className="rounded-none border border-[#1B1340]/12 bg-[#1B1340]/5 px-3.5 py-3">
              <div className="flex items-center gap-2"><TokenLogo ticker={asset.symbol} className="h-9 w-9 rounded-none" /><div className="font-display text-lg font-bold">{asset.symbol}</div></div>
              <div className="text-xs font-bold text-[#B8860B]">Approved {meme ? 'meme' : crypto ? 'crypto asset' : 'stock'}</div>
              <PriceSourceLink
                href={priceSourceUrlForAssetId(asset.assetId)}
                symbol={asset.symbol}
                tone="race"
                className="mt-2 px-2 py-1.5"
              />
            </div>
          ))}
          {Array.from({ length: Math.max(0, 2 - race.assets.length) }, (_, index) => (
            <div key={`empty-${index}`} className="grid place-items-center rounded-none border border-dashed border-[#1B1340]/15 px-3 py-3 text-sm font-medium text-[#1B1340]/55">Open slot</div>
          ))}
        </div>
      </div>

      {lobbyOpen && (
        <div className="rounded-none border border-[#1B1340]/12 bg-[#FFF6DF] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold">Add a contender</h3>
              <p className="mt-1 text-xs font-medium text-[#1B1340]/55">One community-added asset per wallet for this race.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowPicker((value) => !value)
                setPendingAsset(null)
              }}
              disabled={raceFull || hasAddedAsset || !isConnected || !!txLabel}
              className="rounded-full bg-[#ffd23f] px-4 py-2 text-xs font-bold text-[#191330] disabled:opacity-40"
            >
              {raceFull ? 'Race full' : hasAddedAsset ? 'Asset added' : `Add ${meme ? 'meme' : crypto ? 'crypto' : 'stock'}`}
            </button>
          </div>
          {!isConnected && <div className="mt-4"><WalletOptionsList tone="race" /></div>}
          {showPicker && isConnected && !raceFull && !hasAddedAsset && (
            <div className="mt-4 border-t border-[#1B1340]/15 pt-4">
              {isLoading ? <p className="py-6 text-center text-sm text-[#1B1340]/55">Loading approved assets…</p> : (
                <AssetRaceAssetPicker
                  assets={selectable}
                  selectedIds={race.assets.map((asset) => asset.assetId)}
                  highlightedId={pendingAsset?.assetId}
                  onSelect={setPendingAsset}
                  category={race.category}
                />
              )}
              {pendingAsset && (
                <div className="mt-4 rounded-none border border-[#ffd23f]/30 bg-[#ffd23f]/[0.07] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-[#1B1340]/55">Selected contender</div>
                      <div className="mt-1 font-display text-lg font-bold">{pendingAsset.symbol} <span className="font-sans text-sm font-normal text-[#1B1340]/55">{pendingAsset.name}</span></div>
                      <p className="mt-2 max-w-xl text-xs leading-relaxed text-[#1B1340]/60">
                        Confirm adding {pendingAsset.symbol} to this race. Your wallet will ask you to sign the transaction and pay a small SOL network fee.
                      </p>
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setPendingAsset(null)}
                        disabled={!!txLabel}
                        className="flex-1 rounded-full border border-[#1B1340]/15 px-4 py-2.5 text-xs font-bold text-[#1B1340]/65 hover:border-[#1B1340]/30 disabled:opacity-40 sm:flex-none"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => onAddAsset(pendingAsset.symbol)}
                        disabled={!!txLabel}
                        className="flex-1 rounded-full bg-gradient-to-r from-[#ffd23f] to-[#f7b928] px-4 py-2.5 text-xs font-bold text-[#191330] disabled:opacity-40 sm:flex-none"
                      >
                        {txLabel ?? `Confirm ${pendingAsset.symbol}`}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!lobbyOpen && (
        <div className="rounded-none border border-[#ffd23f]/25 bg-[#FFF6DF] p-5">
          <h3 className="font-display text-lg font-bold">Lobby closed</h3>
          <p className="mt-1 text-sm text-[#1B1340]/55">
            {race.assets.length >= 2 ? 'The grid is ready. Betting opens in a few seconds.' : 'Fewer than two assets joined. The race is cancelled; no funds were involved.'}
          </p>
        </div>
      )}

      {txLabel && lobbyOpen && <p className="text-sm text-[#B8860B]">{txLabel}</p>}
      {error && <p className="text-sm text-[#C2245A]">{error}</p>}
    </div>
  )
}
