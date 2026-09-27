import { TokenLogo } from '@/components/TokenLogo'

type ProductTone = 'market' | 'race' | 'arena'

export interface CompactAssetOption {
  id: string
  symbol: string
  name?: string
  logoUrl?: string
}

const TONE_CLASSES: Record<ProductTone, { selected: string; idle: string }> = {
  market: {
    selected: 'bg-[#8B7CF7] text-white',
    idle: 'bg-white/5 text-white/60 hover:bg-[#8B7CF7]/10 hover:text-white',
  },
  race: {
    selected: 'bg-[#F2A65A] text-[#3b2416]',
    idle: 'bg-white/5 text-white/60 hover:bg-[#F2A65A]/10 hover:text-white',
  },
  arena: {
    selected: 'bg-[#7A9FF0] text-[#152447]',
    idle: 'bg-white/5 text-white/60 hover:bg-[#7A9FF0]/10 hover:text-white',
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
          <button
            key={asset.id}
            type="button"
            title={asset.name ?? asset.symbol}
            aria-label={`${active ? 'Selected' : 'Select'} ${asset.name ?? asset.symbol}`}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onSelect(asset.id)}
            className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
              active ? classes.selected : classes.idle
            }`}
          >
            <TokenLogo ticker={asset.symbol} logoUrl={asset.logoUrl} className="h-6 w-6 shrink-0 rounded-lg" />
            <span className="truncate">{asset.symbol}</span>
          </button>
        )
      })}
    </div>
  )
}
