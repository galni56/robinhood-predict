import assert from 'node:assert/strict'
import test from 'node:test'
import { ACTIVE_GAME_POLL_INTERVAL_MS } from '../src/chain/gameSnapshots.ts'
import { DEFAULT_ASSET_RACE_IDLE_POLL_INTERVAL_MS } from './asset-race-keeper.mjs'
import { DEFAULT_EVENT_SEEDER_POLL_INTERVAL_MS } from './event-seeder.mjs'
import {
  DEFAULT_PREDICTION_MARKET_IDLE_POLL_INTERVAL_MS,
  DEFAULT_PREDICTION_MARKET_POLL_INTERVAL_MS,
} from './prediction-market-keeper.mjs'
import {
  DEFAULT_PRICE_ARENA_IDLE_POLL_INTERVAL_MS,
  DEFAULT_PRICE_ARENA_POLL_INTERVAL_MS,
} from './price-arena-keeper.mjs'

test('live products share the fast refresh profile', () => {
  assert.equal(ACTIVE_GAME_POLL_INTERVAL_MS, 1_000)
  assert.equal(DEFAULT_PREDICTION_MARKET_POLL_INTERVAL_MS, 1_000)
  assert.equal(DEFAULT_PRICE_ARENA_POLL_INTERVAL_MS, 1_000)
  assert.equal(DEFAULT_PREDICTION_MARKET_IDLE_POLL_INTERVAL_MS, 5_000)
  assert.equal(DEFAULT_PRICE_ARENA_IDLE_POLL_INTERVAL_MS, 5_000)
  assert.equal(DEFAULT_ASSET_RACE_IDLE_POLL_INTERVAL_MS, 5_000)
  assert.equal(DEFAULT_EVENT_SEEDER_POLL_INTERVAL_MS, 5_000)
})
