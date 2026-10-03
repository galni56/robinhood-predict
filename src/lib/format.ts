import { SOL_DECIMALS } from '@/solana/config'
import { solanaTxError } from '@/solana/tx'

export function formatUsd(value: number, digits = 2): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Exact decimal string of a raw integer amount (`formatUnits(1500000000n, 9)` → "1.5"). */
export function formatUnits(raw: bigint, decimals: number): string {
  const negative = raw < 0n
  const value = negative ? -raw : raw
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const fraction = decimals > 0 ? (value % base).toString().padStart(decimals, '0').replace(/0+$/, '') : ''
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

/** Parses a decimal string into a raw integer amount; throws on bad input or excess precision. */
export function parseUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim().replace(',', '.')
  const normalized = trimmed.startsWith('.') ? `0${trimmed}` : trimmed
  const match = /^(\d+)(?:\.(\d*))?$/.exec(normalized)
  if (!match) throw new Error('Enter a number')
  const fraction = match[2] ?? ''
  if (fraction.length > decimals) throw new Error(`At most ${decimals} decimal places`)
  return BigInt(match[1]) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')
}

/** Exact SOL amount from lamports, without a unit. */
export function formatSol(lamports: bigint): string {
  return formatUnits(lamports, SOL_DECIMALS)
}

/** Compact SOL for dense UI while preserving useful precision for small stakes. */
export function formatCompactSol(lamports: bigint, fractionalSignificantDigits = 4): string {
  return formatCompactUnits(lamports, SOL_DECIMALS, 'SOL', fractionalSignificantDigits)
}

/** Compact amount of any token, keeping `fractionalSignificantDigits` after the first significant digit. */
export function formatCompactUnits(raw: bigint, decimals: number, symbol: string, fractionalSignificantDigits = 4): string {
  const exact = formatUnits(raw, decimals)
  const negative = exact.startsWith('-')
  const unsigned = negative ? exact.slice(1) : exact
  const [whole, fraction = ''] = unsigned.split('.')
  const firstSignificant = fraction.search(/[1-9]/)
  const fractionLength = whole !== '0'
    ? fractionalSignificantDigits
    : firstSignificant < 0
      ? 0
      : firstSignificant + fractionalSignificantDigits
  const compactFraction = fraction.slice(0, fractionLength).replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${compactFraction ? `.${compactFraction}` : ''} ${symbol}`
}

/** "$1.23B" style USD for market caps and other large display values. */
export function formatCompactUsd(value: number): string {
  const abs = Math.abs(value)
  const [scaled, suffix]: [number, string] = abs >= 1e12 ? [value / 1e12, 'T'] : abs >= 1e9 ? [value / 1e9, 'B'] : abs >= 1e6 ? [value / 1e6, 'M'] : abs >= 1e3 ? [value / 1e3, 'K'] : [value, '']
  return `$${scaled.toLocaleString('en-US', { maximumFractionDigits: Math.abs(scaled) >= 100 ? 0 : 2 })}${suffix}`
}

/** USD price with enough digits for sub-cent meme tokens. */
export function formatUsdPrice(value: number): string {
  const magnitude = Math.abs(value)
  const maximumFractionDigits = magnitude >= 100 ? 2 : magnitude >= 1 ? 4 : magnitude >= 0.001 ? 6 : 10
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: Math.min(2, maximumFractionDigits), maximumFractionDigits })}`
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

/** Short, user-facing message for a failed wallet or program action. The
 * console keeps the full error (with program logs) for debugging. */
export function shortTxError(e: unknown, context = 'transaction'): string {
  const message = solanaTxError(e)
  if (message !== 'Request rejected in wallet.') console.error(`[tx:${context}]`, e)
  return message
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
