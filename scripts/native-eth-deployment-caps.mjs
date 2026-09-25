import { pathToFileURL } from 'node:url'

export const PRODUCT_MIN_STAKE_WEI = 100_000_000_000_000n // 0.0001 ETH
export const PRODUCT_MAX_STAKE_WEI = 100_000_000_000_000_000n // 0.1 ETH

export function nativeEthDeploymentCaps() {
  return {
    policy: 'FIXED_NATIVE_ETH_SAFETY_FUSE',
    uiStakeUsdCents: { min: '100', max: '5000' },
    illustrativeFullUiEthUsdRange: { min: '500.00', max: '10000.00' },
    predictionMarket: {
      maxSeedLiquidityWei: PRODUCT_MAX_STAKE_WEI.toString(),
      maxStakePerSideWei: PRODUCT_MAX_STAKE_WEI.toString(),
    },
    assetRace: {
      minStakeWei: PRODUCT_MIN_STAKE_WEI.toString(),
      maxStakePerWalletWei: PRODUCT_MAX_STAKE_WEI.toString(),
    },
    priceArena: {
      minStakeWei: PRODUCT_MIN_STAKE_WEI.toString(),
      maxStakeWei: PRODUCT_MAX_STAKE_WEI.toString(),
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length > 2) {
    console.error('Usage: node scripts/native-eth-deployment-caps.mjs')
    process.exitCode = 1
  } else {
    console.log(JSON.stringify(nativeEthDeploymentCaps(), null, 2))
  }
}
