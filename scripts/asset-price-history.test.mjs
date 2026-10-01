import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assetPriceChartUrl,
  assetPriceCandleIntervalMs,
  buildAssetPriceCandles,
  filterAssetPriceWindow,
  mergeAssetPriceHistory,
  parseAssetPriceHistory,
  sampleAssetPriceSeries,
} from '../src/chain/assetPriceHistory.ts'

function point(receivedAt, priceRaw = String(receivedAt)) {
  return { receivedAt, priceRaw, decimals: 18 }
}

test('internal chart URLs are stable hash routes and reject malformed symbols', () => {
  assert.equal(assetPriceChartUrl('NVDA'), '#/onchain/charts/NVDA')
  assert.equal(assetPriceChartUrl('CASHCAT'), '#/onchain/charts/CASHCAT')
  assert.equal(assetPriceChartUrl('../bad'), undefined)
  assert.equal(assetPriceChartUrl(''), undefined)
})

test('price history parser keeps valid exact-pool points and drops malformed rows', () => {
  const parsed = parseAssetPriceHistory({
    assetId: 'NVDA',
    quoteSymbol: 'USDG',
    protocol: 'UNISWAP_V3',
    poolIdentifier: `0x${'11'.repeat(20)}`,
    points: [
      { priceRaw: '225000000000000000000', decimals: 18, receivedAt: 1_000, blockTimestamp: 900, blockNumber: '10' },
      { priceRaw: 'not-a-price', decimals: 18, receivedAt: 2_000 },
    ],
  }, 'NVDA')
  assert.equal(parsed?.points.length, 1)
  assert.equal(parsed?.points[0].blockNumber, '10')
  assert.equal(parseAssetPriceHistory({ assetId: 'TSLA', points: [] }, 'NVDA'), undefined)
})

test('merges live points in chronological order without losing a corrected timestamp', () => {
  const merged = mergeAssetPriceHistory(
    [point(1_000), point(3_000)],
    [point(2_000), point(3_000, '99')],
  )
  assert.deepEqual(merged.map((entry) => entry.receivedAt), [1_000, 2_000, 3_000])
  assert.equal(merged.at(-1).priceRaw, '99')
})

test('keeps exactly the selected short timeframe', () => {
  const anchor = 600_000
  const points = [point(299_999), point(300_000), point(540_000), point(anchor)]
  assert.deepEqual(filterAssetPriceWindow(points, '1M', anchor).map((entry) => entry.receivedAt), [540_000, 600_000])
  assert.deepEqual(filterAssetPriceWindow(points, '5M', anchor).map((entry) => entry.receivedAt), [300_000, 540_000, 600_000])
  assert.equal(filterAssetPriceWindow(points, 'ALL', anchor), points)
})

test('chart sampling preserves both endpoints and stays within the render limit', () => {
  const points = Array.from({ length: 5_000 }, (_, index) => point(index + 1))
  const sampled = sampleAssetPriceSeries(points, 1_200)
  assert.equal(sampled.length, 1_200)
  assert.equal(sampled[0], points[0])
  assert.equal(sampled.at(-1), points.at(-1))
})

test('builds exact OHLC candles for real one-minute and five-minute intervals', () => {
  const observations = [
    { receivedAt: 61_000, price: 100, blockNumber: '10' },
    { receivedAt: 75_000, price: 104, blockNumber: '11' },
    { receivedAt: 90_000, price: 98, blockNumber: '12' },
    { receivedAt: 119_000, price: 102, blockNumber: '13' },
    { receivedAt: 121_000, price: 103, blockNumber: '14' },
  ]
  const oneMinute = buildAssetPriceCandles(observations, '1m')
  assert.deepEqual(oneMinute, [
    { startTime: 60_000, endTime: 120_000, open: 100, high: 104, low: 98, close: 102, updates: 4, blockNumber: '13' },
    { startTime: 120_000, endTime: 180_000, open: 103, high: 103, low: 103, close: 103, updates: 1, blockNumber: '14' },
  ])
  assert.deepEqual(buildAssetPriceCandles(observations, '5m'), [
    { startTime: 0, endTime: 300_000, open: 100, high: 104, low: 98, close: 103, updates: 5, blockNumber: '14' },
  ])
  assert.equal(assetPriceCandleIntervalMs('15m'), 900_000)
})

test('candle builder sorts observations and ignores invalid prices', () => {
  const candles = buildAssetPriceCandles([
    { receivedAt: 180_000, price: 9 },
    { receivedAt: 120_000, price: 7 },
    { receivedAt: 150_000, price: Number.NaN },
    { receivedAt: 140_000, price: 8 },
  ], '1m')
  assert.deepEqual(candles.map(({ open, high, low, close, updates }) => ({ open, high, low, close, updates })), [
    { open: 7, high: 8, low: 7, close: 8, updates: 2 },
    { open: 9, high: 9, low: 9, close: 9, updates: 1 },
  ])
})
