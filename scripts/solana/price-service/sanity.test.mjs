import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkBoundaryPrice, deviationBp, weightedMedian } from './sanity.mjs'

const s = (slot, price) => ({ slot, price: BigInt(price) })

test('weighted median follows how long each price held', () => {
  // 100 held for 70 slots, 200 for 1 slot, 105 for 79 slots.
  assert.equal(weightedMedian([s(0, 100), s(70, 200), s(71, 105)], 149), 105n)
  assert.equal(weightedMedian([s(0, 100)], 10), 100n)
  assert.equal(weightedMedian([], 10), null)
})

test('a one-block spike at the boundary is refused', () => {
  const samples = [s(0, 1000), s(75, 1300), s(76, 1001)]
  const reason = checkBoundaryPrice({ price: 1300n, samples, endSlot: 150, maxDeviationBp: 500 })
  assert.match(reason, /29.87% from the 1001 median/)
})

test('a real move that persists after the boundary passes', () => {
  // The price climbs to 1080 just before the boundary and stays there.
  const samples = [s(0, 1000), s(40, 1040), s(70, 1080)]
  assert.equal(checkBoundaryPrice({ price: 1080n, samples, endSlot: 150, maxDeviationBp: 500 }), null)
})

test('threshold 0 turns the check off', () => {
  assert.equal(checkBoundaryPrice({ price: 9999n, samples: [s(0, 1)], endSlot: 10, maxDeviationBp: 0 }), null)
})

test('deviation in basis points', () => {
  assert.equal(deviationBp(105n, 100n), 500)
  assert.equal(deviationBp(95n, 100n), 500)
  assert.equal(deviationBp(1n, 0n), Infinity)
})
