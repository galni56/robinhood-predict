import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { useAccount } from 'wagmi'
import { robinhoodMainnet } from '@/chain/config'

const links = [
  { to: '/onchain', label: 'Markets', end: true },
  { to: '/onchain/portfolio', label: 'Portfolio' },
  { to: '/onchain/leaderboard', label: 'Leaderboard' },
]

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Full-size navbar for the real (mainnet) side of the site — the landing
 * page at "/" and everything under /onchain — mirroring the mock <Navbar>'s
 * visual size and layout so the real side doesn't look like a stripped-down
 * afterthought. Links go to the real onchain routes instead of the mock
 * ones, and the right side shows a wallet address (if connected) plus a
 * "Try the demo" link instead of Log in/Sign up, which don't apply to a
 * wallet-based flow. */
export function RealNavbar() {
  const { address, isConnected, chain } = useAccount()
  const [mobileOpen, setMobileOpen] = useState(false)
  const onRightChain = chain?.id === robinhoodMainnet.id

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0a12]/95 lg:bg-[#0a0a12]/85 lg:backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4 lg:gap-6">
        <NavLink to="/" className="flex items-center gap-2 font-extrabold shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#C6FF3D] to-emerald-400 shadow-[0_0_10px_2px_rgba(198,255,61,0.55)]" />
          PredictX
          <span className="text-white/30 font-normal text-xs hidden sm:inline">on Robinhood Chain (mainnet)</span>
        </NavLink>

        <nav className="hidden lg:flex items-center gap-1 text-sm">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
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
            to="/onchain/create"
            className={({ isActive }) =>
              clsx(
                'px-3 py-1.5 rounded-full transition-colors font-medium text-emerald-300',
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
            className="px-3 py-1.5 rounded-full transition-colors font-medium text-white/40 hover:text-white hover:bg-white/5"
          >
            Chain explorer ↗
          </a>
        </nav>

        <div className="ml-auto hidden lg:flex items-center gap-3">
          <NavLink
            to="/demo"
            className="text-xs px-2.5 py-1.5 rounded-full border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors"
          >
            Try the demo →
          </NavLink>
          {isConnected && address && (
            <span
              className={clsx(
                'font-mono text-xs px-2.5 py-1.5 rounded-full border',
                onRightChain ? 'border-emerald-400/30 text-emerald-300 bg-emerald-500/10' : 'border-amber-400/30 text-amber-300 bg-amber-500/10',
              )}
            >
              {truncateAddress(address)}
            </span>
          )}
        </div>

        {/* Mobile / narrow-desktop: everything collapses behind one toggle. */}
        <div className="ml-auto flex lg:hidden items-center gap-2">
          {isConnected && address && <span className="font-mono text-xs text-white/60">{truncateAddress(address)}</span>}
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
            to="/demo"
            onClick={() => setMobileOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-medium text-white/50 hover:bg-white/5"
          >
            Try the demo →
          </NavLink>
        </div>
      )}
    </header>
  )
}
