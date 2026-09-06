import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { STARTING_BALANCE } from '@/store/authStore'
import { useAuthStore } from '@/store/authStore'
import { RHCHAIN_META } from '@/market/tokens'
import { formatUsd } from '@/lib/format'

export function RegisterPage() {
  const register = useAuthStore((s) => s.register)
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const result = register(email, password, displayName)
    if (!result.ok) {
      setError(result.error)
      return
    }
    navigate('/markets', { replace: true })
  }

  return (
    <div className="min-h-[calc(100svh-90px)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 font-extrabold text-lg mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#C6FF3D] to-emerald-400 shadow-[0_0_8px_2px_rgba(198,255,61,0.55)]" />
            PredictX
          </div>
          <p className="text-white/40 text-sm">Create a new demo account on {RHCHAIN_META.name}</p>
        </div>

        <form onSubmit={onSubmit} className="bg-[#12121c]/95 border border-white/10 rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-sm text-white/60 mb-1.5">Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="What should we call you"
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-[#C6FF3D]/60"
            />
          </div>
          <div>
            <label className="block text-sm text-white/60 mb-1.5">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-[#C6FF3D]/60"
            />
          </div>
          <div>
            <label className="block text-sm text-white/60 mb-1.5">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-[#C6FF3D]/60"
            />
          </div>

          {error && <p className="text-rose-400 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-lg bg-gradient-to-r from-[#C6FF3D] to-[#8FBF1F] hover:brightness-110 text-black font-semibold py-2 text-sm transition-all"
          >
            Create account
          </button>

          <p className="text-center text-sm text-white/40">
            Already have an account?{' '}
            <Link to="/login" className="text-[#C6FF3D] hover:underline">
              Log in
            </Link>
          </p>
        </form>

        <p className="text-center text-xs text-white/25 mt-6">
          Signing up instantly credits your wallet with {formatUsd(STARTING_BALANCE)} {RHCHAIN_META.ticker} from the test
          faucet — also a mock transaction, visible in the explorer.
        </p>
      </div>
    </div>
  )
}
