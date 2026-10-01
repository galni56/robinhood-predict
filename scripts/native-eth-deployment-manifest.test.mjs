import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeEthDeploymentManifest } from './native-eth-deployment-manifest.mjs'

const ORACLE = '0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7'
const SIGNER = '0x79F4991Ccc64Cbb8143fB61e4cBD49b8b64d3635'
const OWNER = '0x6d68157bEDa778346Dd27f8Ef4F917f69aD2Dc41'

test('deployment manifest derives every product binding from one registry', () => {
  const manifest = nativeEthDeploymentManifest({
    ownerAddress: OWNER,
    oracleAddress: ORACLE,
    priceSignerAddress: SIGNER,
  })
  assert.equal(manifest.schemaVersion, 5)
  assert.equal(manifest.chain.chainId, 4663)
  assert.equal(manifest.chain.nativeCurrency, 'ETH')
  assert.equal(manifest.chain.stockPriceQuote, 'USDG')
  assert.equal(manifest.settlement.signedPoolOracleAddress, ORACLE)
  assert.equal(manifest.settlement.expectedTrustedSigner, SIGNER)
  assert.deepEqual(manifest.roles, {
    ownerAddress: OWNER,
    signedPoolOracleAddress: ORACLE,
    priceSignerAddress: SIGNER,
  })
  assert.equal(manifest.predictionMarket.assets.length, 25)
  assert.equal(manifest.assetRace.stockAssets.length, 10)
  assert.equal(manifest.assetRace.memeAssets.length, 13)
  assert.equal(manifest.assetRace.cryptoAssets.length, 2)
  assert.equal(manifest.assetRace.policy.maxPriceAgeSeconds, 60)
  assert.equal(manifest.assetRace.policy.maxEndpointLagSeconds, 0)
  assert.deepEqual(manifest.priceArena.stockAssets, manifest.assetRace.stockAssets)
  assert.deepEqual(manifest.priceArena.memeAssets, manifest.assetRace.memeAssets)
  assert.deepEqual(manifest.priceArena.cryptoAssets, manifest.assetRace.cryptoAssets)
  assert.deepEqual(
    manifest.predictionMarket.assets.map(({ assetId, oracleId }) => [assetId, oracleId]),
    [...manifest.assetRace.stockAssets, ...manifest.assetRace.memeAssets, ...manifest.assetRace.cryptoAssets]
      .map(({ assetId, oracleId }) => [assetId, oracleId]),
  )
  assert.deepEqual(manifest.assetRace.policy.durationPresetsSeconds, [60, 300, 900])
  assert.equal(manifest.assetRace.policy.minStakeWei, manifest.priceArena.constructor.minStakeWei)
  assert.equal(manifest.assetRace.policy.maxStakePerWalletWei, manifest.priceArena.constructor.maxStakeWei)
  const allAssets = [...manifest.assetRace.stockAssets, ...manifest.assetRace.memeAssets, ...manifest.assetRace.cryptoAssets]
  assert.equal(new Set(allAssets.map(({ assetId }) => assetId)).size, 25)
  assert.equal(new Set(allAssets.map(({ oracleId }) => oracleId)).size, 25)
  assert.ok(allAssets.every(({ oracleId }) => /^0x[0-9a-f]{64}$/i.test(oracleId)))
})

test('deployment manifest rejects missing, zero, malformed and overlapping public roles', () => {
  const valid = { ownerAddress: OWNER, oracleAddress: ORACLE, priceSignerAddress: SIGNER }
  for (const ownerAddress of [undefined, '', 'invalid', '0x0000000000000000000000000000000000000000']) {
    assert.throws(() => nativeEthDeploymentManifest({ ...valid, ownerAddress }), /InvalidOwnerAddress/)
  }
  for (const oracleAddress of [undefined, '', 'invalid', '0x0000000000000000000000000000000000000000']) {
    assert.throws(() => nativeEthDeploymentManifest({ ...valid, oracleAddress }), /InvalidOracleAddress/)
  }
  for (const priceSignerAddress of [undefined, '', 'invalid', '0x0000000000000000000000000000000000000000']) {
    assert.throws(() => nativeEthDeploymentManifest({ ...valid, priceSignerAddress }), /InvalidPriceSignerAddress/)
  }
  assert.throws(
    () => nativeEthDeploymentManifest({ ...valid, priceSignerAddress: ORACLE }),
    /OracleAndSignerMustDiffer/,
  )
  assert.throws(
    () => nativeEthDeploymentManifest({ ...valid, priceSignerAddress: OWNER }),
    /OwnerAndSignerMustDiffer/,
  )
  assert.throws(
    () => nativeEthDeploymentManifest({ ...valid, oracleAddress: OWNER }),
    /OwnerAndOracleMustDiffer/,
  )
})
