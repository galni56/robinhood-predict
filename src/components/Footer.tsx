import { useState } from 'react'
import { Link } from 'react-router-dom'
import { piu, setSfxEnabled, sfxEnabled } from '@/lib/sfx'
import { CREAM, INK, PINK } from '@/retro/scene'
import { PROPHET_X_URL } from '@/lib/social'

// The mock's footer: ink band, 18+ square, responsibility line and the
// underlined link row.

export function Footer() {
  const [sound, setSound] = useState(sfxEnabled)
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
          <span
            style={{
              flex: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              fontFamily: "'Press Start 2P', 'Courier New', monospace",
              fontSize: 14,
              color: INK,
              background: PINK,
            }}
          >
            18+
          </span>
          <p style={{ margin: 0, maxWidth: 420, fontSize: 20, lineHeight: 1.35, fontWeight: 500 }}>
            Playing with money carries risk. Play responsibly.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 28px', fontSize: 20, fontWeight: 600 }}>
          <Link to="/terms" style={linkStyle}>Rules</Link>
          <a href={PROPHET_X_URL} target="_blank" rel="noreferrer" style={linkStyle}>X / Twitter</a>
          <button
            type="button"
            onClick={() => {
              setSfxEnabled(!sound)
              setSound(!sound)
              if (!sound) piu()
            }}
            style={{ ...linkStyle, background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}
          >
            Sound: {sound ? 'on' : 'off'}
          </button>
        </div>
      </div>
    </footer>
  )
}
