import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { pad } from 'viem'
import {
  POOL_PRICE_DECIMALS,
  PoolPriceEngine,
  UNISWAP_V3_FACTORY,
  UNISWAP_V4_STATE_VIEW,
  findEndpointBlock,
  poolConfigsFromRegistry,
  priceFromSqrtPriceX96,
  verifyPoolConfigs,
  v4PoolId,
} from './asset-race-pool-price-engine.mjs'

const Q96 = 1n << 96n
const registry = JSON.parse(readFileSync(fileURLToPath(new URL('../config/asset-race-assets.json', import.meta.url)), 'utf8'))

test('approved thirteen Memes bind canonical ERC20s to verified WETH/native pools and the same engine', () => {
  const memes = poolConfigsFromRegistry(registry, { category: 'MEME' })
  assert.deepEqual(memes.map((config) => config.assetId).sort(), ['AI', 'CASHCAT', 'CHUMP', 'PIPEDOG', 'IF', 'TENDIES', 'BONER', 'JUGGERNAUT', 'MOO', 'FRONG', 'HOOD', 'BLORB', 'DOGO'].sort())
  assert.equal(poolConfigsFromRegistry(registry).length, 23)
  for (const config of memes) {
    const asset = registry.assets.find((entry) => entry.assetId === config.assetId)
    assert.equal(config.baseToken.toLowerCase(), asset.canonicalTokenAddress.toLowerCase())
    assert.equal(config.quoteToken.toLowerCase(), config.quoteKind === 'NATIVE_ETH'
      ? '0x0000000000000000000000000000000000000000' : registry.marketQuoteUniverses.MEME.address.toLowerCase())
    assert.equal(config.baseDecimals, 18)
    assert.equal(config.quoteDecimals, 18)
    assert.equal(config.quoteUnit, 'ETH_QUOTE')
    if (config.protocol === 'UNISWAP_V4') {
      assert.equal(v4PoolId(config.poolKey), config.poolIdentifier)
      assert.equal(config.poolKey.hooks, '0x0000000000000000000000000000000000000000')
    }
    assert.equal(config.oracleId, asset.networks['robinhood-mainnet'].oracle.identifier)
    assert.equal(asset.tokenVerification.confidence, 'HIGH')
  }
  const wrong = structuredClone(registry)
  wrong.assets.find((asset) => asset.assetId === 'AI').marketSource.quoteToken = wrong.networks['robinhood-mainnet'].settlementToken.address
  assert.throws(() => poolConfigsFromRegistry(wrong), /WrongPoolQuoteToken/)
  const wrongToken = structuredClone(registry)
  wrongToken.assets.find((asset) => asset.assetId === 'AI').marketSource.baseToken = memes[1].baseToken
  assert.throws(() => poolConfigsFromRegistry(wrongToken), /WrongPoolBaseToken/)
  const wrongPool = structuredClone(registry)
  wrongPool.assets.find((asset) => asset.assetId === 'AI').marketSource.poolIdentifier = memes[1].poolIdentifier
  assert.throws(() => poolConfigsFromRegistry(wrongPool), /WrongPoolOracleId/)
})

test('unresolved Meme candidates cannot leak into production approvals', () => {
  const expandedIds = ['AMC', 'DEGEN', 'UBIK', 'ZZZ', 'SHROOM', 'ASTRO']
  const production = poolConfigsFromRegistry(registry, { category: 'MEME' })
  for (const id of expandedIds) {
    const asset = registry.assets.find((entry) => entry.assetId === id)
    assert.ok(!production.some((config) => config.assetId === id))
    if (!asset) continue // Reviewed unresolved extras have no approved registry entry.
    assert.equal(asset.networks.local.oracle.type, 'MOCK_LOCAL')
    assert.equal(asset.networks.local.enabled, true)
    assert.equal(asset.networks['robinhood-mainnet'].enabled, false)
    assert.equal(asset.networks['robinhood-mainnet'].oracle, null)
    assert.equal(asset.productionStatus, 'C')
    assert.ok(asset.networks['robinhood-mainnet'].blocker)
  }
})

test('generic ERC20 pricing handles WETH and non-18-decimal base tokens in both orientations', () => {
  assert.equal(priceFromSqrtPriceX96({ sqrtPriceX96: 2n * Q96, baseDecimals: 18, quoteDecimals: 18, baseIsToken0: true }), 4n * 10n ** 18n)
  assert.equal(priceFromSqrtPriceX96({ sqrtPriceX96: 2n * Q96, baseDecimals: 18, quoteDecimals: 18, baseIsToken0: false }), 25n * 10n ** 16n)
  assert.equal(priceFromSqrtPriceX96({ sqrtPriceX96: Q96, baseDecimals: 8, quoteDecimals: 18, baseIsToken0: false }), 10n ** 8n)
  assert.equal(priceFromSqrtPriceX96({ sqrtPriceX96: Q96, baseDecimals: 6, quoteDecimals: 18, baseIsToken0: true }), 10n ** 6n)
})

test('Meme endpoint and LIVE read identical frozen pools at common blocks without discovery/API prices', async () => {
  const configs = poolConfigsFromRegistry(registry, { category: 'MEME' })
  const blocks = [
    { number: 0n, timestamp: 90n, hash: pad('0x11', { size: 32 }), parentHash: pad('0xff', { size: 32 }) },
    { number: 1n, timestamp: 99n, hash: pad('0x22', { size: 32 }), parentHash: pad('0x11', { size: 32 }) },
    { number: 2n, timestamp: 100n, hash: pad('0x33', { size: 32 }), parentHash: pad('0x22', { size: 32 }) },
    { number: 3n, timestamp: 1000n, hash: pad('0x44', { size: 32 }), parentHash: pad('0x33', { size: 32 }) },
  ]
  const calls = []
  const client = {
    getBlock: async ({ blockTag, blockNumber }) => blockTag === 'latest' ? blocks[3] : blocks[Number(blockNumber)],
    readContract: async ({ address, blockNumber }) => { calls.push({ address, blockNumber }); return [blockNumber === 1n ? Q96 : 2n * Q96] },
  }
  const engine = new PoolPriceEngine({ client, configs })
  const endpoint = await engine.endpointPair(100n)
  const delayed = await engine.endpointPair(100n)
  const live = await engine.latestSnapshot()
  assert.deepEqual(delayed.previous, endpoint.previous)
  assert.ok(Object.values(endpoint.previous.assets).every((entry) => entry.blockHash === blocks[1].hash))
  assert.ok(Object.values(live.assets).every((entry) => entry.blockHash === blocks[3].hash && entry.quoteSymbol === 'ETH' && entry.quoteUnit === 'ETH_QUOTE'))
  for (const config of configs) {
    assert.equal(endpoint.previous.assets[config.assetId].poolIdentifier, live.assets[config.assetId].poolIdentifier)
    assert.equal(endpoint.previous.assets[config.assetId].oracleId, live.assets[config.assetId].oracleId)
  }
  assert.equal(calls.length, configs.length * 5)
  assert.ok(calls.every((call) => call.address === UNISWAP_V4_STATE_VIEW
    || configs.some((config) => config.poolIdentifier.toLowerCase() === call.address.toLowerCase())))
})

test('approved AI/IF/FRONG selection captures fixed mixed V3/native-V4 T0/T1 returns when collected late', async () => {
  const configs = poolConfigsFromRegistry(registry, { category: 'MEME' })
    .filter((config) => ['AI', 'IF', 'FRONG'].includes(config.assetId))
  assert.equal(configs.length, 3)
  assert.equal(configs.find((config) => config.assetId === 'IF').protocol, 'UNISWAP_V3')
  assert.equal(configs.find((config) => config.assetId === 'FRONG').quoteKind, 'NATIVE_ETH')
  const blocks = [90n, 99n, 100n, 199n, 200n, 1000n].map((timestamp, index) => ({
    number: BigInt(index), timestamp, hash: pad(`0x0${index + 1}`, { size: 32 }),
    parentHash: pad(`0x0${index}`, { size: 32 }),
  }))
  const client = {
    getBlock: async ({ blockTag, blockNumber }) => blockTag === 'latest' ? blocks[5] : blocks[Number(blockNumber)],
    readContract: async ({ functionName, args, blockNumber }) => {
      // Later current spot differs, but cannot replace the frozen predecessor.
      if (blockNumber >= 4n) return [4n * Q96]
      return [blockNumber === 3n && functionName === 'getSlot0'
        && args[0] === configs.find((config) => config.assetId === 'FRONG').poolIdentifier ? Q96 / 2n : Q96]
    },
  }
  const engine = new PoolPriceEngine({ client, configs })
  const p0 = (await engine.endpointPair(100n)).previous
  const p1 = (await engine.endpointPair(200n)).previous
  assert.deepEqual((await engine.endpointPair(200n)).previous, p1)
  assert.ok(Object.values(p0.assets).every((asset) => asset.blockHash === blocks[1].hash))
  assert.ok(Object.values(p1.assets).every((asset) => asset.blockHash === blocks[3].hash))
  const returns = configs.map((config) => ({ assetId: config.assetId,
    value: (p1.assets[config.assetId].priceRaw - p0.assets[config.assetId].priceRaw) * 10n ** 18n / p0.assets[config.assetId].priceRaw }))
  assert.equal(returns.reduce((winner, asset) => asset.value > winner.value ? asset : winner).assetId, 'FRONG')
  assert.equal(returns.find((asset) => asset.assetId === 'FRONG').value, 3n * 10n ** 18n)
  assert.ok(returns.filter((asset) => asset.assetId !== 'FRONG').every((asset) => asset.value === 0n))
})

test('runtime Meme verification rejects wrong decimals and a pool not registered by the approved factory', async () => {
  const config = poolConfigsFromRegistry(registry, { category: 'MEME' })[0]
  await assert.rejects(() => verifyPoolConfigs({ readContract: async () => 6 }, [config]), /PoolTokenDecimalsMismatch/)
  const response = { token0: config.quoteToken, token1: config.baseToken, fee: config.fee, factory: UNISWAP_V3_FACTORY, getPool: '0x0000000000000000000000000000000000000000' }
  const client = { readContract: async ({ functionName }) => functionName === 'decimals' ? 18 : response[functionName] }
  await assert.rejects(() => verifyPoolConfigs(client, [config]), /V3FactoryPoolMismatch/)
})

test('keeper endpoint reads only its frozen race pools, so unrelated Meme failures do not block Stocks', async () => {
  const configs = poolConfigsFromRegistry(registry)
  const stock = configs[0]
  const previous = { number: 0n, timestamp: 99n, hash: pad('0x11', { size: 32 }), parentHash: pad('0xff', { size: 32 }) }
  const boundary = { number: 1n, timestamp: 100n, hash: pad('0x22', { size: 32 }), parentHash: previous.hash }
  const calls = []
  const client = {
    getBlock: async ({ blockTag, blockNumber }) => blockTag === 'latest' || blockNumber === 1n ? boundary : previous,
    readContract: async ({ address, blockNumber }) => {
      if (address.toLowerCase() !== stock.poolIdentifier.toLowerCase()) throw new Error('UnrelatedMemePoolUnavailable')
      calls.push(blockNumber)
      return [Q96]
    },
  }
  const engine = new PoolPriceEngine({ client, configs })
  const pair = await engine.endpointPair(100n, [stock.oracleId])
  assert.deepEqual(Object.keys(pair.previous.assets), ['NVDA'])
  assert.deepEqual(calls, [0n, 1n])
  await assert.rejects(() => engine.endpointPair(100n, [pad('0xaa', { size: 32 })]), /UnknownPoolOracleId/)
})

test('V3/V4 sqrt price math handles orientation and decimal normalization with integers', () => {
  const common = { baseDecimals: 18, quoteDecimals: 6, outputDecimals: POOL_PRICE_DECIMALS }
  assert.equal(priceFromSqrtPriceX96({ ...common, sqrtPriceX96: Q96, baseIsToken0: true }), 10n ** 30n)
  assert.equal(priceFromSqrtPriceX96({ ...common, sqrtPriceX96: Q96, baseIsToken0: false }), 10n ** 30n)
  assert.equal(priceFromSqrtPriceX96({ ...common, sqrtPriceX96: 2n * Q96, baseIsToken0: true }), 4n * 10n ** 30n)
  assert.equal(priceFromSqrtPriceX96({ ...common, sqrtPriceX96: 2n * Q96, baseIsToken0: false }), 25n * 10n ** 28n)
  assert.equal(priceFromSqrtPriceX96({ sqrtPriceX96: Q96, baseIsToken0: true, baseDecimals: 6, quoteDecimals: 6 }), 10n ** 18n)
})

test('registry exposes ten approved pool-bound configs and reconstructs every V4 PoolId', () => {
  const configs = poolConfigsFromRegistry(registry, { category: 'STOCK' })
  assert.equal(configs.length, 10)
  assert.deepEqual(configs.map((config) => config.assetId), ['NVDA', 'TSLA', 'AAPL', 'META', 'MSTR', 'AMZN', 'MSFT', 'GOOGL', 'MU', 'NFLX'])
  for (const config of configs.filter((entry) => entry.protocol === 'UNISWAP_V4')) {
    assert.equal(v4PoolId(config.poolKey).toLowerCase(), config.poolIdentifier.toLowerCase())
  }
  const wrong = structuredClone(registry)
  wrong.assets.find((asset) => asset.assetId === 'AAPL').marketSource.poolKey.currency1 = wrong.networks['robinhood-mainnet'].settlementToken.address
  assert.throws(() => poolConfigsFromRegistry(wrong), /InvalidV4PoolKey|WrongV4PoolPair/)
})

test('13-Stock catalog uses the shared engine; five verified candidate tokens all quote canonical USDG', () => {
  const configs = poolConfigsFromRegistry(registry, { includeDisabled: true, category: 'STOCK' })
  assert.equal(configs.length, 13)
  const quote = registry.networks['robinhood-mainnet'].settlementToken.address.toLowerCase()
  for (const config of configs) {
    assert.equal(config.quoteToken.toLowerCase(), quote)
    assert.equal(config.baseDecimals, 18)
    assert.equal(config.quoteDecimals, 6)
    if (config.protocol === 'UNISWAP_V4') assert.equal(v4PoolId(config.poolKey), config.poolIdentifier)
  }
  assert.deepEqual(registry.assets.filter((asset) => asset.category === 'STOCK' && asset.tokenVerification).map((asset) => asset.assetId).sort(), ['AMD', 'COIN', 'MU', 'NFLX', 'TSM'])
  assert.ok(!configs.some((config) => ['HOOD', 'INTC', 'BABA'].includes(config.assetId)))
})

test('runtime verification rejects wrong V3 token orientation', async () => {
  const config = { ...poolConfigsFromRegistry(registry)[0], baseIsToken0: true }
  const responses = {
    decimals: [18, 6],
    token0: config.quoteToken,
    token1: config.baseToken,
    fee: config.fee,
    factory: UNISWAP_V3_FACTORY,
    getPool: config.poolIdentifier,
  }
  let decimalsCall = 0
  const client = { readContract: async ({ functionName }) => functionName === 'decimals'
    ? responses.decimals[decimalsCall++]
    : responses[functionName] }
  await assert.rejects(() => verifyPoolConfigs(client, [config]), /V3PoolMetadataMismatch/)
})

test('endpoint is the last block before T and its first boundary child may be arbitrarily delayed', async () => {
  const blocks = new Map([
    [0n, { number: 0n, timestamp: 90n, hash: pad('0x00', { size: 32 }), parentHash: pad('0xff', { size: 32 }) }],
    [1n, { number: 1n, timestamp: 99n, hash: pad('0x01', { size: 32 }), parentHash: pad('0x00', { size: 32 }) }],
    [2n, { number: 2n, timestamp: 100n, hash: pad('0x02', { size: 32 }), parentHash: pad('0x01', { size: 32 }) }],
    [3n, { number: 3n, timestamp: 100n, hash: pad('0x03', { size: 32 }), parentHash: pad('0x02', { size: 32 }) }],
    [4n, { number: 4n, timestamp: 101n, hash: pad('0x04', { size: 32 }), parentHash: pad('0x03', { size: 32 }) }],
  ])
  const client = { getBlock: async ({ blockTag, blockNumber }) => blockTag === 'latest' ? blocks.get(4n) : blocks.get(blockNumber) }
  const result = await findEndpointBlock(client, 100n, 2n)
  assert.equal(result.previous.number, 1n)
  assert.equal(result.selected.number, 2n)
  const gap = await findEndpointBlock(client, 98n)
  assert.equal(gap.previous.number, 0n)
  assert.equal(gap.selected.number, 1n)
  blocks.get(2n).timestamp = 107n
  blocks.get(3n).timestamp = 107n
  blocks.get(4n).timestamp = 108n
  const delayed = await findEndpointBlock(client, 100n)
  assert.equal(delayed.previous.number, 1n)
  assert.equal(delayed.selected.timestamp, 107n)
})

test('boundary-block pool movement cannot replace historical endpoint state, even on delayed collection', async () => {
  const blocks = [
    { number: 0n, timestamp: 90n, hash: pad('0x01', { size: 32 }), parentHash: pad('0xff', { size: 32 }) },
    { number: 1n, timestamp: 99n, hash: pad('0x02', { size: 32 }), parentHash: pad('0x01', { size: 32 }) },
    { number: 2n, timestamp: 107n, hash: pad('0x03', { size: 32 }), parentHash: pad('0x02', { size: 32 }) },
    { number: 3n, timestamp: 1000n, hash: pad('0x04', { size: 32 }), parentHash: pad('0x03', { size: 32 }) },
  ]
  const client = {
    getBlock: async ({ blockTag, blockNumber }) => blockTag === 'latest' ? blocks[3] : blocks[Number(blockNumber)],
    readContract: async ({ blockNumber }) => [blockNumber === 1n ? Q96 : 2n * Q96],
  }
  const engine = new PoolPriceEngine({ client, configs: poolConfigsFromRegistry(registry).slice(0, 2) })
  const first = await engine.endpointPair(100n)
  const later = await engine.endpointPair(100n)
  assert.equal(first.previous.block.number, 1n)
  assert.notEqual(first.previous.assets.NVDA.priceRaw, first.selected.assets.NVDA.priceRaw)
  assert.deepEqual(later.previous, first.previous)
  assert.ok(Object.values(first.previous.assets).every((entry) => entry.blockHash === blocks[1].hash))
})

test('one engine heartbeat uses one explicit source block for all pools', async () => {
  const block = { number: 77n, timestamp: 100n, hash: pad('0x77', { size: 32 }), parentHash: pad('0x76', { size: 32 }) }
  const calls = []
  const configs = poolConfigsFromRegistry(registry).slice(0, 2)
  const client = {
    getBlock: async () => block,
    readContract: async (request) => { calls.push(request.blockNumber); return [Q96, 0, 0, 0, 0, 0, true] },
  }
  const snapshot = await new PoolPriceEngine({ client, configs }).latestSnapshot()
  assert.equal(Object.keys(snapshot.assets).length, 2)
  assert.deepEqual(calls, [77n, 77n])
  assert.ok(Object.values(snapshot.assets).every((entry) => entry.blockHash === block.hash))
})
