import { Link } from 'react-router-dom'
import { shortHash } from '@/lib/hash'

export function HashPill({ hash, to }: { hash: string; to?: string }) {
  const content = (
    <span className="font-mono text-xs px-2 py-1 rounded-md bg-white/5 border border-white/10 text-emerald-300/90 hover:bg-white/10 transition-colors">
      {shortHash(hash)}
    </span>
  )
  if (!to) return content
  return <Link to={to}>{content}</Link>
}

export function AddressPill({ address, to, label }: { address: string; to?: string; label?: string }) {
  const content = (
    <span className="font-mono text-xs px-2 py-1 rounded-md bg-white/5 border border-white/10 text-sky-300/90 hover:bg-white/10 transition-colors">
      {label ? `${label} ` : ''}
      {shortHash(address)}
    </span>
  )
  if (!to) return content
  return <Link to={to}>{content}</Link>
}

export function StatusBadge({ status }: { status: 'pending' | 'confirmed' }) {
  return (
    <span
      className={
        status === 'confirmed'
          ? 'text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
          : 'text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse'
      }
    >
      {status === 'confirmed' ? 'confirmed' : 'pending'}
    </span>
  )
}

export function SideBadge({ side }: { side: 'YES' | 'NO' }) {
  return (
    <span
      className={
        side === 'YES'
          ? 'text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
          : 'text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30'
      }
    >
      {side === 'YES' ? 'ЗА · YES' : 'ПРОТИВ · NO'}
    </span>
  )
}
