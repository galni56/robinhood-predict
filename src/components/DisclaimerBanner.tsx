import { AlertIcon } from '@/components/icons'
import { SOLANA_CLUSTER } from '@/solana/config'

/** Shown on every page while the app points at a non-mainnet cluster. */
export function DisclaimerBanner() {
  // Only the local test stand is marked; deployed sites never show a cluster label.
  if (SOLANA_CLUSTER !== 'localnet') return null

  return (
    <div className="px-font flex items-center justify-center gap-2 overflow-hidden border-b-[3px] border-[#191330] bg-[#ffd23f] px-4 py-2 text-center text-[8px] text-[#191330]">
      <AlertIcon className="w-3.5 h-3.5 shrink-0" />
      <span className="min-w-0 break-words leading-relaxed">
        LOCAL VALIDATOR · test SOL only.
      </span>
    </div>
  )
}
