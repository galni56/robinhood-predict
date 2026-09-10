export function formatUsd(value: number, digits = 2): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatPct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// Wallet/RPC errors (viem's `.message`) dump the full call — args, sender,
// docs link, library version — which is noise to a non-technical user.
// Show just: the wallet-rejected case, a decoded revert reason if one's
// present, or a short generic fallback. Never the raw multi-line dump.
export function shortTxError(e: unknown): string {
  const raw = e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message) : String(e)
  if (/rejected/i.test(raw)) return 'Rejected in wallet'
  const reasonMatch = raw.match(/reason:\s*\n?\s*"?([^"\n]+)"?/i)
  if (reasonMatch) return reasonMatch[1].trim()
  return 'Transaction failed'
}

export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return 'resolved'
  const totalSec = Math.floor(msRemaining / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}
