import { useLocation } from 'react-router-dom'
import { RHCHAIN_META } from '@/market/tokens'

export function DisclaimerBanner() {
  const { pathname } = useLocation()
  const isOnchain = pathname.startsWith('/onchain')

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-200/90 text-xs text-center py-1.5 px-4">
      {isOnchain
        ? '⛓️ Real mode: actual transactions on Robinhood Chain testnet via your wallet. Testnet tokens only — not real money, contract has not had a security audit.'
        : `⚠️ Demo / prototype running on mock data. ${RHCHAIN_META.disclaimer}`}
    </div>
  )
}
