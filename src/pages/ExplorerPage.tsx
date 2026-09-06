import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HashPill, StatusBadge } from '@/components/Pills'
import { formatUsd, timeAgo } from '@/lib/format'
import { RHCHAIN_META } from '@/market/tokens'
import { useChainStore } from '@/store/chainStore'

export function ExplorerPage() {
  const blocks = useChainStore((s) => s.blocks)
  const txs = useChainStore((s) => s.txs)
  const mempool = useChainStore((s) => s.mempool)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const recentTxs = Object.values(txs)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20)

  function onSearch(e: FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    if (txs[q]) return navigate(`/explorer/tx/${q}`)
    if (/^\d+$/.test(q)) return navigate(`/explorer/block/${q}`)
    navigate(`/explorer/address/${q}`)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{RHCHAIN_META.name} explorer</h1>
        <p className="text-white/50 text-sm mt-1">
          Every block and transaction from this mock demo, generated live in your browser — public, no account
          needed to look up a hash, block, or wallet.
        </p>
      </div>

      <form onSubmit={onSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by tx hash, block number, or address…"
          className="flex-1 rounded-lg bg-[#12121c]/95 border border-white/10 px-3 py-2 text-sm font-mono outline-none focus:border-emerald-400/60"
        />
        <button className="px-4 rounded-lg bg-white/10 hover:bg-white/15 text-sm transition-colors">Search</button>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Blocks" value={blocks.length} />
        <Stat label="Transactions" value={Object.keys(txs).length} />
        <Stat label="In mempool" value={mempool.length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#12121c]/95 border border-white/10 rounded-xl p-4">
          <h2 className="font-medium mb-3">Latest blocks</h2>
          <div className="space-y-2 max-h-[480px] overflow-y-auto scrollbar-thin pr-1">
            {[...blocks]
              .sort((a, b) => b.number - a.number)
              .map((b) => (
                <button
                  key={b.number}
                  onClick={() => navigate(`/explorer/block/${b.number}`)}
                  className="w-full flex items-center justify-between text-sm bg-black/20 hover:bg-black/30 border border-white/5 rounded-lg px-3 py-2 transition-colors text-left"
                >
                  <span className="font-mono text-white/70">#{b.number}</span>
                  <span className="text-white/40 text-xs">{b.txHashes.length} txs</span>
                  <span className="text-white/30 text-xs">{timeAgo(b.timestamp)}</span>
                </button>
              ))}
          </div>
        </div>

        <div className="bg-[#12121c]/95 border border-white/10 rounded-xl p-4">
          <h2 className="font-medium mb-3">Latest transactions</h2>
          <div className="space-y-2 max-h-[480px] overflow-y-auto scrollbar-thin pr-1">
            {recentTxs.map((tx) => (
              <div key={tx.hash} className="flex items-center justify-between text-sm bg-black/20 border border-white/5 rounded-lg px-3 py-2">
                <HashPill hash={tx.hash} to={`/explorer/tx/${tx.hash}`} />
                <span className="text-white/50 font-mono">{formatUsd(tx.amount)}</span>
                <StatusBadge status={tx.status} />
              </div>
            ))}
            {recentTxs.length === 0 && <p className="text-white/30 text-sm text-center py-6">No transactions yet</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[#12121c]/95 border border-white/10 rounded-xl p-4">
      <div className="text-2xl font-semibold font-mono">{value}</div>
      <div className="text-white/40 text-xs mt-1">{label}</div>
    </div>
  )
}
