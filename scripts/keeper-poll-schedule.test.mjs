import assert from 'node:assert/strict'
import test from 'node:test'
import { nextSleepMs } from './keeper-poll-schedule.mjs'

test('nextSleepMs backs off to the idle cap when nothing is tracked', () => {
  assert.equal(nextSleepMs(undefined, 4_000, 20_000, 0), 20_000)
})

test('nextSleepMs caps a far-future due time at the idle interval, never the full wait', () => {
  // Due in 5 real minutes, but we still only sleep the idle cap.
  assert.equal(nextSleepMs(300n, 4_000, 20_000, 0), 20_000)
})

test('nextSleepMs sleeps exactly until due when that falls between the floor and the cap', () => {
  assert.equal(nextSleepMs(300n, 4_000, 20_000, 290_000), 10_000)
})

test('nextSleepMs floors at pollIntervalMs for an already-due or just-missed item, never zero/negative', () => {
  assert.equal(nextSleepMs(300n, 4_000, 20_000, 300_000), 4_000)
  assert.equal(nextSleepMs(300n, 4_000, 20_000, 999_000), 4_000)
})

test('nextSleepMs never exceeds the idle cap even with a zero poll floor', () => {
  assert.equal(nextSleepMs(undefined, 0, 20_000, 0), 20_000)
  assert.equal(nextSleepMs(1_000_000n, 0, 20_000, 0), 20_000)
})
