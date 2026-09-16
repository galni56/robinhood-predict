// Read-only market review. These quotes never enter LIVE or settlement.
import { parseAbi } from 'viem'
import { UNISWAP_V4_QUOTER, v4PoolId } from './asset-race-pool-price-engine.mjs'

const v3Abi = parseAbi(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)'])
const v4Abi = parseAbi(['function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns(uint256 amountOut,uint256 gasEstimate)'])

export async function quotePoolExactInput(client, config, { buy, amountIn, blockNumber }) {
  if (typeof blockNumber !== 'bigint' || typeof amountIn !== 'bigint' || amountIn <= 0n || typeof buy !== 'boolean') {
    throw new Error('InvalidReadOnlyQuote')
  }
  let request
  if (config.protocol === 'UNISWAP_V3') {
    request = { address: '0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7', abi: v3Abi,
      args: [{ tokenIn: buy ? config.quoteToken : config.baseToken, tokenOut: buy ? config.baseToken : config.quoteToken,
        amountIn, fee: config.fee, sqrtPriceLimitX96: 0n }] }
  } else if (config.protocol === 'UNISWAP_V4') {
    if (!config.poolKey || v4PoolId(config.poolKey).toLowerCase() !== config.poolIdentifier.toLowerCase()
      || amountIn >= 1n << 128n) throw new Error('InvalidV4QuotePoolKeyOrAmount')
    request = { address: UNISWAP_V4_QUOTER, abi: v4Abi, args: [{ poolKey: config.poolKey,
      zeroForOne: buy ? !config.baseIsToken0 : config.baseIsToken0, exactAmount: amountIn, hookData: '0x' }] }
  } else throw new Error('UnsupportedQuoteProtocol')
  // simulateContract uses eth_call, not a wallet or an external transaction.
  const { result } = await client.simulateContract({ ...request, functionName: 'quoteExactInputSingle', blockNumber })
  if (result[0] <= 0n) throw new Error('EmptyQuoterResult')
  return { amountIn, amountOut: result[0],
    ...(config.protocol === 'UNISWAP_V3' ? { sqrtPriceX96After: result[1], initializedTicksCrossed: result[2], gasEstimate: result[3] }
      : { gasEstimate: result[1] }) }
}
