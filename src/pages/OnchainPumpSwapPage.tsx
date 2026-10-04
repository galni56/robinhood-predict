import { ClusterBanner } from '@/components/ClusterBanner'
import { PumpSwapCoins } from '@/components/PumpSwapCoins'

/** Every PumpSwap coin the game server currently offers in the meme category. */
export function OnchainPumpSwapPage() {
  return (
    <div style={{ minHeight: '100%', background: '#4B37B0' }}>
      <div className="mx-auto max-w-[1200px] px-4 py-8">
        <ClusterBanner className="mb-5" />
        <PumpSwapCoins />
        <p className="mt-6" style={{ color: '#FFF6DF', fontSize: 15, opacity: 0.7 }}>
          Filter: a real pump.fun coin paired with SOL or USDC, pool liquidity of at least $10K and older than one hour; the 15 most liquid are kept. Low-liquidity coins move fast - games settle on the signed pool price at the boundary block.
        </p>
      </div>
    </div>
  )
}
