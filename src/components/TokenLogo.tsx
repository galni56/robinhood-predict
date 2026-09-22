import { useState } from 'react'

/** A tokenized stock's real logo (from Robinhood's own catalog, see
 * useTokenLogos in robinhoodApi.ts), falling back to the ticker's first
 * letter if there's no logo URL or the image fails to load. `className`
 * carries size/rounding/text-size so each caller matches its own card. */
export function TokenLogo({ ticker, logoUrl, className }: { ticker: string | null | undefined; logoUrl?: string; className: string }) {
  const [failed, setFailed] = useState(false)

  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt=""
        onError={() => setFailed(true)}
        className={`object-contain bg-[#f7f1e3] shrink-0 ${className}`}
      />
    )
  }

  return (
    <span className={`grid place-items-center bg-[#f7f1e3] text-[#241a33] font-display font-bold shrink-0 ${className}`}>
      {(ticker ?? '?')[0]}
    </span>
  )
}
