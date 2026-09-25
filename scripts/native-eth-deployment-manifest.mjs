import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { getAddress, isAddress, zeroAddress } from 'viem'
import { nativeEthDeploymentCaps } from './native-eth-deployment-caps.mjs'

const registry = JSON.parse(readFileSync(new URL('../config/asset-race-assets.json', import.meta.url), 'utf8'))
const MAINNET = 'robinhood-mainnet'
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/

function checkedAddress(value, label) {
  if (typeof value !== 'string' || !isAddress(value.trim()) || value.trim().toLowerCase() === zeroAddress) {
    throw new Error(`Invalid${label}`)
  }
  return getAddress(value.trim())
}

function approvedAssets() {
  const assets = registry.assets.flatMap((asset) => {
    const network = asset.networks?.[MAINNET]
    const source = network?.oracle
    if (!network?.enabled || source?.type !== 'SIGNED_POOL_BLOCK_PAIR') return []
    const profile = registry.validationProfiles[source.validationProfile]
    if (
      !profile
      || !BYTES32_PATTERN.test(source.identifier ?? '')
      || source.expectedDecimals !== registry.poolInfrastructure.outputDecimals
      || !Number.isSafeInteger(profile.maxPriceAgeSeconds) || profile.maxPriceAgeSeconds <= 0
      || !Number.isSafeInteger(profile.maxEndpointLagSeconds) || profile.maxEndpointLagSeconds < 0
      || typeof asset.assetId !== 'string' || Buffer.byteLength(asset.assetId) === 0
      || Buffer.byteLength(asset.assetId) > 32
      || !['STOCK', 'MEME'].includes(asset.category)
    ) {
      throw new Error(`InvalidRegistryAsset:${asset.assetId}`)
    }
    return [{
      assetId: asset.assetId,
      category: asset.category,
      oracleId: source.identifier,
      expectedDecimals: source.expectedDecimals,
      maxPriceAgeSeconds: profile.maxPriceAgeSeconds,
      maxEndpointLagSeconds: profile.maxEndpointLagSeconds,
    }]
  })
  if (new Set(assets.map(({ assetId }) => assetId)).size !== assets.length) {
    throw new Error('DuplicateProductionAssetId')
  }
  if (new Set(assets.map(({ oracleId }) => oracleId.toLowerCase())).size !== assets.length) {
    throw new Error('DuplicateProductionOracleId')
  }
  return assets
}

export function nativeEthDeploymentManifest({ ethUsd, bufferBps = '2500', oracleAddress, priceSignerAddress }) {
  const oracle = checkedAddress(oracleAddress, 'OracleAddress')
  const priceSigner = checkedAddress(priceSignerAddress, 'PriceSignerAddress')
  if (oracle.toLowerCase() === priceSigner.toLowerCase()) throw new Error('OracleAndSignerMustDiffer')

  const assets = approvedAssets()
  const stocks = assets.filter((asset) => asset.category === 'STOCK')
  const memes = assets.filter((asset) => asset.category === 'MEME')
  if (stocks.length !== 10 || memes.length !== 13) throw new Error('UnexpectedProductionAssetCount')
  const maxPriceAges = new Set(assets.map(({ maxPriceAgeSeconds }) => maxPriceAgeSeconds))
  const maxEndpointLags = new Set(assets.map(({ maxEndpointLagSeconds }) => maxEndpointLagSeconds))
  if (maxPriceAges.size !== 1 || maxEndpointLags.size !== 1) {
    throw new Error('MixedAssetRaceValidationProfiles')
  }
  const [maxPriceAgeSeconds] = maxPriceAges
  const [maxEndpointLagSeconds] = maxEndpointLags
  const caps = nativeEthDeploymentCaps({ ethUsd, bufferBps })

  const network = registry.networks?.[MAINNET]
  if (
    network?.chainId !== 4663
    || network?.stockQuoteToken?.symbol !== 'USDG'
    || registry.poolInfrastructure?.chainId !== network.chainId
  ) throw new Error('InvalidProductionNetwork')

  return {
    schemaVersion: 1,
    chain: {
      key: MAINNET,
      chainId: registry.networks[MAINNET].chainId,
      nativeCurrency: 'ETH',
      stockPriceQuote: registry.networks[MAINNET].stockQuoteToken.symbol,
    },
    settlement: {
      signedPoolOracleAddress: oracle,
      expectedTrustedSigner: priceSigner,
      outputDecimals: registry.poolInfrastructure.outputDecimals,
    },
    guardrails: caps,
    predictionMarket: {
      constructor: {
        endpointOracle: oracle,
        feeBp: 200,
        maxSeedLiquidityWei: caps.predictionMarket.maxSeedLiquidityWei,
        maxStakePerSideWei: caps.predictionMarket.maxStakePerSideWei,
      },
      assets: stocks,
    },
    assetRace: {
      constructor: {},
      existingOracle: oracle,
      expectedTrustedSigner: priceSigner,
      policy: {
        lobbyDurationSeconds: 300,
        bettingDurationSeconds: 300,
        startGraceSeconds: 180,
        resolutionGraceSeconds: 300,
        maxPriceAgeSeconds,
        maxEndpointLagSeconds,
        maxOracleTimestampSkewSeconds: 0,
        feeBp: 200,
        minActiveContenders: 2,
        minStakeWei: caps.assetRace.minStakeWei,
        maxStakePerWalletWei: caps.assetRace.maxStakePerWalletWei,
        durationPresetsSeconds: [60, 300, 900],
      },
      stockAssets: stocks,
      memeAssets: memes,
    },
    priceArena: {
      constructor: {
        minStakeWei: caps.priceArena.minStakeWei,
        maxStakeWei: caps.priceArena.maxStakeWei,
      },
      oracle,
      stockAssets: stocks,
      memeAssets: memes,
    },
  }
}

function cliArgs(argv) {
  const result = {}
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]
    const value = argv[i + 1]
    if (!name?.startsWith('--') || value == null) {
      throw new Error('Usage: --eth-usd <price> --oracle-address <address> --price-signer-address <address> [--buffer-bps <bp>]')
    }
    result[name.slice(2)] = value
  }
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = cliArgs(process.argv.slice(2))
    console.log(JSON.stringify(nativeEthDeploymentManifest({
      ethUsd: args['eth-usd'],
      bufferBps: args['buffer-bps'] ?? '2500',
      oracleAddress: args['oracle-address'],
      priceSignerAddress: args['price-signer-address'],
    }), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'NativeEthManifestFailed')
    process.exitCode = 1
  }
}
