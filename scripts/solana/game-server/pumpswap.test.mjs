import { test } from 'node:test'
import assert from 'node:assert/strict'
import { priceDecimalsFor, selectPumpSwapAssets } from './pumpswap.mjs'

const WSOL = 'So11111111111111111111111111111111111111112'
const now = Date.parse('2026-10-04T12:00:00Z')
const pool = (symbol, mint, liquidityUsd, hoursOld, extra = {}) => ({
  pool: `pool-${symbol}-${liquidityUsd}`, mint, quote: WSOL, symbol, name: symbol, logoUrl: null, tokenDecimals: 6,
  priceUsd: 0.001, liquidityUsd, volume24hUsd: 1, createdAt: new Date(now - hoursOld * 3.6e6).toISOString(), ...extra,
})

test('pumpswap filter: real pump.fun coins, SOL/USDC pairs, liquidity, age, one per symbol', () => {
  const pools = [
    pool('GOOD', 'Aaapump', 50_000, 5),
    pool('GOOD', 'Bbbpump', 20_000, 5), // same name, smaller pool: dropped
    pool('FAKE', 'NotAPumpMint', 900_000, 5), // not a pump.fun mint
    pool('THIN', 'Cccpump', 9_000, 5), // below $10k
    pool('NEW', 'Dddpump', 80_000, 0.5), // younger than an hour
    pool('PAIR', 'Eeepump', 80_000, 5, { quote: 'SomeOtherMint' }), // not SOL/USDC
    pool('WIF', 'Fffpump', 80_000, 5), // already in the reviewed catalog
  ]
  const out = selectPumpSwapAssets(pools, { takenSymbols: new Set(['WIF']), now })
  assert.deepEqual(out.map((a) => [a.symbol, a.mint]), [['GOOD', 'Aaapump']])
  assert.equal(out[0].poolKind, 'pumpswap')
})

test('pumpswap filter keeps price decimals and coins of running games', () => {
  const previous = [{ symbol: 'GOOD', mint: 'Aaapump', pool: 'old-pool', priceDecimals: 11 }, { symbol: 'GONE', mint: 'Zzzpump', pool: 'p', priceDecimals: 9 }]
  const out = selectPumpSwapAssets([pool('GOOD', 'Aaapump', 50_000, 5)], { takenSymbols: new Set(), previous, keepSymbols: new Set(['GONE']), now })
  assert.equal(out.find((a) => a.symbol === 'GOOD').priceDecimals, 11)
  assert.equal(out.find((a) => a.symbol === 'GOOD').pool, 'old-pool')
  assert.ok(out.some((a) => a.symbol === 'GONE'), 'a coin in a running game stays')
})

test('pumpswap filter drops blocklisted mints and symbols', () => {
  const now = Date.parse('2026-10-05T12:00:00Z')
  const pools = [pool('IOF', 'Iofpump', 300_000, 20), pool('BOIF', 'Boifpump', 100_000, 20), pool('GOOD', 'Goodpump', 50_000, 20)]
  const blocked = { mints: new Set(['Iofpump']), symbols: new Set(['BOIF']) }
  const out = selectPumpSwapAssets(pools, { takenSymbols: new Set(), now, blocked })
  assert.deepEqual(out.map((a) => a.symbol), ['GOOD'])
})

test('price decimals give about six significant digits', () => {
  assert.equal(priceDecimalsFor(0.0137), 8)
  assert.equal(priceDecimalsFor(0.00000123), 12)
  assert.equal(priceDecimalsFor(5000), 8)
})

test('pumpswap filter: coins launched on Prophet join on top of the limit and are marked', () => {
  const pools = [
    pool('BIG', 'Bigpump', 90_000, 5),
    pool('MID', 'Midpump', 50_000, 5),
    pool('OURS', 'OurMintWithNoPumpSuffix', 12_000, 5), // launched here: ordinary mint, small pool
    pool('OURNEW', 'OurFreshMint', 12_000, 0.5), // launched here but younger than an hour: waits
  ]
  const launched = new Set(['OurMintWithNoPumpSuffix', 'OurFreshMint'])
  const out = selectPumpSwapAssets(pools, { takenSymbols: new Set(), now, filter: { minLiquidityUsd: 10_000, minAgeHours: 1, limit: 1 }, launched })
  assert.deepEqual(out.map((a) => a.symbol), ['OURS', 'BIG'])
  assert.equal(out.find((a) => a.symbol === 'OURS').launchedOnProphet, true)
  assert.equal(out.find((a) => a.symbol === 'BIG').launchedOnProphet, undefined)
})

test('pumpswap list accumulates: kept when out of the top pages, dropped when seen failing, blocked or stale', () => {
  const day = 86_400_000
  const previous = [
    { symbol: 'OLD', mint: 'Oldpump', pool: 'p1', priceDecimals: 9, liquidityUsd: 40_000, lastSeenAt: new Date(now - day).toISOString() }, // not in today's pages: stays
    { symbol: 'THIN', mint: 'Thinpump', pool: 'p2', priceDecimals: 9, liquidityUsd: 40_000, lastSeenAt: new Date(now - day).toISOString() }, // seen today below $10k: goes
    { symbol: 'STALE', mint: 'Stalepump', pool: 'p3', priceDecimals: 9, liquidityUsd: 40_000, lastSeenAt: new Date(now - 8 * day).toISOString() }, // unseen 8 days: goes
    { symbol: 'BAD', mint: 'Badpump', pool: 'p4', priceDecimals: 9, liquidityUsd: 40_000, lastSeenAt: new Date(now - day).toISOString() }, // blocklisted: goes
  ]
  const pools = [pool('NEW', 'Newpump', 30_000, 5), pool('THIN', 'Thinpump', 5_000, 5)]
  const out = selectPumpSwapAssets(pools, { takenSymbols: new Set(), previous, now, blocked: { mints: new Set(['Badpump']), symbols: new Set() } })
  assert.deepEqual(out.map((a) => a.symbol).sort(), ['NEW', 'OLD'])
  assert.equal(out.find((a) => a.symbol === 'NEW').lastSeenAt, new Date(now).toISOString())
})

test('pumpswap list: over the limit the least liquid make room', () => {
  const previous = [{ symbol: 'SMALL', mint: 'Smallpump', pool: 'p', priceDecimals: 9, liquidityUsd: 11_000, lastSeenAt: new Date(now).toISOString() }]
  const pools = [pool('A', 'Apump', 90_000, 5), pool('B', 'Bpump', 50_000, 5)]
  const out = selectPumpSwapAssets(pools, { takenSymbols: new Set(), previous, now, filter: { minLiquidityUsd: 10_000, minAgeHours: 1, limit: 2, staleDays: 7 } })
  assert.deepEqual(out.map((a) => a.symbol), ['A', 'B'])
})
