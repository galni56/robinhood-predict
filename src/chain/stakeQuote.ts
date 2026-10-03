import { LAMPORTS_PER_SOL, SOL_DECIMALS } from '@/solana/config'
import type { SolUsdQuote } from '@/chain/livePrices'

// Stakes are entered in USD or SOL and always sent as exact lamports. A USD
// entry is converted once, at the displayed SOL/USD rate, and that frozen
// quote is what the wallet signs. The $1–$50 range is a product guardrail on
// top of each game's on-chain minimum and maximum.

export const USD_CENTS_SCALE = 100n
export const MIN_STAKE_USD_CENTS = 100n
export const MAX_STAKE_USD_CENTS = 5_000n

export type StakeInputUnit = 'USD' | 'SOL'

export interface FrozenStakeQuote {
  inputUnit: StakeInputUnit
  usdCents: bigint
  lamports: bigint
  solUsdPriceRaw: bigint
  solUsdDecimals: number
  quoteReceivedAt: number
}

export type StakeGuardrailViolation = 'BELOW_ONCHAIN_MINIMUM' | 'ABOVE_ONCHAIN_MAXIMUM'

export interface StakeGuardrails {
  minInitial?: bigint
  maxCumulative?: bigint
  existingStake?: bigint
  initialStake?: boolean
}

function normalizedDecimal(value: string) {
  const trimmed = value.trim().replace(',', '.')
  return trimmed.startsWith('.') ? `0${trimmed}` : trimmed
}

export function parseUsdCents(value: string): bigint {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(normalizedDecimal(value))
  if (!match) throw new Error('InvalidUsdAmount')
  return BigInt(match[1]) * USD_CENTS_SCALE + BigInt((match[2] ?? '').padEnd(2, '0') || '0')
}

export function parseSolLamports(value: string): bigint {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,9}))?$/.exec(normalizedDecimal(value))
  if (!match) throw new Error('InvalidSolAmount')
  const lamports = BigInt(match[1]) * LAMPORTS_PER_SOL + BigInt((match[2] ?? '').padEnd(SOL_DECIMALS, '0') || '0')
  if (lamports <= 0n) throw new Error('InvalidSolAmount')
  return lamports
}

/** An SPL stake entered in its own units (no USD conversion). */
export function parseTokenAmount(value: string, decimals: number): bigint {
  const match = new RegExp(`^(0|[1-9]\\d*)(?:\\.(\\d{1,${Math.max(decimals, 1)}}))?$`).exec(normalizedDecimal(value))
  if (!match || (decimals === 0 && match[2])) throw new Error('InvalidTokenAmount')
  const raw = BigInt(match[1]) * 10n ** BigInt(decimals) + BigInt((match[2] ?? '').padEnd(decimals, '0') || '0')
  if (raw <= 0n) throw new Error('InvalidTokenAmount')
  return raw
}

function assertUsablePrice(priceRaw: bigint, decimals: number) {
  if (priceRaw <= 0n) throw new Error('InvalidSolUsdPrice')
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('InvalidSolUsdPrice')
}

export function usdCentsToLamports(usdCents: bigint, priceRaw: bigint, decimals: number): bigint {
  assertUsablePrice(priceRaw, decimals)
  // Round to nearest (flooring made a $1.00 entry convert to lamports worth
  // a hair under $1.00, which then failed the exact SOL-side range check
  // after a unit switch; the check-side tolerance covers the half-lamport
  // that rounding can still miss).
  const numerator = usdCents * 10n ** BigInt(decimals) * LAMPORTS_PER_SOL
  const denominator = USD_CENTS_SCALE * priceRaw
  return (numerator + denominator / 2n) / denominator
}

export function lamportsToUsdCents(lamports: bigint, priceRaw: bigint, decimals: number): bigint {
  assertUsablePrice(priceRaw, decimals)
  const denominator = LAMPORTS_PER_SOL * 10n ** BigInt(decimals)
  return (lamports * priceRaw * USD_CENTS_SCALE + denominator / 2n) / denominator
}

function assertFresh(quote: SolUsdQuote, now: number) {
  if (now - quote.receivedAt > quote.staleAfterMs) throw new Error('SolUsdQuoteStale')
}

export function freezeStakeQuote(
  input: string,
  inputUnit: StakeInputUnit,
  quote: SolUsdQuote,
  now = Date.now(),
): FrozenStakeQuote {
  assertFresh(quote, now)
  const { priceRaw, decimals } = quote
  const base = { inputUnit, solUsdPriceRaw: priceRaw, solUsdDecimals: decimals, quoteReceivedAt: quote.receivedAt }
  if (inputUnit === 'USD') {
    const usdCents = parseUsdCents(input)
    if (usdCents < MIN_STAKE_USD_CENTS || usdCents > MAX_STAKE_USD_CENTS) throw new Error('UsdStakeOutOfRange')
    const lamports = usdCentsToLamports(usdCents, priceRaw, decimals)
    if (lamports <= 0n) throw new Error('SolStakeRoundsToZero')
    return { ...base, usdCents, lamports }
  }
  const lamports = parseSolLamports(input)
  // Compare exactly, before rounding to cents - but allow one lamport of
  // tolerance at each edge (~$3e-6), so an amount produced by the USD
  // conversion above always passes the same range it was quoted for.
  const scaled = lamports * priceRaw * USD_CENTS_SCALE
  const unit = LAMPORTS_PER_SOL * 10n ** BigInt(decimals)
  const oneLamport = priceRaw * USD_CENTS_SCALE
  if (scaled + oneLamport < MIN_STAKE_USD_CENTS * unit || scaled - oneLamport > MAX_STAKE_USD_CENTS * unit) {
    throw new Error('UsdStakeOutOfRange')
  }
  return { ...base, usdCents: lamportsToUsdCents(lamports, priceRaw, decimals), lamports }
}

export function formatUsdCents(usdCents: bigint): string {
  const dollars = usdCents / USD_CENTS_SCALE
  const cents = (usdCents % USD_CENTS_SCALE).toString().padStart(2, '0')
  return `$${dollars.toString()}.${cents}`
}

export function stakeQuoteErrorMessage(cause: unknown): string | undefined {
  const code = cause instanceof Error ? cause.message : String(cause)
  if (code === 'InvalidUsdAmount') return 'Enter a valid USD amount with no more than two decimal places.'
  if (code === 'InvalidSolAmount') return 'Enter a valid SOL amount with no more than 9 decimal places.'
  if (code === 'InvalidTokenAmount') return 'Enter a valid token amount for this game’s stake currency.'
  if (code === 'UsdStakeOutOfRange') return 'The stake must be worth between $1 and $50 at the live SOL/USD rate.'
  if (code === 'SolUsdQuoteStale') return 'The SOL/USD rate is unavailable or stale. Try again in a moment.'
  if (code === 'InvalidSolUsdPrice' || code === 'SolStakeRoundsToZero') {
    return 'The SOL/USD rate could not be used safely. No transaction was sent.'
  }
  return undefined
}

export function stakeGuardrailViolation(
  amount: bigint,
  { minInitial, maxCumulative, existingStake = 0n, initialStake = existingStake === 0n }: StakeGuardrails,
): StakeGuardrailViolation | undefined {
  if (amount <= 0n) return undefined
  if (initialStake && minInitial != null && amount < minInitial) return 'BELOW_ONCHAIN_MINIMUM'
  if (maxCumulative != null && existingStake + amount > maxCumulative) return 'ABOVE_ONCHAIN_MAXIMUM'
  return undefined
}

export function stakeGuardrailMessage(violation: StakeGuardrailViolation): string {
  return violation === 'BELOW_ONCHAIN_MINIMUM'
    ? 'This amount is below the game’s minimum stake. No transaction was sent.'
    : 'This amount, with your existing stake, exceeds the game’s maximum. No transaction was sent.'
}
