const RPC_METHODS = new Set([
  'getBlock',
  'getBytecode',
  'getChainId',
  'multicall',
  'readContract',
  'simulateContract',
])

function defaultSleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

export function isRateLimitError(error) {
  let current = error
  for (let depth = 0; depth < 10 && current && typeof current === 'object'; depth += 1) {
    if (current.status === 429 || current.statusCode === 429 || current.code === 429) return true
    const message = typeof current.message === 'string' ? current.message.toLowerCase() : ''
    if (message.includes('429') || message.includes('rate limit') || message.includes('throughput')) return true
    current = current.cause
  }
  return false
}

// Serializes high-level viem RPC operations. At the production default of
// 150 ms, even a stream of 26-CU eth_call requests stays below 200 CU/s.
export function withRpcRateLimit(client, {
  minIntervalMs = 150,
  maxRetries = 5,
  baseRetryMs = 1_000,
  now = Date.now,
  sleep = defaultSleep,
} = {}) {
  if (!client || !Number.isSafeInteger(minIntervalMs) || minIntervalMs < 0
    || !Number.isSafeInteger(maxRetries) || maxRetries < 0
    || !Number.isSafeInteger(baseRetryMs) || baseRetryMs < 0) {
    throw new Error('InvalidRpcRateLimitConfig')
  }

  let queue = Promise.resolve()
  let nextAllowedAt = 0
  const stats = { operations: 0, retries: 0 }

  async function executeOnce(method, args) {
    const scheduled = queue.then(async () => {
      const delay = Math.max(0, nextAllowedAt - now())
      if (delay > 0) await sleep(delay)
      nextAllowedAt = now() + minIntervalMs
      stats.operations += 1
      return Reflect.apply(client[method], client, args)
    })
    queue = scheduled.then(() => undefined, () => undefined)
    return scheduled
  }

  async function execute(method, args) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await executeOnce(method, args)
      } catch (error) {
        if (!isRateLimitError(error) || attempt >= maxRetries) throw error
        stats.retries += 1
        await sleep(baseRetryMs * (2 ** attempt))
      }
    }
  }

  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === 'rpcBudgetStats') return () => ({ ...stats })
      const value = Reflect.get(target, property, receiver)
      if (typeof property !== 'string' || typeof value !== 'function' || !RPC_METHODS.has(property)) return value
      return (...args) => execute(property, args)
    },
  })
}
