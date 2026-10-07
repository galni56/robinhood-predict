import { useState } from 'react'
import { PIXEL } from '@/retro/scene'

/** Copies a link to this room (hash route) for friends. */
export function InviteButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}${import.meta.env.BASE_URL}#${path}`
  async function invite() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('Copy this link', url)
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <button type="button" onClick={invite} className="rx-btn rx-btn-yellow" title={url} style={{ padding: '8px 12px', fontFamily: PIXEL, fontSize: 10 }}>
      {copied ? 'LINK COPIED!' : 'INVITE'}
    </button>
  )
}
