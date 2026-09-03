import { RHCHAIN_META } from '@/market/tokens'

export function DisclaimerBanner() {
  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-200/90 text-xs text-center py-1.5 px-4">
      ⚠️ Демо / прототип на мок-данных. {RHCHAIN_META.disclaimer}
    </div>
  )
}
