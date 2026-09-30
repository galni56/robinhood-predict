import assert from 'node:assert/strict'
import test from 'node:test'
import { predictionSettlementPrice } from '../src/chain/predictionMarketSettlement.ts'

test('decodes the numeric price from a settlement tuple', () => {
  assert.equal(predictionSettlementPrice([225_000000000000000000n, 1_790_000_000n, `0x${'ab'.repeat(32)}`]), 225_000000000000000000n)
})

test('rejects a mismatched getMarket row instead of displaying its bytes32 asset id', () => {
  assert.equal(predictionSettlementPrice([`0x${'54'.repeat(32)}`, `0x${'00'.repeat(32)}`, 18]), undefined)
  assert.equal(predictionSettlementPrice({ assetId: `0x${'54'.repeat(32)}` }), undefined)
  assert.equal(predictionSettlementPrice(undefined), undefined)
})
