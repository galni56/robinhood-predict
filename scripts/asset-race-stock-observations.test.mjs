import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { decodeAbiParameters, recoverTypedDataAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  SIGNED_STOCK_ORACLE_NAME,
  SIGNED_STOCK_ORACLE_VERSION,
  StockObservationCollector,
  observationFromRobinhoodResponse,
  oracleIdForStockSymbol,
  priceObservationTypes,
  robinhoodMidpointPrice,
} from './asset-race-stock-observations.mjs'

const account = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const verifyingContract = '0x1111111111111111111111111111111111111111'

function quote(symbol, generatedAt, bid = '100.000000001', ask = '100.000000019') {
  return { quotes: [{ tokenSymbol: symbol, bid, ask, currency: 'USD', isTradingHalt: false, generatedAt }] }
}

function response(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

function collector(fetchFn, symbols = ['NVDA', 'TSLA']) {
  const directory = mkdtempSync(join(tmpdir(), 'asset-race-observations-'))
  const statePath = join(directory, 'state.json')
  return {
    statePath,
    value: new StockObservationCollector({
      account,
      apiBaseUrl: 'https://prices.invalid/rhj/prices',
      chainId: 31337,
      fetchFn,
      historyLimit: 8,
      statePath,
      symbols,
      verifyingContract,
    }),
  }
}

test('midpoint parsing uses exact integers and deterministic floor rounding', () => {
  assert.equal(robinhoodMidpointPrice('100.000000001', '100.000000019'), 10_000_000_001n)
  assert.throws(() => robinhoodMidpointPrice('0.000000001', '0.000000002'), /InvalidMidpoint/)
  assert.throws(() => robinhoodMidpointPrice('101', '100'), /InvalidBidAsk/)
})

test('quote validation rejects non-USD, halted, missing timestamps, and invalid prices', () => {
  const valid = quote('NVDA', '2026-09-15T10:00:00Z', '100', '102')
  assert.equal(observationFromRobinhoodResponse('NVDA', valid).price, 10_100_000_000n)
  assert.throws(() => observationFromRobinhoodResponse('NVDA', { quotes: [{ ...valid.quotes[0], currency: 'EUR' }] }), /InvalidCurrency/)
  assert.throws(() => observationFromRobinhoodResponse('NVDA', { quotes: [{ ...valid.quotes[0], isTradingHalt: true }] }), /TradingHalted/)
  assert.throws(() => observationFromRobinhoodResponse('NVDA', { quotes: [{ ...valid.quotes[0], generatedAt: '' }] }), /InvalidGeneratedAt/)
  assert.throws(() => observationFromRobinhoodResponse('NVDA', quote('NVDA', '2026-09-15T10:00:00Z', '0', '1')), /InvalidBidAsk/)
})

test('collector polls once per symbol, deduplicates generatedAt, and persists bounded signed history', async () => {
  let generation = 0
  const calls = []
  const setup = collector(async (url) => {
    calls.push(url)
    const symbol = url.endsWith('NVDA') ? 'NVDA' : 'TSLA'
    return response(quote(symbol, `2026-09-15T10:00:${String(generation).padStart(2, '0')}Z`))
  })
  await setup.value.poll()
  await setup.value.poll()
  assert.equal(calls.length, 4)
  assert.equal(setup.value.assets.NVDA.length, 1)
  assert.equal(setup.value.assets.TSLA.length, 1)
  generation = 15
  await setup.value.poll()
  const persisted = JSON.parse(readFileSync(setup.statePath, 'utf8'))
  assert.equal(persisted.assets.NVDA.length, 2)
  assert.equal(persisted.assets.NVDA[1].sequence, '2')
  assert.match(persisted.assets.NVDA[1].signature, /^0x[0-9a-f]{130}$/)

  const components = priceObservationTypes.PriceObservation
  const target = BigInt(Date.parse('2026-09-15T10:00:05Z') / 1_000)
  const proof = setup.value.proofFor(oracleIdForStockSymbol('NVDA'), target)
  const decoded = decodeAbiParameters(
    [
      { type: 'tuple', components },
      { type: 'bytes' },
      { type: 'tuple', components },
      { type: 'bytes' },
    ],
    proof,
  )
  assert.equal(decoded[0].sequence, 1n)
  assert.equal(decoded[2].sequence, 2n)
  assert.equal(await recoverTypedDataAddress({
    domain: {
      name: SIGNED_STOCK_ORACLE_NAME,
      version: SIGNED_STOCK_ORACLE_VERSION,
      chainId: 31337,
      verifyingContract,
    },
    types: priceObservationTypes,
    primaryType: 'PriceObservation',
    message: decoded[2],
    signature: decoded[3],
  }), account.address)

  const restarted = new StockObservationCollector({
    account,
    apiBaseUrl: 'https://prices.invalid/rhj/prices',
    chainId: 31337,
    fetchFn: async () => { throw new Error('unused') },
    historyLimit: 8,
    statePath: setup.statePath,
    symbols: ['NVDA', 'TSLA'],
    verifyingContract,
  })
  assert.equal(restarted.assets.NVDA.length, 2)
  assert.equal(restarted.proofFor(oracleIdForStockSymbol('NVDA'), target), proof)
})

test('one-symbol HTTP failure does not discard another symbol', async () => {
  const setup = collector(async (url) => {
    if (url.endsWith('NVDA')) throw new Error('offline')
    return response(quote('TSLA', '2026-09-15T10:00:00Z'))
  })
  const outcomes = await setup.value.poll()
  assert.equal(outcomes[0].symbol, 'NVDA')
  assert.match(outcomes[0].error.message, /offline/)
  assert.equal(outcomes[1].added, true)
  assert.equal(setup.value.assets.NVDA.length, 0)
  assert.equal(setup.value.assets.TSLA.length, 1)
})
