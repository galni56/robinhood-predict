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

const OPEN = 0
const SIGNED_POOL_BLOCK_PAIR = 2

export const priceArenaKeeperAbi = [
  { type: 'function', name: 'arenaCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'getArena', stateMutability: 'view', inputs: [{ name: 'arenaId', type: 'uint256' }],
    outputs: [{ type: 'tuple', components: [
      { name: 'assetId', type: 'bytes32' }, { name: 'oracleId', type: 'bytes32' },
      { name: 'oracle', type: 'address' }, { name: 'creator', type: 'address' },
      { name: 'priceDecimals', type: 'uint8' }, { name: 'category', type: 'uint8' },
      { name: 'status', type: 'uint8' }, { name: 'createdAt', type: 'uint64' },
      { name: 'startsAt', type: 'uint64' }, { name: 'deadline', type: 'uint64' },
      { name: 'resolvedAt', type: 'uint64' }, { name: 'duration', type: 'uint32' },
      { name: 'participantCount', type: 'uint16' }, { name: 'winnerCount', type: 'uint16' },
      { name: 'feeBp', type: 'uint16' }, { name: 'totalPool', type: 'uint256' },
      { name: 'finalPrice', type: 'uint256' }, { name: 'finalUpdatedAt', type: 'uint256' },
      { name: 'observationId', type: 'bytes32' }, { name: 'protocolFee', type: 'uint256' },
      { name: 'remainingLiability', type: 'uint256' }, { name: 'title', type: 'string' },
    ] }],
  },
  {
    type: 'function', name: 'approvedAssets', stateMutability: 'view', inputs: [{ name: 'assetId', type: 'bytes32' }],
    outputs: [
      { name: 'oracle', type: 'address' }, { name: 'oracleId', type: 'bytes32' },
      { name: 'decimals', type: 'uint8' }, { name: 'category', type: 'uint8' }, { name: 'enabled', type: 'bool' },
    ],
  },
  {
    type: 'function', name: 'resolve', stateMutability: 'nonpayable',
    inputs: [{ name: 'arenaId', type: 'uint256' }, { name: 'endpointProof', type: 'bytes' }], outputs: [],
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

function requiredPrivateKey(primary, ...fallbacks) {
  const value = [primary, ...fallbacks].map((name) => process.env[name]?.trim()).find(Boolean)
  if (!/^0x[0-9a-fA-F]{64}$/.test(value ?? '')) throw new KeeperConfigError(`${primary} is required and invalid`)
  return value
}

export function readKeeperConfig() {
  const rpcUrl = process.env.PRICE_ARENA_RPC_URL?.trim() || process.env.PREDICTION_MARKET_RPC_URL?.trim()
  const poolRpcUrl = process.env.PRICE_ARENA_POOL_RPC_URL?.trim()
    || process.env.PREDICTION_MARKET_POOL_RPC_URL?.trim() || rpcUrl
  const rawAddress = process.env.PRICE_ARENA_ADDRESS?.trim()
  const rawOracle = process.env.PRICE_ARENA_SIGNED_POOL_ORACLE_ADDRESS?.trim()
    || process.env.PREDICTION_MARKET_SIGNED_POOL_ORACLE_ADDRESS?.trim()
    || process.env.ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS?.trim()
  if (!rpcUrl) throw new KeeperConfigError('PRICE_ARENA_RPC_URL is required')
  if (!rawAddress || !isAddress(rawAddress)) throw new KeeperConfigError('PRICE_ARENA_ADDRESS is invalid')
  if (!rawOracle || !isAddress(rawOracle)) throw new KeeperConfigError('PRICE_ARENA_SIGNED_POOL_ORACLE_ADDRESS is invalid')

  const dryRun = boolEnv('DRY_RUN', true)
  const keeperPrivateKey = process.env.PRICE_ARENA_KEEPER_PRIVATE_KEY?.trim()
    || process.env.PREDICTION_MARKET_KEEPER_PRIVATE_KEY?.trim()
  if (!dryRun && !/^0x[0-9a-fA-F]{64}$/.test(keeperPrivateKey ?? '')) {
    throw new KeeperConfigError('PRICE_ARENA_KEEPER_PRIVATE_KEY is required for live mode')
  }
  if (keeperPrivateKey && !/^0x[0-9a-fA-F]{64}$/.test(keeperPrivateKey)) {
    throw new KeeperConfigError('PRICE_ARENA_KEEPER_PRIVATE_KEY is invalid')
  }

  return {
    address: getAddress(rawAddress),
    signedOracleAddress: getAddress(rawOracle),
    rpcUrl,
    poolRpcUrl,
    keeperPrivateKey,
    priceSignerPrivateKey: requiredPrivateKey(
      'PRICE_ARENA_POOL_PRICE_SIGNER_PRIVATE_KEY',
      'PREDICTION_MARKET_POOL_PRICE_SIGNER_PRIVATE_KEY',
      'ASSET_RACE_POOL_PRICE_SIGNER_PRIVATE_KEY',
    ),
    expectedChainId: uintEnv('PRICE_ARENA_CHAIN_ID', 4663, 1),
    allowLive: boolEnv('PRICE_ARENA_ALLOW_LIVE', false),
    dryRun,
    pollIntervalMs: uintEnv('PRICE_ARENA_POLL_INTERVAL_MS', 5_000, 500),
    archiveMinIntervalMs: uintEnv('PRICE_ARENA_ARCHIVE_MIN_INTERVAL_MS', 150, 50),
    realtimeEndpointWindowSeconds: uintEnv('PRICE_ARENA_REALTIME_ENDPOINT_WINDOW_SECONDS', 30),
    endpointCacheFile: process.env.PRICE_ARENA_ENDPOINT_CACHE_FILE?.trim()
      || join(homedir(), '.local', 'state', 'prophet', 'price-arena-endpoints.json'),
    runOnce: boolEnv('RUN_ONCE', false),
    scanFrom: BigInt(uintEnv('PRICE_ARENA_SCAN_FROM', 0)),
  }
}

function productionPoolConfigs() {
  const registry = JSON.parse(readFileSync(fileURLToPath(new URL('../config/asset-race-assets.json', import.meta.url)), 'utf8'))
  return poolConfigsFromRegistry(registry)
}

export async function verifyConfiguredAssets(publicClient, arenaAddress, oracleAddress, configs) {
  const bindings = await Promise.all(configs.map((config) => publicClient.readContract({
    address: arenaAddress,
    abi: priceArenaKeeperAbi,
    functionName: 'approvedAssets',
    args: [stringToHex(config.assetId, { size: 32 })],
  })))
  for (let index = 0; index < configs.length; index += 1) {
    const [oracle, oracleId, decimals, category, enabled] = bindings[index]
    const config = configs[index]
    const expectedCategory = config.category === 'MEME' ? 1 : 0
    if (!enabled || oracle.toLowerCase() !== oracleAddress.toLowerCase()
      || oracleId.toLowerCase() !== config.oracleId.toLowerCase()
      || Number(decimals) !== 18 || Number(category) !== expectedCategory) {
      throw new KeeperConfigError(`PriceArena asset binding mismatch: ${config.assetId}`)
    }
  }
  return true
}

export function transitionForArena(arena, now) {
  if (Number(arena.status) !== OPEN || now < arena.deadline) return undefined
  return {
    needsEndpointProof: Number(arena.participantCount) >= 2,
    outcome: Number(arena.participantCount) < 2 ? 'CANCELLED' : 'DEADLINE_SETTLEMENT',
  }
}

export class ActiveArenaTracker {
  constructor(scanFrom = 0n) {
    this.nextArenaId = BigInt(scanFrom)
    this.arenas = new Map()
  }

  observe(arenaId, arena) {
    if (Number(arena.status) !== OPEN) { this.arenas.delete(arenaId); return }
    this.arenas.set(arenaId, { deadline: BigInt(arena.deadline) })
  }

  async discover(publicClient, contractAddress, arenaCount) {
    if (arenaCount < this.nextArenaId) return
    for (let arenaId = this.nextArenaId; arenaId < arenaCount; arenaId += 1n) {
      const arena = await publicClient.readContract({ address: contractAddress, abi: priceArenaKeeperAbi, functionName: 'getArena', args: [arenaId] })
      this.observe(arenaId, arena)
    }
    this.nextArenaId = arenaCount
  }

  dueArenaIds(now) {
    return [...this.arenas.entries()].filter(([, value]) => value.deadline <= now).map(([id]) => id).sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
  }

  async refresh(publicClient, contractAddress, arenaId) {
    const arena = await publicClient.readContract({ address: contractAddress, abi: priceArenaKeeperAbi, functionName: 'getArena', args: [arenaId] })
    this.observe(arenaId, arena)
    return arena
  }

  complete(arenaId) { this.arenas.delete(arenaId) }
}

export async function endpointProofForArena(collector, arena) {
  if (Number(arena.participantCount) < 2) return '0x'
  const collected = await collector.proofsFor([arena.oracleId], arena.deadline)
  const proof = collected.proofs.get(arena.oracleId.toLowerCase())
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
  if (chainId !== config.expectedChainId) throw new KeeperConfigError(`RPC chain ID ${chainId} does not match expected ${config.expectedChainId}`)
  if (!config.dryRun && chainId !== 31_337 && !config.allowLive) throw new KeeperConfigError('Non-Anvil writes require PRICE_ARENA_ALLOW_LIVE=true')

  const chain = defineChain({
    id: chainId,
    name: `Price Arena chain ${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
    contracts: poolChainContracts(chainId),
  })
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl, { batch: true }) })
  const priceAccount = privateKeyToAccount(config.priceSignerPrivateKey)
  const [trustedSigner, proofType] = await Promise.all([
    publicClient.readContract({ address: config.signedOracleAddress, abi: signedPoolOracleAbi, functionName: 'TRUSTED_SIGNER' }),
    publicClient.readContract({ address: config.signedOracleAddress, abi: signedPoolOracleAbi, functionName: 'endpointProofType' }),
  ])
  if (trustedSigner.toLowerCase() !== priceAccount.address.toLowerCase()) throw new KeeperConfigError('Pool price signer does not match oracle TRUSTED_SIGNER')
  if (Number(proofType) !== SIGNED_POOL_BLOCK_PAIR) throw new KeeperConfigError('Unexpected endpoint proof type')

  const configs = productionPoolConfigs()
  if (configs.length !== 23) throw new KeeperConfigError('Registry must expose exactly 23 production pools')
  await verifyConfiguredAssets(publicClient, config.address, config.signedOracleAddress, configs)
  const engine = new PoolPriceEngine({ client: publicClient, configs })
  let fallbackEngine
  if (config.poolRpcUrl !== config.rpcUrl) {
    const archiveClient = withRpcRateLimit(createPublicClient({ chain, transport: http(config.poolRpcUrl, { batch: true }) }), { minIntervalMs: config.archiveMinIntervalMs })
    if (await archiveClient.getChainId() !== chainId) throw new KeeperConfigError('Archive RPC chain ID mismatch')
    fallbackEngine = new PoolPriceEngine({ client: archiveClient, configs })
  }
  try { await engine.verify() } catch (error) { if (!fallbackEngine) throw error; await fallbackEngine.verify() }
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
  if (account?.address.toLowerCase() === priceAccount.address.toLowerCase()) throw new KeeperConfigError('Transaction keeper and pool price signer must be separate accounts')
  const walletClient = config.dryRun ? undefined : createWalletClient({ account, chain, transport: http(config.rpcUrl) })
  const tracker = new ActiveArenaTracker(config.scanFrom)
  let stopping = false
  process.once('SIGINT', () => { stopping = true })
  process.once('SIGTERM', () => { stopping = true })

  async function poll() {
    const [block, arenaCount] = await Promise.all([
      publicClient.getBlock({ blockTag: 'latest' }),
      publicClient.readContract({ address: config.address, abi: priceArenaKeeperAbi, functionName: 'arenaCount' }),
    ])
    await tracker.discover(publicClient, config.address, arenaCount)
    for (const arenaId of tracker.dueArenaIds(block.timestamp)) {
      try {
        const arena = await tracker.refresh(publicClient, config.address, arenaId)
        const transition = transitionForArena(arena, block.timestamp)
        if (!transition) continue
        const endpointProof = await endpointProofForArena(collector, arena)
        const simulation = await publicClient.simulateContract({
          account: account || zeroAddress,
          address: config.address,
          abi: priceArenaKeeperAbi,
          functionName: 'resolve',
          args: [arenaId, endpointProof],
        })
        if (config.dryRun) { console.log(`[dry-run] arena #${arenaId}: resolve -> ${transition.outcome}`); continue }
        const hash = await walletClient.writeContract(simulation.request)
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error('TransactionReverted')
        tracker.complete(arenaId)
        console.log(`[keeper] arena #${arenaId}: resolve submitted (${hash})`)
      } catch (error) {
        console.error(`[keeper] arena #${arenaId}: resolve failed (${safeErrorName(error)}); continuing`)
      }
    }
  }

  do {
    try { await poll() } catch (error) { console.error(`[keeper] poll failed (${safeErrorName(error)}); continuing`) }
    if (config.runOnce || stopping) break
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs))
  } while (!stopping)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const prefix = error instanceof KeeperConfigError ? '[keeper] configuration error:' : '[keeper] stopped:'
    console.error(prefix, safeErrorName(error))
    process.exitCode = 1
  })
}
