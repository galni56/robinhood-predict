import assert from 'node:assert/strict'
import test from 'node:test'
import {
  nativeEthDeploymentCaps,
  parseFixedDecimal,
  usdCentsToWeiAtPrice,
} from './native-eth-deployment-caps.mjs'

test('deployment caps use exact bigint math across the buffered ETH/USD corridor', () => {
  const caps = nativeEthDeploymentCaps({ ethUsd: '4000', bufferBps: '2500' })
  assert.deepEqual(caps, {
    referencePriceRaw: '400000000000',
    lowerPriceRaw: '300000000000',
    upperPriceRaw: '500000000000',
    priceDecimals: 8,
    bufferBps: '2500',
    predictionMarket: {
      maxSeedLiquidityWei: '16666666666666666',
      maxStakePerSideWei: '16666666666666666',
    },
    assetRace: {
      minStakeWei: '200000000000000',
      maxStakePerWalletWei: '16666666666666666',
    },
    priceArena: {
      minStakeWei: '200000000000000',
      maxStakeWei: '16666666666666666',
    },
  })

  const minAtUpper = usdCentsToWeiAtPrice(100n, BigInt(caps.upperPriceRaw))
  const maxAtLower = usdCentsToWeiAtPrice(5_000n, BigInt(caps.lowerPriceRaw))
  assert.equal(minAtUpper.toString(), caps.assetRace.minStakeWei)
  assert.equal(maxAtLower.toString(), caps.assetRace.maxStakePerWalletWei)
})

test('fractional reference prices stay fixed at eight decimals without floating point', () => {
  assert.equal(parseFixedDecimal('2345.67890123'), 234_567_890_123n)
  assert.throws(() => parseFixedDecimal('2345.678901234'), /InvalidFixedDecimal/)
  assert.throws(() => parseFixedDecimal('2e3'), /InvalidFixedDecimal/)
  assert.throws(() => parseFixedDecimal('0'), /NonPositiveFixedDecimal/)
})

test('deployment caps reject malformed or unsafe buffers', () => {
  for (const bufferBps of ['-1', '1.5', '10000', '12000', '']) {
    assert.throws(() => nativeEthDeploymentCaps({ ethUsd: '4000', bufferBps }), /InvalidBufferBps/)
  }
  assert.throws(() => nativeEthDeploymentCaps({ ethUsd: '0.00000001', bufferBps: '9999' }), /BufferedPriceRoundsToZero/)
})
