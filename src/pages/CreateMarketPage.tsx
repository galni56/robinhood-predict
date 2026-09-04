import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatUsd } from '@/lib/format'
import { TOKENS } from '@/market/tokens'
import { useAuthStore } from '@/store/authStore'
import { DURATION_PRESETS, MAX_TARGET_PRICE, useMarketStore } from '@/store/marketStore'

export function CreateMarketPage() {
  const user = useAuthStore((s) => s.currentUser())
  const createMarket = useMarketStore((s) => s.createMarket)
  const navigate = useNavigate()

  const [symbol, setSymbol] = useState(TOKENS[0].symbol)
  const [target, setTarget] = useState('100')
  const [durationIdx, setDurationIdx] = useState(DURATION_PRESETS.length - 1)
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const result = createMarket(user, symbol, Number(target), DURATION_PRESETS[durationIdx].ms)
    if (!result.ok) {
      setError(result.error)
      return
    }
    navigate(`/markets/${result.id}`)
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-1">Создать рынок</h1>
      <p className="text-white/50 text-sm mb-6">
        Любой может создать рынок — он сразу появится в общем списке. Целевая цена не может быть выше{' '}
        {formatUsd(MAX_TARGET_PRICE, 0)}.
      </p>

      <form onSubmit={onSubmit} className="bg-white/[0.03] border border-white/10 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm text-white/60 mb-1.5">Токен</label>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
          >
            {TOKENS.map((t) => (
              <option key={t.symbol} value={t.symbol}>
                {t.symbol} — {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-white/60 mb-1.5">Целевая цена, $ (макс. {formatUsd(MAX_TARGET_PRICE, 0)})</label>
          <input
            type="number"
            min={1}
            max={MAX_TARGET_PRICE}
            step="0.01"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
          />
        </div>

        <div>
          <label className="block text-sm text-white/60 mb-1.5">Срок</label>
          <select
            value={durationIdx}
            onChange={(e) => setDurationIdx(Number(e.target.value))}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
          >
            {DURATION_PRESETS.map((d, i) => (
              <option key={d.label} value={i}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-rose-400 text-sm">{error}</p>}

        <button
          type="submit"
          className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-medium py-2 text-sm transition-colors"
        >
          Создать рынок
        </button>
      </form>
    </div>
  )
}
