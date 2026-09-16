import assert from 'node:assert/strict'
import test from 'node:test'
import { pad } from 'viem'
import { readFileSync } from 'node:fs'
import { poolConfigsFromRegistry } from './asset-race-pool-price-engine.mjs'
import { endpointProofsForRace, startCallForRace, transitionFor, verifySignedPoolOracle } from './asset-race-keeper.mjs'

const oracle = '0x1111111111111111111111111111111111111111'
const assets = [1, 2].map((id) => ({ oracle, oracleId: pad(`0x0${id}`, { size: 32 }), pool: 10n, active: true, maxEndpointLag: 0n }))
const client = { readContract: async ({ functionName }) => functionName === 'getRaceAssets' ? assets : 3 }

test('keeper checks the onchain signed-pool signer before generating production proofs', async () => {
  const calls = []
  const signer = '0x2222222222222222222222222222222222222222'
  const rpc = { readContract: async (request) => {
    calls.push(request)
    return request.functionName === 'TRUSTED_SIGNER' ? signer : 3
  } }
  await verifySignedPoolOracle(rpc, oracle, signer)
  assert.ok(calls.every((request) => request.address === oracle))
  await assert.rejects(() => verifySignedPoolOracle(rpc, oracle, oracle), /does not match oracle TRUSTED_SIGNER/)
})

test('keeper rejects a wrong oracle adapter even when the public signer matches', async () => {
  await assert.rejects(() => verifySignedPoolOracle({ readContract: async ({ functionName }) =>
    functionName === 'TRUSTED_SIGNER' ? oracle : 1 }, oracle, oracle), /does not support signed pool endpoints/)
})
function collectorFor(target) {
  return { verifyingContract: oracle, proofsFor: async (...args) => {
    assert.equal(args.length, 2)
    assert.equal(args[1], target)
    assert.deepEqual(args[0], assets.map((asset) => asset.oracleId))
    return { proofs: new Map(assets.map((asset) => [asset.oracleId.toLowerCase(), '0x1234'])) }
  } }
}

test('keeper uses registry Meme pools and exact scheduled endpoints through the shared collector', async () => {
  const registry = JSON.parse(readFileSync(new URL('../config/asset-race-assets.json', import.meta.url), 'utf8'))
  const memes = poolConfigsFromRegistry(registry, { category: 'MEME' }).slice(0, 3)
  const raceAssets = memes.map((config) => ({ ...config, oracle, pool: 10n, active: true, maxEndpointLag: 0n }))
  const memeClient = { readContract: async ({ functionName }) => functionName === 'getRaceAssets' ? raceAssets : 3 }
  const targets = []
  const collector = { verifyingContract: oracle, proofsFor: async (ids, target) => {
    assert.deepEqual(ids, memes.map((config) => config.oracleId))
    targets.push(target)
    return { proofs: new Map(ids.map((id) => [id.toLowerCase(), '0x1234'])) }
  } }
  const start = await startCallForRace(memeClient, oracle, 0n, { category: 1, bettingEndTime: 100n, minActiveContenders: 2 }, collector)
  assert.equal(start.functionName, 'startRaceWithProofs')
  assert.deepEqual(await endpointProofsForRace(memeClient, oracle, 0n, 200n, collector), ['0x1234', '0x1234', '0x1234'])
  assert.deepEqual(targets, [100n, 200n])
})

test('keeper requests exact scheduled T0 proofs with no pool lag/latest-price selection', async () => {
  const call = await startCallForRace(client, oracle, 1n, { bettingEndTime: 100n, minActiveContenders: 2 }, collectorFor(100n))
  assert.equal(call.functionName, 'startRaceWithProofs')
  assert.deepEqual(call.args[1], ['0x1234', '0x1234'])
})

test('keeper requests exact T1 proofs independently of transaction execution time', async () => {
  assert.deepEqual(await endpointProofsForRace(client, oracle, 1n, 200n, collectorFor(200n)), ['0x1234', '0x1234'])
})

test('keeper never finalizes using uncaptured prices and finalization stays available after grace', () => {
  const race = { status: 1, raceEndTime: 200n, resolutionGrace: 60n, endSnapshotsCaptured: true }
  assert.equal(transitionFor(race, 100_000n).functionName, 'resolveRace')
  assert.equal(transitionFor({ ...race, endSnapshotsCaptured: false }, 100_000n).functionName, 'voidExpiredRace')
})

test('keeper rejects mixed pool proof types rather than replacing the endpoint', async () => {
  let calls = 0
  const mixed = { readContract: async ({ functionName }) => functionName === 'getRaceAssets' ? assets : ++calls === 1 ? 3 : 1 }
  await assert.rejects(() => endpointProofsForRace(mixed, oracle, 1n, 200n, collectorFor(200n)), /MixedPoolEndpointProofTypes/)
})
