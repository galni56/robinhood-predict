import { formatStakeAmount, useStakeCurrencies } from '@/solana/stakeTokens'

/** Stake currency for a new game. Hidden while SOL is the only accepted one. */
export function StakeCurrencySelect({ value, onChange, tone }: {
  value: string
  onChange: (mint: string) => void
  tone: 'race' | 'arena'
}) {
  const currencies = useStakeCurrencies()
  const enabled = [...(currencies.data?.values() ?? [])].filter((currency) => currency.enabled)
  if (enabled.length <= 1) return null
  const selected = enabled.find((currency) => currency.mint === value)
  const focus = tone === 'race' ? 'focus:border-[#ffd23f]/50' : 'focus:border-[#6bcbf4]/50'
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-white/60">Stake currency</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-none border border-white/10 bg-[#191330] px-3.5 py-2.5 font-medium outline-none ${focus}`}
      >
        {enabled.map((currency) => <option key={currency.mint} value={currency.mint}>{currency.symbol}</option>)}
      </select>
      {selected && (
        <p className="mt-1.5 text-xs font-medium text-white/35">
          Players stake {formatStakeAmount(selected.minStake, selected)} to {formatStakeAmount(selected.maxStake, selected)} per wallet.
        </p>
      )}
    </div>
  )
}
