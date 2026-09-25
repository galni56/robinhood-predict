import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LIVE_DISPLAY_RETURN_SCALE,
  calculateLiveDisplayReturnWad,
  displayedRaceReturnWad,
  parseAssetRaceLiveSnapshot,
} from '../src/chain/assetRaceLiveDisplay.ts'
import {
  freezeUsdStakeQuote,
  parseUsdCents,
  usdCentsToWei,
} from '../src/chain/ethUsd.ts'

test('Meme WETH heartbeat uses official P0 across refresh/late viewers, not a USD/display anchor', () => {
  const entry = { assetId: 'AI', oracleId: `0x${'11'.repeat(32)}`, priceQuote: '0.0011', quoteSymbol: 'WETH',
    priceRaw: '1100000000000000', decimals: 18, blockNumber: '10', blockHash: `0x${'22'.repeat(32)}`,
    blockTimestamp: 900, poolIdentifier: `0x${'33'.repeat(20)}`, protocol: 'UNISWAP_V3',
    receivedAt: 1_000, priceChangedAt: 1_000, provider: 'ROBINHOOD_POOL_RPC', stale: false }
  const snapshot = parseAssetRaceLiveSnapshot({ provider: 'ROBINHOOD_POOL_RPC', heartbeatAt: 1_000,
    staleAfterMs: 5_000, upstreamRequestCount: 1, assets: { AI: entry }, errors: {} })
  assert.equal(snapshot.assets.AI.quoteSymbol, 'WETH')
  assert.equal(snapshot.assets.AI.priceUsdG, undefined)
  const officialP0 = 1_000_000_000_000_000n
  const render = () => displayedRaceReturnWad({ final: false, officialReturn: 0n,
    settlementStartPrice: officialP0, livePrice: BigInt(snapshot.assets.AI.priceRaw) })
  assert.equal(render(), LIVE_DISPLAY_RETURN_SCALE / 10n)
  assert.equal(render(), render())
})

test('pool movement uses exact bigint return math from official onchain P0', () => {
  const p0 = 10n * 10n ** 18n
  const current = 11n * 10n ** 18n
  assert.equal(calculateLiveDisplayReturnWad(p0, current), LIVE_DISPLAY_RETURN_SCALE / 10n)
})

test('official final return replaces provisional live return', () => {
  const result = displayedRaceReturnWad({
    final: true,
    officialReturn: -5n,
    settlementStartPrice: 100n,
    livePrice: 200n,
  })
  assert.equal(result, -5n)
})

test('USD stake conversion uses fixed-point bigint math only', () => {
  const priceRaw = 2500n * 10n ** 8n
  assert.equal(parseUsdCents('1'), 100n)
  assert.equal(parseUsdCents('12.34'), 1_234n)
  assert.equal(usdCentsToWei(100n, priceRaw, 8), 400_000_000_000_000n)
  assert.equal(usdCentsToWei(5_000n, priceRaw, 8), 20_000_000_000_000_000n)
  assert.throws(() => parseUsdCents('1.005'), /InvalidUsdAmount/)
})

test('wallet quote freezes exact wei and rejects stale or out-of-range input', () => {
  const quote = {
    provider: 'COINBASE_EXCHANGE', pair: 'ETH-USD', priceUsd: '2500.00',
    priceRaw: '250000000000', decimals: 8, receivedAt: 10_000,
    staleAfterMs: 45_000, stale: false,
  }
  const frozen = freezeUsdStakeQuote('50.00', quote, 20_000)
  assert.equal(frozen.usdCents, 5_000n)
  assert.equal(frozen.wei, 20_000_000_000_000_000n)
  assert.equal(frozen.ethUsdPriceRaw, 250_000_000_000n)
  assert.throws(() => freezeUsdStakeQuote('50.01', quote, 20_000), /UsdStakeOutOfRange/)
  assert.throws(() => freezeUsdStakeQuote('1', quote, 60_001), /EthUsdQuoteStale/)
})
