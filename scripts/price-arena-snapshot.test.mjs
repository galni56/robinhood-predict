import assert from 'node:assert/strict'
import test from 'node:test'
import { isCoherentPriceArenaSnapshot } from '../src/chain/priceArenaSnapshot.ts'

function arena(overrides = {}) {
  return {
    assetId: `0x${'4e564441'.padEnd(64, '0')}`,
    oracleId: `0x${'11'.repeat(32)}`,
    oracle: '0x1111111111111111111111111111111111111111',
    creator: '0x2222222222222222222222222222222222222222',
    priceDecimals: 18,
    category: 0,
    status: 0,
    createdAt: 1_000n,
    startsAt: 1_600n,
    deadline: 2_500n,
    resolvedAt: 0n,
    duration: 900,
    participantCount: 0,
    winnerCount: 0,
    feeBp: 200,
    totalPool: 0n,
    finalPrice: 0n,
    finalUpdatedAt: 0n,
    observationId: `0x${'00'.repeat(32)}`,
    protocolFee: 0n,
    remainingLiability: 0n,
    title: 'NVDA 15m Arena',
    ...overrides,
  }
}

test('accepts a coherent lobby Arena snapshot', () => {
  assert.equal(isCoherentPriceArenaSnapshot(arena(), 0, 0), true)
})

test('rejects the malformed card shape that previously reached the homepage', () => {
  const malformed = arena({
    assetId: `0x${'00'.repeat(32)}`,
    duration: 180,
    participantCount: 2,
    totalPool: 0n,
    title: '',
  })
  assert.equal(isCoherentPriceArenaSnapshot(malformed, 1, undefined), false)
})

test('rejects inconsistent lifecycle, timestamps and stake accounting', () => {
  assert.equal(isCoherentPriceArenaSnapshot(arena({ status: 2 }), 1, 0), false)
  assert.equal(isCoherentPriceArenaSnapshot(arena({ deadline: 2_499n }), 0, 0), false)
  assert.equal(isCoherentPriceArenaSnapshot(arena({ participantCount: 1, totalPool: 0n }), 0, 0), false)
})

test('accepts coherent resolved and played-cancelled Arena snapshots', () => {
  assert.equal(isCoherentPriceArenaSnapshot(arena({
    status: 1,
    resolvedAt: 2_505n,
    participantCount: 2,
    winnerCount: 1,
    totalPool: 2_000n,
    finalPrice: 225n * 10n ** 18n,
  }), 2, 0), true)
  assert.equal(isCoherentPriceArenaSnapshot(arena({
    status: 2,
    resolvedAt: 2_505n,
    participantCount: 2,
    totalPool: 2_000n,
  }), 3, 0), true)
})
