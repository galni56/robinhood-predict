import { type FormEvent, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { RHCHAIN_META } from '@/market/tokens'
import { useAuthStore } from '@/store/authStore'
import type { MarketSide } from '@/types'

interface LoginLocationState {
  from?: Location
  /** Set when login was triggered from a bet popup/form so we can reopen it
   * on the page the user came from, pre-selected on the same side. */
  reopenBet?: { marketId: string; side: MarketSide }
}

export function LoginPage() {
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const state = location.state as LoginLocationState | null
  const from = state?.from?.pathname ?? '/markets'

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const result = login(email, password)
    if (!result.ok) {
      setError(result.error)
      return
    }
    navigate(from, { replace: true, state: state?.reopenBet ? { reopenBet: state.reopenBet } : undefined })
  }

  return (
    <div className="min-h-[calc(100svh-90px)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 font-extrabold text-lg mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-violet-400 to-emerald-400 shadow-[0_0_8px_2px_rgba(139,92,246,0.55)]" />
            PredictX
          </div>
          <p className="text-white/40 text-sm">
            {state?.reopenBet
              ? 'Войдите, чтобы завершить ставку — вернём вас прямо туда, где остановились'
              : `Вход в демо-аккаунт на ${RHCHAIN_META.name}`}
          </p>
        </div>

        <form onSubmit={onSubmit} className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-sm text-white/60 mb-1.5">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-violet-400/60"
            />
          </div>
          <div>
            <label className="block text-sm text-white/60 mb-1.5">Пароль</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-violet-400/60"
            />
          </div>

          {error && <p className="text-rose-400 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:brightness-110 text-white font-semibold py-2 text-sm transition-all"
          >
            Войти
          </button>

          <p className="text-center text-sm text-white/40">
            Нет аккаунта?{' '}
            <Link to="/register" className="text-violet-300 hover:underline">
              Зарегистрироваться
            </Link>
          </p>
        </form>

        <p className="text-center text-xs text-white/25 mt-6">
          Мок-аутентификация: данные хранятся только в localStorage вашего браузера. Реальных паролей вводить не нужно.
        </p>
      </div>
    </div>
  )
}
