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
      <div className={`relative overflow-hidden rounded-2xl border p-5 ${meme ? 'border-fuchsia-300/30 bg-gradient-to-br from-fuchsia-500/[0.14] to-orange-400/[0.08]' : 'border-violet-400/30 bg-violet-500/[0.08]'}`}>
        <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-violet-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black tracking-[0.24em] text-violet-300">COMMUNITY RACE · LOBBY</div>
            <h2 className="mt-2 text-2xl font-black">Assets are being selected.</h2>
            <div className="mt-2 max-w-xl space-y-1 text-sm text-white/50">
              <p>Assets are being selected.</p>
              <p>You may add one approved asset, or simply wait for betting.</p>
              <p>Betting starts after the Lobby closes.</p>
              <p>The asset list cannot change after Betting opens.</p>
            </div>
            <p className="mt-3 text-xs text-white/40">Created by <AddressLabel address={race.creator} link={!isLocalAssetRace} className="font-bold text-white/70" /></p>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-black">{nowMs > 0 ? formatCountdown(Number(race.lobbyEndTime) * 1_000 - nowMs) : '…'}</div>
            <div className="text-[11px] uppercase tracking-wider text-white/35">Lobby closes in</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#12121c]/95 p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-black">Starting grid</h3>
          <span className="shrink-0 whitespace-nowrap font-mono text-sm font-bold text-[#C6FF3D]">{race.assets.length} / 6 ASSETS</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {race.assets.map((asset) => (
            <div key={asset.assetIndex} className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">
              <div className="text-lg font-black">{asset.symbol}</div>
              <div className={`text-[10px] font-bold tracking-wider ${meme ? 'text-orange-200' : 'text-emerald-300'}`}>APPROVED {meme ? 'MEME' : 'STOCK'}</div>
            </div>
          ))}
          {Array.from({ length: Math.max(0, 2 - race.assets.length) }, (_, index) => (
            <div key={`empty-${index}`} className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-sm text-white/25">Open slot</div>
          ))}
        </div>
      </div>

      {lobbyOpen && (
        <div className="rounded-2xl border border-white/10 bg-[#12121c]/95 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-black">Add a contender</h3>
              <p className="mt-1 text-xs text-white/40">One community-added asset per wallet for this Race.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowPicker((value) => !value)
                setPendingAsset(null)
              }}
              disabled={raceFull || hasAddedAsset || !isConnected || !onRightChain || !!txLabel}
              className="rounded-lg bg-[#C6FF3D] px-4 py-2 text-xs font-black text-black disabled:opacity-40"
            >
              {raceFull ? 'RACE FULL' : hasAddedAsset ? 'ASSET ADDED' : `+ ADD ${meme ? 'MEME' : 'STOCK'}`}
            </button>
          </div>
          {!isConnected && <div className="mt-4"><WalletOptionsList /></div>}
          {isConnected && !onRightChain && (
            <button onClick={onSwitchChain} disabled={isSwitching} className="mt-4 w-full rounded-lg bg-amber-400 py-2.5 text-sm font-black text-black disabled:opacity-50">
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
                <div className={`mt-4 rounded-xl border p-4 ${meme ? 'border-orange-300/30 bg-orange-300/[0.07]' : 'border-[#C6FF3D]/30 bg-[#C6FF3D]/[0.06]'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-black uppercase tracking-wider text-white/45">Selected contender</div>
                      <div className="mt-1 text-lg font-black">{pendingAsset.symbol} <span className="text-sm font-normal text-white/40">{pendingAsset.name}</span></div>
                      <p className="mt-2 max-w-xl text-xs leading-relaxed text-amber-100/75">
                        Confirm adding {pendingAsset.symbol} to this Race. Your wallet will ask you to approve the transaction and its ETH network fee.
                      </p>
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setPendingAsset(null)}
                        disabled={!!txLabel}
                        className="flex-1 rounded-lg border border-white/15 px-4 py-2.5 text-xs font-black text-white/65 hover:border-white/30 disabled:opacity-40 sm:flex-none"
                      >
                        CANCEL
                      </button>
                      <button
                        type="button"
                        onClick={() => onAddAsset(pendingAsset.assetId)}
                        disabled={!!txLabel}
                        className="flex-1 rounded-lg bg-gradient-to-r from-[#C6FF3D] to-[#8FBF1F] px-4 py-2.5 text-xs font-black text-black disabled:opacity-40 sm:flex-none"
                      >
                        {txLabel ?? `CONFIRM ADD ${pendingAsset.symbol}`}
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
        <div className="rounded-2xl border border-[#C6FF3D]/25 bg-[#12160f]/90 p-5">
          <h3 className="font-black">Lobby closed</h3>
          <p className="mt-1 text-sm text-white/45">
            {race.assets.length >= 2 ? 'The grid is ready. Anyone can open the betting window.' : 'Fewer than two assets joined. Opening will cancel this Race with no funds involved.'}
          </p>
          <div className="mt-4">
            {!isConnected ? <WalletOptionsList /> : !onRightChain ? (
              <button onClick={onSwitchChain} disabled={isSwitching} className="w-full rounded-lg bg-amber-400 py-2.5 text-sm font-black text-black disabled:opacity-50">
                {isSwitching ? 'Switching…' : `Switch to ${assetRaceChain.name}`}
              </button>
            ) : (
              <button onClick={onOpenBetting} disabled={!!txLabel} className="w-full rounded-lg bg-gradient-to-r from-[#C6FF3D] to-[#8FBF1F] py-2.5 text-sm font-black text-black disabled:opacity-40">
                {txLabel ?? (race.assets.length >= 2 ? 'OPEN BETTING' : 'CANCEL EMPTY LOBBY')}
              </button>
            )}
          </div>
        </div>
      )}

      {txLabel && lobbyOpen && <p className="text-sm text-[#C6FF3D]">{txLabel}</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </div>
  )
}
