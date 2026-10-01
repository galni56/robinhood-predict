import { useMemo, useState } from 'react'
import type { Hex } from 'viem'
import { ASSET_RACE_CATEGORY, type ApprovedRaceAsset } from '@/chain/assetRaces'
import { formatCompactUsd, memeMarketCapUsd, useMemeTokenSupplies } from '@/chain/memeMarketCap'
import { useAssetRaceLiveDisplay } from '@/chain/useAssetRaceLiveDisplay'
import { PriceSourceLink } from '@/components/PriceSourceLink'
import { TokenLogo } from '@/components/TokenLogo'

export function AssetRaceAssetPicker({
  assets,
  selectedIds,
  onSelect,
  highlightedId,
  maxSelected = 6,
  category = ASSET_RACE_CATEGORY.STOCK,
  compact = false,
}: {
  assets: ApprovedRaceAsset[]
  selectedIds: readonly Hex[]
  onSelect: (asset: ApprovedRaceAsset) => void
  highlightedId?: Hex
  maxSelected?: number
  category?: number
  compact?: boolean
}) {
  const meme = category === ASSET_RACE_CATEGORY.MEME
  // Memes are picked by market cap: show MC per contender from the live
  // ETH-quoted price, onchain supply and ETH/USD. Display-only.
  const memeSupplies = useMemeTokenSupplies(meme)
  const live = useAssetRaceLiveDisplay({ enabled: meme })
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
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm font-medium outline-none transition-colors focus:border-[#F2A65A]/60"
      />
      <div className={`grid grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 ${compact ? 'max-h-52' : 'max-h-80'}`}>
        {matches.map((asset) => {
          const alreadySelected = selected.has(asset.assetId.toLowerCase())
          const highlighted = highlightedId?.toLowerCase() === asset.assetId.toLowerCase()
          const disabled = alreadySelected || selectedIds.length >= maxSelected
          return (
            <div
              key={asset.assetId}
              className={`min-w-0 overflow-hidden rounded-2xl border transition-all ${
                highlighted
                  ? 'border-[#F2A65A]/60 bg-[#F2A65A]/10'
                  : 'border-white/5 bg-white/5 hover:border-[#F2A65A]/40'
              }`}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(asset)}
                className="flex w-full min-w-0 items-center gap-3 p-3 text-left disabled:cursor-not-allowed disabled:opacity-40"
              >
                <TokenLogo ticker={asset.symbol} logoUrl={asset.logoUrl} className="h-9 w-9 rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{asset.symbol}</span>
                  <span className="block truncate text-xs text-white/40">{asset.name}</span>
                </span>
                <span className="text-right">
                  <span className="block text-xs font-bold text-[#F2A65A]">
                    {alreadySelected ? 'Added' : highlighted ? 'Selected' : 'Approved'}
                  </span>
                  {(() => {
                    const livePrice = meme ? live.assets[asset.symbol] : undefined
                    const cap = livePrice && !livePrice.stale
                      ? memeMarketCapUsd({
                          priceRaw: BigInt(livePrice.priceRaw),
                          priceDecimals: livePrice.decimals,
                          supply: memeSupplies.get(asset.symbol),
                          ethUsd: live.ethUsd,
                        })
                      : undefined
                    return cap != null ? (
                      <span className="mt-0.5 block font-mono text-[11px] text-white/45">MC {formatCompactUsd(cap)}</span>
                    ) : null
                  })()}
                </span>
              </button>
              <PriceSourceLink
                href={asset.priceUrl}
                symbol={asset.symbol}
                tone="race"
                className="w-full rounded-none border-t border-white/10 px-3 py-2"
              />
            </div>
          )
        })}
      </div>
      {matches.length === 0 && <p className="py-5 text-center text-sm text-white/35">No approved assets match that search.</p>}
    </div>
  )
}
