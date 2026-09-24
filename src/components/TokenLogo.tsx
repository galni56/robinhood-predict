import { useState } from 'react'
import { assetIconUrl } from '@/lib/assetIcons'

/** Uses the project's reviewed stock/meme artwork first, an optional remote
 * logo second, then the ticker's first letter as the final fallback. */
export function TokenLogo({ ticker, logoUrl, className }: { ticker: string | null | undefined; logoUrl?: string; className: string }) {
  const resolvedUrl = assetIconUrl(ticker) ?? logoUrl
  const [failedUrl, setFailedUrl] = useState<string>()

  if (resolvedUrl && failedUrl !== resolvedUrl) {
    return (
      <img
        src={resolvedUrl}
        alt={ticker ? `${ticker} logo` : 'Asset logo'}
        onError={() => setFailedUrl(resolvedUrl)}
        className={`object-contain bg-white shrink-0 ${className}`}
      />
    )
  }

  return (
    <span className={`grid place-items-center bg-[#f7f1e3] text-[#241a33] font-display font-bold shrink-0 ${className}`}>
      {(ticker ?? '?')[0]}
    </span>
  )
}
