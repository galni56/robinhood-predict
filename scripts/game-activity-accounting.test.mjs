import assert from 'node:assert/strict'
import test from 'node:test'
import { settledGameUserStats } from '../src/chain/gameActivityAccounting.ts'

const ALICE = '0x0000000000000000000000000000000000000001'
const BOB = '0x0000000000000000000000000000000000000002'

function byAddress(rows, address) {
  return rows.find((row) => row.address.toLowerCase() === address.toLowerCase())
}

test('claimed Arena winner shows payout minus the resolved arena stake', () => {
  const rows = settledGameUserStats(
    [{ gameId: 300n, user: ALICE, stake: 3725n }],
    [{ gameId: 300n, user: ALICE, payout: 7376n }],
    new Set(['300']),
  )

  const alice = byAddress(rows, ALICE)
  assert.equal(alice.claimed - alice.staked, 3651n)
  assert.equal(alice.bets, 1)
})

test('open and cancelled Arena stakes do not turn into leaderboard losses', () => {
  const rows = settledGameUserStats(
    [
      { gameId: 300n, user: ALICE, stake: 3725n },
      { gameId: 301n, user: ALICE, stake: 4000n },
      { gameId: 299n, user: ALICE, stake: 5000n },
    ],
    [{ gameId: 300n, user: ALICE, payout: 7376n }],
    new Set(['300']),
  )

  const alice = byAddress(rows, ALICE)
  assert.deepEqual(alice, { address: ALICE, staked: 3725n, claimed: 7376n, bets: 1 })
})

test('resolved losers are included and cumulative entry updates count once', () => {
  const rows = settledGameUserStats(
    [
      { gameId: 300n, user: ALICE, stake: 3725n },
      { gameId: 300n, user: BOB, stake: 3725n },
    ],
    [{ gameId: 300n, user: ALICE, payout: 7376n }],
    new Set(['300']),
  )

  assert.equal(byAddress(rows, BOB).claimed - byAddress(rows, BOB).staked, -3725n)
  assert.equal(byAddress(rows, BOB).bets, 1)
})

test('claims without a confirmed resolved game are ignored defensively', () => {
  const rows = settledGameUserStats(
    [{ gameId: 300n, user: ALICE, stake: 3725n }],
    [{ gameId: 301n, user: ALICE, payout: 7376n }],
    new Set(['300']),
  )

  assert.deepEqual(byAddress(rows, ALICE), { address: ALICE, staked: 3725n, claimed: 0n, bets: 1 })
})
