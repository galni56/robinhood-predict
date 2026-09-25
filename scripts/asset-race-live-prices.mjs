export const DEXSCREENER_CHAIN_ID = 'robinhood'
export const DEXSCREENER_PRICE_DECIMALS = 18
export const DEXSCREENER_PAIRS_API = 'https://api.dexscreener.com/latest/dex/pairs'
export const ETH_USD_TICKER_API = 'https://api.exchange.coinbase.com/products/ETH-USD/ticker'
export const ETH_USD_PRICE_DECIMALS = 8
export const ETH_USD_MIN_REFRESH_MS = 15_000

function normalize(value) {
  return typeof value === 'string' ? value.toLowerCase() : ''
}

export function decimalToUnits(value, decimals = DEXSCREENER_PRICE_DECIMALS) {
  if (!Number.isSafeInteger(decimals) || decimals < 0) throw new Error('InvalidDecimals')
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new Error('InvalidDecimalPrice')
  }
  const [whole, fraction = ''] = value.split('.')
  const padded = fraction.padEnd(decimals, '0').slice(0, decimals)
  const result = BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(padded || '0')
  if (result <= 0n) throw new Error('NonPositivePrice')
  return result
}

export function selectCoinbaseEthUsdQuote(payload, receivedAt) {
  if (!Number.isSafeInteger(receivedAt) || receivedAt <= 0) throw new Error('InvalidReceivedAt')
  const priceUsd = payload?.price
  const priceRaw = decimalToUnits(priceUsd, ETH_USD_PRICE_DECIMALS)
  return {
    provider: 'COINBASE_EXCHANGE',
    pair: 'ETH-USD',
    priceUsd,
    priceRaw: priceRaw.toString(),
    decimals: ETH_USD_PRICE_DECIMALS,
    receivedAt,
    stale: false,
  }
}

/// One process-wide public ETH/USD cache. Calls inside the refresh window reuse
/// the same quote, including after failures, so visitors never multiply load.
export class EthUsdQuoteCache {
  constructor({
    fetchFn = fetch,
    now = Date.now,
    minRefreshMs = ETH_USD_MIN_REFRESH_MS,
    staleAfterMs = 45_000,
    url = ETH_USD_TICKER_API,
  } = {}) {
    if (typeof fetchFn !== 'function' || typeof now !== 'function') throw new Error('InvalidEthUsdDependency')
    if (!Number.isSafeInteger(minRefreshMs) || minRefreshMs < ETH_USD_MIN_REFRESH_MS) {
      throw new Error('EthUsdRefreshTooFrequent')
    }
    if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs < minRefreshMs) throw new Error('InvalidEthUsdStaleThreshold')
    this.fetchFn = fetchFn
    this.now = now
    this.minRefreshMs = minRefreshMs
    this.staleAfterMs = staleAfterMs
    this.url = url
    this.quote = undefined
    this.error = undefined
    this.lastAttemptAt = 0
    this.hasAttempted = false
    this.inFlight = undefined
    this.upstreamRequestCount = 0
  }

  snapshot(at = this.now()) {
    return {
      quote: this.quote ? { ...this.quote, stale: at - this.quote.receivedAt > this.staleAfterMs } : undefined,
      error: this.error,
      upstreamRequestCount: this.upstreamRequestCount,
      minRefreshMs: this.minRefreshMs,
      staleAfterMs: this.staleAfterMs,
    }
  }

  async refresh() {
    const requestedAt = this.now()
    if (this.inFlight) return this.inFlight
    if (this.hasAttempted && requestedAt - this.lastAttemptAt < this.minRefreshMs) return this.snapshot(requestedAt)
    this.hasAttempted = true
    this.lastAttemptAt = requestedAt
    this.upstreamRequestCount += 1
    this.inFlight = (async () => {
      try {
        const response = await this.fetchFn(this.url, { headers: { accept: 'application/json' } })
        if (!response?.ok) throw new Error('EthUsdHttpError')
        this.quote = selectCoinbaseEthUsdQuote(await response.json(), this.now())
        this.error = undefined
      } catch {
        // Never publish upstream response text: it may contain infrastructure detail.
        this.error = 'EthUsdQuoteUnavailable'
      } finally {
        this.inFlight = undefined
      }
      return this.snapshot(this.now())
    })()
    return this.inFlight
  }
}

export function liveStockConfigsFromRegistry(registry) {
  const profile = registry?.liveDisplayProfiles?.DEXSCREENER_STOCK_TOKEN_V1
  if (!profile) throw new Error('MissingDexScreenerLiveDisplayProfile')
  return registry.assets
    .filter((asset) => asset.category === 'STOCK' && asset.networks?.['robinhood-mainnet']?.enabled)
    .map((asset) => {
      const live = asset.liveDisplay
      if (live?.type !== 'DEXSCREENER_STOCK_TOKEN') throw new Error(`MissingLiveDisplay:${asset.assetId}`)
      return {
        assetId: asset.assetId,
        tokenAddress: asset.canonicalTokenAddress,
        pairAddress: live.pairAddress,
        quoteTokenAddress: live.quoteTokenAddress,
        chainId: profile.chainId,
        priceField: profile.priceField,
      }
    })
}

export function buildDexScreenerPairsUrl(configs, apiBase = DEXSCREENER_PAIRS_API) {
  if (!Array.isArray(configs) || configs.length === 0) throw new Error('MissingLiveDisplayConfigs')
  const chainIds = new Set(configs.map((config) => config.chainId))
  if (chainIds.size !== 1) throw new Error('MixedDexScreenerChains')
  const pairIds = configs.map((config) => config.pairAddress)
  if (new Set(pairIds.map(normalize)).size !== pairIds.length) throw new Error('DuplicateConfiguredPair')
  return `${apiBase.replace(/\/$/, '')}/${encodeURIComponent(configs[0].chainId)}/${pairIds.join(',')}`
}

export function selectConfiguredDexPrices(payload, configs, receivedAt) {
  if (!Array.isArray(payload)) throw new Error('InvalidDexScreenerResponse')
  if (!Number.isSafeInteger(receivedAt) || receivedAt <= 0) throw new Error('InvalidReceivedAt')

  const assets = {}
  const errors = {}
  for (const config of configs) {
    const matches = payload.filter((pair) => normalize(pair?.pairAddress) === normalize(config.pairAddress))
    if (matches.length !== 1) {
      errors[config.assetId] = matches.length === 0 ? 'ConfiguredPairMissing' : 'DuplicateConfiguredPairResponse'
      continue
    }
    const pair = matches[0]
    if (pair.chainId !== config.chainId) {
      errors[config.assetId] = 'WrongChain'
      continue
    }
    if (normalize(pair.baseToken?.address) !== normalize(config.tokenAddress)) {
      errors[config.assetId] = 'WrongBaseToken'
      continue
    }
    if (normalize(pair.quoteToken?.address) !== normalize(config.quoteTokenAddress)) {
      errors[config.assetId] = 'WrongQuoteToken'
      continue
    }
    if (config.priceField !== 'priceNative') {
      errors[config.assetId] = 'UnsupportedPriceField'
      continue
    }
    try {
      const priceRaw = decimalToUnits(pair.priceNative)
      assets[config.assetId] = {
        assetId: config.assetId,
        tokenAddress: config.tokenAddress,
        pairAddress: config.pairAddress,
        priceUsdG: pair.priceNative,
        priceRaw: priceRaw.toString(),
        decimals: DEXSCREENER_PRICE_DECIMALS,
        receivedAt,
        priceChangedAt: receivedAt,
        provider: 'DEXSCREENER',
        stale: false,
      }
    } catch (error) {
      errors[config.assetId] = error instanceof Error ? error.message : 'InvalidPrice'
    }
  }
  return { assets, errors }
}

export class StockLivePriceCollector {
  constructor({ configs, fetchFn = fetch, historyLimit = 14_400, now = Date.now, staleAfterMs = 5_000, url }) {
    if (!Array.isArray(configs) || configs.length === 0) throw new Error('MissingLiveDisplayConfigs')
    if (typeof fetchFn !== 'function' || typeof now !== 'function') throw new Error('InvalidCollectorDependency')
    if (!Number.isSafeInteger(historyLimit) || historyLimit < 1) throw new Error('InvalidHistoryLimit')
    if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs < 1_000) throw new Error('InvalidStaleThreshold')
    this.configs = configs
    this.fetchFn = fetchFn
    this.historyLimit = historyLimit
    this.now = now
    this.staleAfterMs = staleAfterMs
    this.url = url ?? buildDexScreenerPairsUrl(configs)
    this.assets = {}
    this.history = Object.fromEntries(configs.map((config) => [config.assetId, []]))
    this.errors = {}
    this.listeners = new Set()
    this.upstreamRequestCount = 0
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot(at = this.now()) {
    const assets = {}
    for (const config of this.configs) {
      const entry = this.assets[config.assetId]
      if (entry) assets[config.assetId] = { ...entry, stale: at - entry.receivedAt > this.staleAfterMs }
    }
    return {
      provider: 'DEXSCREENER',
      heartbeatAt: at,
      staleAfterMs: this.staleAfterMs,
      upstreamRequestCount: this.upstreamRequestCount,
      assets,
      errors: { ...this.errors },
    }
  }

  anchorsAfter(timestamp) {
    if (!Number.isSafeInteger(timestamp) || timestamp <= 0) throw new Error('InvalidAnchorTimestamp')
    const assets = {}
    for (const config of this.configs) {
      const anchor = this.history[config.assetId].find((entry) => entry.receivedAt >= timestamp)
      if (anchor) assets[config.assetId] = anchor
    }
    return { after: timestamp, assets }
  }

  async poll() {
    this.upstreamRequestCount += 1
    const receivedAt = this.now()
    try {
      const response = await this.fetchFn(this.url, { headers: { accept: 'application/json' } })
      if (!response?.ok) throw new Error(`DexScreenerHttp${response?.status ?? 'Error'}`)
      const selected = selectConfiguredDexPrices(await response.json(), this.configs, receivedAt)
      this.errors = selected.errors
      for (const [assetId, next] of Object.entries(selected.assets)) {
        const previous = this.assets[assetId]
        this.assets[assetId] = {
          ...next,
          priceChangedAt: previous?.priceRaw === next.priceRaw ? previous.priceChangedAt : receivedAt,
        }
        this.history[assetId] = [...this.history[assetId], this.assets[assetId]].slice(-this.historyLimit)
      }
    } catch (error) {
      this.errors = { upstream: error instanceof Error ? error.message : 'DexScreenerRequestFailed' }
    }
    const snapshot = this.snapshot(this.now())
    for (const listener of this.listeners) listener(snapshot)
    return snapshot
  }
}

export function poolLiveConfigsFromRegistry(registry) {
  return poolConfigsFromRegistry(registry)
}

/// @notice One process polls one fixed Robinhood block and fans the snapshot
/// out to every SSE client. Settlement and live pricing share PoolPriceEngine.
export class StockPoolLiveCollector {
  constructor({ engine, ethUsdQuoteCache, now = Date.now, staleAfterMs = 5_000 }) {
    if (!engine?.latestSnapshot || typeof now !== 'function') throw new Error('InvalidPoolLiveCollector')
    if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs < 1_000) throw new Error('InvalidStaleThreshold')
    this.engine = engine
    this.ethUsdQuoteCache = ethUsdQuoteCache
    this.now = now
    this.staleAfterMs = staleAfterMs
    this.assets = {}
    this.errors = {}
    this.listeners = new Set()
    this.upstreamRequestCount = 0
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot(at = this.now()) {
    const assets = {}
    for (const [assetId, entry] of Object.entries(this.assets)) {
      assets[assetId] = { ...entry, stale: at - entry.receivedAt > this.staleAfterMs }
    }
    const ethUsd = this.ethUsdQuoteCache?.snapshot(at)
    return {
      provider: 'ROBINHOOD_POOL_RPC',
      heartbeatAt: at,
      staleAfterMs: this.staleAfterMs,
      upstreamRequestCount: this.upstreamRequestCount,
      assets,
      ethUsd: ethUsd?.quote ? { ...ethUsd.quote, staleAfterMs: ethUsd.staleAfterMs } : undefined,
      errors: { ...this.errors, ...(ethUsd?.error ? { ethUsd: ethUsd.error } : {}) },
    }
  }

  async poll() {
    this.upstreamRequestCount += 1
    const receivedAt = this.now()
    await this.ethUsdQuoteCache?.refresh()
    try {
      const snapshot = await this.engine.latestSnapshot()
      const nextAssets = {}
      for (const [assetId, entry] of Object.entries(snapshot.assets)) {
        const priceRaw = BigInt(entry.priceRaw).toString()
        const previous = this.assets[assetId]
        nextAssets[assetId] = {
          assetId,
          oracleId: entry.oracleId,
          priceQuote: formatUnits(BigInt(priceRaw), POOL_PRICE_DECIMALS),
          // Preserve the Stock field; neither ETH representation is USDG.
          ...(entry.quoteSymbol === 'USDG' ? { priceUsdG: formatUnits(BigInt(priceRaw), POOL_PRICE_DECIMALS) } : {}),
          quoteSymbol: entry.quoteSymbol ?? 'USDG',
          quoteUnit: entry.quoteUnit,
          quoteKind: entry.quoteKind,
          quoteToken: entry.quoteToken,
          priceRaw,
          decimals: POOL_PRICE_DECIMALS,
          blockNumber: BigInt(entry.blockNumber).toString(),
          blockHash: entry.blockHash,
          blockTimestamp: Number(entry.blockTimestamp),
          poolIdentifier: entry.poolIdentifier,
          protocol: entry.protocol,
          provider: 'ROBINHOOD_POOL_RPC',
          receivedAt,
          priceChangedAt: previous?.priceRaw === priceRaw ? previous.priceChangedAt : receivedAt,
          stale: false,
        }
      }
      this.assets = nextAssets
      this.errors = {}
    } catch {
      // This snapshot is public SSE; RPC errors can contain provider credentials.
      this.errors = { upstream: 'PoolRpcRequestFailed' }
    }
    const snapshot = this.snapshot(this.now())
    for (const listener of this.listeners) listener(snapshot)
    return snapshot
  }
}
import { formatUnits } from 'viem'
import { POOL_PRICE_DECIMALS, poolConfigsFromRegistry } from './asset-race-pool-price-engine.mjs'
