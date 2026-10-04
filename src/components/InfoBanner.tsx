import type { ReactNode } from 'react'

const TONES = {
  // purple: neutral product information
  info: 'border-[#ff4f8b]/25 bg-[#ff4f8b]/10 text-[#ff4f8b]',
  // orange: preview/local/caution notes
  warning: 'border-[#ffd23f]/25 bg-[#ffd23f]/10 text-[#ffd23f]',
} as const

/** The one page-level notice strip (preview mode, local network, legacy
 * contract, ...) so every page renders it identically instead of repeating
 * the class soup. Presentation only. */
export function InfoBanner({
  tone = 'info',
  className = 'mb-6',
  children,
}: {
  tone?: keyof typeof TONES
  className?: string
  children: ReactNode
}) {
  return <div className={`rounded-none border px-4 py-3 text-sm font-medium ${TONES[tone]} ${className}`}>{children}</div>
}
