#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  isAddress,
  stringToHex,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { JsonEndpointProofCache, PoolEndpointCollector } from './asset-race-pool-endpoints.mjs'
import { PoolPriceEngine, poolChainContracts, poolConfigsFromRegistry } from './asset-race-pool-price-engine.mjs'
import { withRpcRateLimit } from './asset-race-rpc-budget.mjs'
import { nextSleepMs } from './keeper-poll-schedule.mjs'

const OPEN = 0
const SIGNED_POOL_BLOCK_PAIR = 2

export const predictionMarketKeeperAbi = [
  { type: 'function', name: 'marketCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'participantCount', stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'getMarket', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'assetId', type: 'bytes32' },
        { name: 'oracleId', type: 'bytes32' },
        { name: 'priceDecimals', type: 'uint8' },
        { name: 'targetPrice', type: 'int256' },
        { name: 'createdAt', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
        { name: 'poolYes', type: 'uint256' },
        { name: 'poolNo', type: 'uint256' },
        { name: 'weightedPoolYes', type: 'uint256' },
        { name: 'weightedPoolNo', type: 'uint256' },
        { name: 'status', type: 'uint8' },
        { name: 'outcome', type: 'uint8' },
        { name: 'feeBp', type: 'uint256' },
      ],
    }],
  },
  { type: 'function', name: 'endpointOracle', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    type: 'function', name: 'approvedAssets', stateMutability: 'view',
    inputs: [{ name: 'assetId', type: 'bytes32' }],
    outputs: [
      { name: 'oracleId', type: 'bytes32' },
      { name: 'decimals', type: 'uint8' },
      { name: 'allowed', type: 'bool' },
    ],
  },
  {
    type: 'function', name: 'resolve', stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }, { name: 'endpointProof', type: 'bytes' }], outputs: [],
  },
]

const signedPoolOracleAbi = [
  { type: 'function', name: 'TRUSTED_SIGNER', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'endpointProofType', stateMutability: 'pure', inputs: [], outputs: [{ type: 'uint8' }] },
]

class KeeperConfigError extends Error {}

function boolEnv(name, fallback) {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new KeeperConfigError(`${name} must be true or false`)
}

function uintEnv(name, fallback, minimum = 0) {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < minimum) throw new KeeperConfigError(`${name} is invalid`)
  return value
}

function privateKeyEnv(name, fallbackName) {
  const value = process.env[name]?.trim() || process.env[fallbackName]?.trim()
  if (!/^0x[0-9a-fA-F]{64}$/.test(value ?? '')) throw new KeeperConfigError(`${name} is required and invalid`)
  return value
}

export function readKeeperConfig() {
  const rpcUrl = process.env.PREDICTION_MARKET_RPC_URL?.trim()
  const rawAddress = process.env.PREDICTION_MARKET_ADDRESS?.trim()
  const rawOracle = process.env.PREDICTION_MARKET_SIGNED_POOL_ORACLE_ADDRESS?.trim()
    || process.env.ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS?.trim()
  if (!rpcUrl) throw new KeeperConfigError('PREDICTION_MARKET_RPC_URL is required')
  if (!rawAddress || !isAddress(rawAddress)) throw new KeeperConfigError('PREDICTION_MARKET_ADDRESS is invalid')
  if (!rawOracle || !isAddress(rawOracle)) throw new KeeperConfigError('PREDICTION_MARKET_SIGNED_POOL_ORACLE_ADDRESS is invalid')

  const dryRun = boolEnv('DRY_RUN', true)
  const keeperKeyValue = process.env.PREDICTION_MARKET_KEEPER_PRIVATE_KEY?.trim()
    || process.env.ASSET_RACE_KEEPER_PRIVATE_KEY?.trim()
  if (!dryRun && !/^0x[0-9a-fA-F]{64}$/.test(keeperKeyValue ?? '')) {
    throw new KeeperConfigError('PREDICTION_MARKET_KEEPER_PRIVATE_KEY is required for live mode')
  }
  if (keeperKeyValue && !/^0x[0-9a-fA-F]{64}$/.test(keeperKeyValue)) {
    throw new KeeperConfigError('PREDICTION_MARKET_KEEPER_PRIVATE_KEY is invalid')
  }

  return {
    address: getAddress(rawAddress),
    signedOracleAddress: getAddress(rawOracle),
    allowLive: boolEnv('PREDICTION_MARKET_ALLOW_LIVE', false),
    dryRun,
    expectedChainId: uintEnv('PREDICTION_MARKET_CHAIN_ID', 4663, 1),
    pollIntervalMs: uintEnv('PREDICTION_MARKET_POLL_INTERVAL_MS', 5_000, 500),
    idlePollIntervalMs: uintEnv('PREDICTION_MARKET_IDLE_POLL_INTERVAL_MS', 20_000, 1_000),
    archiveMinIntervalMs: uintEnv('PREDICTION_MARKET_ARCHIVE_MIN_INTERVAL_MS', 150, 50),
    realtimeEndpointWindowSeconds: uintEnv('PREDICTION_MARKET_REALTIME_ENDPOINT_WINDOW_SECONDS', 30),
    endpointCacheFile: process.env.PREDICTION_MARKET_ENDPOINT_CACHE_FILE?.trim()
      || join(homedir(), '.local', 'state', 'prophet', 'prediction-market-endpoints.json'),
    keeperPrivateKey: keeperKeyValue,
    priceSignerPrivateKey: privateKeyEnv(
      'PREDICTION_MARKET_POOL_PRICE_SIGNER_PRIVATE_KEY',
      'ASSET_RACE_POOL_PRICE_SIGNER_PRIVATE_KEY',
    ),
    poolRpcUrl: process.env.PREDICTION_MARKET_POOL_RPC_URL?.trim() || rpcUrl,
    rpcUrl,
    runOnce: boolEnv('RUN_ONCE', false),
    scanFrom: BigInt(uintEnv('MARKET_SCAN_FROM', 0)),
  }
}

function productionStockPoolConfigs() {
  const registry = JSON.parse(readFileSync(fileURLToPath(new URL('../config/asset-race-assets.json', import.meta.url)), 'utf8'))
  return poolConfigsFromRegistry(registry, { category: 'STOCK' })
}

export async function verifyConfiguredAssets(publicClient, marketAddress, configs) {
  const bindings = await Promise.all(configs.map((config) => publicClient.readContract({
    address: marketAddress,
    abi: predictionMarketKeeperAbi,
    functionName: 'approvedAssets',
    args: [stringToHex(config.assetId, { size: 32 })],
  })))
  for (let index = 0; index < configs.length; index += 1) {
    const [oracleId, decimals, allowed] = bindings[index]
    const config = configs[index]
    if (!allowed || oracleId.toLowerCase() !== config.oracleId.toLowerCase() || Number(decimals) !== 18) {
      throw new KeeperConfigError(`PredictionMarket asset binding mismatch: ${config.assetId}`)
    }
  }
  return true
}

export function transitionForMarket(market, now) {
  if (Number(market.status) !== OPEN || now < market.deadline) return undefined
  const hasEnoughParticipants = market.participantCount >= 2n
  return {
    needsEndpointProof: market.poolYes > 0n && market.poolNo > 0n && hasEnoughParticipants,
    outcome: market.poolYes === 0n || market.poolNo === 0n || !hasEnoughParticipants
      ? 'CANCELLED'
      : 'DEADLINE_SETTLEMENT',
  }
}

export class ActiveMarketTracker {
  constructor(scanFrom = 0n) {
    this.nextMarketId = BigInt(scanFrom)
    this.markets = new Map()
  }

  observe(marketId, market) {
    if (Number(market.status) !== OPEN) {
      this.markets.delete(marketId)
      return
    }
    this.markets.set(marketId, { deadline: BigInt(market.deadline) })
  }

  async discover(publicClient, contractAddress, marketCount) {
    if (marketCount < this.nextMarketId) return
    for (let marketId = this.nextMarketId; marketId < marketCount; marketId += 1n) {
      const market = await publicClient.readContract({
        address: contractAddress,
        abi: predictionMarketKeeperAbi,
        functionName: 'getMarket',
        args: [marketId],
      })
      this.observe(marketId, market)
    }
    this.nextMarketId = marketCount
  }

  dueMarketIds(now) {
    return [...this.markets.entries()]
      .filter(([, tracked]) => tracked.deadline <= now)
      .map(([marketId]) => marketId)
      .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
  }

  async refresh(publicClient, contractAddress, marketId) {
    const market = await publicClient.readContract({
      address: contractAddress,
      abi: predictionMarketKeeperAbi,
      functionName: 'getMarket',
      args: [marketId],
    })
    this.observe(marketId, market)
    return market
  }

  complete(marketId) {
    this.markets.delete(marketId)
  }

  /** Unix seconds (bigint) of the soonest-tracked market's deadline, or
   * undefined if nothing is currently tracked. Drives the adaptive poll
   * sleep -- see keeper-poll-schedule.mjs. */
  earliestDueAt() {
    let earliest
    for (const { deadline } of this.markets.values()) {
      if (earliest === undefined || deadline < earliest) earliest = deadline
    }
    return earliest
  }
}

export async function endpointProofForMarket(collector, market) {
  if (market.poolYes === 0n || market.poolNo === 0n || market.participantCount < 2n) return '0x'
  const collected = await collector.proofsFor([market.oracleId], market.deadline)
  const proof = collected.proofs.get(market.oracleId.toLowerCase())
  if (!proof) throw new Error('MissingPoolEndpointProof')
  return proof
}

function safeErrorName(error) {
  if (error instanceof Error) return error.shortMessage || error.message.split('\n')[0]
  return 'UnknownError'
}

async function main() {
  const config = readKeeperConfig()
  const bootstrapClient = createPublicClient({ transport: http(config.rpcUrl) })
  const chainId = await bootstrapClient.getChainId()
  if (chainId !== config.expectedChainId) {
    throw new KeeperConfigError(`RPC chain ID ${chainId} does not match expected ${config.expectedChainId}`)
  }
  if (!config.dryRun && chainId !== 31_337 && !config.allowLive) {
    throw new KeeperConfigError('Non-Anvil writes require PREDICTION_MARKET_ALLOW_LIVE=true')
  }

  const chain = defineChain({
    id: chainId,
    name: `Prediction Market chain ${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
    contracts: poolChainContracts(chainId),
  })
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl, { batch: true }) })
  const priceAccount = privateKeyToAccount(config.priceSignerPrivateKey)
  const [marketOracle, trustedSigner, proofType] = await Promise.all([
    publicClient.readContract({ address: config.address, abi: predictionMarketKeeperAbi, functionName: 'endpointOracle' }),
    publicClient.readContract({ address: config.signedOracleAddress, abi: signedPoolOracleAbi, functionName: 'TRUSTED_SIGNER' }),
    publicClient.readContract({ address: config.signedOracleAddress, abi: signedPoolOracleAbi, functionName: 'endpointProofType' }),
  ])
  if (marketOracle.toLowerCase() !== config.signedOracleAddress.toLowerCase()) {
    throw new KeeperConfigError('PredictionMarket endpoint oracle does not match configured signed pool oracle')
  }
  if (trustedSigner.toLowerCase() !== priceAccount.address.toLowerCase()) {
    throw new KeeperConfigError('Pool price signer does not match oracle TRUSTED_SIGNER')
  }
  if (Number(proofType) !== SIGNED_POOL_BLOCK_PAIR) throw new KeeperConfigError('Unexpected endpoint proof type')

  const configs = productionStockPoolConfigs()
  if (configs.length !== 10) throw new KeeperConfigError('Registry must expose exactly 10 production Stock pools')
  await verifyConfiguredAssets(publicClient, config.address, configs)
  const engine = new PoolPriceEngine({ client: publicClient, configs })
  let fallbackEngine
  if (config.poolRpcUrl !== config.rpcUrl) {
    const archiveClient = withRpcRateLimit(
      createPublicClient({ chain, transport: http(config.poolRpcUrl, { batch: true }) }),
      { minIntervalMs: config.archiveMinIntervalMs },
    )
    if (await archiveClient.getChainId() !== chainId) throw new KeeperConfigError('Archive RPC chain ID mismatch')
    fallbackEngine = new PoolPriceEngine({ client: archiveClient, configs })
  }
  try { await engine.verify() } catch (error) {
    if (!fallbackEngine) throw error
    await fallbackEngine.verify()
  }
  const collector = new PoolEndpointCollector({
    account: priceAccount,
    cache: new JsonEndpointProofCache(config.endpointCacheFile),
    chainId,
    engine,
    fallbackEngine,
    primaryWindowSeconds: config.realtimeEndpointWindowSeconds,
    verifyingContract: config.signedOracleAddress,
  })

  const account = config.keeperPrivateKey ? privateKeyToAccount(config.keeperPrivateKey) : undefined
  if (account?.address.toLowerCase() === priceAccount.address.toLowerCase()) {
    throw new KeeperConfigError('Transaction keeper and pool price signer must be separate accounts')
  }
  const walletClient = config.dryRun ? undefined : createWalletClient({ account, chain, transport: http(config.rpcUrl) })
  const tracker = new ActiveMarketTracker(config.scanFrom)
  let stopping = false
  process.once('SIGINT', () => { stopping = true })
  process.once('SIGTERM', () => { stopping = true })

  async function poll() {
    const [block, marketCount] = await Promise.all([
      publicClient.getBlock({ blockTag: 'latest' }),
      publicClient.readContract({ address: config.address, abi: predictionMarketKeeperAbi, functionName: 'marketCount' }),
    ])
    await tracker.discover(publicClient, config.address, marketCount)
    for (const marketId of tracker.dueMarketIds(block.timestamp)) {
      try {
        const market = await tracker.refresh(publicClient, config.address, marketId)
        const participantCount = await publicClient.readContract({
          address: config.address,
          abi: predictionMarketKeeperAbi,
          functionName: 'participantCount',
          args: [marketId],
        })
        const marketState = { ...market, participantCount }
        const transition = transitionForMarket(marketState, block.timestamp)
        if (!transition) continue
        const endpointProof = await endpointProofForMarket(collector, marketState)
        const simulation = await publicClient.simulateContract({
          account: account || zeroAddress,
          address: config.address,
          abi: predictionMarketKeeperAbi,
          functionName: 'resolve',
          args: [marketId, endpointProof],
        })
        if (config.dryRun) { console.log(`[dry-run] market #${marketId}: resolve -> ${transition.outcome}`); continue }
        const hash = await walletClient.writeContract(simulation.request)
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error('TransactionReverted')
        tracker.complete(marketId)
        console.log(`[keeper] market #${marketId}: resolve submitted (${hash})`)
      } catch (error) {
        console.error(`[keeper] market #${marketId}: resolve failed (${safeErrorName(error)}); continuing`)
      }
    }
  }

  do {
    try { await poll() } catch (error) { console.error(`[keeper] poll failed (${safeErrorName(error)}); continuing`) }
    if (config.runOnce || stopping) break
    const sleepMs = nextSleepMs(tracker.earliestDueAt(), config.pollIntervalMs, config.idlePollIntervalMs)
    await new Promise((resolve) => setTimeout(resolve, sleepMs))
  } while (!stopping)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const prefix = error instanceof KeeperConfigError ? '[keeper] configuration error:' : '[keeper] stopped:'
    console.error(prefix, safeErrorName(error))
    process.exitCode = 1
  })
}
