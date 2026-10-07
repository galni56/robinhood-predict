import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RuleError } from './rules.mjs'
import { SHOT, aimShot, createShot, joinShot, leaveShot, lockShot, readyShot, resolveShot, shotSettlements, shotStartsAt, shotTimers } from './shot.mjs'

const SOL = 1_000_000_000n
const ASSET = { symbol: 'WIF', priceSource: 'pool-WIF', priceDecimals: 6, category: 'meme' }
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof RuleError && e.code === code)
/** Lock Shot as the server sees it: the signed price, then the stake transfer. */
const lock = (shot, wallet, prediction, stake, time) => {
  aimShot(shot, { wallet, prediction }, time)
  lockShot(shot, { wallet, amount: stake, time })
}

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
  lock(shot, 'a', 1000n, SOL / 10n, 111)
  lock(shot, 'b', 1050n, SOL / 10n, 112)
  lock(shot, 'c', 2000n, SOL / 10n, 113)
  throwsCode(() => aimShot(shot, { wallet: 'a', prediction: 1n }, 114), 'AlreadyLocked')
  throwsCode(() => lockShot(shot, { wallet: 'a', amount: SOL / 10n, time: 114 }), 'AlreadyLocked')
  shotTimers(shot, shot.aimEndsAt + 2)
  assert.equal(shot.status, 'live', 'every aimed shot is locked: no confirming wait')
  assert.equal(shot.deadline, shot.aimEndsAt + 2 + 60, 'the full length from the real start')
  resolveShot(shot, { price: 1000n, prevSlot: 9, prevBlockTime: shot.deadline - 1 }, shot.deadline + 5)
  assert.equal(shot.winnerCount, 1)
  const [win, ...others] = shotSettlements(shot)
  assert.equal(win.wallet, 'a')
  assert.equal(win.amount, SOL / 10n + ((2n * SOL) / 10n) * 98n / 100n)
  assert.equal(others.length, 0)
  assert.equal(shot.creatorFee, ((2n * SOL) / 10n) / 100n, 'the creator half of the fee, paid like an arena creator')
})

test('a shot locked in the last second still counts; its stake has the grace to confirm', () => {
  const shot = room(['a', 'b'])
  readyShot(shot, 'a', true, 110)
  readyShot(shot, 'b', true, 110)
  lock(shot, 'a', 5n, SOL / 100n, 120)
  aimShot(shot, { wallet: 'b', prediction: 6n }, shot.aimEndsAt - 1)
  throwsCode(() => aimShot(shot, { wallet: 'a', prediction: 7n }, shot.aimEndsAt), 'AimClosed')
  throwsCode(() => lockShot(shot, { wallet: 'b', amount: SOL / 100n, time: shot.aimEndsAt + SHOT.lockGrace }), 'AimClosed')
  lockShot(shot, { wallet: 'b', amount: SOL / 100n, time: shot.aimEndsAt + 3 })
  assert.equal(shot.entries.length, 2)
  shotTimers(shot, shotStartsAt(shot))
  resolveShot(shot, { price: 5n, prevSlot: 9, prevBlockTime: shot.deadline - SHOT.maxPriceStaleness - 1 }, shot.deadline + 5)
  assert.equal(shot.status, 'cancelled')
  assert.deepEqual(shotSettlements(shot).map((c) => [c.wallet, c.amount, c.reason]), [['a', SOL / 100n, 'refund'], ['b', SOL / 100n, 'refund']])
})

test('an empty room closes after a while; a room with players stays', () => {
  const shot = room(['a'])
  leaveShot(shot, 'a')
  assert.equal(shotTimers(shot, 100 + SHOT.idleRoomSeconds), null)
  assert.equal(shotTimers(shot, 101 + SHOT.idleRoomSeconds), 'cancelled')
  const busy = room(['a'])
  assert.equal(shotTimers(busy, 100 + 10 * SHOT.idleRoomSeconds), null)
})

test('a stake without an aimed price, or out of the stake limits, is refused (and so refunded)', () => {
  const shot = room(['a', 'b'])
  readyShot(shot, 'a', true, 110)
  readyShot(shot, 'b', true, 110)
  throwsCode(() => lockShot(shot, { wallet: 'a', amount: SOL / 10n, time: 111 }), 'NoAimedPrice')
  aimShot(shot, { wallet: 'a', prediction: 7n }, 112)
  throwsCode(() => lockShot(shot, { wallet: 'a', amount: 2n * SOL, time: 113 }), 'InvalidStake')
  throwsCode(() => aimShot(shot, { wallet: 'z', prediction: 7n }, 112), 'NotInMatch')
  aimShot(shot, { wallet: 'a', prediction: 8n }, 114)
  lockShot(shot, { wallet: 'a', amount: SOL / 10n, time: 115 })
  assert.equal(shot.entries[0].prediction, 8n, 'the last aimed price before the stake counts')
})

test('an aimed shot whose stake has not arrived holds the start until the confirming window ends', () => {
  const shot = room(['a', 'b', 'c', 'd', 'e'])
  for (const p of ['a', 'b', 'c']) readyShot(shot, p, true, 110)
  lock(shot, 'a', 5n, SOL / 100n, 120)
  lock(shot, 'b', 6n, SOL / 100n, 121)
  aimShot(shot, { wallet: 'c', prediction: 7n }, 122)
  assert.equal(shotTimers(shot, shot.aimEndsAt + 1), null, "c's stake may still confirm")
  lockShot(shot, { wallet: 'c', amount: SOL / 100n, time: shot.aimEndsAt + 4 })
  assert.equal(shotTimers(shot, shot.aimEndsAt + 5), 'live', 'all in: start at once')
  assert.equal(shot.entries.length, 3)
})
