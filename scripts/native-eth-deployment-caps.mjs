import { pathToFileURL } from 'node:url'

export const CAP_PRICE_DECIMALS = 8
export const CAP_BPS_DENOMINATOR = 10_000n
export const PRODUCT_MIN_USD_CENTS = 100n
export const PRODUCT_MAX_USD_CENTS = 5_000n
const WEI_PER_ETH = 10n ** 18n
const PRICE_SCALE = 10n ** BigInt(CAP_PRICE_DECIMALS)

export function parseFixedDecimal(value, decimals = CAP_PRICE_DECIMALS) {
  if (typeof value !== 'string' || !Number.isSafeInteger(decimals) || decimals < 0) {
    throw new Error('InvalidFixedDecimal')
  }
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value.trim())
  if (!match || (match[2]?.length ?? 0) > decimals) throw new Error('InvalidFixedDecimal')
  const fraction = (match[2] ?? '').padEnd(decimals, '0')
  const raw = BigInt(match[1]) * 10n ** BigInt(decimals) + BigInt(fraction || '0')
  if (raw <= 0n) throw new Error('NonPositiveFixedDecimal')
  return raw
}

export function usdCentsToWeiAtPrice(usdCents, ethUsdPriceRaw) {
  if (usdCents <= 0n || ethUsdPriceRaw <= 0n) throw new Error('InvalidCapInput')
  return (usdCents * PRICE_SCALE * WEI_PER_ETH) / (100n * ethUsdPriceRaw)
}

function ceilDiv(numerator, denominator) {
  return (numerator + denominator - 1n) / denominator
}

export function nativeEthDeploymentCaps({ ethUsd, bufferBps = '2500' }) {
  const referencePriceRaw = parseFixedDecimal(ethUsd)
  if (typeof bufferBps !== 'string' || !/^\d+$/.test(bufferBps)) throw new Error('InvalidBufferBps')
  const buffer = BigInt(bufferBps)
  if (buffer >= CAP_BPS_DENOMINATOR) throw new Error('InvalidBufferBps')

  // Lower is rounded down and upper up, conservatively widening the accepted
  // price corridor by at most one 8-decimal price unit.
  const lowerPriceRaw = (referencePriceRaw * (CAP_BPS_DENOMINATOR - buffer)) / CAP_BPS_DENOMINATOR
  const upperPriceRaw = ceilDiv(
    referencePriceRaw * (CAP_BPS_DENOMINATOR + buffer),
    CAP_BPS_DENOMINATOR,
  )
  if (lowerPriceRaw <= 0n) throw new Error('BufferedPriceRoundsToZero')

  const minStakeWei = usdCentsToWeiAtPrice(PRODUCT_MIN_USD_CENTS, upperPriceRaw)
  const maxStakeWei = usdCentsToWeiAtPrice(PRODUCT_MAX_USD_CENTS, lowerPriceRaw)
  if (minStakeWei <= 0n || maxStakeWei < minStakeWei) throw new Error('InvalidComputedCaps')

  return {
    referencePriceRaw: referencePriceRaw.toString(),
    lowerPriceRaw: lowerPriceRaw.toString(),
    upperPriceRaw: upperPriceRaw.toString(),
    priceDecimals: CAP_PRICE_DECIMALS,
    bufferBps: buffer.toString(),
    predictionMarket: {
      maxSeedLiquidityWei: maxStakeWei.toString(),
      maxStakePerSideWei: maxStakeWei.toString(),
    },
    assetRace: {
      minStakeWei: minStakeWei.toString(),
      maxStakePerWalletWei: maxStakeWei.toString(),
    },
    priceArena: {
      minStakeWei: minStakeWei.toString(),
      maxStakeWei: maxStakeWei.toString(),
    },
  }
}

function cliArgs(argv) {
  const result = {}
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]
    const value = argv[i + 1]
    if (!name?.startsWith('--') || value == null) throw new Error('Usage: --eth-usd <decimal> [--buffer-bps <integer>]')
    result[name.slice(2)] = value
  }
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = cliArgs(process.argv.slice(2))
    if (!args['eth-usd']) throw new Error('Usage: --eth-usd <decimal> [--buffer-bps <integer>]')
    console.log(JSON.stringify(nativeEthDeploymentCaps({
      ethUsd: args['eth-usd'],
      bufferBps: args['buffer-bps'] ?? '2500',
    }), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'NativeEthCapCalculationFailed')
    process.exitCode = 1
  }
}
