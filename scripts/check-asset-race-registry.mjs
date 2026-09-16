#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isAddress } from 'viem'
import {
  POOL_PRICE_DECIMALS,
  ROBINHOOD_CHAIN_ID,
  UNISWAP_INTERFACE_MULTICALL,
  UNISWAP_V3_FACTORY,
  UNISWAP_V4_POOL_MANAGER,
  UNISWAP_V4_STATE_VIEW,
  poolConfigsFromRegistry,
} from './asset-race-pool-price-engine.mjs'

const registryPath = fileURLToPath(new URL('../config/asset-race-assets.json', import.meta.url))
const registry = JSON.parse(readFileSync(registryPath, 'utf8'))
const networkNames = ['local', 'robinhood-testnet', 'robinhood-mainnet']
const requiredMemes = new Map([
  ['AI', 'Artificial Inu'],
  ['CASHCAT', 'Cash Cat'],
  ['HOOD', 'GreenHood'],
  ['AMC', 'A Meme Coin'],
  ['BLORB', 'BLORB'],
  ['CHUMP', 'Chump Coin'],
  ['DEGEN', 'Degen'],
  ['BONER', 'Boner Coin'],
  ['PIPEDOG', 'pipedog'],
  ['UBIK', 'ubik'],
  ['TENDIES', 'TENDIES'],
  ['IF', 'What If'],
  ['JUGGERNAUT', 'The Juggernaut'],
  ['MOO', 'Memory cow Moo'],
  ['FRONG', 'frong'],
  ['DOGO', 'DogBull'],
])
const productionPoolStocks = new Set(['NVDA', 'TSLA', 'AAPL', 'META', 'MSTR', 'AMZN', 'MSFT', 'GOOGL', 'MU', 'NFLX'])
const catalogStocks = new Set([...productionPoolStocks, 'MU', 'AMD', 'COIN', 'NFLX', 'TSM'])
const pairIdPattern = /^0x(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function validateDexSource(source, assetId) {
  for (const field of ['poolAddress', 'baseTokenAddress', 'quoteTokenAddress']) {
    assert(isAddress(source[field] ?? ''), `${assetId}: DEX source requires a valid ${field}`)
  }
  assert(typeof source.assetIsToken0 === 'boolean', `${assetId}: DEX token ordering must be explicit`)
  assert(source.baseTokenAddress.toLowerCase() !== source.quoteTokenAddress.toLowerCase(), `${assetId}: DEX pair tokens must differ`)
  if (source.quoteConversionOracle) {
    assert(source.quoteConversionOracle.type === 'CHAINLINK_V3', `${assetId}: unsupported quote conversion source`)
    assert(isAddress(source.quoteConversionOracle.feedAddress ?? ''), `${assetId}: invalid quote conversion feed`)
  }
}

function validate() {
  assert(registry.schemaVersion === 1, 'unsupported registry schema')
  assert(registry.networks.local.chainId === 31337, 'local chain ID must be 31337')
  assert(registry.networks['robinhood-testnet'].chainId === 46630, 'Robinhood testnet chain ID must be 46630')
  assert(registry.networks['robinhood-mainnet'].chainId === 4663, 'Robinhood mainnet chain ID must be 4663')
  assert(registry.networks['robinhood-mainnet'].settlementToken?.symbol === 'USDG', 'mainnet settlement token must be USDG')
  assert(isAddress(registry.networks['robinhood-mainnet'].settlementToken?.address ?? ''), 'mainnet USDG address is invalid')
  assert(registry.poolInfrastructure?.chainId === ROBINHOOD_CHAIN_ID, 'pool infrastructure chain ID mismatch')
  assert(registry.poolInfrastructure?.outputDecimals === POOL_PRICE_DECIMALS, 'pool output decimals mismatch')
  assert(registry.poolInfrastructure?.uniswapV3Factory?.toLowerCase() === UNISWAP_V3_FACTORY.toLowerCase(), 'V3 factory mismatch')
  assert(registry.poolInfrastructure?.uniswapV4PoolManager?.toLowerCase() === UNISWAP_V4_POOL_MANAGER.toLowerCase(), 'V4 PoolManager mismatch')
  assert(registry.poolInfrastructure?.uniswapV4StateView?.toLowerCase() === UNISWAP_V4_STATE_VIEW.toLowerCase(), 'V4 StateView mismatch')
  assert(registry.poolInfrastructure?.uniswapInterfaceMulticall?.toLowerCase() === UNISWAP_INTERFACE_MULTICALL.toLowerCase(), 'Uniswap interface multicall mismatch')
  const memeQuote = registry.marketQuoteUniverses?.MEME
  assert(memeQuote?.chainId === ROBINHOOD_CHAIN_ID && memeQuote?.symbol === 'WETH'
    && memeQuote?.address?.toLowerCase() === '0x0bd7d308f8e1639fab988df18a8011f41eacad73'
    && memeQuote?.decimals === 18 && memeQuote?.unit === 'ETH_QUOTE'
    && JSON.stringify(memeQuote?.supportedQuoteKinds) === JSON.stringify(['WETH', 'NATIVE_ETH']),
  'Meme quote must be the ETH unit represented only by canonical WETH or V4 native ETH')
  const liveProfile = registry.liveDisplayProfiles?.DEXSCREENER_STOCK_TOKEN_V1
  assert(liveProfile?.provider === 'DEXSCREENER', 'Stock live display provider must be DEX Screener')
  assert(liveProfile?.chainId === 'robinhood', 'DEX Screener chain ID must be robinhood')
  assert(liveProfile?.priceField === 'priceNative', 'Stock live display must use the oriented priceNative field')
  assert(liveProfile?.pollIntervalMs === 1_000, 'Stock live display poll interval must be one second')
  assert(liveProfile?.staleAfterMs >= liveProfile.pollIntervalMs, 'Stock live display staleness must cover one poll')
  assert(
    liveProfile?.quoteTokenAddress?.toLowerCase() === registry.networks['robinhood-mainnet'].settlementToken.address.toLowerCase(),
    'Stock live display quote token must be canonical USDG',
  )

  const ids = new Set()
  const mainnetFeeds = new Set()
  const livePairs = new Set()
  for (const asset of registry.assets) {
    assert(asset.assetId === asset.symbol, `${asset.assetId}: assetId and symbol must match`)
    assert(Buffer.byteLength(asset.assetId) > 0 && Buffer.byteLength(asset.assetId) <= 32, `${asset.assetId}: invalid bytes32 assetId`)
    assert(!ids.has(asset.assetId), `${asset.assetId}: duplicate assetId`)
    ids.add(asset.assetId)
    assert(['STOCK', 'MEME'].includes(asset.category), `${asset.assetId}: invalid category`)
    for (const networkName of networkNames) {
      const networkAsset = asset.networks[networkName]
      assert(networkAsset && typeof networkAsset.enabled === 'boolean', `${asset.assetId}: missing ${networkName} config`)
      if (!networkAsset.enabled) {
        assert(networkAsset.oracle === null, `${asset.assetId}: disabled ${networkName} asset must not retain an oracle`)
        assert(typeof networkAsset.blocker === 'string' && networkAsset.blocker, `${asset.assetId}: disabled ${networkName} asset needs a blocker`)
        continue
      }

      const source = networkAsset.oracle
      assert(source && registry.supportedOracleTypes.includes(source.type), `${asset.assetId}: invalid ${networkName} oracle`)
      assert(registry.networks[networkName].allowedOracleTypes.includes(source.type), `${asset.assetId}: ${source.type} forbidden on ${networkName}`)
      assert(Number.isInteger(source.expectedDecimals), `${asset.assetId}: expected decimals required`)
      const profile = registry.validationProfiles[source.validationProfile]
      assert(profile?.maxPriceAgeSeconds > 0, `${asset.assetId}: valid freshness profile required`)
      assert(source.type === 'SIGNED_POOL_BLOCK_PAIR' ? profile?.maxEndpointLagSeconds === 0
        : profile?.maxEndpointLagSeconds > 0, `${asset.assetId}: invalid endpoint timing profile`)
      if (source.type === 'MOCK_LOCAL') {
        assert(networkName === 'local' && typeof source.identifier === 'string' && source.identifier, `${asset.assetId}: mock source must be local and named`)
      } else if (source.type === 'CHAINLINK_V3') {
        assert(isAddress(source.feedAddress ?? ''), `${asset.assetId}: invalid Chainlink feed`)
        const normalizedFeed = source.feedAddress.toLowerCase()
        assert(!mainnetFeeds.has(normalizedFeed), `${asset.assetId}: duplicate Chainlink feed`)
        mainnetFeeds.add(normalizedFeed)
      } else if (source.type === 'SIGNED_POOL_BLOCK_PAIR') {
        assert(networkName === 'robinhood-mainnet', `${asset.assetId}: signed pool source is production-only`)
        if (asset.category === 'STOCK') assert(productionPoolStocks.has(asset.assetId), `${asset.assetId}: Stock is not approved for pool pricing`)
        else {
          assert(asset.tokenVerification?.confidence === 'HIGH', `${asset.assetId}: authoritative Meme identity required`)
          assert(asset.productionStatus === 'A', `${asset.assetId}: Meme pool must be approved`)
          // Exact quote-kind/pair/PoolId validation is shared with the engine.
          // Native ETH is allowed only for V4; Stock quotes remain USDG.
          assert(asset.marketSource?.quoteDecimals === memeQuote.decimals, `${asset.assetId}: Meme quote mismatch`)
        }
        assert(/^0x[0-9a-fA-F]{64}$/.test(source.identifier), `${asset.assetId}: pool oracle identity must be bytes32`)
        assert(source.expectedDecimals === POOL_PRICE_DECIMALS, `${asset.assetId}: pool observations must use 18 decimals`)
        assert(source.validationProfile === 'SIGNED_POOL_BLOCK_PAIR_V1', `${asset.assetId}: wrong signed pool validation profile`)
        assert(isAddress(asset.canonicalTokenAddress ?? ''), `${asset.assetId}: canonical token address required`)
        if (asset.category === 'MEME') continue // Direct-pool LIVE derives from the same marketSource, not DEX Screener.
        const live = asset.liveDisplay
        assert(live?.type === 'DEXSCREENER_STOCK_TOKEN', `${asset.assetId}: DEX Screener live display required`)
        assert(live?.profile === 'DEXSCREENER_STOCK_TOKEN_V1', `${asset.assetId}: wrong live display profile`)
        assert(pairIdPattern.test(live?.pairAddress ?? ''), `${asset.assetId}: invalid live pair identifier`)
        assert(!livePairs.has(live.pairAddress.toLowerCase()), `${asset.assetId}: duplicate live pair identifier`)
        livePairs.add(live.pairAddress.toLowerCase())
        assert(live?.baseTokenAddress?.toLowerCase() === asset.canonicalTokenAddress.toLowerCase(), `${asset.assetId}: live base token must be canonical Stock Token`)
        assert(live?.quoteTokenAddress?.toLowerCase() === liveProfile.quoteTokenAddress.toLowerCase(), `${asset.assetId}: live quote token must be canonical USDG`)
        assert(live?.orientation === 'BASE_STOCK_QUOTE_USDG', `${asset.assetId}: live pair orientation must be explicit`)
      } else {
        validateDexSource(source, asset.assetId)
      }
    }
  }

  const memes = registry.assets.filter((asset) => asset.category === 'MEME')
  assert(memes.length === requiredMemes.size, 'registry must contain the approved reviewed Meme catalog')
  for (const asset of memes) {
    assert(requiredMemes.get(asset.assetId) === asset.displayName, `${asset.assetId}: unapproved Meme asset or display name`)
    assert(asset.productionStatus === (asset.networks['robinhood-mainnet'].enabled ? 'A' : 'C'), `${asset.assetId}: inconsistent Meme production status`)
    assert(asset.networks.local.enabled && asset.networks.local.oracle?.type === 'MOCK_LOCAL', `${asset.assetId}: local Meme must use MockRaceOracle`)
    assert(!asset.networks['robinhood-testnet'].enabled, `${asset.assetId}: Meme testnet source is not verified`)
    if (asset.networks['robinhood-mainnet'].enabled) {
      assert(asset.maxRecommendedRaceExposureUsd === null
        || (Number.isFinite(asset.maxRecommendedRaceExposureUsd) && asset.maxRecommendedRaceExposureUsd > 0),
      `${asset.assetId}: advisory exposure must be pending (null) or a positive dollar amount`)
      assert(asset.raceExposureReviewStatus === (asset.maxRecommendedRaceExposureUsd === null
        ? 'PENDING_CURRENT_EXECUTABLE_DEPTH' : 'REVIEWED'), `${asset.assetId}: exposure review status mismatch`)
    }
    if (asset.networks['robinhood-mainnet'].enabled) assert(asset.networks['robinhood-mainnet'].oracle?.type === 'SIGNED_POOL_BLOCK_PAIR', `${asset.assetId}: Meme must use the shared signed pool oracle`)
  }

  for (const asset of registry.assets) {
    assert(!asset.networks['robinhood-testnet'].enabled, `${asset.assetId}: testnet must fail closed until separately verified`)
    assert(asset.networks['robinhood-mainnet'].oracle?.type !== 'MOCK_LOCAL', `${asset.assetId}: production cannot use MockRaceOracle`)
  }

  const configs = poolConfigsFromRegistry(registry, { category: 'STOCK' })
  const memeConfigs = poolConfigsFromRegistry(registry, { category: 'MEME' })
  assert(memeConfigs.length === memes.filter((asset) => asset.networks['robinhood-mainnet'].enabled).length, 'enabled Meme pool configuration missing')
  const stocks = registry.assets.filter((asset) => asset.category === 'STOCK')
  assert(stocks.length === catalogStocks.size, 'registry must contain exactly 13 approved Stocks')
  for (const stock of stocks) assert(catalogStocks.has(stock.assetId), `${stock.assetId}: unapproved Stock`)
  assert(poolConfigsFromRegistry(registry, { includeDisabled: true, category: 'STOCK' }).length === catalogStocks.size, 'all catalog Stocks require a verified candidate pool')
  assert(configs.length === productionPoolStocks.size, 'registry must expose exactly 10 approved pool configs')

  const enabledPoolStocks = registry.assets.filter((asset) =>
    asset.category === 'STOCK' && asset.networks['robinhood-mainnet'].enabled
      && asset.networks['robinhood-mainnet'].oracle?.type === 'SIGNED_POOL_BLOCK_PAIR')
  assert(enabledPoolStocks.length === productionPoolStocks.size, 'mainnet must enable exactly the 10 approved pool-backed Stocks')
  for (const asset of enabledPoolStocks) assert(productionPoolStocks.has(asset.assetId), `${asset.assetId}: unexpected pool-backed Stock`)
  assert(livePairs.size === productionPoolStocks.size, 'mainnet must configure exactly 10 distinct Stock monitoring pairs')
  for (const asset of registry.assets.filter((item) => !productionPoolStocks.has(item.assetId))) {
    assert(!asset.liveDisplay, `${asset.assetId}: live display is out of scope or not production-approved`)
  }
}

try {
  validate()
  const isMeme = process.argv.some((arg) => arg === '--deployment-meme-symbols' || arg === '--deployment-meme-oracle-ids')
  const configs = poolConfigsFromRegistry(registry, { category: isMeme ? 'MEME' : 'STOCK' })
  if (process.argv.includes('--deployment-symbols') || process.argv.includes('--deployment-meme-symbols')) {
    console.log(configs.map((config) => config.assetId).join(','))
  } else if (process.argv.includes('--deployment-oracle-ids') || process.argv.includes('--deployment-meme-oracle-ids')) {
    console.log(configs.map((config) => config.oracleId).join(','))
  } else {
  const enabledCounts = Object.fromEntries(networkNames.map((network) => [
    network,
    registry.assets.filter((asset) => asset.networks[network].enabled).length,
  ]))
  console.log(`Asset Race registry valid: ${registry.assets.length} assets; enabled local=${enabledCounts.local}, testnet=${enabledCounts['robinhood-testnet']}, mainnet=${enabledCounts['robinhood-mainnet']}`)
  }
} catch (error) {
  console.error(`Asset Race registry invalid: ${error.message}`)
  process.exitCode = 1
}
