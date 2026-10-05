import { useState } from 'react'
import { CREAM, INK, PIXEL } from '@/retro/scene'

/** The $PROPHET token mint on pump.fun. Empty until the token launches. */
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
