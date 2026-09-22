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
const REVERT_MESSAGES: Record<string, string> = {
  'target too close to current price':
    'Target is too close to the current price. It must be at least 2% above or below it.',
  'target too far from current price':
    'Target is too far from the current price for this deadline (or the price just moved). Pick a target a bit closer.',
  'market duration too short': 'The deadline is too soon. Pick a longer duration.',
  'stale price feed': "The price feed hasn't updated recently. Try again in a minute.",
  'feed not allowlisted': "This price feed isn't supported.",
  'betting closed': 'Betting on this market has closed.',
  'market not open': 'This market is no longer open.',
  'already bet this side': "You've already bet on this side of this market.",
  'exceeds max stake per side': 'Maximum stake is $50 per side of a market.',
  'too early': "The deadline hasn't passed yet, so this market can't be resolved.",
  'not resolved': "This market hasn't been resolved yet.",
  'already claimed': "You've already claimed this payout.",
  'no winning stake': 'You have no winning stake in this market.',
  'not cancelled': "This market wasn't cancelled, so there is nothing to refund.",
  'nothing to refund': 'You have nothing to refund on this market.',
}

// Wallets sometimes swallow the real revert reason and return only a generic
// placeholder; showing that verbatim tells the user nothing.
const GENERIC_WALLET_ERROR = /^(unexpected error|internal (json-rpc )?error|an internal error was received\.?|unknown error)$/i

export function shortTxError(e: unknown): string {
  const raw = e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message) : String(e)
  if (/rejected/i.test(raw)) return 'Rejected in wallet'
  const reasonMatch = raw.match(/reason:\s*\n?\s*"?([^"\n]+)"?/i)
  if (reasonMatch) {
    const reason = reasonMatch[1].trim()
    if (GENERIC_WALLET_ERROR.test(reason)) return 'Transaction would fail, but the wallet did not say why. Check the values and try again.'
    return REVERT_MESSAGES[reason.toLowerCase()] ?? reason
  }
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
