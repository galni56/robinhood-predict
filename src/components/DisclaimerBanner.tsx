import { AlertIcon } from '@/components/icons'
import { SOLANA_CLUSTER } from '@/solana/config'

/** Shown on every page while the app points at a non-mainnet cluster. */
export function DisclaimerBanner() {
  if (SOLANA_CLUSTER === 'mainnet-beta') return null

  return (
    <div className="flex items-center justify-center gap-2 overflow-hidden bg-[#2a1f16] border-b border-[#F2A65A]/20 text-[#F2A65A]/90 text-xs font-medium text-center py-1.5 px-4">
      <AlertIcon className="w-3.5 h-3.5 shrink-0" />
      <span className="min-w-0 break-words">
        {SOLANA_CLUSTER === 'localnet' ? 'LOCAL VALIDATOR' : 'SOLANA DEVNET'} · NO REAL FUNDS - every stake uses test SOL or test tokens.
      </span>
    </div>
  )
}
