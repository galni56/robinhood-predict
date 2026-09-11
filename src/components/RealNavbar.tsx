import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { robinhoodMainnet } from '@/chain/config'
import { ConnectWalletButton } from '@/components/ConnectWalletButton'

const links = [
  { to: '/onchain', label: 'Markets', end: true },
  { to: '/onchain/portfolio', label: 'Portfolio' },
  { to: '/onchain/leaderboard', label: 'Leaderboard' },
  { to: '/onchain/archive', label: 'Archive' },
]

/** Full-size navbar for the real (mainnet) side of the site — the landing
 * page at "/" and everything under /onchain — mirroring the mock <Navbar>'s
 * visual size and layout so the real side doesn't look like a stripped-down
 * afterthought. Links go to the real onchain routes instead of the mock
 * ones, and the right side shows ConnectWalletButton (address avatar once
 * connected) plus a "Try the demo" link instead of Log in/Sign up, which
 * don't apply to a wallet-based flow. ConnectWalletButton also appears in
 * the collapsed mobile row, not just the hamburger menu — connecting a
 * wallet shouldn't be buried an extra tap deep. */
export function RealNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0a12]/95 xl:bg-[#0a0a12]/85 xl:backdrop-blur">
      <div className="max-w-[1500px] mx-auto px-4 h-14 flex items-center gap-4 xl:gap-6">
        <NavLink to="/" className="flex items-center gap-2 font-extrabold shrink-0">
          <img src={`${import.meta.env.BASE_URL}ProphetMarkets_fun.png`} alt="" className="w-4 h-4 rounded-sm shrink-0" />
          Prophet
          <span className="text-white/30 font-normal text-xs hidden sm:inline">on Robinhood Chain (mainnet)</span>
        </NavLink>

        <nav className="hidden xl:flex items-center gap-1 text-sm shrink-0">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                clsx(
                  'px-3 py-1.5 rounded-full transition-colors font-medium whitespace-nowrap',
                  isActive ? 'bg-[#C6FF3D]/15 text-[#C6FF3D]' : 'text-white/60 hover:text-white hover:bg-white/5',
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
          <NavLink
            to="/onchain/create"
            className={({ isActive }) =>
              clsx(
                'px-3 py-1.5 rounded-full transition-colors font-medium text-emerald-300 whitespace-nowrap',
                isActive ? 'bg-emerald-500/15' : 'hover:bg-emerald-500/10',
              )
            }
          >
            + Market
          </NavLink>
          <a
            href={robinhoodMainnet.blockExplorers.default.url}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-full transition-colors font-medium text-white/40 hover:text-white hover:bg-white/5 whitespace-nowrap"
          >
            Chain explorer ↗
          </a>
          <NavLink
            to="/whitepaper"
            className={({ isActive }) =>
              clsx(
                'px-3 py-1.5 rounded-full transition-colors font-medium whitespace-nowrap',
                isActive ? 'bg-[#C6FF3D]/15 text-[#C6FF3D]' : 'text-white/40 hover:text-white hover:bg-white/5',
              )
            }
          >
            Whitepaper
          </NavLink>
          <a
            href="https://x.com/prophetmarketsx"
            target="_blank"
            rel="noreferrer"
            aria-label="Prophet on X"
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        </nav>

        <div className="ml-auto hidden xl:flex items-center gap-3">
          <NavLink
            to="/demo"
            className="text-xs px-2.5 py-1.5 rounded-full border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors"
          >
            Demo →
          </NavLink>
          <ConnectWalletButton />
        </div>

        {/* Mobile / narrow-desktop: everything collapses behind one toggle,
            except the wallet button itself — that stays one tap away. */}
        <div className="ml-auto flex xl:hidden items-center gap-2">
          <ConnectWalletButton />
          <button
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="w-9 h-9 shrink-0 rounded-lg border border-white/10 flex flex-col items-center justify-center gap-[3px] hover:border-white/30 transition-colors"
          >
            <span className={clsx('block w-4 h-[4px] bg-white/80 transition-transform', mobileOpen && 'translate-y-[5px] rotate-45')} />
            <span className={clsx('block w-4 h-[4px] bg-white/80 transition-opacity', mobileOpen && 'opacity-0')} />
            <span className={clsx('block w-4 h-[4px] bg-white/80 transition-transform', mobileOpen && '-translate-y-[5px] -rotate-45')} />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="xl:hidden border-t border-white/10 bg-[#0a0a12] px-4 py-3 space-y-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
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
            to="/onchain/create"
            onClick={() => setMobileOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-medium text-emerald-300 hover:bg-emerald-500/10"
          >
            + Create market
          </NavLink>
          <a
            href={robinhoodMainnet.blockExplorers.default.url}
            target="_blank"
            rel="noreferrer"
            className="block px-3 py-2 rounded-lg text-sm font-medium text-white/40 hover:bg-white/5"
          >
            Chain explorer ↗
          </a>
          <NavLink
            to="/whitepaper"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              clsx(
                'block px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive ? 'bg-[#C6FF3D]/15 text-[#C6FF3D]' : 'text-white/40 hover:bg-white/5 hover:text-white',
              )
            }
          >
            Whitepaper
          </NavLink>
          <a
            href="https://x.com/prophetmarketsx"
            target="_blank"
            rel="noreferrer"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white/40 hover:bg-white/5 hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            X
          </a>
          <NavLink
            to="/demo"
            onClick={() => setMobileOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-medium text-white/50 hover:bg-white/5"
          >
            Demo →
          </NavLink>
        </div>
      )}
    </header>
  )
}
