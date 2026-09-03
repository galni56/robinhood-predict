import { type FormEvent, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { RHCHAIN_META } from '@/market/tokens'
import { useAuthStore } from '@/store/authStore'

export function LoginPage() {
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: Location })?.from?.pathname ?? '/markets'

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const result = login(email, password)
    if (!result.ok) {
      setError(result.error)
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <div className="min-h-[calc(100svh-90px)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 font-semibold text-lg mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.6)]" />
            PredictX
          </div>
          <p className="text-white/40 text-sm">Вход в демо-аккаунт на {RHCHAIN_META.name}</p>
        </div>

        <form onSubmit={onSubmit} className="bg-white/[0.03] border border-white/10 rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm text-white/60 mb-1.5">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
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
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
            />
          </div>

          {error && <p className="text-rose-400 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-medium py-2 text-sm transition-colors"
          >
            Войти
          </button>

          <p className="text-center text-sm text-white/40">
            Нет аккаунта?{' '}
            <Link to="/register" className="text-emerald-400 hover:underline">
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
