import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { pad, zeroAddress } from 'viem'
import { PoolPriceEngine, poolConfigsFromRegistry, poolOracleId, priceFromSqrtPriceX96, verifyPoolConfigs, v4PoolId } from './asset-race-pool-price-engine.mjs'
import { StockPoolLiveCollector } from './asset-race-live-prices.mjs'
import { quotePoolExactInput } from './asset-race-pool-quotes.mjs'

const original = JSON.parse(readFileSync(new URL('../config/asset-race-assets.json', import.meta.url), 'utf8'))
const Q96 = 1n << 96n

// Synthetic alternate PoolKey only; never changes the actual registry.
function fixture(native = true) {
  const registry = structuredClone(original)
  const asset = registry.assets.find((entry) => entry.assetId === 'BLORB')
  const quoteToken = native ? zeroAddress : registry.marketQuoteUniverses.MEME.address
  const poolKey = { currency0: quoteToken, currency1: asset.canonicalTokenAddress, fee: 10000, tickSpacing: 200, hooks: zeroAddress }
  asset.marketSource = { type: 'UNISWAP_V4', poolIdentifier: v4PoolId(poolKey), baseToken: asset.canonicalTokenAddress,
    quoteToken, quoteKind: native ? 'NATIVE_ETH' : 'WETH', baseDecimals: 18, quoteDecimals: 18,
    baseIsToken0: false, poolKey, orientation: 'BASE_TOKEN_QUOTE_TOKEN' }
  asset.productionStatus = 'A'
  const identifier = poolOracleId({ ...asset.marketSource, protocol: 'UNISWAP_V4', chainId: 4663 })
  asset.networks['robinhood-mainnet'] = { enabled: true, oracle: {
    ...registry.assets.find((entry) => entry.assetId === 'AI').networks['robinhood-mainnet'].oracle, identifier } }
  const config = poolConfigsFromRegistry(registry, { category: 'MEME' }).find((entry) => entry.assetId === 'BLORB')
  return { registry, asset, config }
}

test('V4 native ETH PoolKey retains zero currency and normalizes into the ETH unit', () => {
  const native = fixture().config, wrapped = fixture(false).config
  assert.equal(native.poolKey.currency0, zeroAddress)
  assert.equal(native.quoteToken, zeroAddress)
  assert.equal(native.quoteKind, 'NATIVE_ETH')
  assert.equal(wrapped.quoteKind, 'WETH')
  assert.equal(native.quoteDecimals, 18)
  assert.equal(native.quoteUnit, 'ETH_QUOTE')
  assert.equal(native.quoteUnit, wrapped.quoteUnit)
  assert.equal(native.quoteSymbol, 'ETH')
  assert.equal(native.baseIsToken0, false)
  assert.equal(v4PoolId(native.poolKey), native.poolIdentifier)
})

test('native ETH decimals are literal 18; zero currency is never queried as ERC20', async () => {
  const config = fixture().config, calls = []
  const client = { readContract: async (request) => {
    calls.push(request)
    assert.notEqual(request.address.toLowerCase(), zeroAddress)
    return request.functionName === 'decimals' ? 18 : [Q96, 0, 0, 10000]
  } }
  assert.equal(await verifyPoolConfigs(client, [config]), true)
  assert.equal(calls.filter((request) => request.functionName === 'decimals').length, 1)
  const wrong = { ...config, quoteDecimals: 6 }
  await assert.rejects(() => verifyPoolConfigs(client, [wrong]), /InvalidNativePoolCurrency/)
})

test('sqrt orientation and normalization are identical for native ETH and WETH', () => {
  for (const sqrtPriceX96 of [Q96, 2n * Q96]) {
    assert.equal(priceFromSqrtPriceX96({ ...fixture().config, sqrtPriceX96 }),
      priceFromSqrtPriceX96({ ...fixture(false).config, sqrtPriceX96 }))
  }
  assert.equal(priceFromSqrtPriceX96({ ...fixture().config, sqrtPriceX96: 2n * Q96 }), 25n * 10n ** 16n)
  assert.equal(priceFromSqrtPriceX96({ ...fixture().config, baseIsToken0: true, sqrtPriceX96: 2n * Q96 }), 4n * 10n ** 18n)
})

test('oracle identity binds exact quote representation, not just the ETH unit', () => {
  const native = fixture().config, wrapped = fixture(false).config
  assert.notEqual(native.oracleId, wrapped.oracleId)
  assert.notEqual(native.oracleId, poolOracleId({ ...native, quoteToken: wrapped.quoteToken }))
  assert.notEqual(native.poolIdentifier, wrapped.poolIdentifier)
})

test('native ETH rejects V3, Stocks, wrong quote kind and a mismatched PoolKey', () => {
  const { registry, asset } = fixture()
  asset.marketSource.quoteKind = 'WETH'
  assert.throws(() => poolConfigsFromRegistry(registry), /InvalidNativePoolCurrency/)
  asset.marketSource.quoteKind = 'NATIVE_ETH'
  asset.marketSource.type = 'UNISWAP_V3'
  assert.throws(() => poolConfigsFromRegistry(registry), /InvalidNativePoolCurrency/)
  const stockRegistry = structuredClone(original)
  const stock = stockRegistry.assets.find((entry) => entry.assetId === 'AAPL')
  stock.marketSource.quoteToken = zeroAddress
  assert.throws(() => poolConfigsFromRegistry(stockRegistry), /InvalidNativePoolCurrency/)
  const wrongPair = fixture()
  wrongPair.asset.marketSource.quoteToken = original.marketQuoteUniverses.MEME.address
  wrongPair.asset.marketSource.quoteKind = 'WETH'
  assert.throws(() => poolConfigsFromRegistry(wrongPair.registry), /WrongV4PoolPair/)
})

test('native runtime verification cannot substitute a different PoolKey or orientation', async () => {
  const config = fixture().config
  const client = { readContract: async ({ functionName }) => functionName === 'decimals' ? 18 : [Q96] }
  await assert.rejects(() => verifyPoolConfigs(client, [{ ...config, baseIsToken0: true }]), /WrongV4PoolPair/)
  await assert.rejects(() => verifyPoolConfigs(client, [{ ...config, poolKey: { ...config.poolKey, fee: 500 } }]), /InvalidV4PoolKey/)
})

test('mixed WETH/native LIVE and historical endpoints share blocks and stay fixed when collected later', async () => {
  const configs = poolConfigsFromRegistry(fixture().registry, { category: 'MEME' }).filter((entry) => ['AI', 'BLORB'].includes(entry.assetId))
  const blocks = [
    { number: 0n, timestamp: 90n, hash: pad('0x11', { size: 32 }), parentHash: pad('0xff', { size: 32 }) },
    { number: 1n, timestamp: 99n, hash: pad('0x22', { size: 32 }), parentHash: pad('0x11', { size: 32 }) },
    { number: 2n, timestamp: 100n, hash: pad('0x33', { size: 32 }), parentHash: pad('0x22', { size: 32 }) },
    { number: 3n, timestamp: 1000n, hash: pad('0x44', { size: 32 }), parentHash: pad('0x33', { size: 32 }) },
  ]
  const calls = []
  const client = {
    getBlock: async ({ blockTag, blockNumber }) => blockTag === 'latest' ? blocks[3] : blocks[Number(blockNumber)],
    readContract: async (request) => { calls.push(request); return [request.blockNumber === 1n ? Q96 : 2n * Q96] },
  }
  const engine = new PoolPriceEngine({ client, configs })
  const endpoint = await engine.endpointPair(100n), delayed = await engine.endpointPair(100n)
  assert.deepEqual(endpoint.previous, delayed.previous)
  assert.equal(endpoint.previous.block.timestamp, 99n)
  assert.equal(endpoint.selected.block.timestamp, 100n)
  assert.equal(endpoint.selected.block.parentHash, endpoint.previous.block.hash)
  assert.ok(Object.values(endpoint.previous.assets).every((entry) => entry.blockHash === blocks[1].hash && entry.priceRaw === 10n ** 18n))
  const collector = new StockPoolLiveCollector({ engine, now: () => 2000 })
  await collector.poll()
  const live = collector.snapshot()
  assert.ok(Object.values(live.assets).every((entry) => entry.blockHash === blocks[3].hash && entry.quoteSymbol === 'ETH'
    && entry.quoteUnit === 'ETH_QUOTE' && !entry.priceUsdG))
  assert.equal(live.assets.BLORB.quoteToken, zeroAddress)
  assert.equal(live.assets.BLORB.quoteKind, 'NATIVE_ETH')
  assert.equal(live.assets.AI.quoteKind, 'WETH')
  assert.equal(live.assets.BLORB.oracleId, endpoint.previous.assets.BLORB.oracleId)
  assert.ok(calls.filter((request) => request.functionName === 'getSlot0').every((request) => request.args[0] === configs[1].poolIdentifier))
})

test('other Meme quotes remain rejected and approved native Memes preserve the Stock catalog', () => {
  const { registry, asset } = fixture()
  asset.marketSource.quoteToken = registry.networks['robinhood-mainnet'].settlementToken.address
  asset.marketSource.quoteKind = 'WETH'
  assert.throws(() => poolConfigsFromRegistry(registry), /WrongPoolQuoteToken/)
  const memes = poolConfigsFromRegistry(original, { category: 'MEME' })
  assert.equal(memes.length, 13)
  assert.deepEqual(memes.filter((entry) => entry.quoteKind === 'NATIVE_ETH').map((entry) => entry.assetId).sort(), ['BLORB', 'DOGO', 'FRONG', 'HOOD'])
  const frong = memes.find((entry) => entry.assetId === 'FRONG')
  assert.equal(frong.poolIdentifier, '0xacea8920877840033f0275c37f9b61550b5326917e948bcf8339714d96f9521a')
  assert.equal(frong.poolKey.fee, 2500)
  assert.equal(frong.poolKey.tickSpacing, 60)
  assert.equal(frong.poolKey.hooks, zeroAddress)
  assert.equal(poolConfigsFromRegistry(original, { category: 'STOCK' }).length, 10)
})

test('V4 Quoter uses the frozen native PoolKey, both directions, and an explicit block without a wallet', async () => {
  const config = fixture().config, calls = []
  const client = { simulateContract: async (request) => { calls.push(request); return { result: [42n, 100000n] } } }
  const buy = await quotePoolExactInput(client, config, { buy: true, amountIn: 100n, blockNumber: 10n })
  const sell = await quotePoolExactInput(client, config, { buy: false, amountIn: 200n, blockNumber: 10n })
  assert.equal(buy.amountOut, 42n)
  assert.equal(sell.amountIn, 200n)
  assert.equal(buy.sqrtPriceX96After, undefined) // Official V4 schema has no post-state.
  assert.ok(calls.every((request) => request.blockNumber === 10n && !request.account))
  assert.deepEqual(calls.map((request) => request.args[0].zeroForOne), [true, false])
  assert.ok(calls.every((request) => request.args[0].poolKey.currency0 === zeroAddress))
  assert.ok(calls.every((request) => request.args[0].poolKey === config.poolKey))
})

test('V4 read-only quotes reject a wrong key and uint128 overflow before any RPC', async () => {
  const config = fixture().config
  const client = { simulateContract: () => { throw new Error('MustNotCallRPC') } }
  await assert.rejects(() => quotePoolExactInput(client, { ...config, poolKey: { ...config.poolKey, tickSpacing: 60 } },
    { buy: true, amountIn: 1n, blockNumber: 10n }), /InvalidV4QuotePoolKeyOrAmount/)
  await assert.rejects(() => quotePoolExactInput(client, config,
    { buy: true, amountIn: 1n << 128n, blockNumber: 10n }), /InvalidV4QuotePoolKeyOrAmount/)
})

test('V3 quote adapter preserves canonical WETH routing and returned post-sqrt data', async () => {
  const config = poolConfigsFromRegistry(original, { category: 'MEME' })[0]
  const client = { simulateContract: async (request) => {
    assert.equal(request.args[0].tokenIn, config.quoteToken)
    assert.equal(request.args[0].tokenOut, config.baseToken)
    assert.equal(request.args[0].fee, config.fee)
    assert.equal(request.blockNumber, 10n)
    return { result: [42n, Q96, 2, 100000n] }
  } }
  const quoted = await quotePoolExactInput(client, config, { buy: true, amountIn: 100n, blockNumber: 10n })
  assert.equal(quoted.sqrtPriceX96After, Q96)
  assert.equal(quoted.initializedTicksCrossed, 2)
})
