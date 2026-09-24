import { useEffect, useRef, useState } from 'react'

type ShareGameKind = 'market' | 'race' | 'arena'

const SHARE_ORIGIN = 'https://prophetmarkets.fun'

function copyWithTextarea(value: string) {
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Copy failed')
}

function shareInviteUrl(kind: ShareGameKind, id: bigint | string | number) {
  return `${SHARE_ORIGIN}/share/${kind}/${id.toString()}`
}

export function ShareInviteButton({ kind, id, className = '' }: {
  kind: ShareGameKind
  id: bigint | string | number
  className?: string
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle')
  const resetTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (resetTimer.current != null) window.clearTimeout(resetTimer.current)
  }, [])

  async function copyInvite() {
    const url = shareInviteUrl(kind, id)
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url)
      else copyWithTextarea(url)
      setState('copied')
    } catch {
      try {
        copyWithTextarea(url)
        setState('copied')
      } catch {
        setState('error')
      }
    }
    if (resetTimer.current != null) window.clearTimeout(resetTimer.current)
    resetTimer.current = window.setTimeout(() => setState('idle'), 2_000)
  }

  return (
    <button
      type="button"
      onClick={copyInvite}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-bold text-white/65 transition-colors hover:border-[#8B7CF7]/45 hover:bg-[#8B7CF7]/10 hover:text-white ${className}`}
      aria-label="Copy invite link"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
      </svg>
      {state === 'copied' ? 'Invite link copied' : state === 'error' ? 'Copy failed' : 'Copy invite link'}
    </button>
  )
}
