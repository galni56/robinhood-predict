import { useLocation } from 'react-router-dom'
import { AlertIcon, ChainIcon } from '@/components/icons'
import { RHCHAIN_META } from '@/market/tokens'

export function DisclaimerBanner() {
  const { pathname } = useLocation()
  const isOnchain = pathname === '/' || pathname.startsWith('/onchain') || pathname === '/whitepaper' || pathname === '/terms'

  return (
    <div className="flex items-center justify-center gap-2 bg-[#2a1f16] border-b border-[#F2A65A]/20 text-[#F2A65A]/90 text-xs font-medium text-center py-1.5 px-4">
      {isOnchain ? <ChainIcon className="w-3.5 h-3.5 shrink-0" /> : <AlertIcon className="w-3.5 h-3.5 shrink-0" />}
      <span>
        {isOnchain
          ? 'Real mode: actual transactions on Robinhood Chain mainnet via your wallet. Real USDG, real money - contract has not had an external security audit. Betting currency is USDG only for now; ETH support is planned for a future update.'
          : `Demo / prototype running on mock data. ${RHCHAIN_META.disclaimer}`}
      </span>
    </div>
  )
}
