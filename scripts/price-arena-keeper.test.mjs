import assert from 'node:assert/strict'
import test from 'node:test'
import { ActiveArenaTracker, transitionForArena } from './price-arena-keeper.mjs'

test('transition becomes due only at the immutable deadline', () => {
  const arena = { status: 0, deadline: 1_000n, participantCount: 2 }
  assert.equal(transitionForArena(arena, 999n), undefined)
  assert.deepEqual(transitionForArena(arena, 1_000n), { needsEndpointProof: true, outcome: 'DEADLINE_SETTLEMENT' })
  assert.equal(transitionForArena({ ...arena, status: 1 }, 1_000n), undefined)
})

test('an undersubscribed arena resolves as cancellation without an endpoint proof', () => {
  assert.deepEqual(
    transitionForArena({ status: 0, deadline: 10n, participantCount: 1 }, 10n),
    { needsEndpointProof: false, outcome: 'CANCELLED' },
  )
})

test('tracker keeps only open arenas and orders due ids', () => {
  const tracker = new ActiveArenaTracker()
  tracker.observe(3n, { status: 0, deadline: 30n })
  tracker.observe(1n, { status: 0, deadline: 10n })
  tracker.observe(2n, { status: 1, deadline: 5n })
  assert.deepEqual(tracker.dueArenaIds(30n), [1n, 3n])
  tracker.complete(1n)
  assert.deepEqual(tracker.dueArenaIds(30n), [3n])
})

test('tracker reports the soonest deadline across tracked arenas, or undefined when idle', () => {
  const tracker = new ActiveArenaTracker()
  assert.equal(tracker.earliestDueAt(), undefined)

  tracker.observe(0n, { status: 0, deadline: 300n })
  tracker.observe(1n, { status: 0, deadline: 150n })
  assert.equal(tracker.earliestDueAt(), 150n)

  tracker.complete(1n)
  assert.equal(tracker.earliestDueAt(), 300n)

  tracker.observe(0n, { status: 1 }) // resolved -> terminal -> no longer tracked
  assert.equal(tracker.earliestDueAt(), undefined)
})
