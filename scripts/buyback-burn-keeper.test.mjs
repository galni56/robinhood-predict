import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buybackBudget,
  readBuybackKeeperConfig,
  tokenDeployerPrivateKeyFromEnvironment,
  minOutputForQuote,
  pendingBuybackForCredits,
  sumCreditedLogs,
} from './buyback-burn-keeper.mjs'

const validConfigEnvironment = {
  BUYBACK_RPC_URL: 'https://example.invalid',
  BUYBACK_EXECUTOR_ADDRESS: '0x7B71d233FFFD6c354A4eD83816Ef7b3Dffb88D4c',
  BUYBACK_FEE_RECIPIENT_ADDRESS: '0x821758584b2155c93713ce4991a7d9b447d0ccd8',
  BUYBACK_CREDIT_START_BLOCK: '77555716',
}

test('token deployer key prefers its dedicated variable and supports PRIVATE_KEY', () => {
  assert.equal(tokenDeployerPrivateKeyFromEnvironment({
    BUYBACK_TOKEN_DEPLOYER_PRIVATE_KEY: ' token-deployer ',
    PRIVATE_KEY: ' website-deployer ',
  }), 'token-deployer')
  assert.equal(tokenDeployerPrivateKeyFromEnvironment({ PRIVATE_KEY: ' token-deployer-fallback ' }), 'token-deployer-fallback')
  assert.equal(tokenDeployerPrivateKeyFromEnvironment({}), undefined)
})

test('buybackBudget accumulates below threshold and caps large batches', () => {
  assert.equal(buybackBudget(9n, 100n, 10n), 0n)
  assert.equal(buybackBudget(10n, 100n, 10n), 10n)
  assert.equal(buybackBudget(500n, 100n, 10n), 100n)
})

test('minOutputForQuote applies basis-point slippage with floor rounding', () => {
  assert.equal(minOutputForQuote(1_000n, 300n), 970n)
  assert.equal(minOutputForQuote(101n, 100n), 99n)
  assert.throws(() => minOutputForQuote(1n, 10_000n), /slippage is invalid/)
  assert.throws(() => minOutputForQuote(0n, 100n), /must be positive/)
})

test('pendingBuybackForCredits derives the durable 15 percent cumulative obligation', () => {
  assert.equal(pendingBuybackForCredits(1_000n, 0n), 150n)
  assert.equal(pendingBuybackForCredits(1_001n, 100n), 50n)
  assert.equal(pendingBuybackForCredits(1_000n, 150n), 0n)
  assert.equal(pendingBuybackForCredits(1_000n, 200n), 0n)
})

test('sumCreditedLogs reconstructs owner revenue from escrow events', () => {
  assert.equal(sumCreditedLogs([
    { args: { amount: 40n } },
    { args: { amount: 60n } },
  ]), 100n)
})

test('release config pins executor, deployer and token launch block', () => {
  const config = readBuybackKeeperConfig(validConfigEnvironment)
  assert.equal(config.executorAddress, '0x7B71d233FFFD6c354A4eD83816Ef7b3Dffb88D4c')
  assert.equal(config.feeRecipient, '0x821758584b2155c93713cE4991A7D9b447d0ccd8')
  assert.equal(config.creditStartBlock, 77_555_716n)

  assert.throws(() => readBuybackKeeperConfig({
    ...validConfigEnvironment,
    BUYBACK_EXECUTOR_ADDRESS: '0x0000000000000000000000000000000000000001',
  }), /does not match the Prophet release/)
  assert.throws(() => readBuybackKeeperConfig({
    ...validConfigEnvironment,
    BUYBACK_FEE_RECIPIENT_ADDRESS: '0x0000000000000000000000000000000000000001',
  }), /does not match the Prophet token deployer/)
  assert.throws(() => readBuybackKeeperConfig({
    ...validConfigEnvironment,
    BUYBACK_CREDIT_START_BLOCK: '77555715',
  }), /does not match the Prophet launch block/)
})
