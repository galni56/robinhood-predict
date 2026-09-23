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
        placeholder={meme ? 'Search approved meme assets…' : 'Search Stock Tokens…'}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-medium outline-none transition-colors focus:border-[#8B7CF7]/50"
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
              className={`flex min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                highlighted
                  ? meme
                    ? 'border-[#F2A65A]/60 bg-[#F2A65A]/10'
                    : 'border-[#8B7CF7]/60 bg-[#8B7CF7]/10'
                  : `border-white/5 bg-white/5 ${meme ? 'hover:border-[#F2A65A]/40' : 'hover:border-[#8B7CF7]/40'}`
              }`}
            >
              {asset.logoUrl ? (
                <img src={asset.logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full bg-white/5 object-contain" />
              ) : (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f7f1e3] font-display text-xs font-bold text-[#241a33]">
                  {asset.symbol.slice(0, 2)}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{asset.symbol}</span>
                <span className="block truncate text-xs text-white/40">{asset.name}</span>
              </span>
              <span className={`text-xs font-bold ${meme ? 'text-[#F2A65A]' : 'text-[#B3A7FA]'}`}>
                {alreadySelected ? 'Added' : highlighted ? 'Selected' : 'Approved'}
              </span>
            </button>
          )
        })}
      </div>
      {matches.length === 0 && <p className="py-5 text-center text-sm text-white/35">No approved assets match that search.</p>}
    </div>
  )
}
