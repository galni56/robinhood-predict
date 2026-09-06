import type { ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { AddressPill, SideBadge, StatusBadge } from '@/components/Pills'
import { formatUsd, timeAgo } from '@/lib/format'
import { useChainStore } from '@/store/chainStore'

const TYPE_LABEL: Record<string, string> = {
  FAUCET: 'Faucet grant',
  BET: 'Bet',
  SETTLEMENT: 'Market payout',
}

export function TxDetailPage() {
  const { hash = '' } = useParams()
  const tx = useChainStore((s) => s.txs[hash])

  if (!tx) return <Navigate to="/explorer" replace />

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <Link to="/explorer" className="text-sm text-white/40 hover:text-white/70">
        ← Explorer
      </Link>

      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Transaction</h1>
        <StatusBadge status={tx.status} />
      </div>

      <div className="bg-[#12121c]/95 border border-white/10 rounded-xl p-4 space-y-3 text-sm">
        <Row label="Hash" value={<span className="font-mono break-all">{tx.hash}</span>} />
        <Row label="Type" value={TYPE_LABEL[tx.type] ?? tx.type} />
        <Row label="From" value={<AddressPill address={tx.from} to={`/explorer/address/${tx.from}`} />} />
        <Row label="To" value={<AddressPill address={tx.to} to={`/explorer/address/${tx.to}`} />} />
        <Row label="Amount" value={<span className="font-mono">{formatUsd(tx.amount)}</span>} />
        {tx.marketId && (
          <Row
            label="Market"
            value={
              <Link to={`/markets/${tx.marketId}`} className="text-emerald-400 hover:underline">
                {tx.marketId}
              </Link>
            }
          />
        )}
        {tx.side && <Row label="Side" value={<SideBadge side={tx.side} />} />}
        <Row label="Block" value={tx.blockNumber != null ? <Link to={`/explorer/block/${tx.blockNumber}`} className="text-emerald-400 hover:underline">#{tx.blockNumber}</Link> : 'in mempool'} />
        <Row label="Time" value={`${new Date(tx.timestamp).toLocaleString()} (${timeAgo(tx.timestamp)})`} />
        <Row label="Memo" value={<span className="text-white/60">{tx.memo}</span>} />
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-white/40 shrink-0">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}
