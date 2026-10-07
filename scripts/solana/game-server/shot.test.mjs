import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RuleError } from './rules.mjs'
import { SHOT, createShot, joinShot, leaveShot, lockShot, readyShot, resolveShot, shotCredits, shotTimers } from './shot.mjs'

const SOL = 1_000_000_000n
const ASSET = { symbol: 'WIF', priceSource: 'pool-WIF', priceDecimals: 6, category: 'meme' }
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof RuleError && e.code === code)

function room(players, now = 100) {
  const shot = createShot(1, { creator: players[0], duration: 60 }, ASSET, now)
  for (const p of players) joinShot(shot, p, now)
  return shot
}

test('ready: more than half and at least two; the rest sit this match out', () => {
  const shot = room(['a', 'b', 'c', 'd'])
  readyShot(shot, 'a', true, 110)
  readyShot(shot, 'b', true, 110)
  assert.equal(shot.status, 'open', 'two of four is only half')
  readyShot(shot, 'b', false, 111)
  readyShot(shot, 'b', true, 112)
  readyShot(shot, 'c', true, 113)
  assert.equal(shot.status, 'aim')
  assert.deepEqual(shot.players.map((p) => p.wallet), ['a', 'b', 'c'])
  assert.equal(shot.aimEndsAt, 113 + SHOT.aimSeconds)
  throwsCode(() => joinShot(shot, 'e', 114), 'RoomClosed')
  throwsCode(() => leaveShot(shot, 'a'), 'RoomClosed')
})

test('a lone ready player never starts a match', () => {
  const shot = room(['a'])
  readyShot(shot, 'a', true, 110)
  assert.equal(shot.status, 'open')
})

test('odd field: one more loser than winners; payouts weighted by accuracy', () => {
  // Five in the room: the third ready player (3 of 5) starts the aim.
  const shot = room(['a', 'b', 'c', 'd', 'e'])
  for (const p of ['a', 'b', 'c']) readyShot(shot, p, true, 110)
  assert.equal(shot.players.length, 3)
  lockShot(shot, { wallet: 'a', prediction: 1000n, stake: SOL / 10n }, 111)
  lockShot(shot, { wallet: 'b', prediction: 1050n, stake: SOL / 10n }, 112)
  lockShot(shot, { wallet: 'c', prediction: 2000n, stake: SOL / 10n }, 113)
  throwsCode(() => lockShot(shot, { wallet: 'a', prediction: 1n, stake: SOL / 10n }, 114), 'AlreadyLocked')
  shotTimers(shot, shot.aimEndsAt)
  assert.equal(shot.status, 'live')
  resolveShot(shot, { price: 1000n, prevSlot: 9, prevBlockTime: shot.deadline - 1 }, shot.deadline + 5)
  assert.equal(shot.winnerCount, 1)
  const credits = shotCredits(shot)
  const win = credits.find((c) => c.reason === 'win')
  assert.equal(win.wallet, 'a')
  assert.equal(win.amount, SOL / 10n + ((2n * SOL) / 10n) * 98n / 100n)
  assert.equal(credits.find((c) => c.reason === 'creator').amount, ((2n * SOL) / 10n) / 100n)
})

test('aim closes on time; a stale deadline price cancels with refunds', () => {
  const shot = room(['a', 'b'])
  readyShot(shot, 'a', true, 110)
  readyShot(shot, 'b', true, 110)
  lockShot(shot, { wallet: 'a', prediction: 5n, stake: SOL / 100n }, 120)
  throwsCode(() => lockShot(shot, { wallet: 'b', prediction: 5n, stake: SOL / 100n }, shot.aimEndsAt), 'AimClosed')
  lockShot(shot, { wallet: 'b', prediction: 6n, stake: SOL / 100n }, shot.aimEndsAt - 1)
  shotTimers(shot, shot.aimEndsAt)
  resolveShot(shot, { price: 5n, prevSlot: 9, prevBlockTime: shot.deadline - SHOT.maxPriceStaleness - 1 }, shot.deadline + 5)
  assert.equal(shot.status, 'cancelled')
  assert.deepEqual(shotCredits(shot).map((c) => [c.wallet, c.amount, c.reason]), [['a', SOL / 100n, 'refund'], ['b', SOL / 100n, 'refund']])
})

test('an empty room closes after a while; a room with players stays', () => {
  const shot = room(['a'])
  leaveShot(shot, 'a')
  assert.equal(shotTimers(shot, 100 + SHOT.idleRoomSeconds), null)
  assert.equal(shotTimers(shot, 101 + SHOT.idleRoomSeconds), 'cancelled')
  const busy = room(['a'])
  assert.equal(shotTimers(busy, 100 + 10 * SHOT.idleRoomSeconds), null)
})
