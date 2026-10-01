type ProductTone = 'market' | 'race' | 'arena'

const TONE_CLASSES: Record<ProductTone, string> = {
  market: 'text-[#C9C0FF] hover:bg-[#8B7CF7]/15 hover:text-white',
  race: 'text-[#F2A65A] hover:bg-[#F2A65A]/15 hover:text-[#FFD4A4]',
  arena: 'text-[#B7CEFF] hover:bg-[#7A9FF0]/15 hover:text-white',
}

export function PriceSourceLink({
  href,
  symbol,
  tone,
  label = 'View chart',
  className = '',
}: {
  href?: string
  symbol?: string
  tone: ProductTone
  label?: string
  className?: string
}) {
  if (!href) return null
  const assetLabel = symbol ? `${symbol} ` : ''
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`View ${assetLabel}price chart for the exact reviewed settlement pool on Uniswap (opens in a new tab)`}
      onClick={(event) => event.stopPropagation()}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full text-xs font-bold transition-colors ${TONE_CLASSES[tone]} ${className}`}
    >
      {label} <span aria-hidden="true">↗</span>
    </a>
  )
}
