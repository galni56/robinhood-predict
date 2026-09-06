import { Link, useParams } from 'react-router-dom'
import { HashPill, SideBadge, StatusBadge } from '@/components/Pills'
import { formatUsd, timeAgo } from '@/lib/format'
import { TOKENS } from '@/market/tokens'
import { useChainStore } from '@/store/chainStore'

export function AddressDetailPage() {
  const { address = '' } = useParams()
  const balance = useChainStore((s) => s.balanceOf(address))
  // Stable function reference, called below — see note in
  // MarketDetailPage.tsx for why calling it directly inside the selector
  // would cause an infinite re-render loop.
  const txsForAddress = useChainStore((s) => s.txsForAddress)
  const txs = txsForAddress(address)
  const token = TOKENS.find((t) => t.contractAddress === address)

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <Link to="/explorer" className="text-sm text-white/40 hover:text-white/70">
        ← Эксплорер
      </Link>

      <div>
        <h1 className="text-xl font-semibold font-mono break-all">{address}</h1>
        {token && (
          <p className="text-emerald-400 text-sm mt-1">
            Контракт токена {token.symbol} ({token.name})
          </p>
        )}
      </div>

      <div className="bg-[#12121c]/95 border border-white/10 rounded-xl p-4">
        <div className="text-white/40 text-xs">Баланс</div>
        <div className="text-2xl font-mono font-semibold">{formatUsd(balance)}</div>
      </div>

      <div className="bg-[#12121c]/95 border border-white/10 rounded-xl p-4">
        <h2 className="font-medium mb-3">История транзакций ({txs.length})</h2>
        <div className="space-y-2 max-h-[520px] overflow-y-auto scrollbar-thin pr-1">
          {txs.map((tx) => (
            <div key={tx.hash} className="flex items-center justify-between text-sm bg-black/20 border border-white/5 rounded-lg px-3 py-2">
              <HashPill hash={tx.hash} to={`/explorer/tx/${tx.hash}`} />
              <span className="text-white/40 text-xs">{tx.from === address ? 'исходящая' : 'входящая'}</span>
              {tx.side ? <SideBadge side={tx.side} /> : <span className="text-white/40 text-xs">{tx.type}</span>}
              <span className="font-mono">{formatUsd(tx.amount)}</span>
              <StatusBadge status={tx.status} />
              <span className="text-white/30 text-xs">{timeAgo(tx.timestamp)}</span>
            </div>
          ))}
          {txs.length === 0 && <p className="text-white/30 text-sm text-center py-6">Нет транзакций для этого адреса</p>}
        </div>
      </div>
    </div>
  )
}
