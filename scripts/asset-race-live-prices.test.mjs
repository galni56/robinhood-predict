import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
import {
  DEFAULT_ASSET_RACE_LIVE_RPC_URL,
  createAssetRaceLiveServer,
  resolveLiveRpcUrl,
  verifyLiveChain,
} from './asset-race-live-server.mjs'
import { poolConfigsFromRegistry } from './asset-race-pool-price-engine.mjs'
import {
  StockPoolLiveCollector,
  StockLivePriceCollector,
  buildDexScreenerPairsUrl,
  decimalToUnits,
  liveStockConfigsFromRegistry,
  selectConfiguredDexPrices,
} from './asset-race-live-prices.mjs'

const registry = JSON.parse(readFileSync(fileURLToPath(new URL('../config/asset-race-assets.json', import.meta.url)), 'utf8'))
const configs = liveStockConfigsFromRegistry(registry)

test('LIVE verifies the actual RPC chain before serving production pool prices', async () => {
  await verifyLiveChain({ getChainId: async () => 4663 }, 4663)
  await assert.rejects(() => verifyLiveChain({ getChainId: async () => 31337 }, 4663), /chain ID mismatch/)
  await assert.rejects(() => verifyLiveChain({ getChainId: async () => 46630 }, 4663), /chain ID mismatch/)
})

test('LIVE never falls back to the archive credential', () => {
  assert.equal(resolveLiveRpcUrl({
    ASSET_RACE_POOL_RPC_URL: 'https://archive.example/secret',
  }), DEFAULT_ASSET_RACE_LIVE_RPC_URL)
  assert.equal(resolveLiveRpcUrl({
    ASSET_RACE_LIVE_RPC_URL: ' https://live.example ',
    ASSET_RACE_POOL_RPC_URL: 'https://archive.example/secret',
  }), 'https://live.example')
})

test('public pool LIVE failures never expose RPC error messages or provider URL material', async () => {
  const marker = 'SYNTHETIC_PRIVATE_RPC_MARKER'
  const collector = new StockPoolLiveCollector({ engine: {
    latestSnapshot: async () => { throw new Error(`HTTP request failed: https://rpc.invalid/${marker}`) },
  } })
  let published
  collector.subscribe((snapshot) => { published = JSON.stringify(snapshot) })
  const snapshot = await collector.poll()
  assert.deepEqual(snapshot.errors, { upstream: 'PoolRpcRequestFailed' })
  assert.ok(!JSON.stringify(snapshot).includes(marker))
  assert.ok(!published.includes(marker))
})

test('Meme direct-pool SSE shares one heartbeat across viewers without inventing price movement', async (t) => {
  const memes = poolConfigsFromRegistry(registry, { category: 'MEME' })
  let calls = 0, now = 1_000
  const blockHash = `0x${'22'.repeat(32)}`
  const engine = { latestSnapshot: async () => {
    calls += 1
    return { assets: Object.fromEntries(memes.map((config) => [config.assetId, {
      ...config, priceRaw: 123n, decimals: 18, blockNumber: 10n, blockHash,
      blockTimestamp: 900n, provider: 'ROBINHOOD_POOL_RPC',
    }])) }
  } }
  const collector = new StockPoolLiveCollector({ engine, now: () => now })
  const { server, endClients } = createAssetRaceLiveServer(collector)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const controllers = [new AbortController(), new AbortController()]
  t.after(async () => {
    for (const controller of controllers) controller.abort()
    endClients()
    await new Promise((resolve) => server.close(resolve))
  })
  await collector.poll()
  const url = `http://127.0.0.1:${server.address().port}`
  const streams = await Promise.all(controllers.map(async (controller) => {
    const response = await fetch(`${url}/api/asset-race/live`, { signal: controller.signal })
    assert.match(response.headers.get('content-type'), /text\/event-stream/)
    return response.body.getReader()
  }))
  async function readEvent(reader) {
    let data = ''
    while (!data.includes('\n\n')) {
      const chunk = await reader.read()
      assert.equal(chunk.done, false)
      data += new TextDecoder().decode(chunk.value)
    }
    return JSON.parse(data.slice(6).trim())
  }
  const first = await Promise.all(streams.map(readEvent))
  assert.equal(calls, 1)
  assert.deepEqual(first[0], first[1])
  assert.equal(Object.keys(first[0].assets).length, 13)
  assert.ok(Object.values(first[0].assets).every((entry) => entry.blockHash === blockHash && entry.quoteSymbol === 'ETH'
    && entry.quoteUnit === 'ETH_QUOTE' && !entry.priceUsdG))
  now = 2_000
  await collector.poll()
  const second = await Promise.all(streams.map(readEvent))
  assert.equal(calls, 2)
  assert.deepEqual(second[0], second[1])
  assert.equal(second[0].assets.AI.priceChangedAt, first[0].assets.AI.priceChangedAt)
  assert.equal(second[0].assets.AI.receivedAt, 2_000)
  const health = await (await fetch(`${url}/health`)).json()
  assert.equal(health.clients, 2)
  assert.equal(health.upstreamRequests, 2)
})

test('LIVE polls immediately on first viewer, pauses at zero viewers, and resumes on demand', async (t) => {
  let calls = 0
  const listeners = new Set()
  const collector = {
    upstreamRequestCount: 0,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    snapshot() { return { provider: 'TEST', heartbeatAt: Date.now(), assets: {}, errors: {} } },
    async poll() {
      calls += 1
      this.upstreamRequestCount += 1
      const snapshot = this.snapshot()
      for (const listener of listeners) listener(snapshot)
      return snapshot
    },
  }
  const { server, endClients } = createAssetRaceLiveServer(collector, { pollIntervalMs: 20 })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}`
  const controllers = [new AbortController(), new AbortController()]
  t.after(async () => {
    for (const controller of controllers) controller.abort()
    endClients()
    await new Promise((resolve) => server.close(resolve))
  })
  const waitFor = async (condition) => {
    const deadline = Date.now() + 1_000
    while (!await condition()) {
      if (Date.now() >= deadline) throw new Error('TimedOutWaitingForLivePoll')
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(calls, 0)
  const first = await fetch(`${url}/api/asset-race/live`, { signal: controllers[0].signal })
  assert.match(first.headers.get('content-type'), /text\/event-stream/)
  await waitFor(() => calls >= 1)
  const _second = await fetch(`${url}/api/asset-race/live`, { signal: controllers[1].signal })
  await waitFor(() => calls >= 2)
  const beforeDisconnect = calls
  controllers[0].abort()
  controllers[1].abort()
  await waitFor(async () => (await (await fetch(`${url}/health`)).json()).clients === 0)
  const pausedAt = calls
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.ok(pausedAt >= beforeDisconnect)
  assert.equal(calls, pausedAt)

  const resumed = new AbortController()
  controllers.push(resumed)
  await fetch(`${url}/api/asset-race/live`, { signal: resumed.signal })
  await waitFor(() => calls > pausedAt)
})

function pairFor(config, overrides = {}) {
  return {
    chainId: config.chainId,
    pairAddress: config.pairAddress,
    baseToken: { address: config.tokenAddress, symbol: config.assetId },
    quoteToken: { address: config.quoteTokenAddress, symbol: 'USDG' },
    priceNative: '123.456789012345678901',
    ...overrides,
  }
}

function response(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

test('configured pair selection uses exact chain, pair, Stock Token, USDG, and orientation', () => {
  const config = configs[0]
  const duplicateTokenPair = pairFor(config, { pairAddress: '0x1111111111111111111111111111111111111111', priceNative: '999' })
  const selected = selectConfiguredDexPrices([duplicateTokenPair, pairFor(config)], [config], 1_000)
  assert.equal(selected.assets[config.assetId].pairAddress, config.pairAddress)
  assert.equal(selected.assets[config.assetId].priceRaw, decimalToUnits('123.456789012345678901').toString())
  assert.equal(selected.errors[config.assetId], undefined)
})

test('wrong Stock Token, wrong USDG, and reversed orientation are rejected', () => {
  const config = configs[0]
  const wrongBase = selectConfiguredDexPrices([pairFor(config, { baseToken: { address: configs[1].tokenAddress } })], [config], 1_000)
  assert.equal(wrongBase.errors[config.assetId], 'WrongBaseToken')
  const wrongQuote = selectConfiguredDexPrices([pairFor(config, { quoteToken: { address: configs[1].tokenAddress } })], [config], 1_000)
  assert.equal(wrongQuote.errors[config.assetId], 'WrongQuoteToken')
  const reversed = selectConfiguredDexPrices([pairFor(config, {
    baseToken: { address: config.quoteTokenAddress },
    quoteToken: { address: config.tokenAddress },
  })], [config], 1_000)
  assert.equal(reversed.errors[config.assetId], 'WrongBaseToken')
})

test('one batch response supports all ten production-enabled Stock Tokens', () => {
  const selected = selectConfiguredDexPrices(configs.map((config) => pairFor(config)), configs, 1_000)
  assert.equal(configs.length, 10)
  assert.equal(Object.keys(selected.assets).length, 10)
  assert.deepEqual(selected.errors, {})
  assert.match(buildDexScreenerPairsUrl(configs), /\/latest\/dex\/pairs\/robinhood\//)
})

test('one collector poll fans out to multiple consumers without per-user upstream requests', async () => {
  let calls = 0
  let now = 1_000
  const collector = new StockLivePriceCollector({
    configs,
    fetchFn: async () => {
      calls += 1
      return response(configs.map((config) => pairFor(config)))
    },
    now: () => now,
    staleAfterMs: 5_000,
  })
  let first = 0
  let second = 0
  collector.subscribe(() => { first += 1 })
  collector.subscribe(() => { second += 1 })
  await collector.poll()
  assert.equal(calls, 1)
  assert.equal(first, 1)
  assert.equal(second, 1)

  const changedAt = collector.assets.NVDA.priceChangedAt
  now = 2_000
  await collector.poll()
  assert.equal(calls, 2)
  assert.equal(collector.assets.NVDA.priceChangedAt, changedAt)
  assert.equal(collector.assets.NVDA.receivedAt, 2_000)
})

test('failed or missing upstream data becomes stale without inventing a value', async () => {
  let now = 1_000
  let fail = false
  const collector = new StockLivePriceCollector({
    configs,
    fetchFn: async () => fail ? response({}, false, 429) : response(configs.map((config) => pairFor(config))),
    now: () => now,
    staleAfterMs: 5_000,
  })
  await collector.poll()
  const price = collector.assets.NVDA.priceRaw
  fail = true
  now = 7_001
  const stale = await collector.poll()
  assert.equal(stale.assets.NVDA.stale, true)
  assert.equal(stale.assets.NVDA.priceRaw, price)
  assert.equal(stale.errors.upstream, 'DexScreenerHttp429')
})

test('direct pool collector fans one fixed-block engine snapshot out to every viewer', async () => {
  let calls = 0
  let now = 1_000
  let price = 100n
  let fail = false
  const engine = { latestSnapshot: async () => {
    calls += 1
    if (fail) throw new Error('RpcUnavailable')
    return { assets: { NVDA: {
      assetId: 'NVDA', oracleId: `0x${'11'.repeat(32)}`, priceRaw: price, decimals: 18,
      blockNumber: 10n, blockHash: `0x${'22'.repeat(32)}`, parentBlockHash: `0x${'33'.repeat(32)}`,
      blockTimestamp: 900n, poolIdentifier: configs[0].pairAddress, protocol: 'UNISWAP_V3', provider: 'ROBINHOOD_POOL_RPC',
    } } }
  } }
  const collector = new StockPoolLiveCollector({ engine, now: () => now, staleAfterMs: 5_000 })
  let viewerA = 0
  let viewerB = 0
  collector.subscribe(() => { viewerA += 1 })
  collector.subscribe(() => { viewerB += 1 })
  const first = await collector.poll()
  assert.equal(calls, 1)
  assert.equal(viewerA, 1)
  assert.equal(viewerB, 1)
  assert.equal(first.assets.NVDA.blockNumber, '10')
  assert.equal(first.assets.NVDA.provider, 'ROBINHOOD_POOL_RPC')

  const changedAt = first.assets.NVDA.priceChangedAt
  now = 2_000
  await collector.poll()
  assert.equal(collector.assets.NVDA.priceChangedAt, changedAt)
  price = 101n
  now = 3_000
  await collector.poll()
  assert.equal(collector.assets.NVDA.priceRaw, '101')
  assert.equal(collector.assets.NVDA.priceChangedAt, 3_000)

  fail = true
  now = 9_001
  const stale = await collector.poll()
  assert.equal(stale.assets.NVDA.priceRaw, '101')
  assert.equal(stale.assets.NVDA.stale, true)
  assert.equal(stale.errors.upstream, 'PoolRpcRequestFailed')
})
