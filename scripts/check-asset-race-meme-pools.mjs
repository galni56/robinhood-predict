#!/usr/bin/env node

// Explicit read-only RPC + discovery analytics. No account, keys, env files,
// transactions, approvals or swaps. Analytics never enter signed observations.
import { readFileSync } from 'node:fs'
import { createPublicClient, defineChain, formatUnits, http, parseAbi, parseUnits } from 'viem'
import { PoolPriceEngine, poolChainContracts, poolConfigsFromRegistry, poolEngineAbis, poolOracleId, priceFromSqrtPriceX96, verifyPoolConfigs, ROBINHOOD_CHAIN_ID, UNISWAP_V4_STATE_VIEW } from './asset-race-pool-price-engine.mjs'
import { quotePoolExactInput } from './asset-race-pool-quotes.mjs'
import { archiveLookbacks, archiveRpcMinIntervalMs, archiveRpcUrl } from './asset-race-archive-options.mjs'
import { withRpcRateLimit } from './asset-race-rpc-budget.mjs'

async function main() {
const args = process.argv.slice(2)
function option(name) { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
const rpcUrl = archiveRpcUrl(args, process.env)
const rpcMinIntervalMs = archiveRpcMinIntervalMs(args, process.env)
const archiveOnly = args.includes('--archive-only')
const lookbacks = archiveLookbacks(option('--lookback-seconds'))
const quoteUsd = parseUnits(option('--quote-usd') ?? '0', 18)
if (!archiveOnly && quoteUsd <= 0n) throw new Error('Explicit approximate analytics-only --quote-usd required for dollar notionals')
const registry = JSON.parse(readFileSync(new URL('../config/asset-race-assets.json', import.meta.url), 'utf8'))
const requested = option('--assets')?.split(',')
const configs = poolConfigsFromRegistry(registry, { category: 'MEME', includeDisabled: !archiveOnly && !args.includes('--enabled-only') })
  .filter((config) => !requested || requested.includes(config.assetId))
if (requested && (new Set(requested).size !== requested.length || requested.some((id) => !configs.some((config) => config.assetId === id)))) {
  throw new Error('Requested assets must be distinct configured Meme pools (and enabled when --enabled-only is used)')
}
if (!configs.length) throw new Error('No configured Meme candidate pools')
// Candidate review uses individual calls because the public RPC returned partial
// batches. Archive-only probes exercise batching used by production keeper/LIVE.
const chain = defineChain({ id: ROBINHOOD_CHAIN_ID, name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } }, contracts: poolChainContracts(ROBINHOOD_CHAIN_ID) })
const client = withRpcRateLimit(
  createPublicClient({ chain, transport: http(rpcUrl, { batch: archiveOnly, timeout: 30_000 }) }),
  { minIntervalMs: rpcMinIntervalMs },
)
if (await client.getChainId() !== 4663) throw new Error('Expected Robinhood Chain 4663')
const compare = option('--compare-pool')
if (archiveOnly && compare) throw new Error('Archive-only checks use approved registry sources, not comparison pools')
if (compare) {
  const [assetId, poolIdentifier] = compare.split(':')
  const original = configs.find((config) => config.assetId === assetId)
  if (!original) throw new Error('Comparison requires a registry-verified candidate token')
  const [fee, token0] = await Promise.all(['fee', 'token0'].map((functionName) =>
    client.readContract({ address: poolIdentifier, abi: poolEngineAbis.v3PoolAbi, functionName })))
  const alternate = { ...original, assetId: `${assetId}-comparison`, poolIdentifier, fee, baseIsToken0: token0.toLowerCase() === original.baseToken.toLowerCase() }
  alternate.oracleId = poolOracleId(alternate)
  configs.push(alternate)
}
const engine = new PoolPriceEngine({ client, configs })
await engine.verify()
const latest = await engine.latestSnapshot()
const summary = (snapshot) => ({ block: snapshot.block.number.toString(), timestamp: snapshot.block.timestamp.toString(), hash: snapshot.block.hash,
  pricesInQuote: Object.fromEntries(Object.entries(snapshot.assets).map(([id, asset]) => [id, formatUnits(asset.priceRaw, asset.decimals)])) })
const pairs = []
for (const lookback of lookbacks) {
  const pair = await engine.endpointPair(latest.block.timestamp - lookback)
  if (archiveOnly) {
    for (const snapshot of [pair.previous, pair.selected]) {
      await verifyPoolConfigs({ readContract: (request) => client.readContract({ ...request, blockNumber: snapshot.block.number }) }, configs)
    }
  }
  pairs.push({ lookbackSeconds: lookback.toString(), pair })
}
const pair = pairs[0].pair
console.log(JSON.stringify({ latest: summary(latest), historicalEndpoint: summary(pair.previous), boundary: summary(pair.selected),
  boundaryParentHash: pair.selected.block.parentHash, quote: registry.marketQuoteUniverses.MEME,
  quoteUsdAnalyticsOnly: archiveOnly ? null : formatUnits(quoteUsd, 18),
  historicalEndpoints: pairs.map(({ lookbackSeconds, pair }) => ({ lookbackSeconds, endpoint: summary(pair.previous), boundary: summary(pair.selected) })),
  rpcBudget: client.rpcBudgetStats() }))

const tokenAbi = parseAbi(['function name() view returns(string)', 'function symbol() view returns(string)', 'function totalSupply() view returns(uint256)'])
const liquidityAbi = parseAbi(['function liquidity() view returns(uint128)'])
const v4LiquidityAbi = parseAbi(['function getLiquidity(bytes32 poolId) view returns(uint128)'])
const wrappedConfig = archiveOnly ? undefined : configs.find((config) => config.quoteKind === 'WETH')
if (wrappedConfig) {
  const quoteSymbol = await client.readContract({ address: wrappedConfig.quoteToken, abi: tokenAbi, functionName: 'symbol', blockNumber: latest.block.number })
  if (quoteSymbol !== registry.marketQuoteUniverses.MEME.symbol) throw new Error('Quote token metadata mismatch')
}
for (const config of archiveOnly ? [] : configs) {
  const originalId = config.assetId.replace('-comparison', '')
  const asset = registry.assets.find((item) => item.assetId === originalId)
  const [code, name, symbol, supply, liquidity] = await Promise.all([
    client.getBytecode({ address: config.baseToken, blockNumber: latest.block.number }),
    ...['name', 'symbol', 'totalSupply'].map((functionName) => client.readContract({ address: config.baseToken, abi: tokenAbi, functionName, blockNumber: latest.block.number })),
    client.readContract(config.protocol === 'UNISWAP_V3'
      ? { address: config.poolIdentifier, abi: liquidityAbi, functionName: 'liquidity', blockNumber: latest.block.number }
      : { address: UNISWAP_V4_STATE_VIEW, abi: v4LiquidityAbi, functionName: 'getLiquidity', args: [config.poolIdentifier], blockNumber: latest.block.number }),
  ])
  if (!code || code === '0x' || name !== asset.tokenVerification.name || symbol !== asset.tokenVerification.symbol || liquidity <= 0n) {
    throw new Error(`MemeIdentityOrLiquidityMismatch:${config.assetId}`)
  }
  const spot = latest.assets[config.assetId].priceRaw
  const impacts = []
  const notionals = [100n, 500n, 1_000n, 2_500n, 5_000n, 10_000n]
  if (args.includes('--movement-depth')) notionals.push(25_000n, 50_000n, 100_000n)
  for (const dollars of notionals) {
    const quoteIn = dollars * 10n ** BigInt(config.quoteDecimals + 18) / quoteUsd
    const baseIn = quoteIn * 10n ** BigInt(config.baseDecimals + 18) / (spot * 10n ** BigInt(config.quoteDecimals))
    const [buy, sell] = await Promise.all([true, false].map((buy) => quotePoolExactInput(client, config,
      { buy, amountIn: buy ? quoteIn : baseIn, blockNumber: latest.block.number })))
    const buyPrice = quoteIn * 10n ** BigInt(config.baseDecimals + 18) / (buy.amountOut * 10n ** BigInt(config.quoteDecimals))
    const sellPrice = sell.amountOut * 10n ** BigInt(config.baseDecimals + 18) / (baseIn * 10n ** BigInt(config.quoteDecimals))
    const fee = config.protocol === 'UNISWAP_V3' ? BigInt(config.fee) : null
    impacts.push({ approximateDollars: dollars.toString(), buyAmountInRaw: quoteIn.toString(), buyAmountOutRaw: buy.amountOut.toString(),
      sellAmountInRaw: baseIn.toString(), sellAmountOutRaw: sell.amountOut.toString(),
      buyImpactBp: ((buyPrice - spot) * 10_000n / spot).toString(), sellImpactBp: ((spot - sellPrice) * 10_000n / spot).toString(),
      ...(fee !== null ? { buyPureImpactBp: ((buyPrice * (1_000_000n - fee) / 1_000_000n - spot) * 10_000n / spot).toString(),
        sellPureImpactBp: ((spot - sellPrice * 1_000_000n / (1_000_000n - fee)) * 10_000n / spot).toString() } : {}),
      ...(buy.sqrtPriceX96After !== undefined ? {
        buySqrtPriceX96After: buy.sqrtPriceX96After.toString(), sellSqrtPriceX96After: sell.sqrtPriceX96After.toString(),
        buySpotMoveBp: ((priceFromSqrtPriceX96({ ...config, sqrtPriceX96: buy.sqrtPriceX96After }) - spot) * 10_000n / spot).toString(),
        sellSpotMoveBp: ((spot - priceFromSqrtPriceX96({ ...config, sqrtPriceX96: sell.sqrtPriceX96After })) * 10_000n / spot).toString(),
      } : { postTradeState: 'Not exposed by the official V4 Quoter; not inferred from TVL' }) })
  }
  const response = await fetch(`https://api.dexscreener.com/token-pairs/v1/robinhood/${config.baseToken}`)
  if (!response.ok) throw new Error(`DiscoveryHTTP:${response.status}`)
  const discovered = await response.json()
  const matching = discovered.find((item) => item.pairAddress.toLowerCase() === config.poolIdentifier.toLowerCase())
  console.log(JSON.stringify({ assetId: config.assetId, canonicalToken: config.baseToken, name, symbol, totalSupplyRaw: supply.toString(),
    pool: config.poolIdentifier, protocol: config.protocol, quoteKind: config.quoteKind, quoteUnit: config.quoteUnit,
    fee: config.fee ?? config.poolKey?.fee, hooks: config.poolKey?.hooks, activeLiquidityRaw: liquidity.toString(), impacts,
    analyticsOnly: { liquidityUsd: matching?.liquidity?.usd, volume24h: matching?.volume?.h24, trades24h: matching?.txns?.h24,
      trades1h: matching?.txns?.h1, poolCreatedAt: matching?.pairCreatedAt,
      credibleUniswapAlternatives: discovered.filter((item) => item.dexId === 'uniswap' && (item.liquidity?.usd ?? 0) >= 10_000).map((item) => ({
        pool: item.pairAddress, protocol: item.labels, quote: item.quoteToken, liquidityUsd: item.liquidity?.usd, volume24h: item.volume?.h24 })) } }))
}
}

main().catch((error) => {
  console.error(`[asset-race-meme-pools] failed (${error instanceof Error ? error.name : 'UnknownError'})`)
  process.exitCode = 1
})
