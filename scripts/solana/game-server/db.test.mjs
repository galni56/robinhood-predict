import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeState, encodeState, openDatabase } from './db.mjs'

test('every BigInt survives a store round trip, whatever its field name', () => {
  const game = {
    kind: 'duel',
    id: 1,
    status: 'lobby',
    pot: 5_000_000n, // not in the legacy BIGINT_KEYS list
    racers: [{ seat: 1, stake: 10n, someNewAmount: 7n, nested: { deep: 3n } }],
    title: '123', // a numeric-looking string must stay a string
  }
  const back = decodeState(encodeState(game))
  assert.equal(back.pot, 5_000_000n)
  assert.equal(back.racers[0].someNewAmount, 7n)
  assert.equal(back.racers[0].nested.deep, 3n)
  assert.equal(back.racers[0].stake, 10n)
  assert.equal(back.title, '123')
})

test('rows written before tagging still revive known amount fields', () => {
  const legacy = JSON.stringify({ kind: 'race', id: 2, status: 'betting', totalPool: '42', assets: [{ pool: '7' }] })
  const back = decodeState(legacy)
  assert.equal(back.totalPool, 42n)
  assert.equal(back.assets[0].pool, 7n)
})

test('the database stores and loads games with tagged amounts', () => {
  const db = openDatabase(':memory:')
  db.saveGame({ kind: 'arena', id: 3, status: 'open', bank: 99n, entries: [{ stake: 5n, extra: 1n }] })
  const back = db.getGame('arena', 3)
  assert.equal(back.bank, 99n)
  assert.equal(typeof back.entries[0].extra, 'bigint')
})
