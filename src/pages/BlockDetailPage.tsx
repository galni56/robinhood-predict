import type { ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { HashPill, SideBadge, StatusBadge } from '@/components/Pills'
import { formatUsd, timeAgo } from '@/lib/format'
import { useChainStore } from '@/store/chainStore'

export function BlockDetailPage() {
  const { number = '' } = useParams()
  const block = useChainStore((s) => s.blocks.find((b) => b.number === Number(number)))
  const txs = useChainStore((s) => s.txs)

  if (!block) return <Navigate to="/explorer" replace />

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <Link to="/explorer" className="text-sm text-white/40 hover:text-white/70">
        ← Explorer
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">Block #{block.number}</h1>
        <p className="text-white/40 text-sm">{timeAgo(block.timestamp)}</p>
      </div>

      <div className="bg-[#12121c]/95 border border-white/10 rounded-xl p-4 space-y-2 text-sm">
        <Row label="Block hash" value={<HashPill hash={block.hash} />} />
        <Row label="Parent hash" value={block.parentHash === '0x0' ? '—' : <HashPill hash={block.parentHash} />} />
        <Row label="Validator" value={<span className="font-mono text-white/70">{block.validator}</span>} />
        <Row label="Transactions" value={block.txHashes.length} />
      </div>

      <div className="bg-[#12121c]/95 border border-white/10 rounded-xl p-4">
        <h2 className="font-medium mb-3">Transactions</h2>
        <div className="space-y-2">
          {block.txHashes.map((hash) => {
            const tx = txs[hash]
            if (!tx) return null
            return (
              <div key={hash} className="flex items-center justify-between text-sm bg-black/20 border border-white/5 rounded-lg px-3 py-2">
                <HashPill hash={tx.hash} to={`/explorer/tx/${tx.hash}`} />
                {tx.side ? <SideBadge side={tx.side} /> : <span className="text-white/40 text-xs">{tx.type}</span>}
                <span className="font-mono">{formatUsd(tx.amount)}</span>
                <StatusBadge status={tx.status} />
              </div>
            )
          })}
          {block.txHashes.length === 0 && <p className="text-white/30 text-sm text-center py-6">Empty block</p>}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/40">{label}</span>
      <span>{value}</span>
    </div>
  )
}
