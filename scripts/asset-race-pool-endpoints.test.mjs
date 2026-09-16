import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeAbiParameters, pad, recoverTypedDataAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  PoolEndpointCollector,
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
