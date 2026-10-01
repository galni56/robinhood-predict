import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACTIVE_GAME_POLL_INTERVAL_MS,
  ACTIVE_GAME_REFRESH_OPTIONS,
  GAME_SNAPSHOT_MULTICALL_BATCH_SIZE,
  clearSessionGameSnapshots,
  isActiveOnchainStatus,
  readSessionGameSnapshots,
  reconcileGameSnapshots,
  reconcileGameSnapshotsWhenReady,
  selectMonotonicGameCount,
  splitProgressiveGameIds,
  writeSessionGameSnapshots,
} from '../src/chain/gameSnapshots.ts'
import {
  buildGameHistoryIndex,
  visibleIdsThroughCount,
} from '../src/chain/gameHistoryIndex.ts'

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

test('snapshots outside the current visible-id set are pruned', () => {
  assert.deepEqual(
    reconcileGameSnapshots([{ id: 1n, status: 0 }, { id: 2n, status: 0 }], [2n, 3n], [null, null]),
    [{ id: 2n, status: 0 }],
  )
})

test('route remount keeps cached cards until the refreshed count is ready', () => {
  const previous = [{ id: 11n, status: 0 }, { id: 10n, status: 1 }]
  assert.deepEqual(reconcileGameSnapshotsWhenReady(previous, [], [], false), previous)
  assert.deepEqual(reconcileGameSnapshotsWhenReady(previous, [12n, 11n], [null, null], true), [previous[0]])
})

test('active game queries always refresh on route activation, focus, and reconnect', () => {
  assert.equal(ACTIVE_GAME_REFRESH_OPTIONS.refetchOnMount, 'always')
  assert.equal(ACTIVE_GAME_REFRESH_OPTIONS.refetchOnWindowFocus, 'always')
  assert.equal(ACTIVE_GAME_REFRESH_OPTIONS.refetchOnReconnect, 'always')
  assert.equal(ACTIVE_GAME_REFRESH_OPTIONS.refetchIntervalInBackground, false)
  assert.equal(ACTIVE_GAME_REFRESH_OPTIONS.staleTime, 0)
  assert.equal(ACTIVE_GAME_POLL_INTERVAL_MS, 1_000)
  assert.equal(GAME_SNAPSHOT_MULTICALL_BATCH_SIZE, 0)
})

test('visible product snapshots survive route unmount and remount in the SPA session', () => {
  const key = 'test-races'
  clearSessionGameSnapshots(key)
  const active = [{ id: 15n, status: 1, title: 'AAPL vs META' }]
  writeSessionGameSnapshots(key, active)
  assert.deepEqual(readSessionGameSnapshots(key), active)
  const restored = readSessionGameSnapshots(key)
  restored.length = 0
  assert.deepEqual(readSessionGameSnapshots(key), active)
  clearSessionGameSnapshots(key)
})

test('append-only game counts ignore stale lower-block RPC responses', () => {
  assert.equal(selectMonotonicGameCount(168n, undefined), 168n)
  assert.equal(selectMonotonicGameCount(168n, 0n), 168n)
  assert.equal(selectMonotonicGameCount(168n, 139n), 168n)
  assert.equal(selectMonotonicGameCount(168n, 168n), 168n)
  assert.equal(selectMonotonicGameCount(168n, 169n), 169n)
})

test('progressive discovery reads newest ids first without dropping history', () => {
  const ascending = [10n, 11n, 12n, 13n, 14n]
  assert.deepEqual(splitProgressiveGameIds(ascending, 2), {
    fastIds: [13n, 14n],
    historyIds: [10n, 11n, 12n],
  })

  const descending = [...ascending].reverse()
  assert.deepEqual(splitProgressiveGameIds(descending, 2, true), {
    fastIds: [14n, 13n],
    historyIds: [12n, 11n, 10n],
  })
})

test('complete history keeps every game except an empty cancellation', () => {
  const index = buildGameHistoryIndex(
    [0n, 1n, 2n, 3n, 4n],
    [0n, 1n],
    [2n, 3n],
    [0n, 2n, 4n],
  )

  assert.deepEqual(index.visibleIds, [4n, 2n, 1n, 0n])
  assert.deepEqual(index.terminalIds, [2n, 1n, 0n])
  assert.equal(index.indexedCount, 5)
})

test('new count tail appears before the slower history index refreshes', () => {
  const index = buildGameHistoryIndex([0n, 1n], [], [], [])
  assert.deepEqual(visibleIdsThroughCount(index, 5), [4n, 3n, 2n, 1n, 0n])
  assert.deepEqual(visibleIdsThroughCount(index, 5, false), [0n, 1n, 2n, 3n, 4n])
})
