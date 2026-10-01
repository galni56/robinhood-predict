/** The one pill-button row used for list filters and Stocks/Memes segments.
 * Accents follow the product color system (CLAUDE.md): purple = Prediction
 * Markets, orange = Asset Races, blue = Price Arena, cream = neutral
 * category. Presentation only - selection state lives with the caller. */

export type ChipAccent = 'market' | 'race' | 'raceSoft' | 'arena' | 'cream'

const ACTIVE: Record<ChipAccent, string> = {
  market: 'bg-[#8B7CF7] text-[#f7f1e3]',
  race: 'bg-[#ED8F3A] text-[#3b2416]',
  raceSoft: 'bg-[#F2A65A] text-[#3b2416]',
  arena: 'bg-[#7A9FF0] text-[#152447]',
  cream: 'bg-[#f7f1e3] text-[#241a33]',
}

/** The Stocks/Memes category segment shared by race and arena pages. */
export const GAME_MODE_CHIP_OPTIONS = [
  { key: 'stocks', label: 'Stocks', accent: 'cream' },
  { key: 'memes', label: 'Memes', accent: 'raceSoft' },
] as const satisfies readonly ChipOption<'stocks' | 'memes'>[]

export interface ChipOption<T extends string> {
  key: T
  label: string
  /** Overrides the group accent for this option (e.g. Memes = orange). */
  accent?: ChipAccent
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  accent = 'market',
  size = 'xs',
  className = '',
}: {
  options: readonly ChipOption<T>[]
  value: T
  onChange: (key: T) => void
  accent?: ChipAccent
  size?: 'xs' | 'sm'
  className?: string
}) {
  const sizeClass = size === 'sm' ? 'px-4 py-1.5 text-sm' : 'px-3.5 py-1.5 text-xs'
  return (
    <div className={`flex gap-1.5 ${className}`}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={`whitespace-nowrap rounded-full font-bold transition-colors ${sizeClass} ${
            value === option.key ? ACTIVE[option.accent ?? accent] : 'text-white/50 hover:bg-white/5 hover:text-white'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
