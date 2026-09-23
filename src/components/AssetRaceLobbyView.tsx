import { useState } from 'react'
import type { Hex } from 'viem'
import { assetRaceChain, isLocalAssetRace } from '@/chain/config'
import { useApprovedRaceAssets } from '@/chain/useApprovedRaceAssets'
import { AddressLabel } from '@/components/AddressLabel'
import { AssetRaceAssetPicker } from '@/components/AssetRaceAssetPicker'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { formatCountdown } from '@/lib/format'
import { ASSET_RACE_CATEGORY, type ApprovedRaceAsset, type AssetRaceViewModel } from '@/chain/assetRaces'

export function AssetRaceLobbyView({
  race,
  nowMs,
  isConnected,
  onRightChain,
  isSwitching,
  onSwitchChain,
  hasAddedAsset,
  onAddAsset,
  onOpenBetting,
  txLabel,
  error,
}: {
  race: AssetRaceViewModel
  nowMs: number
  isConnected: boolean
  onRightChain: boolean
  isSwitching: boolean
  onSwitchChain: () => void
  hasAddedAsset: boolean
  onAddAsset: (assetId: Hex) => void
  onOpenBetting: () => void
  txLabel: string | null
  error: string | null
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [pendingAsset, setPendingAsset] = useState<ApprovedRaceAsset | null>(null)
  const { assets: approvedAssets, isLoading } = useApprovedRaceAssets()
  const meme = race.category === ASSET_RACE_CATEGORY.MEME
  const lobbyOpen = nowMs > 0 && nowMs < Number(race.lobbyEndTime) * 1_000
  const raceFull = race.assets.length >= 6
  const selectable = approvedAssets.filter((approved) =>
    approved.category === race.category &&
    !race.assets.some((candidate) => candidate.assetId.toLowerCase() === approved.assetId.toLowerCase()),
  )

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/5 bg-[#241b2f] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={`text-sm font-bold ${meme ? 'text-[#F2A65A]' : 'text-[#B3A7FA]'}`}>Community race · lobby</p>
            <h2 className="mt-1 font-display text-2xl font-bold">The grid is being assembled</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/50">
              You may add one approved asset, or simply wait. Betting starts after the lobby closes, and the asset list
              cannot change after that.
            </p>
            <p className="mt-3 text-xs font-medium text-white/40">Created by <AddressLabel address={race.creator} link={!isLocalAssetRace} className="font-bold text-white/70" /></p>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-bold">{nowMs > 0 ? formatCountdown(Number(race.lobbyEndTime) * 1_000 - nowMs) : '…'}</div>
            <div className="mt-0.5 text-xs font-bold text-white/35">lobby closes</div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/5 bg-[#241b2f] p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold">Starting grid</h3>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${meme ? 'bg-[#F2A65A]/15 text-[#F2A65A]' : 'bg-[#8B7CF7]/15 text-[#B3A7FA]'}`}>
            {race.assets.length} / 6 assets
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {race.assets.map((asset) => (
            <div key={asset.assetIndex} className="rounded-2xl border border-white/5 bg-white/5 px-3.5 py-3">
              <div className="font-display text-lg font-bold">{asset.symbol}</div>
              <div className={`text-xs font-bold ${meme ? 'text-[#F2A65A]' : 'text-[#B3A7FA]'}`}>Approved {meme ? 'meme' : 'stock'}</div>
            </div>
          ))}
          {Array.from({ length: Math.max(0, 2 - race.assets.length) }, (_, index) => (
            <div key={`empty-${index}`} className="grid place-items-center rounded-2xl border border-dashed border-white/15 px-3 py-3 text-sm font-medium text-white/25">Open slot</div>
          ))}
        </div>
      </div>

      {lobbyOpen && (
        <div className="rounded-3xl border border-white/5 bg-[#241b2f] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-bold">Add a contender</h3>
              <p className="mt-1 text-xs font-medium text-white/40">One community-added asset per wallet for this race.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowPicker((value) => !value)
                setPendingAsset(null)
              }}
              disabled={raceFull || hasAddedAsset || !isConnected || !onRightChain || !!txLabel}
              className="rounded-full bg-[#8B7CF7] px-4 py-2 text-xs font-bold text-[#f7f1e3] disabled:opacity-40"
            >
              {raceFull ? 'Race full' : hasAddedAsset ? 'Asset added' : `Add ${meme ? 'meme' : 'stock'}`}
            </button>
          </div>
          {!isConnected && <div className="mt-4"><WalletOptionsList /></div>}
          {isConnected && !onRightChain && (
            <button onClick={onSwitchChain} disabled={isSwitching} className="mt-4 w-full rounded-full bg-[#F2A65A] py-2.5 text-sm font-bold text-[#3b2416] disabled:opacity-50">
              {isSwitching ? 'Switching…' : `Switch to ${assetRaceChain.name}`}
            </button>
          )}
          {showPicker && isConnected && !raceFull && !hasAddedAsset && (
            <div className="mt-4 border-t border-white/10 pt-4">
              {isLoading ? <p className="py-6 text-center text-sm text-white/35">Loading approved assets…</p> : (
                <AssetRaceAssetPicker
                  assets={selectable}
                  selectedIds={race.assets.map((asset) => asset.assetId)}
                  highlightedId={pendingAsset?.assetId}
                  onSelect={setPendingAsset}
                  category={race.category}
                />
              )}
              {pendingAsset && (
                <div className={`mt-4 rounded-2xl border p-4 ${meme ? 'border-[#F2A65A]/30 bg-[#F2A65A]/[0.07]' : 'border-[#8B7CF7]/30 bg-[#8B7CF7]/[0.06]'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-white/45">Selected contender</div>
                      <div className="mt-1 font-display text-lg font-bold">{pendingAsset.symbol} <span className="font-sans text-sm font-normal text-white/40">{pendingAsset.name}</span></div>
                      <p className="mt-2 max-w-xl text-xs leading-relaxed text-white/50">
                        Confirm adding {pendingAsset.symbol} to this race. Your wallet will ask you to approve the transaction and its ETH network fee.
                      </p>
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setPendingAsset(null)}
                        disabled={!!txLabel}
                        className="flex-1 rounded-full border border-white/15 px-4 py-2.5 text-xs font-bold text-white/65 hover:border-white/30 disabled:opacity-40 sm:flex-none"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => onAddAsset(pendingAsset.assetId)}
                        disabled={!!txLabel}
                        className="flex-1 rounded-full bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40 sm:flex-none"
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
        <div className="rounded-3xl border border-[#8B7CF7]/25 bg-[#241b2f] p-5">
          <h3 className="font-display text-lg font-bold">Lobby closed</h3>
          <p className="mt-1 text-sm text-white/45">
            {race.assets.length >= 2 ? 'The grid is ready. Anyone can open the betting window.' : 'Fewer than two assets joined. Opening will cancel this race with no funds involved.'}
          </p>
          <div className="mt-4">
            {!isConnected ? <WalletOptionsList /> : !onRightChain ? (
              <button onClick={onSwitchChain} disabled={isSwitching} className="w-full rounded-full bg-[#F2A65A] py-2.5 text-sm font-bold text-[#3b2416] disabled:opacity-50">
                {isSwitching ? 'Switching…' : `Switch to ${assetRaceChain.name}`}
              </button>
            ) : (
              <button onClick={onOpenBetting} disabled={!!txLabel} className="w-full rounded-xl bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] py-3 text-sm font-bold text-white disabled:opacity-40">
                {txLabel ?? (race.assets.length >= 2 ? 'Open betting' : 'Cancel empty lobby')}
              </button>
            )}
          </div>
        </div>
      )}

      {txLabel && lobbyOpen && <p className="text-sm text-[#8B7CF7]">{txLabel}</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </div>
  )
}
