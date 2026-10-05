import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccountHistory } from './history.mjs'

const buf = (n) => Buffer.from([n])

test('state at a slot is the latest change at or before it', () => {
  const h = new AccountHistory()
  h.record('A', 100, buf(1))
  h.record('A', 105, buf(2))
  h.record('A', 103, buf(9)) // out-of-order arrival is placed by slot
  assert.deepEqual(h.stateAt('A', 100), buf(1))
  assert.deepEqual(h.stateAt('A', 104), buf(9))
  assert.deepEqual(h.stateAt('A', 200), buf(2))
  assert.throws(() => h.stateAt('A', 99), /no recorded state/)
})

test('a repeated slot replaces the entry', () => {
  const h = new AccountHistory()
  h.record('A', 10, buf(1))
  h.record('A', 10, buf(2))
  assert.equal(h.entries.get('A').length, 1)
  assert.deepEqual(h.stateAt('A', 10), buf(2))
})

test('slots inside a gap are unknown unless recorded exactly', () => {
  const h = new AccountHistory()
  h.record('A', 100, buf(1))
  h.markGap('A', 100, 200)
  h.record('A', 150, buf(5))
  h.record('A', 200, buf(7))
  assert.deepEqual(h.stateAt('A', 100), buf(1)) // the gap's left edge was observed
  assert.throws(() => h.stateAt('A', 120), /missed/)
  assert.deepEqual(h.stateAt('A', 150), buf(5)) // exact notification inside the gap
  assert.throws(() => h.stateAt('A', 160), /missed/)
  assert.deepEqual(h.stateAt('A', 200), buf(7)) // fresh state after the gap
})

test('prune keeps one base entry so recent slots stay answerable', () => {
  const h = new AccountHistory()
  for (const slot of [10, 20, 30, 40]) h.record('A', slot, buf(slot))
  h.prune(35)
  assert.deepEqual(h.entries.get('A').map((e) => e.slot), [30, 40])
  assert.deepEqual(h.stateAt('A', 36), buf(30))
})

test('an open gap hides everything after it until a baseline closes it', () => {
  const h = new AccountHistory()
  h.record('A', 100, buf(1))
  h.openGap('A', 100)
  // The outage has no known end: later slots must not fall back to slot 100.
  assert.throws(() => h.stateAt('A', 150), /missed/)
  assert.throws(() => h.stateAt('A', 10_000), /missed/)
  h.record('A', 180, buf(7)) // baseline after the reconnect
  h.closeOpenGaps('A', 180)
  assert.throws(() => h.stateAt('A', 150), /missed/)
  assert.deepEqual(h.stateAt('A', 180), buf(7))
  assert.deepEqual(h.stateAt('A', 250), buf(7))
  h.prune(120)
  assert.throws(() => h.stateAt('A', 150), /missed/) // a closed gap ending after the prune point stays
})
