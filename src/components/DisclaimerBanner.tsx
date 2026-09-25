import { useLocation } from 'react-router-dom'
import { isLocalAssetRace } from '@/chain/config'
import { AlertIcon, ChainIcon } from '@/components/icons'
import { RHCHAIN_META } from '@/market/tokens'

export function DisclaimerBanner() {
  const { pathname } = useLocation()
  const isOnchain = pathname === '/' || pathname.startsWith('/onchain') || pathname === '/whitepaper' || pathname === '/terms'
  const isLocalRaceRoute = isLocalAssetRace && pathname.startsWith('/onchain/races')

  return (
    <div className="flex items-center justify-center gap-2 overflow-hidden bg-[#2a1f16] border-b border-[#F2A65A]/20 text-[#F2A65A]/90 text-xs font-medium text-center py-1.5 px-4">
      {isOnchain && !isLocalRaceRoute ? <ChainIcon className="w-3.5 h-3.5 shrink-0" /> : <AlertIcon className="w-3.5 h-3.5 shrink-0" />}
      <span className="min-w-0 break-words">
        {isLocalRaceRoute
          ? 'LOCAL TEST NETWORK · NO REAL FUNDS - Asset Race transactions use Anvil and test ETH only.'
          : isOnchain
          ? 'Real mode: wagers use native ETH once the reviewed contracts are configured; stock prices remain quoted in USDG. Real money - contracts have not had an external security audit.'
          : `Demo / prototype running on mock data. ${RHCHAIN_META.disclaimer}`}
      </span>
    </div>
  )
}
