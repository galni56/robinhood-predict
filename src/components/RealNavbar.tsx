import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { isLocalAssetRace, robinhoodMainnet } from '@/chain/config'
import { ConnectWalletButton } from '@/components/ConnectWalletButton'

const links = [
  { to: '/onchain', label: 'Markets', end: true },
  { to: '/onchain/races', label: 'Races' },
  { to: '/onchain/arenas', label: 'Arena' },
  { to: '/onchain/portfolio', label: 'Portfolio' },
  { to: '/onchain/leaderboard', label: 'Leaderboard' },
  { to: '/onchain/archive', label: 'Archive' },
]

/** Full-size navbar for the real (mainnet) side of the site - the landing
 * page at "/" and everything under /onchain - mirroring the mock <Navbar>'s
 * visual size and layout so the real side doesn't look like a stripped-down
 * afterthought. Links go to the real onchain routes instead of the mock
 * ones, and the right side shows ConnectWalletButton (address avatar once
 * connected) plus a "Try the demo" link instead of Log in/Sign up, which
 * don't apply to a wallet-based flow. ConnectWalletButton also appears in
 * the collapsed mobile row, not just the hamburger menu - connecting a
 * wallet shouldn't be buried an extra tap deep. */
export function RealNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()
  const localRaceRoute = isLocalAssetRace && pathname.startsWith('/onchain/races')

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#17111f]/95 xl:bg-[#17111f]/85 xl:backdrop-blur">
      <div className="max-w-[1500px] mx-auto px-4 h-16 flex items-center gap-4 xl:gap-6">
        <NavLink to="/" className="flex items-center gap-2 shrink-0">
          <img src={`${import.meta.env.BASE_URL}brand/mascot-small.png`} alt="" className="w-9 h-9 shrink-0" />
          <span className="font-display font-bold text-xl leading-none text-[#f7f1e3]">
            Prophet<span className="hidden sm:inline"> Markets</span><span className="text-[#8B7CF7]">.</span>
          </span>
          {localRaceRoute && <span className="hidden text-xs font-normal text-white/30 sm:inline">on Local Anvil (test only)</span>}
        </NavLink>

        <nav className="hidden xl:flex items-center gap-1 text-sm shrink-0">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                clsx(
                  'px-3 py-1.5 rounded-full transition-colors font-bold whitespace-nowrap',
                  isActive ? 'bg-[#8B7CF7]/15 text-[#B3A7FA]' : 'text-white/60 hover:text-white hover:bg-white/5',
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
                'px-3 py-1.5 rounded-full transition-colors font-bold text-[#F2A65A] whitespace-nowrap',
                isActive ? 'bg-[#F2A65A]/15' : 'hover:bg-[#F2A65A]/10',
              )
            }
          >
            + Market
          </NavLink>
          <NavLink
            to="/onchain/races/create"
            className={({ isActive }) =>
              clsx(
                'px-3 py-1.5 rounded-full transition-colors font-medium text-[#8B7CF7] whitespace-nowrap',
                isActive ? 'bg-[#8B7CF7]/15' : 'hover:bg-[#8B7CF7]/10',
              )
            }
          >
            + Race
          </NavLink>
          <NavLink
            to="/onchain/arenas/create"
            className={({ isActive }) =>
              clsx(
                'px-3 py-1.5 rounded-full transition-colors font-medium text-emerald-300 whitespace-nowrap',
                isActive ? 'bg-emerald-300/15' : 'hover:bg-emerald-300/10',
              )
            }
          >
            + Arena
          </NavLink>
          {!localRaceRoute && <a
            href={robinhoodMainnet.blockExplorers.default.url}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-full transition-colors font-bold text-white/40 hover:text-white hover:bg-white/5 whitespace-nowrap"
          >
            Chain explorer ↗
          </a>}
          <NavLink
            to="/whitepaper"
            className={({ isActive }) =>
              clsx(
                'px-3 py-1.5 rounded-full transition-colors font-bold whitespace-nowrap',
                isActive ? 'bg-[#8B7CF7]/15 text-[#B3A7FA]' : 'text-white/40 hover:text-white hover:bg-white/5',
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
            className="text-xs px-2.5 py-1.5 rounded-full border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors font-bold"
          >
            Demo →
          </NavLink>
          <ConnectWalletButton />
        </div>

        {/* Mobile / narrow-desktop: everything collapses behind one toggle,
            except the wallet button itself - that stays one tap away. */}
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
        <div className="xl:hidden border-t border-white/10 bg-[#17111f] px-4 py-3 space-y-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'block px-3 py-2 rounded-lg text-sm font-bold transition-colors',
                  isActive ? 'bg-[#8B7CF7]/15 text-[#B3A7FA]' : 'text-white/70 hover:bg-white/5 hover:text-white',
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
          <NavLink
            to="/onchain/create"
            onClick={() => setMobileOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-bold text-[#F2A65A] hover:bg-[#F2A65A]/10"
          >
            + Create market
          </NavLink>
          <NavLink
            to="/onchain/races/create"
            onClick={() => setMobileOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-medium text-[#8B7CF7] hover:bg-[#8B7CF7]/10"
          >
            + Create Race
          </NavLink>
          <NavLink
            to="/onchain/arenas/create"
            onClick={() => setMobileOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-medium text-emerald-300 hover:bg-emerald-300/10"
          >
            + Create Arena
          </NavLink>
          {!localRaceRoute && <a
            href={robinhoodMainnet.blockExplorers.default.url}
            target="_blank"
            rel="noreferrer"
            className="block px-3 py-2 rounded-lg text-sm font-bold text-white/40 hover:bg-white/5"
          >
            Chain explorer ↗
          </a>}
          <NavLink
            to="/whitepaper"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              clsx(
                'block px-3 py-2 rounded-lg text-sm font-bold transition-colors',
                isActive ? 'bg-[#8B7CF7]/15 text-[#B3A7FA]' : 'text-white/40 hover:bg-white/5 hover:text-white',
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
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-white/40 hover:bg-white/5 hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            X
          </a>
          <NavLink
            to="/demo"
            onClick={() => setMobileOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-bold text-white/50 hover:bg-white/5"
          >
            Demo →
          </NavLink>
        </div>
      )}
    </header>
  )
}
