import { TokenLogo } from '@/components/TokenLogo'
import { PriceSourceLink } from '@/components/PriceSourceLink'

type ProductTone = 'market' | 'race' | 'arena'

export interface CompactAssetOption {
  id: string
  symbol: string
  name?: string
  logoUrl?: string
  priceUrl?: string
}

const TONE_CLASSES: Record<ProductTone, { selected: string; idle: string }> = {
  market: {
    selected: 'bg-[#ff4f8b] text-white',
    idle: 'bg-white/5 text-white/60 hover:bg-[#ff4f8b]/10 hover:text-white',
  },
  race: {
    selected: 'bg-[#ffd23f] text-[#191330]',
    idle: 'bg-white/5 text-white/60 hover:bg-[#ffd23f]/10 hover:text-white',
  },
  arena: {
    selected: 'bg-[#6bcbf4] text-[#191330]',
    idle: 'bg-white/5 text-white/60 hover:bg-[#6bcbf4]/10 hover:text-white',
  },
}

export function CompactAssetSelector({
  assets,
  selectedIds,
  onSelect,
  tone,
  multiple = false,
  maxSelected = 1,
}: {
  assets: readonly CompactAssetOption[]
  selectedIds: readonly string[]
  onSelect: (id: string) => void
  tone: ProductTone
  multiple?: boolean
  maxSelected?: number
}) {
  const selected = new Set(selectedIds.map((id) => id.toLowerCase()))
  const classes = TONE_CLASSES[tone]

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {assets.map((asset) => {
        const active = selected.has(asset.id.toLowerCase())
        const disabled = multiple && !active && selected.size >= maxSelected

        return (
          <div key={asset.id} className={`min-w-0 overflow-hidden rounded-none transition-colors ${active ? classes.selected : classes.idle}`}>
            <button
              type="button"
              title={asset.name ?? asset.symbol}
              aria-label={`${active ? 'Selected' : 'Select'} ${asset.name ?? asset.symbol}`}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onSelect(asset.id)}
              className="flex w-full min-w-0 items-center justify-center gap-2 px-2 pb-1.5 pt-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-30"
            >
              <TokenLogo ticker={asset.symbol} logoUrl={asset.logoUrl} className="h-6 w-6 shrink-0 rounded-none" />
              <span className="truncate">{asset.symbol}</span>
            </button>
            <PriceSourceLink
              href={asset.priceUrl}
              symbol={asset.symbol}
              tone={tone}
              className="w-full rounded-none border-t border-white/10 px-1 py-1 text-[10px]"
            />
          </div>
        )
      })}
    </div>
  )
}
