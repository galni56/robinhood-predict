import clsx from 'clsx'
import { NavLink, Outlet } from 'react-router-dom'
import { robinhoodTestnet } from '@/chain/config'

const links = [
  { to: '/onchain', label: 'Markets', end: true },
  { to: '/onchain/create', label: '+ Create' },
  { to: '/onchain/portfolio', label: 'Portfolio' },
  { to: '/onchain/leaderboard', label: 'Leaderboard' },
]

/** Shared sub-nav for every real-chain page, so the on-chain section reads
 * as one connected product instead of a few loose routes — mirrors the
 * mock app's own nav structure (Markets/Portfolio/Leaderboard), just wired
 * to the deployed contract instead of localStorage. */
export function OnchainLayout() {
  return (
    <div>
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
            href={robinhoodTestnet.blockExplorers.default.url}
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
