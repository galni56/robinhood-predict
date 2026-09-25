import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PRODUCT_MAX_STAKE_WEI,
  PRODUCT_MIN_STAKE_WEI,
  nativeEthDeploymentCaps,
} from './native-eth-deployment-caps.mjs'

test('deployment uses approved broad fixed ETH safety fuses', () => {
  const caps = nativeEthDeploymentCaps()
  assert.deepEqual(caps, {
    policy: 'FIXED_NATIVE_ETH_SAFETY_FUSE',
    uiStakeUsdCents: { min: '100', max: '5000' },
    illustrativeFullUiEthUsdRange: { min: '500.00', max: '10000.00' },
    predictionMarket: {
      maxSeedLiquidityWei: '100000000000000000',
      maxStakePerSideWei: '100000000000000000',
    },
    assetRace: {
      minStakeWei: '100000000000000',
      maxStakePerWalletWei: '100000000000000000',
    },
    priceArena: {
      minStakeWei: '100000000000000',
      maxStakeWei: '100000000000000000',
    },
  })
  assert.equal(PRODUCT_MIN_STAKE_WEI, 10n ** 14n)
  assert.equal(PRODUCT_MAX_STAKE_WEI, 10n ** 17n)
  assert.equal(PRODUCT_MAX_STAKE_WEI / PRODUCT_MIN_STAKE_WEI, 1_000n)
})

test('deployment safety fuses are independent of a mutable ETH/USD quote', () => {
  assert.deepEqual(nativeEthDeploymentCaps(), nativeEthDeploymentCaps())
  assert.equal(nativeEthDeploymentCaps.length, 0)
})
