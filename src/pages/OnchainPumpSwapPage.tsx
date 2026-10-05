import { ClusterBanner } from '@/components/ClusterBanner'
import { PumpSwapCoins } from '@/components/PumpSwapCoins'

/** Every PumpSwap coin the game server currently offers in the meme category. */
export function OnchainPumpSwapPage() {
  return (
    <div style={{ minHeight: '100%', background: '#4B37B0' }}>
      <div className="mx-auto max-w-[1200px] px-4 py-8">
        <ClusterBanner className="mb-5" />
        <PumpSwapCoins />
      </div>
    </div>
  )
}
