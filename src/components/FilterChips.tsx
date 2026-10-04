/** The one chip-button row used for list filters and category segments.
 * Retro accents: sun yellow = Asset Races, sky blue = Price Arena, pink =
 * crypto/wild, paper = neutral. Presentation only - selection state lives
 * with the caller. */

import { CRYPTO_ASSETS_ENABLED } from '@/chain/features'

export type ChipAccent = 'market' | 'race' | 'raceSoft' | 'arena' | 'cream'

const ACTIVE: Record<ChipAccent, string> = {
  market: 'bg-[#ff4f8b] text-[#fbf3e2]',
  race: 'bg-[#ffd23f] text-[#191330]',
  raceSoft: 'bg-[#ffd23f] text-[#191330]',
  arena: 'bg-[#6bcbf4] text-[#191330]',
  cream: 'bg-[#fbf3e2] text-[#191330]',
}

/** The Stocks/Memes category segment shared by race and arena pages. */
const BASE_GAME_MODE_CHIP_OPTIONS = [
  { key: 'stocks', label: 'Stocks', accent: 'cream' },
  { key: 'memes', label: 'Memes', accent: 'raceSoft' },
] as const satisfies readonly ChipOption<'stocks' | 'memes' | 'crypto'>[]

export const GAME_MODE_CHIP_OPTIONS: readonly ChipOption<'stocks' | 'memes' | 'crypto'>[] = CRYPTO_ASSETS_ENABLED
  ? [...BASE_GAME_MODE_CHIP_OPTIONS, { key: 'crypto', label: 'Crypto', accent: 'market' }]
  : BASE_GAME_MODE_CHIP_OPTIONS

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
  const sizeClass = size === 'sm' ? 'px-3.5 py-2 text-[10px]' : 'px-3 py-1.5 text-[9px]'
  return (
    <div className={`flex gap-2 ${className}`}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={`px-font whitespace-nowrap border-2 transition-all ${sizeClass} ${
            value === option.key
              ? `border-[#191330] shadow-[2px_2px_0_#191330] ${ACTIVE[option.accent ?? accent]}`
              : 'border-transparent text-[#191330]/50 hover:border-[#191330]/30 hover:text-[#191330]'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
