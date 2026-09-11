import { useLocation } from 'react-router-dom'
import { RHCHAIN_META } from '@/market/tokens'

export function DisclaimerBanner() {
  const { pathname } = useLocation()
  const isOnchain = pathname === '/' || pathname.startsWith('/onchain') || pathname === '/whitepaper' || pathname === '/terms'

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-200/90 text-xs text-center py-1.5 px-4">
      {isOnchain
        ? '⛓️ Real mode: actual transactions on Robinhood Chain mainnet via your wallet. Real USDG, real money — contract has not had an external security audit. Betting currency is USDG only for now; ETH support is planned for a future update.'
        : `⚠️ Demo / prototype running on mock data. ${RHCHAIN_META.disclaimer}`}
    </div>
  )
}
