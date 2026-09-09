import clsx from 'clsx'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { robinhoodMainnet } from '@/chain/config'

const links = [
  { to: '/onchain', label: 'Markets', end: true },
  { to: '/onchain/create', label: '+ Create' },
  { to: '/onchain/portfolio', label: 'Portfolio' },
  { to: '/onchain/leaderboard', label: 'Leaderboard' },
]

/** Top bar + shared sub-nav for the whole on-chain section — this is the
 * site's front door now (see App.tsx: "/" redirects here), so it carries
 * its own brand header instead of relying on the mock app's <Navbar>,
 * whose links and Log in/Sign up buttons don't apply to a wallet-based
 * flow. The mock demo stays one click away via the "Try the demo" link. */
export function OnchainLayout() {
  return (
    <div>
      <div className="border-b border-white/10 bg-[#0a0a12]">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link to="/onchain" className="flex items-center gap-2 font-extrabold shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#C6FF3D] to-emerald-400 shadow-[0_0_10px_2px_rgba(198,255,61,0.55)]" />
            PredictX
            <span className="text-white/30 font-normal text-xs hidden sm:inline">on Robinhood Chain (mainnet)</span>
          </Link>
          <Link to="/demo" className="text-xs text-white/40 hover:text-white/70 shrink-0">
            Try the demo →
          </Link>
        </div>
      </div>
      <div className="border-b border-white/10 bg-[#0a0a12]">
        <div className="max-w-2xl mx-auto px-4 h-11 flex items-center gap-1 overflow-x-auto scrollbar-thin">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                clsx(
                  'shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors',
                  isActive ? 'bg-[#C6FF3D]/15 text-[#C6FF3D]' : 'text-white/50 hover:text-white hover:bg-white/5',
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
          <a
            href={robinhoodMainnet.blockExplorers.default.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto shrink-0 text-xs text-white/40 hover:text-white/70 px-3"
          >
            Chain explorer ↗
          </a>
        </div>
      </div>
      <Outlet />
    </div>
  )
}
