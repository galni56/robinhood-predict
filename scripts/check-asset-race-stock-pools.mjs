#!/usr/bin/env node

// Read-only production preparation: eth_call, block/bytecode reads, and Quoter
// simulations only. No wallet, signer credentials, sendTransaction, or writes.
import { readFileSync } from 'node:fs'
import { createPublicClient, formatUnits, http, parseAbi, zeroAddress } from 'viem'
import { PoolPriceEngine, poolConfigsFromRegistry, poolEngineAbis, ROBINHOOD_CHAIN_ID, UNISWAP_V4_STATE_VIEW } from './asset-race-pool-price-engine.mjs'

const args = process.argv.slice(2)
const rpcUrl = args[args.indexOf('--rpc-url') + 1]
if (!args.includes('--rpc-url') || !/^https?:\/\//.test(rpcUrl ?? '')) {
  throw new Error('An explicit public --rpc-url is required; this tool never reads env files')
}
const lookbackIndex = args.indexOf('--lookback-seconds')
const lookback = lookbackIndex < 0 ? 60n : BigInt(args[lookbackIndex + 1])
if (lookback <= 0n) throw new Error('Invalid historical lookback')
const assess = args.includes('--assess-candidates')
const registry = JSON.parse(readFileSync(new URL('../config/asset-race-assets.json', import.meta.url), 'utf8'))
const configs = poolConfigsFromRegistry(registry, { includeDisabled: assess, category: 'STOCK' })
const client = createPublicClient({ transport: http(rpcUrl, { batch: true, timeout: 30_000 }) })
if (await client.getChainId() !== ROBINHOOD_CHAIN_ID) throw new Error('Wrong chain; expected Robinhood Chain 4663')
const engine = new PoolPriceEngine({ client, configs })
await engine.verify()
const latest = await engine.latestSnapshot()
const pair = await engine.endpointPair(latest.block.timestamp - lookback)
function summary(snapshot) {
  return { block: snapshot.block.number.toString(), hash: snapshot.block.hash, timestamp: snapshot.block.timestamp.toString(),
    prices: Object.fromEntries(Object.entries(snapshot.assets).map(([id, entry]) => [id, formatUnits(entry.priceRaw, entry.decimals)])) }
}
console.log(JSON.stringify({ latest: summary(latest), historicalEndpoint: summary(pair.previous),
  boundary: { block: pair.selected.block.number.toString(), hash: pair.selected.block.hash, parentHash: pair.selected.block.parentHash, timestamp: pair.selected.block.timestamp.toString() } }))

if (assess) {
  const tokenAbi = parseAbi(['function name() view returns(string)', 'function symbol() view returns(string)', 'function uid() view returns(bytes32)'])
  const liquidityAbi = parseAbi(['function liquidity() view returns(uint128)', 'function getLiquidity(bytes32) view returns(uint128)'])
  const quoterV3 = parseAbi(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)'])
  const quoterV4 = parseAbi(['function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)'])
  for (const config of configs.filter((item) => registry.assets.find((asset) => asset.assetId === item.assetId)?.tokenVerification)) {
    const asset = registry.assets.find((item) => item.assetId === config.assetId)
    const [code, name, symbol, uid, decimals] = await Promise.all([
      client.getBytecode({ address: config.baseToken }),
      ...['name', 'symbol', 'uid'].map((functionName) => client.readContract({ address: config.baseToken, abi: tokenAbi, functionName })),
      client.readContract({ address: config.baseToken, abi: poolEngineAbis.erc20Abi, functionName: 'decimals' }),
    ])
    if (!code || code === '0x' || symbol !== asset.symbol || decimals !== asset.tokenVerification.decimals
      || uid.toLowerCase() !== asset.tokenVerification.registryUid.toLowerCase()) throw new Error(`CanonicalTokenMismatch:${asset.assetId}`)
    const liquidity = await client.readContract(config.protocol === 'UNISWAP_V3'
      ? { address: config.poolIdentifier, abi: liquidityAbi, functionName: 'liquidity', blockNumber: latest.block.number }
      : { address: UNISWAP_V4_STATE_VIEW, abi: liquidityAbi, functionName: 'getLiquidity', args: [config.poolIdentifier], blockNumber: latest.block.number })
    const spot = latest.assets[config.assetId].priceRaw
    async function quote(buy, amountIn) {
      const result = await client.simulateContract(config.protocol === 'UNISWAP_V3'
        ? { account: zeroAddress, address: '0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7', abi: quoterV3, functionName: 'quoteExactInputSingle',
          args: [{ tokenIn: buy ? config.quoteToken : config.baseToken, tokenOut: buy ? config.baseToken : config.quoteToken, amountIn, fee: config.fee, sqrtPriceLimitX96: 0n }], blockNumber: latest.block.number }
        : { account: zeroAddress, address: '0x8dc178efb8111bb0973dd9d722ebeff267c98f94', abi: quoterV4, functionName: 'quoteExactInputSingle',
          args: [{ poolKey: config.poolKey, zeroForOne: buy ? !config.baseIsToken0 : config.baseIsToken0, exactAmount: amountIn, hookData: '0x' }], blockNumber: latest.block.number })
      if (result.result[0] <= 0n) throw new Error(`EmptyQuote:${asset.assetId}`)
      return result.result[0]
    }
    const impacts = []
    for (const dollars of [1_000n, 5_000n, 10_000n, 25_000n]) {
      const usdIn = dollars * 10n ** 6n
      const stockIn = dollars * 10n ** 36n / spot
      const buyOut = await quote(true, usdIn)
      const sellOut = await quote(false, stockIn)
      const buyPrice = usdIn * 10n ** 30n / buyOut
      const sellPrice = sellOut * 10n ** 30n / stockIn
      impacts.push({ dollars: dollars.toString(), buyImpactBp: ((buyPrice - spot) * 10_000n / spot).toString(),
        sellImpactBp: ((spot - sellPrice) * 10_000n / spot).toString() })
    }
    console.log(JSON.stringify({ assetId: asset.assetId, canonicalToken: config.baseToken, name, symbol, uid, decimals,
      codeBytes: (code.length - 2) / 2, protocol: config.protocol, pool: config.poolIdentifier, activeLiquidityRaw: liquidity.toString(),
      impactMethod: 'Uniswap Quoter eth_call, fees included, all quotes at common explicit block', impacts }))
  }
}
