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
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) throw new Error('InvalidUsdAmount')
  const fraction = (match[2] ?? '').padEnd(2, '0')
  return BigInt(match[1]) * USD_CENTS_SCALE + BigInt(fraction || '0')
}

export function usdCentsToWei(usdCents: bigint, ethUsdPriceRaw: bigint, priceDecimals: number): bigint {
  if (usdCents <= 0n) throw new Error('InvalidUsdAmount')
  if (ethUsdPriceRaw <= 0n) throw new Error('InvalidEthUsdPrice')
  if (!Number.isSafeInteger(priceDecimals) || priceDecimals < 0 || priceDecimals > 36) {
    throw new Error('InvalidEthUsdDecimals')
  }
  return (usdCents * 10n ** BigInt(priceDecimals) * WEI_PER_ETH) / (USD_CENTS_SCALE * ethUsdPriceRaw)
}

export function freezeUsdStakeQuote(usdInput: string, quote: EthUsdQuote, now = Date.now()): FrozenEthStakeQuote {
  const usdCents = parseUsdCents(usdInput)
  if (usdCents < MIN_STAKE_USD_CENTS || usdCents > MAX_STAKE_USD_CENTS) throw new Error('UsdStakeOutOfRange')
  if (quote.stale || now - quote.receivedAt > quote.staleAfterMs) throw new Error('EthUsdQuoteStale')
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
