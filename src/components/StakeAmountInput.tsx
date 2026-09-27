import type { StakeInputUnit } from '@/chain/ethUsd'

export function StakeAmountInput({
  id,
  label,
  value,
  inputUnit,
  onChange,
  onInputUnitChange,
  disabled = false,
  tone = 'market',
}: {
  id: string
  label: string
  value: string
  inputUnit: StakeInputUnit
  onChange?: (value: string) => void
  onInputUnitChange?: (unit: StakeInputUnit) => void
  disabled?: boolean
  tone?: 'market' | 'race' | 'arena'
}) {
  const activeClass = tone === 'race'
    ? 'bg-[#F2A65A] text-[#3b2416]'
    : tone === 'arena'
      ? 'bg-[#7A9FF0] text-[#152447]'
      : 'bg-[#8B7CF7] text-white'
  const focusClass = tone === 'race'
    ? 'focus:border-[#F2A65A]/60'
    : tone === 'arena'
      ? 'focus:border-[#7A9FF0]/60'
      : 'focus:border-[#8B7CF7]/50'
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-bold text-white/60">
          {label} in {inputUnit}
        </label>
        <div className="grid grid-cols-2 rounded-lg bg-white/5 p-0.5" aria-label="Stake input currency">
          {(['USD', 'ETH'] as const).map((unit) => (
            <button
              key={unit}
              type="button"
              disabled={disabled}
              aria-pressed={inputUnit === unit}
              onClick={() => onInputUnitChange?.(unit)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors disabled:cursor-not-allowed ${
                inputUnit === unit ? activeClass : 'text-white/40 hover:text-white/70'
              }`}
            >
              {unit}
            </button>
          ))}
        </div>
      </div>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={inputUnit === 'USD' ? '10.00' : '0.004'}
        className={`w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 font-mono outline-none transition-colors placeholder:text-white/25 disabled:cursor-not-allowed ${focusClass}`}
      />
      <p className="mt-1.5 text-[11px] font-medium text-white/30">
        {inputUnit === 'USD' ? '$1–$50' : 'Live equivalent of $1–$50'}
      </p>
    </div>
  )
}
