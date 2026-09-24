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

  const label = state === 'copied' ? 'Link copied!' : state === 'error' ? 'Copy failed' : 'Invite link'
  const hint = state === 'copied' ? 'Paste it anywhere' : state === 'error' ? 'Tap to try again' : 'Copy game link'

  return (
    <button
      type="button"
      onClick={copyInvite}
      className={`group relative inline-flex h-[50px] min-w-[210px] items-center gap-2.5 overflow-hidden rounded-xl border border-[#8B7CF7]/45 bg-gradient-to-r from-[#3B2D53] to-[#2E2442] px-3 py-2 text-left text-white shadow-[0_10px_24px_-16px_rgba(139,124,247,0.8)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#8B7CF7]/70 hover:bg-[#3B2D53] hover:shadow-[0_12px_28px_-16px_rgba(139,124,247,0.9)] active:translate-y-0 ${className}`}
      aria-label="Copy invite link"
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#8B7CF7]/10 to-transparent" />
      <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#8B7CF7]/30 bg-[#8B7CF7]/15 transition-transform duration-300 group-hover:rotate-3 group-hover:scale-105">
        {state === 'copied' ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12 4 4L19 6" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17 17 7" />
            <path d="M7 7h10v10" />
          </svg>
        )}
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block font-display text-sm font-bold leading-tight" aria-live="polite">{label}</span>
        <span className="block text-[10px] font-semibold leading-tight text-[#B3A7FA]/75">{hint}</span>
      </span>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="relative h-4 w-4 shrink-0 fill-none stroke-current text-white/65 transition-transform duration-300 group-hover:translate-x-0.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
      </svg>
    </button>
  )
}
