import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Avatar } from '@/components/Avatar'
import { formatUsd } from '@/lib/format'
import { RHCHAIN_META } from '@/market/tokens'
import { useAuthStore } from '@/store/authStore'
import { useChainStore } from '@/store/chainStore'

const links = [
  { to: '/markets', label: 'Рынки' },
  { to: '/portfolio', label: 'Портфель' },
  { to: '/leaderboard', label: 'Лидерборд' },
  { to: '/archive', label: 'Архив' },
  { to: '/explorer', label: 'Эксплорер' },
]

export function Navbar() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.currentUser())
  const logout = useAuthStore((s) => s.logout)
  const balance = useChainStore((s) => (user ? s.balanceOf(user.walletAddress) : 0))
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0a12]/85 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
        <NavLink to="/markets" className="flex items-center gap-2 font-extrabold shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-violet-400 to-emerald-400 shadow-[0_0_10px_2px_rgba(139,92,246,0.55)]" />
          PredictX
          <span className="text-white/30 font-normal text-xs hidden sm:inline">on {RHCHAIN_META.name}</span>
        </NavLink>

        {/* Nav is public — browsing markets/leaderboard/archive/explorer needs
            no account, only placing a bet or creating a market does. */}
        <nav className="hidden md:flex items-center gap-1 text-sm">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                clsx(
                  'px-3 py-1.5 rounded-full transition-colors font-medium',
                  isActive ? 'bg-violet-500/15 text-violet-200' : 'text-white/60 hover:text-white hover:bg-white/5',
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
          <NavLink
            to="/markets/create"
            className={({ isActive }) =>
              clsx(
                'px-3 py-1.5 rounded-full transition-colors font-medium text-emerald-300',
                isActive ? 'bg-emerald-500/15' : 'hover:bg-emerald-500/10',
              )
            }
          >
            + Рынок
          </NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <NavLink
            to="/onchain"
            className={({ isActive }) =>
              clsx(
                'text-xs px-2.5 py-1.5 rounded-full border transition-colors',
                isActive
                  ? 'border-sky-400/50 bg-sky-500/15 text-sky-300'
                  : 'border-white/10 text-white/50 hover:text-sky-300 hover:border-sky-400/30',
              )
            }
          >
            ⛓️ Реальный тестнет
          </NavLink>
          {user ? (
            <>
              <div className="text-sm text-right hidden sm:block">
                <div className="text-white/90 font-semibold">{formatUsd(balance)}</div>
                <div className="text-white/40 text-xs">{RHCHAIN_META.ticker}</div>
              </div>

              <div className="relative">
                <button onClick={() => setMenuOpen((v) => !v)} className="block">
                  <Avatar name={user.displayName} color={user.avatarColor} size={32} />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-10 z-20 w-48 rounded-xl border border-white/10 bg-[#151622] shadow-2xl py-1 text-sm">
                      <NavLink
                        to={`/u/${user.id}`}
                        onClick={() => setMenuOpen(false)}
                        className="block px-3 py-2 text-white/70 hover:bg-white/5 hover:text-white"
                      >
                        Публичный профиль
                      </NavLink>
                      <NavLink
                        to="/settings"
                        onClick={() => setMenuOpen(false)}
                        className="block px-3 py-2 text-white/70 hover:bg-white/5 hover:text-white"
                      >
                        Настройки
                      </NavLink>
                      <button
                        onClick={() => {
                          setMenuOpen(false)
                          logout()
                          navigate('/login')
                        }}
                        className="w-full text-left px-3 py-2 text-rose-400 hover:bg-white/5"
                      >
                        Выйти
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <NavLink
                to="/login"
                className="text-sm px-3 py-1.5 rounded-full border border-white/10 text-white/70 hover:text-white hover:border-white/30 transition-colors"
              >
                Войти
              </NavLink>
              <NavLink
                to="/register"
                className="text-sm px-3 py-1.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:brightness-110 text-white font-semibold transition-all"
              >
                Регистрация
              </NavLink>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
