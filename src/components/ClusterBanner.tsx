import { InfoBanner } from '@/components/InfoBanner'
import { SOLANA_CLUSTER } from '@/solana/config'
import { PRICE_SERVICE_URL } from '@/solana/services'

/** Marks test clusters so nobody mistakes test SOL games for real ones. */
export function ClusterBanner({ className }: { className?: string }) {
  // Only the local test stand is marked; deployed sites never show a cluster label.
  if (SOLANA_CLUSTER !== 'localnet') return null
  return (
    <InfoBanner tone="warning" className={className}>
      Local validator - test SOL only.{' '}
      {PRICE_SERVICE_URL == null
        ? 'Preview build: live prices and game settlement are not running here yet.'
        : 'Prices come from live mainnet pools.'}
    </InfoBanner>
  )
}
