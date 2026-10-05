import type { StakeInputUnit } from '@/chain/stakeQuote'

export function StakeAmountInput({
  id,
  label,
  value,
  inputUnit,
  onChange,
  onInputUnitChange,
  disabled = false,
  tone = 'market',
  token,
}: {
  id: string
  label: string
  value: string
  inputUnit: StakeInputUnit
  onChange?: (value: string) => void
  onInputUnitChange?: (unit: StakeInputUnit) => void
  disabled?: boolean
  tone?: 'market' | 'race' | 'arena'
  /** An SPL stake currency: entered in its own units, no USD conversion. */
  token?: { symbol: string; native: boolean }
}) {
  const spl = token != null && !token.native
  const activeClass = tone === 'race'
    ? 'bg-[#ffd23f] text-[#191330]'
    : tone === 'arena'
      ? 'bg-[#6bcbf4] text-[#191330]'
      : 'bg-[#ff4f8b] text-white'
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-current" style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 12 }}>
          {label} in {spl ? token.symbol : inputUnit}
        </label>
        {!spl && <div className="rx-plate grid grid-cols-2 bg-white p-0.5" aria-label="Stake input currency">
          {(['USD', 'SOL'] as const).map((unit) => (
            <button
              key={unit}
              type="button"
              disabled={disabled}
              aria-pressed={inputUnit === unit}
              onClick={() => onInputUnitChange?.(unit)}
              className={`rounded-none px-2.5 py-1 text-[13px] font-bold transition-colors disabled:cursor-not-allowed ${
                inputUnit === unit ? activeClass : 'text-[#1B1340]/45 hover:text-[#1B1340]'
              }`}
            >
              {unit}
            </button>
          ))}
        </div>}
      </div>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={spl ? '0' : inputUnit === 'USD' ? '10.00' : '0.05'}
        className="rx-input w-full px-3.5 py-2.5 disabled:cursor-not-allowed" style={{ height: 52, fontFamily: "'Press Start 2P', monospace", fontSize: 16 }}
      />
      {!spl && (
        <p className="mt-1.5" style={{ fontSize: 14, fontWeight: 500, opacity: 0.55 }}>
          {inputUnit === 'USD' ? '$1–$50' : 'Live equivalent of $1–$50'}
        </p>
      )}
    </div>
  )
}
