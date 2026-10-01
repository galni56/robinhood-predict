import type { ReactNode } from 'react'

const TONES = {
  // purple: neutral product information
  info: 'border-[#8B7CF7]/25 bg-[#8B7CF7]/10 text-[#B3A7FA]',
  // orange: preview/local/caution notes
  warning: 'border-[#F2A65A]/25 bg-[#F2A65A]/10 text-[#F2A65A]',
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
  return <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${TONES[tone]} ${className}`}>{children}</div>
}
