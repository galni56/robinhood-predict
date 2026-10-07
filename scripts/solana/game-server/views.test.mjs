import { test } from 'node:test'
import assert from 'node:assert/strict'
import { historyView } from './views.mjs'

// A Price Shot stake is a deposit since stakes became transfers: /history
// used to crash on it (a shot has no race positions).
test('history counts Price Shot stakes and wins on the Shot board', () => {
  const deposit = { status: 'accepted', game_kind: 'shot', game_id: 2, wallet: 'W1', amount: '8568300', signature: 's1', slot: 1, block_time: 10 }
  const payout = { game_kind: 'shot', game_id: 2, wallet: 'W1', kind: 'win', amount: '16966945', signature: 'p1', done_at: 20 }
  const db = { recentDeposits: () => [deposit], acceptedDeposits: () => [deposit], recentPayouts: () => [payout], donePayouts: () => [payout] }
  const games = [{ kind: 'shot', id: 2, symbol: 'NEAR' }]
  const view = historyView(db, 'mainnet', 'GAME', games)
  assert.equal(view.activity.length, 2)
  assert.equal(view.leaderboards.arena[0].wallet, 'W1')
  assert.equal(view.leaderboards.arena[0].net, String(16966945 - 8568300))
  assert.deepEqual(view.leaderboards.arena[0].symbols, ['NEAR'])
})
