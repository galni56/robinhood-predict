import { useLocation } from 'react-router-dom'
import { RHCHAIN_META } from '@/market/tokens'

export function DisclaimerBanner() {
  const { pathname } = useLocation()
  const isOnchain = pathname.startsWith('/onchain')

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-200/90 text-xs text-center py-1.5 px-4">
      {isOnchain
        ? '⛓️ Реальный режим: настоящие транзакции на Robinhood Chain testnet через твой кошелёк. Только тестовые токены — не настоящие деньги, контракт не проходил security review.'
        : `⚠️ Демо / прототип на мок-данных. ${RHCHAIN_META.disclaimer}`}
    </div>
  )
}
