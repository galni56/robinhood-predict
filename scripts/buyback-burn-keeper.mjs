#!/usr/bin/env node

import { pathToFileURL } from 'node:url'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  isAddress,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

export const ROBINHOOD_CHAIN_ID = 4_663
export const PONS_V2_FACTORY = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e'
export const PONS_V2_FEE_ESCROW = '0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e'
export const PONS_V2_MEME_HOOK = '0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044'
export const UNISWAP_V4_UNIVERSAL_ROUTER = '0x204FAca1764B154221e35c0d20aBb3c525710498'
export const UNISWAP_V4_QUOTER = '0x8dc178efb8111bb0973dd9d722ebeff267c98f94'
export const PROPHET_TOKEN_DEPLOYER_ADDRESS = '0x821758584b2155c93713cE4991A7D9b447d0ccd8'
export const PROPHET_TOKEN_ADDRESS = '0x410f2bD350F3d88795cfC29b61cA664C30987Efd'
export const PROPHET_TOKEN_LAUNCH_BLOCK = 77_555_716n
export const PROPHET_BUYBACK_EXECUTOR_ADDRESS = '0x7B71d233FFFD6c354A4eD83816Ef7b3Dffb88D4c'
export const BUYBACK_BPS = 1_500n
export const BPS = 10_000n
export const DEFAULT_SLIPPAGE_BPS = 300n

export const buybackExecutorAbi = [
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'feeRecipient', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'token', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'curve', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'ponsFactory', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'postGraduationExecutor', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'buybacksPaused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'maxBuybackPerCall', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalNativeSpent', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalTokensBurned', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'executeBuyback', stateMutability: 'payable',
    inputs: [{ name: 'minTokensOut', type: 'uint256' }, { name: 'deadline', type: 'uint256' }],
    outputs: [
      { name: 'spent', type: 'uint256' },
      { name: 'burned', type: 'uint256' },
      { name: 'refunded', type: 'uint256' },
    ],
  },
]

export const feeEscrowAbi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'recipient', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'event', name: 'Credited', anonymous: false,
    inputs: [
      { indexed: true, name: 'recipient', type: 'address' },
      { indexed: true, name: 'depositor', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
  },
]

export const ponsFactoryAbi = [
  { type: 'function', name: 'feeEscrow', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'memeHook', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'poolManager', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    type: 'function', name: 'getLaunchedToken', stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{
      type: 'tuple', components: [
        { name: 'token', type: 'address' }, { name: 'curve', type: 'address' },
        { name: 'deployer', type: 'address' }, { name: 'creatorFeeRecipient', type: 'address' },
        { name: 'pairToken', type: 'address' }, { name: 'graduationThreshold', type: 'uint256' },
        { name: 'poolFee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' },
        { name: 'creatorTaxBps', type: 'uint16' }, { name: 'buybackEnabled', type: 'bool' },
        { name: 'phase', type: 'uint8' }, { name: 'sweptQuote', type: 'uint256' },
        { name: 'sweptTokens', type: 'uint256' }, { name: 'sweptAt', type: 'uint256' },
        { name: 'exists', type: 'bool' },
      ],
    }],
  },
]

const v4ExecutorAbi = [
  { type: 'function', name: 'buybackExecutor', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'feeRecipient', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'ponsFactory', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'ponsMemeHook', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'universalRouter', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
]

const curveAbi = [{
  type: 'function', name: 'buy', stateMutability: 'payable',
  inputs: [{ name: 'quoteIn', type: 'uint256' }, { name: 'minTokensOut', type: 'uint256' }, { name: 'recipient', type: 'address' }],
  outputs: [{ name: 'tokensOut', type: 'uint256' }],
}]

const quoterAbi = [{
  type: 'function', name: 'quoteExactInputSingle', stateMutability: 'nonpayable',
  inputs: [{
    name: 'params', type: 'tuple', components: [
      {
        name: 'poolKey', type: 'tuple', components: [
          { name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' },
        ],
      },
      { name: 'zeroForOne', type: 'bool' }, { name: 'exactAmount', type: 'uint128' },
      { name: 'hookData', type: 'bytes' },
    ],
  }],
  outputs: [{ name: 'amountOut', type: 'uint256' }, { name: 'gasEstimate', type: 'uint256' }],
}]

class BuybackConfigError extends Error {}

function boolEnv(name, fallback, environment = process.env) {
  const raw = environment[name]
  if (raw == null || raw === '') return fallback
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new BuybackConfigError(`${name} must be true or false`)
}

function bigintEnv(name, fallback, minimum = 0n, environment = process.env) {
  const raw = environment[name]?.trim()
  if (!raw) return fallback
  if (!/^\d+$/.test(raw)) throw new BuybackConfigError(`${name} must be an unsigned integer`)
  const value = BigInt(raw)
  if (value < minimum) throw new BuybackConfigError(`${name} is below its minimum`)
  return value
}

export function minOutputForQuote(quotedOutput, slippageBps) {
  if (quotedOutput <= 0n) throw new BuybackConfigError('quoted output must be positive')
  if (slippageBps < 0n || slippageBps >= BPS) throw new BuybackConfigError('slippage is invalid')
  const minimum = quotedOutput * (BPS - slippageBps) / BPS
  if (minimum === 0n) throw new BuybackConfigError('minimum output rounds to zero')
  return minimum
}

export function pendingBuybackForCredits(totalCredited, totalSpent) {
  if (totalCredited < 0n || totalSpent < 0n) throw new BuybackConfigError('accounting values cannot be negative')
  const target = totalCredited * BUYBACK_BPS / BPS
  return target > totalSpent ? target - totalSpent : 0n
}

export function buybackBudget(pending, maxPerCall, minimumExecution) {
  const budget = pending < maxPerCall ? pending : maxPerCall
  return budget >= minimumExecution ? budget : 0n
}

export function sumCreditedLogs(logs) {
  return logs.reduce((total, log) => total + (log.args.amount ?? 0n), 0n)
}

export function tokenDeployerPrivateKeyFromEnvironment(environment = process.env) {
  return environment.BUYBACK_TOKEN_DEPLOYER_PRIVATE_KEY?.trim()
    || environment.PRIVATE_KEY?.trim()
}

export function readBuybackKeeperConfig(environment = process.env) {
  const rpcUrl = environment.BUYBACK_RPC_URL?.trim()
  const rawExecutor = environment.BUYBACK_EXECUTOR_ADDRESS?.trim()
    || PROPHET_BUYBACK_EXECUTOR_ADDRESS
  const rawRecipient = environment.BUYBACK_FEE_RECIPIENT_ADDRESS?.trim()
    || PROPHET_TOKEN_DEPLOYER_ADDRESS
  if (!rpcUrl) throw new BuybackConfigError('BUYBACK_RPC_URL is required')
  if (!rawExecutor || !isAddress(rawExecutor)) throw new BuybackConfigError('BUYBACK_EXECUTOR_ADDRESS is invalid')
  if (!rawRecipient || !isAddress(rawRecipient)) {
    throw new BuybackConfigError('BUYBACK_FEE_RECIPIENT_ADDRESS is invalid')
  }
  const executorAddress = getAddress(rawExecutor)
  const feeRecipient = getAddress(rawRecipient)
  if (executorAddress.toLowerCase() !== PROPHET_BUYBACK_EXECUTOR_ADDRESS.toLowerCase()) {
    throw new BuybackConfigError('BUYBACK_EXECUTOR_ADDRESS does not match the Prophet release')
  }
  if (feeRecipient.toLowerCase() !== PROPHET_TOKEN_DEPLOYER_ADDRESS.toLowerCase()) {
    throw new BuybackConfigError('BUYBACK_FEE_RECIPIENT_ADDRESS does not match the Prophet token deployer')
  }
  const dryRun = boolEnv('DRY_RUN', true, environment)
  const allowLive = boolEnv('BUYBACK_ALLOW_LIVE', false, environment)
  const privateKey = tokenDeployerPrivateKeyFromEnvironment(environment)
  if (!dryRun && !allowLive) throw new BuybackConfigError('BUYBACK_ALLOW_LIVE=true is required for live mode')
  if (!dryRun && !/^0x[0-9a-fA-F]{64}$/.test(privateKey ?? '')) {
    throw new BuybackConfigError('BUYBACK_TOKEN_DEPLOYER_PRIVATE_KEY or PRIVATE_KEY is required for live mode')
  }
  if (privateKey && !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new BuybackConfigError('BUYBACK_TOKEN_DEPLOYER_PRIVATE_KEY is invalid')
  }
  const creditStartBlock = bigintEnv(
    'BUYBACK_CREDIT_START_BLOCK',
    PROPHET_TOKEN_LAUNCH_BLOCK,
    1n,
    environment,
  )
  if (creditStartBlock !== PROPHET_TOKEN_LAUNCH_BLOCK) {
    throw new BuybackConfigError('BUYBACK_CREDIT_START_BLOCK does not match the Prophet launch block')
  }
  return {
    allowLive,
    creditStartBlock,
    dryRun,
    executorAddress,
    feeRecipient,
    logBlockRange: bigintEnv('BUYBACK_LOG_BLOCK_RANGE', 25_000n, 100n, environment),
    minimumExecutionWei: bigintEnv(
      'BUYBACK_MIN_EXECUTION_WEI',
      5_000_000_000_000_000n,
      1n,
      environment,
    ),
    pollIntervalMs: Number(bigintEnv('BUYBACK_POLL_INTERVAL_MS', 30_000n, 5_000n, environment)),
    privateKey,
    rpcConfirmations: bigintEnv('BUYBACK_RPC_CONFIRMATIONS', 2n, 0n, environment),
    rpcUrl,
    slippageBps: bigintEnv('BUYBACK_SLIPPAGE_BPS', DEFAULT_SLIPPAGE_BPS, 0n, environment),
  }
}

export async function readCumulativeCredits(client, config, checkpoint) {
  const latest = await client.getBlockNumber()
  const confirmed = latest > config.rpcConfirmations ? latest - config.rpcConfirmations : 0n
  const firstUnreadBlock = checkpoint?.nextBlock ?? config.creditStartBlock
  let totalCredited = checkpoint?.totalCredited ?? 0n
  if (confirmed < firstUnreadBlock) return { confirmedBlock: confirmed, totalCredited }

  for (let fromBlock = firstUnreadBlock; fromBlock <= confirmed; fromBlock += config.logBlockRange) {
    const candidateTo = fromBlock + config.logBlockRange - 1n
    const toBlock = candidateTo < confirmed ? candidateTo : confirmed
    const logs = await client.getLogs({
      address: PONS_V2_FEE_ESCROW,
      event: feeEscrowAbi[2],
      args: { recipient: config.feeRecipient },
      fromBlock,
      toBlock,
    })
    totalCredited += sumCreditedLogs(logs)
  }
  if (checkpoint) {
    checkpoint.nextBlock = confirmed + 1n
    checkpoint.totalCredited = totalCredited
  }
  return { confirmedBlock: confirmed, totalCredited }
}

export async function verifyBuybackRelease(client, executorAddress, expectedRecipient) {
  const chainId = await client.getChainId()
  if (chainId !== ROBINHOOD_CHAIN_ID) throw new Error(`Wrong chain: ${chainId}`)
  const code = await client.getBytecode({ address: executorAddress })
  if (!code || code === '0x') throw new Error('Buyback executor has no code')

  const [factory, owner, feeRecipient, token, curve, v4Executor, paused, maxPerCall, totalSpent, totalBurned] = await Promise.all([
    client.readContract({ address: executorAddress, abi: buybackExecutorAbi, functionName: 'ponsFactory' }),
    client.readContract({ address: executorAddress, abi: buybackExecutorAbi, functionName: 'owner' }),
    client.readContract({ address: executorAddress, abi: buybackExecutorAbi, functionName: 'feeRecipient' }),
    client.readContract({ address: executorAddress, abi: buybackExecutorAbi, functionName: 'token' }),
    client.readContract({ address: executorAddress, abi: buybackExecutorAbi, functionName: 'curve' }),
    client.readContract({ address: executorAddress, abi: buybackExecutorAbi, functionName: 'postGraduationExecutor' }),
    client.readContract({ address: executorAddress, abi: buybackExecutorAbi, functionName: 'buybacksPaused' }),
    client.readContract({ address: executorAddress, abi: buybackExecutorAbi, functionName: 'maxBuybackPerCall' }),
    client.readContract({ address: executorAddress, abi: buybackExecutorAbi, functionName: 'totalNativeSpent' }),
    client.readContract({ address: executorAddress, abi: buybackExecutorAbi, functionName: 'totalTokensBurned' }),
  ])
  if (factory.toLowerCase() !== PONS_V2_FACTORY.toLowerCase()) throw new Error('Unexpected PONZ factory')
  if (feeRecipient.toLowerCase() !== expectedRecipient.toLowerCase()) throw new Error('Fee recipient mismatch')
  if (owner === zeroAddress || v4Executor === zeroAddress) throw new Error('A required role is zero')
  if (maxPerCall === 0n) throw new Error('Maximum buyback size is zero')

  const v4Code = await client.getBytecode({ address: v4Executor })
  if (!v4Code || v4Code === '0x') throw new Error('V4 executor has no code')
  const [v4Parent, v4Recipient, v4Factory, v4Hook, v4Router, factoryEscrow, factoryHook] = await Promise.all([
    client.readContract({ address: v4Executor, abi: v4ExecutorAbi, functionName: 'buybackExecutor' }),
    client.readContract({ address: v4Executor, abi: v4ExecutorAbi, functionName: 'feeRecipient' }),
    client.readContract({ address: v4Executor, abi: v4ExecutorAbi, functionName: 'ponsFactory' }),
    client.readContract({ address: v4Executor, abi: v4ExecutorAbi, functionName: 'ponsMemeHook' }),
    client.readContract({ address: v4Executor, abi: v4ExecutorAbi, functionName: 'universalRouter' }),
    client.readContract({ address: factory, abi: ponsFactoryAbi, functionName: 'feeEscrow' }),
    client.readContract({ address: factory, abi: ponsFactoryAbi, functionName: 'memeHook' }),
  ])
  if (v4Parent.toLowerCase() !== executorAddress.toLowerCase()) throw new Error('V4 executor parent mismatch')
  if (v4Recipient.toLowerCase() !== feeRecipient.toLowerCase()) throw new Error('V4 fee recipient mismatch')
  if (v4Factory.toLowerCase() !== factory.toLowerCase()) throw new Error('V4 factory mismatch')
  if (v4Hook.toLowerCase() !== PONS_V2_MEME_HOOK.toLowerCase()) throw new Error('V4 hook mismatch')
  if (v4Router.toLowerCase() !== UNISWAP_V4_UNIVERSAL_ROUTER.toLowerCase()) throw new Error('V4 router mismatch')
  if (factoryEscrow.toLowerCase() !== PONS_V2_FEE_ESCROW.toLowerCase()) throw new Error('Factory escrow mismatch')
  if (factoryHook.toLowerCase() !== v4Hook.toLowerCase()) throw new Error('Factory hook mismatch')

  let launch
  if (token !== zeroAddress) {
    if (token.toLowerCase() !== PROPHET_TOKEN_ADDRESS.toLowerCase()) {
      throw new Error('Buyback executor is bound to an unexpected token')
    }
    launch = await client.readContract({ address: factory, abi: ponsFactoryAbi, functionName: 'getLaunchedToken', args: [token] })
    if (!launch.exists || launch.token.toLowerCase() !== token.toLowerCase()) throw new Error('Token is not a PONZ launch')
    if (launch.curve.toLowerCase() !== curve.toLowerCase()) throw new Error('Curve binding mismatch')
    if (launch.deployer.toLowerCase() !== expectedRecipient.toLowerCase()) {
      throw new Error('PONZ token deployer mismatch')
    }
    if (launch.creatorFeeRecipient.toLowerCase() !== feeRecipient.toLowerCase()) {
      throw new Error('Deployer wallet is not the PONZ creator fee recipient')
    }
    if (launch.pairToken !== zeroAddress) throw new Error('Only a native ETH quote launch is supported')
    if (launch.buybackEnabled) throw new Error('PONZ built-in buyback must be disabled')
  }
  return { curve, factory, feeRecipient, launch, maxPerCall, owner, paused, token, totalBurned, totalSpent, v4Executor }
}

async function quoteBuy(client, status, executorAddress, budget) {
  if (Number(status.launch.phase) === 0) {
    const { result } = await client.simulateContract({
      account: status.feeRecipient,
      address: status.curve,
      abi: curveAbi,
      functionName: 'buy',
      args: [budget, 1n, executorAddress],
      value: budget,
    })
    return result
  }
  if (Number(status.launch.phase) === 2) {
    const { result } = await client.simulateContract({
      account: status.feeRecipient,
      address: UNISWAP_V4_QUOTER,
      abi: quoterAbi,
      functionName: 'quoteExactInputSingle',
      args: [{
        poolKey: {
          currency0: zeroAddress,
          currency1: status.token,
          fee: status.launch.poolFee,
          tickSpacing: status.launch.tickSpacing,
          hooks: PONS_V2_MEME_HOOK,
        },
        zeroForOne: true,
        exactAmount: budget,
        hookData: '0x',
      }],
    })
    return result[0]
  }
  throw new Error(`Buyback waits while PONZ phase is ${status.launch.phase}`)
}

export async function runBuybackKeeperOnce({ client, walletClient, config, creditCheckpoint }) {
  const status = await verifyBuybackRelease(client, config.executorAddress, config.feeRecipient)
  if (status.token === zeroAddress) return { action: 'awaiting-token', pending: 0n, status, totalCredited: 0n }

  const [{ confirmedBlock, totalCredited }, escrowBalance] = await Promise.all([
    readCumulativeCredits(client, config, creditCheckpoint),
    client.readContract({
      address: PONS_V2_FEE_ESCROW,
      abi: feeEscrowAbi,
      functionName: 'balanceOf',
      args: [status.feeRecipient],
    }),
  ])
  const pending = pendingBuybackForCredits(totalCredited, status.totalSpent)

  if (escrowBalance > 0n) {
    const claimSimulation = await client.simulateContract({
      account: status.feeRecipient,
      address: PONS_V2_FEE_ESCROW,
      abi: feeEscrowAbi,
      functionName: 'claim',
    })
    if (config.dryRun) {
      return { action: 'claim-dry-run', confirmedBlock, escrowBalance, pending, simulation: claimSimulation, status, totalCredited }
    }
    const hash = await walletClient.writeContract(claimSimulation.request)
    const receipt = await client.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error(`Fee claim transaction reverted: ${hash}`)
    return { action: 'claim-broadcast', confirmedBlock, escrowBalance, hash, pending, receipt, retryImmediately: true, status, totalCredited }
  }

  if (status.paused) return { action: 'paused', confirmedBlock, pending, status, totalCredited }

  const budget = buybackBudget(pending, status.maxPerCall, config.minimumExecutionWei)
  if (budget === 0n) return { action: 'below-threshold', budget, confirmedBlock, pending, status, totalCredited }

  const ownerBalance = await client.getBalance({ address: status.feeRecipient })
  if (ownerBalance <= budget) {
    throw new Error(`Deployer balance ${ownerBalance} cannot fund pending buyback ${budget} plus gas`)
  }
  const quote = await quoteBuy(client, status, config.executorAddress, budget)
  const minOut = minOutputForQuote(quote, config.slippageBps)
  const deadline = BigInt(Math.floor(Date.now() / 1_000) + 300)
  const simulation = await client.simulateContract({
    account: status.feeRecipient,
    address: config.executorAddress,
    abi: buybackExecutorAbi,
    functionName: 'executeBuyback',
    args: [minOut, deadline],
    value: budget,
  })
  if (config.dryRun) {
    return { action: 'dry-run', budget, confirmedBlock, minOut, pending, quote, simulation, status, totalCredited }
  }
  const hash = await walletClient.writeContract(simulation.request)
  const receipt = await client.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`Buyback transaction reverted: ${hash}`)
  return { action: 'broadcast', budget, confirmedBlock, hash, minOut, pending, quote, receipt, status, totalCredited }
}

async function main() {
  const config = readBuybackKeeperConfig()
  const chain = defineChain({
    id: ROBINHOOD_CHAIN_ID,
    name: 'Robinhood Chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  })
  const client = createPublicClient({ chain, transport: http(config.rpcUrl) })
  const account = config.privateKey ? privateKeyToAccount(config.privateKey) : undefined
  if (account && account.address.toLowerCase() !== config.feeRecipient.toLowerCase()) {
    throw new BuybackConfigError('Configured token deployer key does not match the reviewed token deployer address')
  }
  const walletClient = account ? createWalletClient({ account, chain, transport: http(config.rpcUrl) }) : undefined
  const runOnce = boolEnv('RUN_ONCE', false)
  const creditCheckpoint = {}

  do {
    let retryImmediately = false
    try {
      const result = await runBuybackKeeperOnce({ client, walletClient, config, creditCheckpoint })
      retryImmediately = result.retryImmediately === true
      console.log(JSON.stringify({
        action: result.action,
        budgetWei: result.budget?.toString(),
        confirmedBlock: result.confirmedBlock?.toString(),
        pendingWei: result.pending.toString(),
        token: result.status.token,
        totalCreditedWei: result.totalCredited.toString(),
        txHash: result.hash,
      }))
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      if (runOnce) process.exitCode = 1
    }
    if (runOnce) break
    if (!retryImmediately) await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs))
  } while (!runOnce)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
