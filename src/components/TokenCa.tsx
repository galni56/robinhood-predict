import { useState } from 'react'
import { CREAM, INK, PIXEL, YELLOW } from '@/retro/scene'

/** The $HASTE token mint on pump.fun. Empty until the token launches. */
export const PROPHET_TOKEN_CA: string = ''

/** Contract address plate: shows the placeholder until launch, then copies on click. */
export function TokenCa({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  const text = PROPHET_TOKEN_CA
    ? compact ? `CA ${PROPHET_TOKEN_CA.slice(0, 4)}…${PROPHET_TOKEN_CA.slice(-4)}` : PROPHET_TOKEN_CA
    : '[CONTRACT ADDRESS]'
  const copy = () => {
    if (!PROPHET_TOKEN_CA) return
    void navigator.clipboard?.writeText(PROPHET_TOKEN_CA).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      type="button"
      onClick={copy}
      disabled={!PROPHET_TOKEN_CA}
      title={PROPHET_TOKEN_CA ? 'Copy contract address' : undefined}
      className="rx-plate"
      style={{
        fontFamily: PIXEL,
        fontSize: compact ? 9 : 12,
        lineHeight: 1.6,
        color: INK,
        background: CREAM,
        padding: compact ? '6px 10px' : '16px 18px',
        overflowWrap: 'anywhere',
        textAlign: 'left',
        cursor: PROPHET_TOKEN_CA ? 'pointer' : 'default',
      }}
    >
      {copied ? 'COPIED!' : text}
    </button>
  )
}

/** The band under the header on every page: the token's contract address and a copy button. */
export function TokenStrip() {
  const [copied, setCopied] = useState(false)
  const ca = PROPHET_TOKEN_CA
  const copy = () => {
    if (!ca) return
    void navigator.clipboard?.writeText(ca).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div style={{ background: INK, color: CREAM, borderBottom: `4px solid ${INK}` }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '8px clamp(16px, 4vw, 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px 14px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: PIXEL, fontSize: 10, color: YELLOW }}>$HASTE CA</span>
        <span style={{ fontFamily: PIXEL, fontSize: 10, minWidth: 0, overflowWrap: 'anywhere', opacity: ca ? 1 : 0.6 }}>{ca || 'Launching soon on pump.fun'}</span>
        <button
          type="button"
          onClick={copy}
          disabled={!ca}
          className="rx-btn rx-btn-yellow"
          style={{ padding: '4px 10px', fontFamily: PIXEL, fontSize: 9, cursor: ca ? 'pointer' : 'default' }}
        >
          {copied ? 'COPIED!' : 'COPY'}
        </button>
      </div>
    </div>
  )
}
