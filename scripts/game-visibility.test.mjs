import assert from 'node:assert/strict'
import test from 'node:test'
import { isPlayedCancellation, isVisibleInAll } from '../src/chain/gameVisibility.ts'

test('All hides only zero-pool cancellations in every product', () => {
  for (const [product, cancelledStatus] of [['Prediction Market', 2], ['Asset Race', 3], ['Price Arena', 3]]) {
    assert.equal(isVisibleInAll(cancelledStatus, cancelledStatus, 0n), false, `${product}: empty cancellation`)
    assert.equal(isVisibleInAll(cancelledStatus, cancelledStatus, 1n), true, `${product}: played cancellation`)
    assert.equal(isVisibleInAll(0, cancelledStatus, 0n), true, `${product}: open game`)
  }
  assert.equal(isVisibleInAll(4, 3, 0n), true, 'Race VOID remains visible')
})

test('Cancelled filters keep only cancellations with a real stake in every product', () => {
  for (const [product, cancelledStatus] of [['Prediction Market', 2], ['Asset Race', 3], ['Price Arena', 3]]) {
    assert.equal(isPlayedCancellation(cancelledStatus, cancelledStatus, 0n), false, `${product}: empty cancellation`)
    assert.equal(isPlayedCancellation(cancelledStatus, cancelledStatus, 1n), true, `${product}: played cancellation`)
    assert.equal(isPlayedCancellation(1, cancelledStatus, 1n), false, `${product}: non-cancelled game`)
  }
})
