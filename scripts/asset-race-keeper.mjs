#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
import { JsonEndpointProofCache, PoolEndpointCollector } from './asset-race-pool-endpoints.mjs'
import {
  PoolPriceEngine,
  poolChainContracts,
  poolConfigsFromRegistry,
} from './asset-race-pool-price-engine.mjs'
import { withRpcRateLimit } from './asset-race-rpc-budget.mjs'
import { chainlinkRoundProof } from './chainlink-endpoint-proof.mjs'

const STATUS = {
  BETTING: 0,
  RUNNING: 1,
  RESOLVED: 2,
  CANCELLED: 3,
  VOID: 4,
  LOBBY: 5,
}
const STATUS_NAME = ['BETTING', 'RUNNING', 'RESOLVED', 'CANCELLED', 'VOID', 'LOBBY']

const keeperAbi = [
  {
    type: 'function',
    name: 'raceCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getRace',
    stateMutability: 'view',
    inputs: [{ name: 'raceId', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'category', type: 'uint8' },
          { name: 'status', type: 'uint8' },
          { name: 'bettingStartTime', type: 'uint64' },
          { name: 'bettingEndTime', type: 'uint64' },
          { name: 'actualStartTime', type: 'uint64' },
          { name: 'raceEndTime', type: 'uint64' },
          { name: 'resolvedAt', type: 'uint64' },
          { name: 'raceDuration', type: 'uint64' },
          { name: 'startGrace', type: 'uint64' },
          { name: 'resolutionGrace', type: 'uint64' },
          { name: 'maxOracleTimestampSkew', type: 'uint64' },
          { name: 'feeBp', type: 'uint16' },
          { name: 'minActiveContenders', type: 'uint8' },
          { name: 'candidateCount', type: 'uint8' },
          { name: 'activeCount', type: 'uint8' },
          { name: 'winningAssetIndex', type: 'uint8' },
          { name: 'endSnapshotsCaptured', type: 'bool' },
          { name: 'minStake', type: 'uint256' },
          { name: 'maxStakePerWallet', type: 'uint256' },
          { name: 'totalPool', type: 'uint256' },
          { name: 'winningPool', type: 'uint256' },
          { name: 'distributableLosingPool', type: 'uint256' },
          { name: 'protocolFee', type: 'uint256' },
          { name: 'remainingLiability', type: 'uint256' },
          { name: 'origin', type: 'uint8' },
          { name: 'creator', type: 'address' },
          { name: 'title', type: 'string' },
          { name: 'lobbyEndTime', type: 'uint64' },
          { name: 'bettingWindow', type: 'uint64' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getRaceAssets',
    stateMutability: 'view',
    inputs: [{ name: 'raceId', type: 'uint256' }],
    outputs: [{
      type: 'tuple[]',
      components: [
        { name: 'assetId', type: 'bytes32' },
        { name: 'oracle', type: 'address' },
        { name: 'oracleId', type: 'bytes32' },
        { name: 'expectedDecimals', type: 'uint8' },
        { name: 'maxPriceAge', type: 'uint64' },
        { name: 'maxEndpointLag', type: 'uint64' },
        { name: 'active', type: 'bool' },
        { name: 'pool', type: 'uint256' },
        { name: 'startPrice', type: 'uint256' },
        { name: 'endPrice', type: 'uint256' },
        { name: 'startOracleUpdatedAt', type: 'uint256' },
        { name: 'endOracleUpdatedAt', type: 'uint256' },
        { name: 'startObservationId', type: 'bytes32' },
        { name: 'endObservationId', type: 'bytes32' },
        { name: 'returnValue', type: 'int256' },
      ],
    }],
  },
  {
    type: 'function',
    name: 'captureEndSnapshots',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'raceId', type: 'uint256' }, { name: 'proofs', type: 'bytes[]' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'startRaceWithProofs',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'raceId', type: 'uint256' }, { name: 'proofs', type: 'bytes[]' }],
    outputs: [],
  },
  ...['openBetting', 'startRace', 'cancelUnstartedRace', 'resolveRace', 'voidExpiredRace'].map((name) => ({
    type: 'function',
    name,
    stateMutability: 'nonpayable',
    inputs: [{ name: 'raceId', type: 'uint256' }],
    outputs: [],
  })),
]

const endpointOracleAbi = [{
  type: 'function',
  name: 'endpointProofType',
  stateMutability: 'pure',
  inputs: [],
  outputs: [{ type: 'uint8' }],
}]

const trustedSignerAbi = [{
  type: 'function', name: 'TRUSTED_SIGNER', stateMutability: 'view',
  inputs: [], outputs: [{ type: 'address' }],
}]

const ownerAbi = [{
  type: 'function', name: 'owner', stateMutability: 'view',
  inputs: [], outputs: [{ type: 'address' }],
}]

const PROOF_TYPE = { NONE: 0, CHAINLINK_ROUND_PAIR: 1, SIGNED_POOL_BLOCK_PAIR: 2 }

class KeeperConfigError extends Error {}

function printUsage() {
  console.log(`Asset Race lifecycle keeper

Local Anvil (reuses contracts/.asset-race.local):
  npm run keeper:asset-race
  DRY_RUN=true RUN_ONCE=true npm run keeper:asset-race

Explicit configuration:
  ASSET_RACE_RPC_URL=<url>
  ASSET_RACE_POOL_RPC_URL=<archive-url>              optional; T0/T1 only
  ASSET_RACE_ARCHIVE_MIN_INTERVAL_MS=150            free archive pacing
  ASSET_RACE_REALTIME_ENDPOINT_WINDOW_SECONDS=30    public RPC near-tip window
  ASSET_RACE_ENDPOINT_CACHE_FILE=<outside-repo-path> optional durable proof cache
  ASSET_RACE_ADDRESS=<contract-address>
  ASSET_RACE_CHAIN_ID=<expected-chain-id>          optional safety check
  ASSET_RACE_KEEPER_ADDRESS=<unlocked-rpc-account> or
  ASSET_RACE_KEEPER_PRIVATE_KEY=<signer-key>
  ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS=<deployed-adapter>
  ASSET_RACE_POOL_PRICE_SIGNER_PRIVATE_KEY=<separate-price-signer-key>
  ASSET_RACE_ALLOW_LIVE=true                       required for non-Anvil writes
  POLL_INTERVAL_MS=1000                            default with pool endpoints
  RACE_SCAN_FROM=0                                 default
  DRY_RUN=true                                     simulate and report; never send
  RUN_ONCE=true                                    poll once and exit

Private-key values are read only from process environment and are never logged.`)
}

function readBoolean(name, fallback = false) {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return fallback
  if (['1', 'true', 'yes'].includes(raw)) return true
  if (['0', 'false', 'no'].includes(raw)) return false
  throw new KeeperConfigError(`${name} must be true or false`)
}

function readNonNegativeInteger(name, fallback, minimum = 0) {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new KeeperConfigError(`${name} must be an integer of at least ${minimum}`)
  }
  return value
}

function resolveEndpointCacheFile(value, {
  home = homedir(),
  repositoryRoot = fileURLToPath(new URL('../', import.meta.url)),
} = {}) {
  const filePath = resolve(value?.trim() || join(home, '.local', 'state', 'prophet', 'asset-race-endpoints.json'))
  const fromRepository = relative(repositoryRoot, filePath)
  const outsideRepository = fromRepository === '..' || fromRepository.startsWith(`..${sep}`) || isAbsolute(fromRepository)
  if (!outsideRepository) {
    throw new KeeperConfigError('ASSET_RACE_ENDPOINT_CACHE_FILE must be outside the repository')
  }
  return filePath
}

function readLocalPublicConfig() {
  const configuredPath = process.env.ASSET_RACE_LOCAL_CONFIG?.trim()
  const configPath = configuredPath || fileURLToPath(new URL('../contracts/.asset-race.local', import.meta.url))
  if (!existsSync(configPath)) return {}

  const allowedKeys = new Set(['VITE_LOCAL_RPC_URL', 'LOCAL_ASSET_RACE_ADDRESS', 'LOCAL_WALLET_C'])
  const config = {}
  for (const line of readFileSync(configPath, 'utf8').split(/\r?\n/)) {
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    if (allowedKeys.has(key)) config[key] = line.slice(separator + 1).trim()
  }
  return config
}

function resolveConfig() {
  const dryRun = readBoolean('DRY_RUN')
  const explicitRpcUrl = process.env.ASSET_RACE_RPC_URL?.trim()
  const explicitAddress = process.env.ASSET_RACE_ADDRESS?.trim()
  if (Boolean(explicitRpcUrl) !== Boolean(explicitAddress)) {
    throw new KeeperConfigError('ASSET_RACE_RPC_URL and ASSET_RACE_ADDRESS must be set together')
  }

  const localConfig = explicitRpcUrl ? {} : readLocalPublicConfig()
  const rpcUrl = explicitRpcUrl || localConfig.VITE_LOCAL_RPC_URL
  const addressValue = explicitAddress || localConfig.LOCAL_ASSET_RACE_ADDRESS
  if (!rpcUrl || !addressValue || !isAddress(addressValue)) {
    throw new KeeperConfigError('Set valid Asset Race RPC/address variables or create contracts/.asset-race.local')
  }

  const privateKey = process.env.ASSET_RACE_KEEPER_PRIVATE_KEY?.trim()
  const unlockedAddress = process.env.ASSET_RACE_KEEPER_ADDRESS?.trim() || (!privateKey && localConfig.LOCAL_WALLET_C)
  if (privateKey && unlockedAddress) {
    throw new KeeperConfigError('Configure one keeper signer method, not both')
  }
  if (!dryRun && !privateKey && !unlockedAddress) {
    throw new KeeperConfigError('A keeper signer is required unless DRY_RUN=true')
  }
  if (unlockedAddress && !isAddress(unlockedAddress)) {
    throw new KeeperConfigError('ASSET_RACE_KEEPER_ADDRESS is invalid')
  }
  if (privateKey && !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new KeeperConfigError('ASSET_RACE_KEEPER_PRIVATE_KEY has an invalid format')
  }

  const signedOracleValue = process.env.ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS?.trim()
  const priceSignerPrivateKey = process.env.ASSET_RACE_POOL_PRICE_SIGNER_PRIVATE_KEY?.trim()
  if (Boolean(signedOracleValue) !== Boolean(priceSignerPrivateKey)) {
    throw new KeeperConfigError('Signed pool endpoints require both oracle address and pool price signer key')
  }
  if (signedOracleValue && !isAddress(signedOracleValue)) {
    throw new KeeperConfigError('ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS is invalid')
  }
  if (priceSignerPrivateKey && !/^0x[0-9a-fA-F]{64}$/.test(priceSignerPrivateKey)) {
    throw new KeeperConfigError('ASSET_RACE_POOL_PRICE_SIGNER_PRIVATE_KEY has an invalid format')
  }
  const collectorEnabled = Boolean(signedOracleValue)
  const poolRpcUrl = process.env.ASSET_RACE_POOL_RPC_URL?.trim() || rpcUrl
  const endpointCacheFile = resolveEndpointCacheFile(process.env.ASSET_RACE_ENDPOINT_CACHE_FILE)

  return {
    address: getAddress(addressValue),
    allowLive: readBoolean('ASSET_RACE_ALLOW_LIVE'),
    dryRun,
    expectedChainId: process.env.ASSET_RACE_CHAIN_ID?.trim(),
    archiveMinIntervalMs: readNonNegativeInteger('ASSET_RACE_ARCHIVE_MIN_INTERVAL_MS', 150, 50),
    realtimeEndpointWindowSeconds: readNonNegativeInteger('ASSET_RACE_REALTIME_ENDPOINT_WINDOW_SECONDS', 30),
    endpointCacheFile,
    localFallback: !explicitRpcUrl,
    pollIntervalMs: readNonNegativeInteger('POLL_INTERVAL_MS', collectorEnabled ? 1_000 : 15_000, 500),
    privateKey,
    priceSignerPrivateKey,
    poolRpcUrl,
    rpcUrl,
    runOnce: readBoolean('RUN_ONCE'),
    scanFrom: BigInt(readNonNegativeInteger('RACE_SCAN_FROM', 0)),
    signedOracleAddress: signedOracleValue ? getAddress(signedOracleValue) : undefined,
    unlockedAddress: unlockedAddress ? getAddress(unlockedAddress) : undefined,
  }
}

function productionPoolConfigs() {
  const registryPath = fileURLToPath(new URL('../config/asset-race-assets.json', import.meta.url))
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'))
  return poolConfigsFromRegistry(registry)
}

function transitionFor(race, now) {
  if (race.status === STATUS.LOBBY && now >= race.lobbyEndTime) {
    return { functionName: 'openBetting', outcome: 'BETTING/CANCELLED' }
  }
  if (race.status === STATUS.BETTING && now >= race.bettingEndTime) {
    if (now > race.bettingEndTime + race.startGrace) {
      return { functionName: 'cancelUnstartedRace', outcome: 'CANCELLED' }
    }
    return { functionName: 'startRace', outcome: 'RUNNING/CANCELLED' }
  }
  if (race.status === STATUS.RUNNING && now >= race.raceEndTime) {
    if (race.endSnapshotsCaptured) {
      return { functionName: 'resolveRace', outcome: 'RESOLVED/VOID' }
    }
    if (now > race.raceEndTime + race.resolutionGrace) {
      return { functionName: 'voidExpiredRace', outcome: 'VOID' }
    }
    return { functionName: 'captureEndSnapshots', outcome: 'ENDPOINT CAPTURED' }
  }
  return undefined
}

function isTerminalRace(race) {
  return [STATUS.RESOLVED, STATUS.CANCELLED, STATUS.VOID].includes(Number(race.status))
}

function nextTransitionAt(race) {
  if (race.status === STATUS.LOBBY) return BigInt(race.lobbyEndTime)
  if (race.status === STATUS.BETTING) return BigInt(race.bettingEndTime)
  if (race.status === STATUS.RUNNING) return BigInt(race.raceEndTime)
  return undefined
}

class ActiveRaceTracker {
  constructor(scanFrom = 0n) {
    this.nextRaceId = BigInt(scanFrom)
    this.races = new Map()
  }

  observe(raceId, race) {
    if (isTerminalRace(race)) {
      this.races.delete(raceId)
      return
    }
    const dueAt = nextTransitionAt(race)
    if (dueAt === undefined) throw new Error('UnsupportedActiveRaceStatus')
    this.races.set(raceId, { race, dueAt })
  }

  async discover(publicClient, contractAddress, raceCount) {
    if (raceCount < this.nextRaceId) return
    for (let raceId = this.nextRaceId; raceId < raceCount; raceId += 1n) {
      const race = await publicClient.readContract({
        address: contractAddress,
        abi: keeperAbi,
        functionName: 'getRace',
        args: [raceId],
      })
      this.observe(raceId, race)
    }
    this.nextRaceId = raceCount
  }

  dueRaceIds(now) {
    return [...this.races.entries()]
      .filter(([, tracked]) => tracked.dueAt <= now)
      .map(([raceId]) => raceId)
      .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
  }

  async refresh(publicClient, contractAddress, raceId) {
    const race = await publicClient.readContract({
      address: contractAddress,
      abi: keeperAbi,
      functionName: 'getRace',
      args: [raceId],
    })
    this.observe(raceId, race)
    return race
  }
}

async function endpointProofsForRace(publicClient, contractAddress, raceId, targetTimestamp, collector) {
  const assets = await publicClient.readContract({
    address: contractAddress,
    abi: keeperAbi,
    functionName: 'getRaceAssets',
    args: [raceId],
  })
  const proofTypes = await Promise.all(assets.map((asset) => !asset.active ? PROOF_TYPE.NONE : publicClient.readContract({
      address: asset.oracle,
      abi: endpointOracleAbi,
      functionName: 'endpointProofType',
    })))
  const active = assets.map((asset, index) => ({ asset, proofType: proofTypes[index] })).filter(({ asset }) => asset.active)
  const hasPoolProof = active.some(({ proofType }) => proofType === PROOF_TYPE.SIGNED_POOL_BLOCK_PAIR)
  let poolProofs
  if (hasPoolProof) {
    if (active.some(({ proofType }) => proofType !== PROOF_TYPE.SIGNED_POOL_BLOCK_PAIR)) {
      throw new Error('MixedPoolEndpointProofTypes')
    }
    if (!collector) throw new Error('SignedPoolCollectorNotConfigured')
    if (active.some(({ asset }) => asset.oracle.toLowerCase() !== collector.verifyingContract.toLowerCase())) {
      throw new Error('UnexpectedSignedPoolOracle')
    }
    poolProofs = (await collector.proofsFor(active.map(({ asset }) => asset.oracleId), targetTimestamp)).proofs
  }

  const proofs = []
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index]
    if (!asset.active) { proofs.push('0x'); continue }
    const proofType = proofTypes[index]
    if (proofType === PROOF_TYPE.NONE) proofs.push('0x')
    else if (proofType === PROOF_TYPE.CHAINLINK_ROUND_PAIR) {
      proofs.push(await chainlinkRoundProof(publicClient, asset.oracleId, targetTimestamp))
    } else if (proofType === PROOF_TYPE.SIGNED_POOL_BLOCK_PAIR) {
      proofs.push(poolProofs.get(asset.oracleId.toLowerCase()))
    } else throw new Error('UnsupportedEndpointProofType')
  }
  return proofs
}

async function startCallForRace(publicClient, contractAddress, raceId, race, collector) {
  const assets = await publicClient.readContract({
    address: contractAddress,
    abi: keeperAbi,
    functionName: 'getRaceAssets',
    args: [raceId],
  })
  const contenders = assets.filter((asset) => asset.pool > 0n)
  if (contenders.length < race.minActiveContenders) return { functionName: 'startRace', args: [raceId] }

  const proofTypes = await Promise.all(contenders.map((asset) => publicClient.readContract({
    address: asset.oracle,
    abi: endpointOracleAbi,
    functionName: 'endpointProofType',
  })))
  const hasPoolProof = proofTypes.some((proofType) => proofType === PROOF_TYPE.SIGNED_POOL_BLOCK_PAIR)
  if (!hasPoolProof) return { functionName: 'startRace', args: [raceId] }
  if (proofTypes.some((proofType) => proofType !== proofTypes[0])) {
    throw new Error('MixedStartOracleProofTypes')
  }
  if (proofTypes[0] !== PROOF_TYPE.SIGNED_POOL_BLOCK_PAIR) throw new Error('UnsupportedStartProofType')
  if (!collector) throw new Error('SignedPoolCollectorNotConfigured')
  if (contenders.some((asset) => asset.oracle.toLowerCase() !== collector.verifyingContract.toLowerCase())) {
    throw new Error('UnexpectedSignedPoolOracle')
  }

  const collected = await collector.proofsFor(contenders.map((asset) => asset.oracleId), race.bettingEndTime)
  const proofs = assets.map((asset) => asset.pool === 0n ? '0x' : collected.proofs.get(asset.oracleId.toLowerCase()))
  return { functionName: 'startRaceWithProofs', args: [raceId, proofs] }
}

function safeErrorName(error) {
  if (!error || typeof error !== 'object') return 'UnknownError'
  let current = error
  for (let depth = 0; depth < 8 && current && typeof current === 'object'; depth += 1) {
    if (typeof current.name === 'string' && current.name !== 'Error') return current.name
    current = current.cause
  }
  return 'Error'
}

async function verifySignedPoolOracle(publicClient, oracleAddress, signerAddress) {
  const [trustedSigner, proofType] = await Promise.all([
    publicClient.readContract({ address: oracleAddress, abi: trustedSignerAbi, functionName: 'TRUSTED_SIGNER' }),
    publicClient.readContract({ address: oracleAddress, abi: endpointOracleAbi, functionName: 'endpointProofType' }),
  ])
  if (proofType !== PROOF_TYPE.SIGNED_POOL_BLOCK_PAIR) {
    throw new KeeperConfigError('Configured oracle does not support signed pool endpoints')
  }
  if (trustedSigner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new KeeperConfigError('Pool price signer does not match oracle TRUSTED_SIGNER')
  }
}

async function verifyOperationalRoles(publicClient, raceAddress, keeperAddress, priceSignerAddress) {
  const owner = await publicClient.readContract({ address: raceAddress, abi: ownerAbi, functionName: 'owner' })
  const normalizedOwner = owner.toLowerCase()
  const normalizedPriceSigner = priceSignerAddress.toLowerCase()
  if (normalizedOwner === normalizedPriceSigner) {
    throw new KeeperConfigError('Price signer and AssetRace owner must be separate accounts')
  }
  if (!keeperAddress) return
  const normalizedKeeper = keeperAddress.toLowerCase()
  if (normalizedKeeper === normalizedPriceSigner) {
    throw new KeeperConfigError('Price signer and transaction keeper must be separate accounts')
  }
  if (normalizedKeeper === normalizedOwner) {
    throw new KeeperConfigError('Transaction keeper and AssetRace owner must be separate accounts')
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    printUsage()
    return
  }

  const config = resolveConfig()
  const preliminaryClient = createPublicClient({ transport: http(config.rpcUrl) })
  const chainId = await preliminaryClient.getChainId()
  const chain = defineChain({
    id: chainId,
    name: chainId === 31_337 ? 'Local Anvil' : `Asset Race Chain ${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
    contracts: poolChainContracts(chainId),
  })
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl, { batch: true }) })
  if (config.expectedChainId && BigInt(config.expectedChainId) !== BigInt(chainId)) {
    throw new KeeperConfigError('RPC chain ID does not match ASSET_RACE_CHAIN_ID')
  }
  if (config.localFallback && chainId !== 31_337) {
    throw new KeeperConfigError('The local config may only be used with Anvil chain 31337')
  }
  if (!config.dryRun && chainId !== 31_337 && !config.allowLive) {
    throw new KeeperConfigError('Non-Anvil writes require ASSET_RACE_ALLOW_LIVE=true')
  }

  let account
  if (config.privateKey) account = privateKeyToAccount(config.privateKey)
  else if (config.unlockedAddress) account = config.unlockedAddress

  let collector
  if (config.signedOracleAddress) {
    const priceAccount = privateKeyToAccount(config.priceSignerPrivateKey)
    const keeperAddress = typeof account === 'string' ? account : account?.address
    if (chainId !== 4663) throw new KeeperConfigError('Signed production pool endpoints require Robinhood Chain 4663')
    await verifySignedPoolOracle(publicClient, config.signedOracleAddress, priceAccount.address)
    await verifyOperationalRoles(publicClient, config.address, keeperAddress, priceAccount.address)
    const poolConfigs = productionPoolConfigs()
    if (poolConfigs.length === 0) throw new KeeperConfigError('Registry has no enabled pool-backed Stocks')
    const engine = new PoolPriceEngine({ client: publicClient, configs: poolConfigs })
    let fallbackEngine
    if (config.poolRpcUrl !== config.rpcUrl) {
      const poolClient = withRpcRateLimit(
        createPublicClient({ chain, transport: http(config.poolRpcUrl, { batch: true }) }),
        { minIntervalMs: config.archiveMinIntervalMs },
      )
      if (await poolClient.getChainId() !== chainId) {
        throw new KeeperConfigError('Pool archive RPC chain ID does not match lifecycle RPC')
      }
      fallbackEngine = new PoolPriceEngine({ client: poolClient, configs: poolConfigs })
    }
    try {
      await engine.verify()
    } catch (error) {
      if (!fallbackEngine) throw error
      await fallbackEngine.verify()
    }
    collector = new PoolEndpointCollector({
      account: priceAccount,
      cache: new JsonEndpointProofCache(config.endpointCacheFile),
      chainId,
      engine,
      fallbackEngine,
      primaryWindowSeconds: config.realtimeEndpointWindowSeconds,
      verifyingContract: config.signedOracleAddress,
    })
  }

  const walletClient = config.dryRun
    ? undefined
    : createWalletClient({ account, chain, transport: http(config.rpcUrl) })

  let stopping = false
  process.once('SIGINT', () => { stopping = true })
  process.once('SIGTERM', () => { stopping = true })
  const tracker = new ActiveRaceTracker(config.scanFrom)

  async function poll() {
    const [block, raceCount] = await Promise.all([
      publicClient.getBlock({ blockTag: 'latest' }),
      publicClient.readContract({ address: config.address, abi: keeperAbi, functionName: 'raceCount' }),
    ])
    await tracker.discover(publicClient, config.address, raceCount)

    for (const raceId of tracker.dueRaceIds(block.timestamp)) {
      try {
        const race = await tracker.refresh(publicClient, config.address, raceId)
        const transition = transitionFor(race, block.timestamp)
        if (!transition) continue

        let functionName = transition.functionName
        let args = [raceId]
        if (functionName === 'startRace') {
          const startCall = await startCallForRace(publicClient, config.address, raceId, race, collector)
          functionName = startCall.functionName
          args = startCall.args
        } else if (functionName === 'captureEndSnapshots') {
          args = [raceId, await endpointProofsForRace(publicClient, config.address, raceId, race.raceEndTime, collector)]
        }

        const simulation = await publicClient.simulateContract({
          account: account || zeroAddress,
          address: config.address,
          abi: keeperAbi,
          functionName,
          args,
        })
        if (config.dryRun) {
          console.log(`[dry-run] race #${raceId}: ${functionName} -> ${transition.outcome}`)
          continue
        }

        const hash = await walletClient.writeContract(simulation.request)
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error('TransactionReverted')
        const updatedRace = await publicClient.readContract({
          address: config.address,
          abi: keeperAbi,
          functionName: 'getRace',
          args: [raceId],
        })
        tracker.observe(raceId, updatedRace)
        console.log(`[keeper] race #${raceId}: ${functionName} -> ${STATUS_NAME[updatedRace.status]} (${hash})`)
      } catch (error) {
        console.error(`[keeper] race #${raceId}: transition failed (${safeErrorName(error)}); continuing`)
      }
    }
  }

  do {
    try {
      await poll()
    } catch (error) {
      console.error(`[keeper] poll failed (${safeErrorName(error)}); continuing`)
    }
    if (config.runOnce || stopping) break
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs))
  } while (!stopping)
}

export { ActiveRaceTracker, keeperAbi, transitionFor, endpointProofsForRace, resolveEndpointCacheFile, startCallForRace, verifyOperationalRoles, verifySignedPoolOracle }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  if (error instanceof KeeperConfigError) console.error(`[keeper] configuration error: ${error.message}`)
  else console.error(`[keeper] stopped (${safeErrorName(error)})`)
  process.exitCode = 1
})
