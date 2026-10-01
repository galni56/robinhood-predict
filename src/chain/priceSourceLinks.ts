const EXACT_POOL_IDENTIFIER = /^0x(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/

export function uniswapRobinhoodPoolUrl(poolIdentifier?: string): string | undefined {
  const exactPool = poolIdentifier?.trim()
  if (!exactPool || !EXACT_POOL_IDENTIFIER.test(exactPool)) return undefined
  return `https://app.uniswap.org/explore/pools/robinhood/${exactPool}`
}
