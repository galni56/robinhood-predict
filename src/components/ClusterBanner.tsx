import { InfoBanner } from '@/components/InfoBanner'
import { SOLANA_CLUSTER } from '@/solana/config'

/** Marks test clusters so nobody mistakes test SOL games for real ones. */
export function ClusterBanner({ className }: { className?: string }) {
  if (SOLANA_CLUSTER === 'mainnet-beta') return null
  return (
    <InfoBanner tone="warning" className={className}>
      Solana {SOLANA_CLUSTER} - test games with test SOL, no real funds. Prices come from live mainnet pools.
    </InfoBanner>
  )
}
