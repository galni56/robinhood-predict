import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { encodeAbiParameters, stringToHex } from 'viem'

export const SIGNED_STOCK_ORACLE_NAME = 'SignedRobinhoodRaceOracle'
export const SIGNED_STOCK_ORACLE_VERSION = '1'
export const STOCK_PRICE_DECIMALS = 8

const observationComponents = [
  { name: 'oracleId', type: 'bytes32' },
  { name: 'price', type: 'uint256' },
  { name: 'decimals', type: 'uint8' },
  { name: 'updatedAt', type: 'uint256' },
  { name: 'sequence', type: 'uint256' },
]

export const priceObservationTypes = {
  PriceObservation: observationComponents,
}

function parseUnsignedDecimal(value, field) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new Error(`Invalid${field}`)
  }
  const [whole, fraction = ''] = value.split('.')
  return { coefficient: BigInt(`${whole}${fraction}`), scale: fraction.length }
}

function pow10(exponent) {
  return 10n ** BigInt(exponent)
}

function toCommonScale(value, scale) {
  return value.coefficient * pow10(scale - value.scale)
}

/// @notice Returns floor((bid + ask) / 2 * 1e8) without floating point.
export function robinhoodMidpointPrice(bidValue, askValue) {
  const bid = parseUnsignedDecimal(bidValue, 'Bid')
  const ask = parseUnsignedDecimal(askValue, 'Ask')
  const commonScale = Math.max(bid.scale, ask.scale)
  const bidScaled = toCommonScale(bid, commonScale)
  const askScaled = toCommonScale(ask, commonScale)
  if (bidScaled <= 0n || askScaled <= 0n || askScaled < bidScaled) throw new Error('InvalidBidAsk')
  const midpoint = ((bidScaled + askScaled) * pow10(STOCK_PRICE_DECIMALS)) / (2n * pow10(commonScale))
  if (midpoint <= 0n) throw new Error('InvalidMidpoint')
  return midpoint
}

export function oracleIdForStockSymbol(symbol) {
  if (typeof symbol !== 'string' || !/^[A-Z0-9]{1,32}$/.test(symbol)) throw new Error('InvalidStockSymbol')
  return stringToHex(symbol, { size: 32 })
}

function generatedAtSeconds(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error('InvalidGeneratedAt')
  }
  const milliseconds = Date.parse(value)
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw new Error('InvalidGeneratedAt')
  return BigInt(Math.floor(milliseconds / 1_000))
}

export function observationFromRobinhoodResponse(symbol, payload) {
  const quotes = payload?.quotes
  if (!Array.isArray(quotes)) throw new Error('InvalidRobinhoodResponse')
  const matches = quotes.filter((quote) => quote?.tokenSymbol === symbol)
  if (matches.length !== 1) throw new Error('InvalidRobinhoodQuoteCount')
  const quote = matches[0]
  if (quote.currency !== 'USD') throw new Error('InvalidCurrency')
  if (quote.isTradingHalt !== false) throw new Error('TradingHalted')

  return {
    oracleId: oracleIdForStockSymbol(symbol),
    price: robinhoodMidpointPrice(quote.bid, quote.ask),
    decimals: STOCK_PRICE_DECIMALS,
    updatedAt: generatedAtSeconds(quote.generatedAt),
    generatedAt: quote.generatedAt,
  }
}

function messageFor(observation) {
  return {
    oracleId: observation.oracleId,
    price: BigInt(observation.price),
    decimals: observation.decimals,
    updatedAt: BigInt(observation.updatedAt),
    sequence: BigInt(observation.sequence),
  }
}

function assertStoredObservation(observation, symbol) {
  if (
    !observation || observation.oracleId?.toLowerCase() !== oracleIdForStockSymbol(symbol).toLowerCase()
      || !/^\d+$/.test(observation.price) || observation.decimals !== STOCK_PRICE_DECIMALS
      || !/^\d+$/.test(observation.updatedAt) || !/^\d+$/.test(observation.sequence)
      || typeof observation.generatedAt !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(observation.signature)
  ) throw new Error(`InvalidStoredObservation:${symbol}`)
}

export function loadObservationState(path, symbols) {
  if (!existsSync(path)) return Object.fromEntries(symbols.map((symbol) => [symbol, []]))
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  if (parsed?.schemaVersion !== 1 || !parsed.assets || typeof parsed.assets !== 'object') {
    throw new Error('InvalidObservationState')
  }
  const assets = {}
  for (const symbol of symbols) {
    const history = parsed.assets[symbol] ?? []
    if (!Array.isArray(history)) throw new Error(`InvalidObservationHistory:${symbol}`)
    history.forEach((observation) => assertStoredObservation(observation, symbol))
    assets[symbol] = history
  }
  return assets
}

export function persistObservationState(path, assets) {
  const temporaryPath = `${path}.tmp-${process.pid}`
  writeFileSync(temporaryPath, `${JSON.stringify({ schemaVersion: 1, assets }, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporaryPath, path)
}

export class StockObservationCollector {
  constructor({ account, apiBaseUrl, chainId, fetchFn = fetch, historyLimit = 4_096, statePath, symbols, verifyingContract }) {
    if (!account?.signTypedData) throw new Error('PriceSignerRequired')
    if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('InvalidCollectorChainId')
    if (!Number.isSafeInteger(historyLimit) || historyLimit < 2) throw new Error('InvalidHistoryLimit')
    if (!Array.isArray(symbols) || symbols.length === 0 || new Set(symbols).size !== symbols.length) {
      throw new Error('InvalidCollectorSymbols')
    }
    this.account = account
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '')
    this.assets = loadObservationState(statePath, symbols)
    this.chainId = chainId
    this.fetchFn = fetchFn
    this.historyLimit = historyLimit
    this.statePath = statePath
    this.symbols = symbols
    this.verifyingContract = verifyingContract
  }

  async poll() {
    const results = await Promise.allSettled(this.symbols.map(async (symbol) => {
      const response = await this.fetchFn(`${this.apiBaseUrl}/${encodeURIComponent(symbol)}`, {
        headers: { accept: 'application/json' },
      })
      if (!response?.ok) throw new Error(`RobinhoodPriceHttp${response?.status ?? 'Error'}`)
      const unsigned = observationFromRobinhoodResponse(symbol, await response.json())
      const history = this.assets[symbol]
      if (history.some((entry) => entry.generatedAt === unsigned.generatedAt)) return { symbol, deduplicated: true }

      const previous = history.at(-1)
      if (previous && unsigned.updatedAt <= BigInt(previous.updatedAt)) throw new Error('NonIncreasingGeneratedAt')
      const sequence = previous ? BigInt(previous.sequence) + 1n : 1n
      const message = { ...unsigned, sequence }
      const signature = await this.account.signTypedData({
        domain: {
          name: SIGNED_STOCK_ORACLE_NAME,
          version: SIGNED_STOCK_ORACLE_VERSION,
          chainId: this.chainId,
          verifyingContract: this.verifyingContract,
        },
        types: priceObservationTypes,
        primaryType: 'PriceObservation',
        message: messageFor(message),
      })
      return {
        symbol,
        observation: {
          oracleId: message.oracleId,
          price: message.price.toString(),
          decimals: message.decimals,
          updatedAt: message.updatedAt.toString(),
          sequence: message.sequence.toString(),
          generatedAt: message.generatedAt,
          signature,
        },
      }
    }))

    let changed = false
    const outcomes = results.map((result, index) => {
      const symbol = this.symbols[index]
      if (result.status === 'rejected') return { symbol, error: result.reason }
      if (result.value.deduplicated) return result.value
      this.assets[symbol] = [...this.assets[symbol], result.value.observation].slice(-this.historyLimit)
      changed = true
      return { symbol, added: true }
    })
    if (changed) persistObservationState(this.statePath, this.assets)
    return outcomes
  }

  proofFor(oracleId, targetTimestamp) {
    const normalizedId = oracleId.toLowerCase()
    const symbol = this.symbols.find((candidate) => oracleIdForStockSymbol(candidate).toLowerCase() === normalizedId)
    if (!symbol) throw new Error('UnknownSignedStockOracleId')
    const history = this.assets[symbol]
    const selectedIndex = history.findIndex((entry) => BigInt(entry.updatedAt) >= targetTimestamp)
    if (selectedIndex <= 0) throw new Error('SignedEndpointProofUnavailable')
    const previous = history[selectedIndex - 1]
    const selected = history[selectedIndex]
    if (
      BigInt(previous.updatedAt) >= targetTimestamp
        || BigInt(selected.sequence) !== BigInt(previous.sequence) + 1n
    ) throw new Error('InvalidSignedEndpointHistory')

    return encodeAbiParameters(
      [
        { type: 'tuple', components: observationComponents },
        { type: 'bytes' },
        { type: 'tuple', components: observationComponents },
        { type: 'bytes' },
      ],
      [messageFor(previous), previous.signature, messageFor(selected), selected.signature],
    )
  }
}
