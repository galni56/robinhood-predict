#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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
  ...['openBetting', 'startRace', 'cancelUnstartedRace', 'resolveRace', 'voidExpiredRace'].map((name) => ({
    type: 'function',
    name,
    stateMutability: 'nonpayable',
    inputs: [{ name: 'raceId', type: 'uint256' }],
    outputs: [],
  })),
]

class KeeperConfigError extends Error {}

function printUsage() {
  console.log(`Asset Race lifecycle keeper

Local Anvil (reuses contracts/.asset-race.local):
  npm run keeper:asset-race
  DRY_RUN=true RUN_ONCE=true npm run keeper:asset-race

Explicit configuration:
  ASSET_RACE_RPC_URL=<url>
  ASSET_RACE_ADDRESS=<contract-address>
  ASSET_RACE_CHAIN_ID=<expected-chain-id>          optional safety check
  ASSET_RACE_KEEPER_ADDRESS=<unlocked-rpc-account> or
  ASSET_RACE_KEEPER_PRIVATE_KEY=<signer-key>
  ASSET_RACE_ALLOW_LIVE=true                       required for non-Anvil writes
  POLL_INTERVAL_MS=15000                           default
  RACE_SCAN_FROM=0                                 default
  DRY_RUN=true                                     simulate and report; never send
  RUN_ONCE=true                                    poll once and exit

The private-key value is read only from the process environment and is never logged.`)
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

  return {
    address: getAddress(addressValue),
    allowLive: readBoolean('ASSET_RACE_ALLOW_LIVE'),
    dryRun,
    expectedChainId: process.env.ASSET_RACE_CHAIN_ID?.trim(),
    localFallback: !explicitRpcUrl,
    pollIntervalMs: readNonNegativeInteger('POLL_INTERVAL_MS', 15_000, 1_000),
    privateKey,
    rpcUrl,
    runOnce: readBoolean('RUN_ONCE'),
    scanFrom: BigInt(readNonNegativeInteger('RACE_SCAN_FROM', 0)),
    unlockedAddress: unlockedAddress ? getAddress(unlockedAddress) : undefined,
  }
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
    if (now > race.raceEndTime + race.resolutionGrace) {
      return { functionName: 'voidExpiredRace', outcome: 'VOID' }
    }
    return { functionName: 'resolveRace', outcome: 'RESOLVED/VOID' }
  }
  return undefined
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

async function main() {
  if (process.argv.includes('--help')) {
    printUsage()
    return
  }

  const config = resolveConfig()
  const publicClient = createPublicClient({ transport: http(config.rpcUrl) })
  const chainId = await publicClient.getChainId()
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

  const chain = defineChain({
    id: chainId,
    name: chainId === 31_337 ? 'Local Anvil' : `Asset Race Chain ${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  })
  const walletClient = config.dryRun
    ? undefined
    : createWalletClient({ account, chain, transport: http(config.rpcUrl) })

  let stopping = false
  process.once('SIGINT', () => { stopping = true })
  process.once('SIGTERM', () => { stopping = true })

  async function poll() {
    const [block, raceCount] = await Promise.all([
      publicClient.getBlock({ blockTag: 'latest' }),
      publicClient.readContract({ address: config.address, abi: keeperAbi, functionName: 'raceCount' }),
    ])

    for (let raceId = config.scanFrom; raceId < raceCount; raceId += 1n) {
      try {
        const race = await publicClient.readContract({
          address: config.address,
          abi: keeperAbi,
          functionName: 'getRace',
          args: [raceId],
        })
        const transition = transitionFor(race, block.timestamp)
        if (!transition) continue

        const simulation = await publicClient.simulateContract({
          account: account || zeroAddress,
          address: config.address,
          abi: keeperAbi,
          functionName: transition.functionName,
          args: [raceId],
        })
        if (config.dryRun) {
          console.log(`[dry-run] race #${raceId}: ${transition.functionName} -> ${transition.outcome}`)
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
        console.log(`[keeper] race #${raceId}: ${transition.functionName} -> ${STATUS_NAME[updatedRace.status]} (${hash})`)
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

main().catch((error) => {
  if (error instanceof KeeperConfigError) console.error(`[keeper] configuration error: ${error.message}`)
  else console.error(`[keeper] stopped (${safeErrorName(error)})`)
  process.exitCode = 1
})
