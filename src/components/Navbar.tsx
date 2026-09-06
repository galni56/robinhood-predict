import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Avatar } from '@/components/Avatar'
import { formatUsd } from '@/lib/format'
import { RHCHAIN_META } from '@/market/tokens'
import { useAuthStore } from '@/store/authStore'
import { useChainStore } from '@/store/chainStore'

const links = [
  { to: '/markets', label: 'Markets' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/archive', label: 'Archive' },
  { to: '/explorer', label: 'Explorer' },
]

// Full nav + account cluster no longer fits one row once both are always
// visible (browsing is public now, so there's a "Log in"+"Sign up" pair
// competing for the same space as the links) — collapse into a hamburger
// below `lg` instead of letting things overflow/cram.
export function Navbar() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.currentUser())
  const logout = useAuthStore((s) => s.logout)
  const balance = useChainStore((s) => (user ? s.balanceOf(user.walletAddress) : 0))
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0a12]/95 lg:bg-[#0a0a12]/85 lg:backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4 lg:gap-6">
        <NavLink to="/" className="flex items-center gap-2 font-extrabold shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#C6FF3D] to-emerald-400 shadow-[0_0_10px_2px_rgba(198,255,61,0.55)]" />
          PredictX
          <span className="text-white/30 font-normal text-xs hidden sm:inline">on {RHCHAIN_META.name}</span>
        </NavLink>

        {/* Nav is public — browsing markets/leaderboard/archive/explorer needs
            no account, only placing a bet or creating a market does. */}
        <nav className="hidden lg:flex items-center gap-1 text-sm">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                clsx(
                  'px-3 py-1.5 rounded-full transition-colors font-medium',
                  isActive ? 'bg-[#C6FF3D]/15 text-[#C6FF3D]' : 'text-white/60 hover:text-white hover:bg-white/5',
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
            + Market
          </NavLink>
        </nav>

        <div className="ml-auto hidden lg:flex items-center gap-3">
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
            ⛓️ Live testnet
          </NavLink>
          {user ? (
            <>
              <div className="text-sm text-right">
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
                        Public profile
                      </NavLink>
                      <NavLink
                        to="/settings"
                        onClick={() => setMenuOpen(false)}
                        className="block px-3 py-2 text-white/70 hover:bg-white/5 hover:text-white"
                      >
                        Settings
                      </NavLink>
                      <button
                        onClick={() => {
                          setMenuOpen(false)
                          logout()
                          navigate('/login')
                        }}
                        className="w-full text-left px-3 py-2 text-rose-400 hover:bg-white/5"
                      >
                        Log out
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
                Log in
              </NavLink>
              <NavLink
                to="/register"
                className="text-sm px-3 py-1.5 rounded-full bg-gradient-to-r from-[#C6FF3D] to-[#8FBF1F] hover:brightness-110 text-black font-semibold transition-all"
              >
                Sign up
              </NavLink>
            </div>
          )}
        </div>

        {/* Mobile / narrow-desktop: everything collapses behind one toggle. */}
        <div className="ml-auto flex lg:hidden items-center gap-2">
          {user && (
            <div className="text-sm text-right hidden sm:block">
              <div className="text-white/90 font-semibold">{formatUsd(balance)}</div>
            </div>
          )}
          {user ? (
            <Avatar name={user.displayName} color={user.avatarColor} size={28} />
          ) : (
            <NavLink
              to="/register"
              className="text-xs px-2.5 py-1.5 rounded-full bg-gradient-to-r from-[#C6FF3D] to-[#8FBF1F] text-black font-semibold"
            >
              Get started
            </NavLink>
          )}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="w-9 h-9 shrink-0 rounded-lg border border-white/10 flex flex-col items-center justify-center gap-[3px] hover:border-white/30 transition-colors"
          >
            <span className={clsx('block w-4 h-[1.5px] bg-white/80 transition-transform', mobileOpen && 'translate-y-[5px] rotate-45')} />
            <span className={clsx('block w-4 h-[1.5px] bg-white/80 transition-opacity', mobileOpen && 'opacity-0')} />
            <span className={clsx('block w-4 h-[1.5px] bg-white/80 transition-transform', mobileOpen && '-translate-y-[5px] -rotate-45')} />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-white/10 bg-[#0a0a12] px-4 py-3 space-y-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'block px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'bg-[#C6FF3D]/15 text-[#C6FF3D]' : 'text-white/70 hover:bg-white/5 hover:text-white',
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
          <NavLink
            to="/markets/create"
            onClick={() => setMobileOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-medium text-emerald-300 hover:bg-emerald-500/10"
          >
            + Create market
          </NavLink>
          <NavLink
            to="/onchain"
            onClick={() => setMobileOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-medium text-sky-300 hover:bg-sky-500/10"
          >
            ⛓️ Live testnet
          </NavLink>

          <div className="pt-2 mt-2 border-t border-white/10">
            {user ? (
              <>
                <NavLink
                  to={`/u/${user.id}`}
                  onClick={() => setMobileOpen(false)}
                  className="block px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/5 hover:text-white"
                >
                  Public profile
                </NavLink>
                <NavLink
                  to="/settings"
                  onClick={() => setMobileOpen(false)}
                  className="block px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/5 hover:text-white"
                >
                  Settings
                </NavLink>
                <button
                  onClick={() => {
                    setMobileOpen(false)
                    logout()
                    navigate('/login')
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-rose-400 hover:bg-white/5"
                >
                  Log out
                </button>
              </>
            ) : (
              <div className="flex gap-2 px-1">
                <NavLink
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 text-center text-sm px-3 py-2 rounded-lg border border-white/10 text-white/70 hover:text-white hover:border-white/30"
                >
                  Log in
                </NavLink>
                <NavLink
                  to="/register"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 text-center text-sm px-3 py-2 rounded-lg bg-gradient-to-r from-[#C6FF3D] to-[#8FBF1F] text-black font-semibold"
                >
                  Sign up
                </NavLink>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
