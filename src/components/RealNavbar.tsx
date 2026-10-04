import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { SOLANA_CLUSTER } from '@/solana/config'
import { ConnectWalletButton } from '@/components/ConnectWalletButton'
import { PROPHET_X_URL } from '@/lib/social'

const links = [
  { to: '/onchain/races', label: 'Races' },
  { to: '/onchain/arenas', label: 'Arena' },
  { to: '/onchain/portfolio', label: 'Portfolio' },
  { to: '/onchain/leaderboard', label: 'Leaderboard' },
  { to: '/onchain/archive', label: 'Archive' },
  { to: '/roadmap', label: 'Roadmap' },
]

const explorerHref = `https://explorer.solana.com/${SOLANA_CLUSTER === 'mainnet-beta' ? '' : `?cluster=${SOLANA_CLUSTER === 'localnet' ? 'custom' : SOLANA_CLUSTER}`}`

/** Site navbar. ConnectWalletButton also appears in the collapsed mobile row,
 * not just the hamburger menu - connecting a wallet shouldn't be buried an
 * extra tap deep. */
export function RealNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-20 border-b-[3px] border-[#191330] bg-[#fbf3e2]">
      <div className="max-w-[1500px] mx-auto px-4 h-16 flex items-center gap-3 xl:gap-4">
        <NavLink to="/" className="flex items-center gap-2 shrink-0">
          <img src={`${import.meta.env.BASE_URL}brand/mascot-pixel.png`} alt="" className="px-art w-8 h-8 shrink-0" />
          <span className="px-font text-[11px] leading-none text-[#191330] sm:text-[13px]">
            Prophet
          </span>
          {SOLANA_CLUSTER !== 'mainnet-beta' && <span className="px-font hidden text-[8px] text-[#ff4f8b] sm:inline">{SOLANA_CLUSTER}</span>}
        </NavLink>

        <nav className="hidden xl:flex items-center gap-0.5 text-[13px] shrink-0">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                clsx(
                  'px-2.5 py-1.5 transition-colors font-extrabold whitespace-nowrap border-2 border-transparent',
                  isActive ? 'border-[#191330] bg-[#ffd23f] text-[#191330]' : 'text-[#191330]/65 hover:text-[#191330] hover:bg-[#191330]/5',
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
          <NavLink
            to="/onchain/races/create"
            className={({ isActive }) =>
              clsx(
                'px-2.5 py-1.5 transition-colors font-extrabold text-[#f7931a] whitespace-nowrap border-2 border-transparent',
                isActive ? 'border-[#191330] bg-[#f7931a]/15' : 'hover:bg-[#f7931a]/10',
              )
            }
          >
            + Race
          </NavLink>
          <NavLink
            to="/onchain/arenas/create"
            className={({ isActive }) =>
              clsx(
                'px-2.5 py-1.5 transition-colors font-extrabold text-[#453a7e] whitespace-nowrap border-2 border-transparent',
                isActive ? 'border-[#191330] bg-[#453a7e]/10' : 'hover:bg-[#453a7e]/10',
              )
            }
          >
            + Arena
          </NavLink>
          <a
            href={explorerHref}
            target="_blank"
            rel="noreferrer"
            className="px-2.5 py-1.5 transition-colors font-extrabold text-[#191330]/45 hover:text-[#191330] hover:bg-[#191330]/5 whitespace-nowrap"
          >
            Solana explorer ↗
          </a>
          <NavLink
            to="/whitepaper"
            className={({ isActive }) =>
              clsx(
                'px-2.5 py-1.5 rounded-full transition-colors font-bold whitespace-nowrap',
                isActive ? 'border-[#191330] bg-[#ffd23f] text-[#191330]' : 'text-[#191330]/45 hover:text-[#191330] hover:bg-[#191330]/5',
              )
            }
          >
            Whitepaper
          </NavLink>
          <a
            href={PROPHET_X_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Prophet on X"
            className="flex h-10 w-10 shrink-0 items-center justify-center border-[3px] border-[#191330] bg-[#fbf3e2] text-[#191330] shadow-[3px_3px_0_#191330] transition-all hover:-translate-y-0.5"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        </nav>

        <div className="ml-auto hidden xl:flex items-center gap-2">
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
            to="/onchain/races/create"
            onClick={() => setMobileOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-medium text-[#F2A65A] hover:bg-[#F2A65A]/10"
          >
            + Create Race
          </NavLink>
          <NavLink
            to="/onchain/arenas/create"
            onClick={() => setMobileOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-medium text-[#B7CEFF] hover:bg-[#7A9FF0]/10"
          >
            + Create Arena
          </NavLink>
          <a
            href={explorerHref}
            target="_blank"
            rel="noreferrer"
            className="block px-3 py-2 rounded-lg text-sm font-bold text-white/40 hover:bg-white/5"
          >
            Solana explorer ↗
          </a>
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
            href={PROPHET_X_URL}
            target="_blank"
            rel="noreferrer"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 rounded-lg border border-[#8B7CF7]/30 bg-[#8B7CF7]/10 px-3 py-2 text-sm font-bold text-white/80 hover:border-[#B3A7FA] hover:bg-[#8B7CF7]/20 hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            X
          </a>
        </div>
      )}
    </header>
  )
}
