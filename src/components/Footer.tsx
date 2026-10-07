import { Link } from 'react-router-dom'
import { SoundToggle } from '@/components/SoundToggle'
import { CREAM, INK } from '@/retro/scene'
import { X_URL } from '@/lib/social'

// The mock's footer: ink band, responsibility line and the underlined link row.

export function Footer() {
  const linkStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 44,
    padding: '0 4px',
    color: CREAM,
    textDecoration: 'underline',
    textUnderlineOffset: 6,
  } as const

  return (
    <footer style={{ background: INK, color: CREAM, padding: '32px clamp(16px, 4vw, 64px)', fontFamily: "'HasteFun Digits', 'Pixelify Sans', 'Courier New', monospace" }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <p style={{ margin: 0, maxWidth: 420, fontSize: 20, lineHeight: 1.35, fontWeight: 500 }}>
            Playing with money carries risk. Play responsibly.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 28px', fontSize: 20, fontWeight: 600 }}>
          <Link to="/whitepaper" style={linkStyle}>Whitepaper</Link>
          <Link to="/terms" style={linkStyle}>Rules</Link>
          {X_URL && <a href={X_URL} target="_blank" rel="noreferrer" style={linkStyle}>X / Twitter</a>}
          <SoundToggle color={CREAM} />
        </div>
      </div>
    </footer>
  )
}
