import { useMemo, useState } from 'react'
import type { Hex } from 'viem'
import { ASSET_RACE_CATEGORY, type ApprovedRaceAsset } from '@/chain/assetRaces'

export function AssetRaceAssetPicker({
  assets,
  selectedIds,
  onSelect,
  highlightedId,
  maxSelected = 6,
  category = ASSET_RACE_CATEGORY.STOCK,
}: {
  assets: ApprovedRaceAsset[]
  selectedIds: readonly Hex[]
  onSelect: (asset: ApprovedRaceAsset) => void
  highlightedId?: Hex
  maxSelected?: number
  category?: number
}) {
  const meme = category === ASSET_RACE_CATEGORY.MEME
  const [query, setQuery] = useState('')
  const selected = new Set(selectedIds.map((id) => id.toLowerCase()))
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return assets
    return assets.filter((asset) =>
      asset.symbol.toLowerCase().includes(normalized) || asset.name.toLowerCase().includes(normalized),
    )
  }, [assets, query])

  return (
    <div className="space-y-3">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={meme ? 'Search approved Meme assets…' : 'Search Stock Tokens…'}
        className="w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-sm outline-none transition-colors focus:border-[#C6FF3D]/50"
      />
      <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {matches.map((asset) => {
          const alreadySelected = selected.has(asset.assetId.toLowerCase())
          const highlighted = highlightedId?.toLowerCase() === asset.assetId.toLowerCase()
          const disabled = alreadySelected || selectedIds.length >= maxSelected
          return (
            <button
              key={asset.assetId}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(asset)}
              className={`flex min-w-0 items-center gap-3 border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40 ${meme ? `rounded-2xl bg-gradient-to-r from-fuchsia-400/[0.08] to-orange-300/[0.05] hover:-translate-y-0.5 ${highlighted ? 'border-orange-300/70 shadow-[0_0_24px_-14px_rgba(251,146,60,0.9)]' : 'border-fuchsia-300/15 hover:border-orange-300/40'}` : `rounded-xl bg-white/[0.025] ${highlighted ? 'border-[#C6FF3D]/70' : 'border-white/10 hover:border-[#C6FF3D]/35'}`}`}
            >
              {asset.logoUrl ? (
                <img src={asset.logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full bg-white/5 object-contain" />
              ) : (
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black ${meme ? 'bg-gradient-to-br from-fuchsia-400/25 to-orange-300/25 text-orange-100' : 'bg-[#C6FF3D]/10 text-[#C6FF3D]'}`}>
                  {meme ? '⚡' : asset.symbol.slice(0, 2)}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-black">{asset.symbol}</span>
                <span className="block truncate text-xs text-white/40">{asset.name}</span>
              </span>
              <span className={`text-[10px] font-bold ${meme ? 'text-orange-200' : 'text-[#C6FF3D]'}`}>{alreadySelected ? 'ADDED' : highlighted ? 'SELECTED' : 'APPROVED'}</span>
            </button>
          )
        })}
      </div>
      {matches.length === 0 && <p className="py-5 text-center text-sm text-white/35">No approved assets match that search.</p>}
    </div>
  )
}
