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
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0c10]/90 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
        <NavLink to="/markets" className="flex items-center gap-2 font-semibold shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.6)]" />
          PredictX
          <span className="text-white/30 font-normal text-xs hidden sm:inline">on {RHCHAIN_META.name}</span>
        </NavLink>

        {user && (
          <nav className="flex items-center gap-1 text-sm">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  clsx(
                    'px-3 py-1.5 rounded-md transition-colors',
                    isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5',
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
                  'px-3 py-1.5 rounded-md transition-colors text-emerald-300',
                  isActive ? 'bg-emerald-500/15' : 'hover:bg-emerald-500/10',
                )
              }
            >
              + Рынок
            </NavLink>
          </nav>
        )}

        <div className="ml-auto flex items-center gap-3">
          <NavLink
            to="/onchain"
            className={({ isActive }) =>
              clsx(
                'text-xs px-2.5 py-1.5 rounded-md border transition-colors',
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
                <div className="text-white/90 font-medium">{formatUsd(balance)}</div>
                <div className="text-white/40 text-xs">{RHCHAIN_META.ticker}</div>
              </div>

              <div className="relative">
                <button onClick={() => setMenuOpen((v) => !v)} className="block">
                  <Avatar name={user.displayName} color={user.avatarColor} size={32} />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-10 z-20 w-48 rounded-lg border border-white/10 bg-[#16171d] shadow-xl py-1 text-sm">
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
            <NavLink
              to="/login"
              className="text-sm px-3 py-1.5 rounded-md border border-white/10 text-white/70 hover:text-white hover:border-white/30 transition-colors"
            >
              Войти
            </NavLink>
          )}
        </div>
      </div>
    </header>
  )
}
