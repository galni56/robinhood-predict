import assert from 'node:assert/strict'
import test from 'node:test'
import { assetPriceChartUrl, parseAssetPriceHistory } from '../src/chain/assetPriceHistory.ts'

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
