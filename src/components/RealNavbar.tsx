import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { ConnectWalletButton } from '@/components/ConnectWalletButton'
import { PROPHET_TOKEN_CA, TokenCa } from '@/components/TokenCa'
import { PxSprite } from '@/retro/Sprite'
import { logoCoin } from '@/retro/spriteData'
import { CREAM, INK, PINK, PIXEL } from '@/retro/scene'

// The mock's nav, 1:1: cream bar with a 4px ink rule, the pixel logo coin,
// three Pixelify links (active = pink underline bar) and the wallet button.
// Secondary pages live under "More" so the bar stays the mock trio.

const LINKS = [
  { to: '/onchain/races', label: 'Haste' },
  { to: '/onchain/shots', label: 'Shot' },
  { to: '/onchain/pumpswap', label: 'PumpSwap' },
  { to: '/onchain/launch', label: 'Launch' },
  { to: '/?section=how', label: 'How to play' },
]

const MORE = [
  { to: '/onchain/portfolio', label: 'Portfolio' },
  { to: '/onchain/leaderboard', label: 'Leaderboard' },
  { to: '/onchain/archive', label: 'Archive' },
]


export function RealNavbar() {
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()

  const linkStyle = (active: boolean): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 44,
    padding: '0 4px',
    color: INK,
    textDecoration: 'none',
    ...(active ? { boxShadow: `0 4px 0 0 ${PINK}` } : {}),
  })

  return (
    <header
      className="rx-navbar"
      style={{
        position: 'relative',
        zIndex: 20,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px 32px',
        padding: '20px clamp(16px, 4vw, 64px)',
        background: CREAM,
        color: INK,
        borderBottom: `4px solid ${INK}`,
        fontFamily: "'HasteFun Digits', 'Pixelify Sans', 'Courier New', monospace",
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
        <NavLink to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, minHeight: 44, fontFamily: PIXEL, fontSize: 14, color: INK, textDecoration: 'none' }}>
          <PxSprite data={logoCoin} width={32} height={34} />
          <span>HASTEFUN</span>
        </NavLink>
        {/* The placeholder only lives on the landing; in the header it pushed the account button to a second row. */}
        {PROPHET_TOKEN_CA && <TokenCa compact />}
      </div>

      <nav className="rx-navbar-links" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 32px', fontSize: 22, fontWeight: 600 }}>
        {LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} style={linkStyle(link.to.startsWith('/onchain') && location.pathname.startsWith(link.to))}>
            {link.label}
          </NavLink>
        ))}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 4px', background: 'none', border: 0, cursor: 'pointer', font: 'inherit', color: INK }}
          >
            More ▾
          </button>
          {moreOpen && (
            <div
              className="rx-plate"
              style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 30, display: 'flex', flexDirection: 'column', background: CREAM, padding: '8px 0', minWidth: 190 }}
            >
              {MORE.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setMoreOpen(false)}
                  style={{ display: 'block', padding: '8px 18px', fontSize: 20, fontWeight: 600, color: INK, textDecoration: 'none' }}
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </nav>

      <ConnectWalletButton />
    </header>
  )
}
