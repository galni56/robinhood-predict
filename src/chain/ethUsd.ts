export const USD_CENTS_SCALE = 100n
export const WEI_PER_ETH = 10n ** 18n
export const MIN_STAKE_USD_CENTS = 100n
export const MAX_STAKE_USD_CENTS = 5_000n

export interface EthUsdQuote {
  provider: 'COINBASE_EXCHANGE'
  pair: 'ETH-USD'
  priceUsd: string
  priceRaw: string
  decimals: number
  receivedAt: number
  staleAfterMs: number
  stale: boolean
}

export interface FrozenEthStakeQuote {
  usdCents: bigint
  wei: bigint
  ethUsdPriceRaw: bigint
  ethUsdDecimals: number
  quoteReceivedAt: number
}

export type StakeInputUnit = 'USD' | 'ETH'

export interface FrozenNativeStakeQuote extends FrozenEthStakeQuote {
  inputUnit: StakeInputUnit
}

export type NativeStakeGuardrailViolation = 'BELOW_ONCHAIN_MINIMUM' | 'ABOVE_ONCHAIN_MAXIMUM'

export interface NativeStakeGuardrails {
  minInitialWei?: bigint
  maxCumulativeWei?: bigint
  existingStakeWei?: bigint
  initialStake?: boolean
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function parseEthUsdQuote(value: unknown): EthUsdQuote | undefined {
  if (!value || typeof value !== 'object') return undefined
  const quote = value as Partial<EthUsdQuote>
  if (
    quote.provider !== 'COINBASE_EXCHANGE'
      || quote.pair !== 'ETH-USD'
      || typeof quote.priceUsd !== 'string'
      || typeof quote.priceRaw !== 'string' || !/^\d+$/.test(quote.priceRaw) || BigInt(quote.priceRaw) <= 0n
      || !positiveSafeInteger(quote.decimals) || quote.decimals > 36
      || !positiveSafeInteger(quote.receivedAt)
      || !positiveSafeInteger(quote.staleAfterMs)
      || typeof quote.stale !== 'boolean'
  ) return undefined
  return quote as EthUsdQuote
}

export function parseUsdCents(value: string): bigint {
  const trimmed = value.trim()
  const normalized = trimmed.startsWith('.') ? `0${trimmed}` : trimmed
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(normalized)
  if (!match) throw new Error('InvalidUsdAmount')
  const fraction = (match[2] ?? '').padEnd(2, '0')
  return BigInt(match[1]) * USD_CENTS_SCALE + BigInt(fraction || '0')
}

export function parseEthWei(value: string): bigint {
  const trimmed = value.trim()
  const normalized = trimmed.startsWith('.') ? `0${trimmed}` : trimmed
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,18}))?$/.exec(normalized)
  if (!match) throw new Error('InvalidEthAmount')
  const fraction = (match[2] ?? '').padEnd(18, '0')
  const wei = BigInt(match[1]) * WEI_PER_ETH + BigInt(fraction || '0')
  if (wei <= 0n) throw new Error('InvalidEthAmount')
  return wei
}

export function usdCentsToWei(usdCents: bigint, ethUsdPriceRaw: bigint, priceDecimals: number): bigint {
  if (usdCents <= 0n) throw new Error('InvalidUsdAmount')
  if (ethUsdPriceRaw <= 0n) throw new Error('InvalidEthUsdPrice')
  if (!Number.isSafeInteger(priceDecimals) || priceDecimals < 0 || priceDecimals > 36) {
    throw new Error('InvalidEthUsdDecimals')
  }
  return (usdCents * 10n ** BigInt(priceDecimals) * WEI_PER_ETH) / (USD_CENTS_SCALE * ethUsdPriceRaw)
}

export function weiToUsdCents(wei: bigint, ethUsdPriceRaw: bigint, priceDecimals: number): bigint {
  if (wei <= 0n) throw new Error('InvalidEthAmount')
  if (ethUsdPriceRaw <= 0n) throw new Error('InvalidEthUsdPrice')
  if (!Number.isSafeInteger(priceDecimals) || priceDecimals < 0 || priceDecimals > 36) {
    throw new Error('InvalidEthUsdDecimals')
  }
  const denominator = WEI_PER_ETH * 10n ** BigInt(priceDecimals)
  const numerator = wei * ethUsdPriceRaw * USD_CENTS_SCALE
  return (numerator + denominator / 2n) / denominator
}

function assertFreshQuote(quote: EthUsdQuote, now: number) {
  if (quote.stale || now - quote.receivedAt > quote.staleAfterMs) throw new Error('EthUsdQuoteStale')
}

function assertWeiWithinUsdRange(wei: bigint, ethUsdPriceRaw: bigint, priceDecimals: number) {
  const denominator = WEI_PER_ETH * 10n ** BigInt(priceDecimals)
  const numerator = wei * ethUsdPriceRaw * USD_CENTS_SCALE
  if (
    numerator < MIN_STAKE_USD_CENTS * denominator
      || numerator > MAX_STAKE_USD_CENTS * denominator
  ) throw new Error('UsdStakeOutOfRange')
}

export function freezeUsdStakeQuote(usdInput: string, quote: EthUsdQuote, now = Date.now()): FrozenEthStakeQuote {
  const usdCents = parseUsdCents(usdInput)
  if (usdCents < MIN_STAKE_USD_CENTS || usdCents > MAX_STAKE_USD_CENTS) throw new Error('UsdStakeOutOfRange')
  assertFreshQuote(quote, now)
  const ethUsdPriceRaw = BigInt(quote.priceRaw)
  const wei = usdCentsToWei(usdCents, ethUsdPriceRaw, quote.decimals)
  if (wei <= 0n) throw new Error('EthStakeRoundsToZero')
  return {
    usdCents,
    wei,
    ethUsdPriceRaw,
    ethUsdDecimals: quote.decimals,
    quoteReceivedAt: quote.receivedAt,
  }
}

export function freezeNativeStakeQuote(
  input: string,
  inputUnit: StakeInputUnit,
  quote: EthUsdQuote,
  now = Date.now(),
): FrozenNativeStakeQuote {
  if (inputUnit === 'USD') return { ...freezeUsdStakeQuote(input, quote, now), inputUnit }
  assertFreshQuote(quote, now)
  const ethUsdPriceRaw = BigInt(quote.priceRaw)
  const wei = parseEthWei(input)
  assertWeiWithinUsdRange(wei, ethUsdPriceRaw, quote.decimals)
  return {
    inputUnit,
    usdCents: weiToUsdCents(wei, ethUsdPriceRaw, quote.decimals),
    wei,
    ethUsdPriceRaw,
    ethUsdDecimals: quote.decimals,
    quoteReceivedAt: quote.receivedAt,
  }
}

export function formatUsdCents(usdCents: bigint): string {
  const dollars = usdCents / USD_CENTS_SCALE
  const cents = (usdCents % USD_CENTS_SCALE).toString().padStart(2, '0')
  return `$${dollars.toString()}.${cents}`
}

export function nativeStakeQuoteErrorMessage(cause: unknown): string | undefined {
  const code = cause instanceof Error ? cause.message : String(cause)
  if (code === 'InvalidUsdAmount') return 'Enter a valid USD amount with no more than two decimal places.'
  if (code === 'InvalidEthAmount') return 'Enter a valid ETH amount with no more than 18 decimal places.'
  if (code === 'UsdStakeOutOfRange') return 'The stake must be worth between $1 and $50 at the live ETH/USD rate.'
  if (code === 'EthUsdQuoteStale') return 'The ETH/USD quote is unavailable or stale. Try again in a moment.'
  if (code === 'InvalidEthUsdPrice' || code === 'InvalidEthUsdDecimals' || code === 'EthStakeRoundsToZero') {
    return 'The ETH/USD quote could not be used safely. No transaction was sent.'
  }
  return undefined
}

export function nativeStakeGuardrailViolation(
  amountWei: bigint,
  {
    minInitialWei,
    maxCumulativeWei,
    existingStakeWei = 0n,
    initialStake = existingStakeWei === 0n,
  }: NativeStakeGuardrails,
): NativeStakeGuardrailViolation | undefined {
  if (amountWei <= 0n) return undefined
  if (initialStake && minInitialWei != null && amountWei < minInitialWei) return 'BELOW_ONCHAIN_MINIMUM'
  if (maxCumulativeWei != null && existingStakeWei + amountWei > maxCumulativeWei) {
    return 'ABOVE_ONCHAIN_MAXIMUM'
  }
  return undefined
}

export function nativeStakeGuardrailMessage(violation: NativeStakeGuardrailViolation): string {
  return violation === 'BELOW_ONCHAIN_MINIMUM'
    ? 'This amount is below the contract safety minimum. No transaction was sent.'
    : 'This amount or your existing stake exceeds the contract safety maximum. No transaction was sent.'
}
