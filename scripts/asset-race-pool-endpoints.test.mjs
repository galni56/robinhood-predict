import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { decodeAbiParameters, pad, recoverTypedDataAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  PoolEndpointCollector,
  JsonEndpointProofCache,
  SIGNED_POOL_ORACLE_NAME,
  SIGNED_POOL_ORACLE_VERSION,
  poolObservationComponents,
  poolObservationTypes,
} from './asset-race-pool-endpoints.mjs'

const account = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const verifyingContract = '0x1111111111111111111111111111111111111111'
const oracleId = pad('0x12', { size: 32 })

function entry(number, timestamp, hash, parentHash, price) {
  return { oracleId, priceRaw: price, decimals: 18, blockNumber: number, blockTimestamp: timestamp, blockHash: hash, parentBlockHash: parentHash }
}

test('collector signs one deterministic consecutive block pair and no UI ticks', async () => {
  const previousHash = pad('0xaa', { size: 32 })
  const selectedHash = pad('0xbb', { size: 32 })
  let calls = 0
  const engine = { endpointPair: async (target, oracleIds) => {
    calls += 1
    assert.equal(target, 100n)
    assert.deepEqual(oracleIds, [oracleId])
    return {
      previous: { block: { number: 9n, hash: previousHash }, assets: { NVDA: entry(9n, 99n, previousHash, pad('0x99', { size: 32 }), 100n) } },
      selected: { block: { number: 10n, hash: selectedHash }, assets: { NVDA: entry(10n, 100n, selectedHash, previousHash, 101n) } },
    }
  } }
  const collector = new PoolEndpointCollector({ account, chainId: 4663, engine, verifyingContract })
  const result = await collector.proofsFor([oracleId], 100n, 2n)
  assert.equal(calls, 1)
  assert.equal(result.endpointBlockHash, previousHash)
  assert.equal(result.endpointBlockNumber, 9n)
  const decoded = decodeAbiParameters([
    { type: 'tuple', components: poolObservationComponents }, { type: 'bytes' },
    { type: 'tuple', components: poolObservationComponents }, { type: 'bytes' },
  ], result.proofs.get(oracleId.toLowerCase()))
  assert.equal(decoded[0].blockNumber, 9n)
  assert.equal(decoded[0].price, 100n)
  assert.equal(decoded[2].blockNumber, 10n)
  assert.equal(await recoverTypedDataAddress({
    domain: { name: SIGNED_POOL_ORACLE_NAME, version: SIGNED_POOL_ORACLE_VERSION, chainId: 4663, verifyingContract },
    types: poolObservationTypes,
    primaryType: 'PoolObservation',
    message: decoded[2],
    signature: decoded[3],
  }), account.address)
})

test('collector persists signed endpoint proofs and reuses them after restart', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'asset-race-endpoint-cache-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const cache = new JsonEndpointProofCache(join(directory, 'endpoints.json'))
  const previousHash = pad('0xcc', { size: 32 })
  const selectedHash = pad('0xdd', { size: 32 })
  let calls = 0
  const engine = { endpointPair: async () => {
    calls += 1
    return {
      previous: { block: { number: 19n, hash: previousHash }, assets: { NVDA: entry(19n, 199n, previousHash, pad('0xbb', { size: 32 }), 200n) } },
      selected: { block: { number: 20n, hash: selectedHash }, assets: { NVDA: entry(20n, 200n, selectedHash, previousHash, 201n) } },
    }
  } }
  const first = new PoolEndpointCollector({ account, chainId: 4663, engine, cache, verifyingContract })
  const collected = await first.proofsFor([oracleId], 200n)
  assert.equal(collected.source, 'PRIMARY')
  assert.equal(calls, 1)
  assert.equal(statSync(cache.filePath).mode & 0o777, 0o600)
  assert.doesNotThrow(() => JSON.parse(readFileSync(cache.filePath, 'utf8')))

  const restarted = new PoolEndpointCollector({ account, chainId: 4663,
    engine: { endpointPair: async () => { throw new Error('RPC must not run') } }, cache, verifyingContract })
  const restored = await restarted.proofsFor([oracleId], 200n)
  assert.equal(restored.source, 'CACHE')
  assert.equal(restored.endpointBlockHash, previousHash)
  assert.equal(restored.proofs.get(oracleId.toLowerCase()), collected.proofs.get(oracleId.toLowerCase()))
})

test('collector deduplicates concurrent endpoint work and uses archive only after primary failure', async () => {
  const previousHash = pad('0xee', { size: 32 })
  const selectedHash = pad('0xff', { size: 32 })
  let primaryCalls = 0
  let fallbackCalls = 0
  const collector = new PoolEndpointCollector({ account, chainId: 4663,
    engine: { endpointPair: async () => { primaryCalls += 1; throw new Error('PublicRpcUnavailable') } },
    fallbackEngine: { endpointPair: async () => {
      fallbackCalls += 1
      await new Promise((resolve) => setTimeout(resolve, 5))
      return {
        previous: { block: { number: 29n, hash: previousHash }, assets: { NVDA: entry(29n, 299n, previousHash, pad('0xaa', { size: 32 }), 300n) } },
        selected: { block: { number: 30n, hash: selectedHash }, assets: { NVDA: entry(30n, 300n, selectedHash, previousHash, 301n) } },
      }
    } }, nowSeconds: () => 300n, verifyingContract })
  const [left, right] = await Promise.all([
    collector.proofsFor([oracleId], 300n),
    collector.proofsFor([oracleId], 300n),
  ])
  assert.equal(primaryCalls, 1)
  assert.equal(fallbackCalls, 1)
  assert.equal(left.source, 'ARCHIVE_FALLBACK')
  assert.deepEqual(right, left)
})

test('collector sends delayed recovery directly to paced archive instead of bursting public RPC', async () => {
  const previousHash = pad('0xab', { size: 32 })
  const selectedHash = pad('0xac', { size: 32 })
  let primaryCalls = 0
  let fallbackCalls = 0
  const pair = {
    previous: { block: { number: 39n, hash: previousHash }, assets: { NVDA: entry(39n, 399n, previousHash, pad('0xaa', { size: 32 }), 400n) } },
    selected: { block: { number: 40n, hash: selectedHash }, assets: { NVDA: entry(40n, 400n, selectedHash, previousHash, 401n) } },
  }
  const collector = new PoolEndpointCollector({ account, chainId: 4663,
    engine: { endpointPair: async () => { primaryCalls += 1; return pair } },
    fallbackEngine: { endpointPair: async () => { fallbackCalls += 1; return pair } },
    nowSeconds: () => 500n, primaryWindowSeconds: 30, verifyingContract })
  const result = await collector.proofsFor([oracleId], 400n)
  assert.equal(result.source, 'ARCHIVE_FALLBACK')
  assert.equal(primaryCalls, 0)
  assert.equal(fallbackCalls, 1)
})
