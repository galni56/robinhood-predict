import assert from 'node:assert/strict'
import test from 'node:test'
import { isRateLimitError, withRpcRateLimit } from './asset-race-rpc-budget.mjs'

test('archive client serializes viem operations below the configured budget', async () => {
  let clock = 0
  const started = []
  const client = {
    chain: { id: 4663 },
    getBlock: async () => { started.push(clock); return { number: 1n } },
  }
  const limited = withRpcRateLimit(client, {
    minIntervalMs: 150,
    now: () => clock,
    sleep: async (delay) => { clock += delay },
  })
  await Promise.all([limited.getBlock({}), limited.getBlock({}), limited.getBlock({})])
  assert.deepEqual(started, [0, 150, 300])
  assert.deepEqual(limited.rpcBudgetStats(), { operations: 3, retries: 0 })
  assert.equal(limited.chain.id, 4663)
})

test('archive client backs off and retries only throughput failures', async () => {
  let clock = 0
  let attempts = 0
  const client = { readContract: async () => {
    attempts += 1
    if (attempts < 3) throw Object.assign(new Error('throughput exceeded'), { status: 429 })
    return 42n
  } }
  const limited = withRpcRateLimit(client, {
    minIntervalMs: 150,
    baseRetryMs: 1_000,
    now: () => clock,
    sleep: async (delay) => { clock += delay },
  })
  assert.equal(await limited.readContract({}), 42n)
  assert.equal(attempts, 3)
  assert.deepEqual(limited.rpcBudgetStats(), { operations: 3, retries: 2 })
  assert.ok(clock >= 3_000)
  assert.equal(isRateLimitError(new Error('ordinary failure')), false)
})

test('archive client does not retry non-rate-limit failures', async () => {
  let attempts = 0
  const limited = withRpcRateLimit({ getBlock: async () => { attempts += 1; throw new Error('bad block') } }, {
    minIntervalMs: 0,
  })
  await assert.rejects(() => limited.getBlock({}), /bad block/)
  assert.equal(attempts, 1)
})
