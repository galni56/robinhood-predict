import assert from 'node:assert/strict'
import test from 'node:test'
import { isActiveOnchainStatus, reconcileGameSnapshots } from '../src/chain/gameSnapshots.ts'

test('partial refreshes retain the last complete snapshot by game id', () => {
  const previous = [
    { id: 3n, status: 0, title: 'newest' },
    { id: 2n, status: 0, title: 'older' },
  ]

  assert.deepEqual(
    reconcileGameSnapshots(previous, [4n, 3n, 2n], [null, null, { id: 2n, status: 1, title: 'updated' }]),
    [
      { id: 3n, status: 0, title: 'newest' },
      { id: 2n, status: 1, title: 'updated' },
    ],
  )
})

test('successful terminal updates replace stale active state without local-time inference', () => {
  const active = [{ id: 9n, status: 0 }]
  assert.deepEqual(reconcileGameSnapshots(active, [9n], [{ id: 9n, status: 3 }]), [{ id: 9n, status: 3 }])
  assert.equal(isActiveOnchainStatus(0, [2, 3, 4]), true)
  assert.equal(isActiveOnchainStatus(1, [2, 3, 4]), true)
  assert.equal(isActiveOnchainStatus(3, [2, 3, 4]), false)
})

test('snapshots outside the bounded recent-id window are pruned', () => {
  assert.deepEqual(
    reconcileGameSnapshots([{ id: 1n, status: 0 }, { id: 2n, status: 0 }], [2n, 3n], [null, null]),
    [{ id: 2n, status: 0 }],
  )
})
