#!/usr/bin/env node

import { readFileSync } from 'node:fs'
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
import { PoolPriceEngine, poolChainContracts, poolConfigsFromRegistry } from './asset-race-pool-price-engine.mjs'
import { verifyPredictionMarketRelease } from './prediction-market-release.mjs'

const OPEN = 0
const MIN_ASSETS_PER_RACE = 2
const MAX_ASSETS_PER_RACE = 6
const MAX_RACE_TITLE_BYTES = 64
// contracts/src/PriceArena.sol:188 (isSupportedDuration) -- not queryable
// on-chain, so mirrored here.
const PRICE_ARENA_SUPPORTED_DURATIONS = [60, 300, 900, 3_600]
// contracts/src/AssetRace.sol:34-41 (RaceStatus) -- a race stops occupying
// a "slot" once it reaches one of these.
const RACE_TERMINAL_STATUSES = new Set([2, 3, 4]) // RESOLVED, CANCELLED, VOID
export const DEFAULT_EVENT_SEEDER_POLL_INTERVAL_MS = 5_000
export const DISCOVERY_MULTICALL_BATCH_SIZE = 100

export class SeederConfigError extends Error {}

function boolEnv(name, fallback) {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new SeederConfigError(`${name} must be true or false`)
}

function uintEnv(name, fallback, minimum = 0) {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < minimum) throw new SeederConfigError(`${name} is invalid`)
  return value
}

export function readSeederConfig() {
  const rpcUrl = process.env.EVENT_SEEDER_RPC_URL?.trim() || process.env.PREDICTION_MARKET_RPC_URL?.trim()
  if (!rpcUrl) throw new SeederConfigError('EVENT_SEEDER_RPC_URL is required')

  const marketEnabled = boolEnv('EVENT_SEEDER_MARKET_ENABLED', true)
  const rawMarketAddress = process.env.EVENT_SEEDER_MARKET_ADDRESS?.trim()
    || process.env.PREDICTION_MARKET_ADDRESS?.trim()
  if (marketEnabled && (!rawMarketAddress || !isAddress(rawMarketAddress))) {
    throw new SeederConfigError('EVENT_SEEDER_MARKET_ADDRESS is invalid')
  }
  const rawMarketOracleAddress = process.env.EVENT_SEEDER_MARKET_ORACLE_ADDRESS?.trim()
    || process.env.PREDICTION_MARKET_SIGNED_POOL_ORACLE_ADDRESS?.trim()
    || process.env.ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS?.trim()
  if (marketEnabled && (!rawMarketOracleAddress || !isAddress(rawMarketOracleAddress))) {
    throw new SeederConfigError('EVENT_SEEDER_MARKET_ORACLE_ADDRESS is invalid')
  }

  const rawArenaAddress = process.env.EVENT_SEEDER_ARENA_ADDRESS?.trim() || process.env.PRICE_ARENA_ADDRESS?.trim()
  if (!rawArenaAddress || !isAddress(rawArenaAddress)) throw new SeederConfigError('EVENT_SEEDER_ARENA_ADDRESS is invalid')

  const assetRaceEnabled = boolEnv('EVENT_SEEDER_ASSET_RACE_ENABLED', false)
  const raceAddressRaw = process.env.EVENT_SEEDER_RACE_ADDRESS?.trim() || process.env.ASSET_RACE_ADDRESS?.trim()
  if (assetRaceEnabled && (!raceAddressRaw || !isAddress(raceAddressRaw))) {
    throw new SeederConfigError('EVENT_SEEDER_RACE_ADDRESS is invalid')
  }

  const dryRun = boolEnv('DRY_RUN', true)
  const privateKey = process.env.EVENT_SEEDER_PRIVATE_KEY?.trim()
  if (!dryRun && !/^0x[0-9a-fA-F]{64}$/.test(privateKey ?? '')) {
    throw new SeederConfigError('EVENT_SEEDER_PRIVATE_KEY is required for live mode')
  }
  if (privateKey && !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new SeederConfigError('EVENT_SEEDER_PRIVATE_KEY is invalid')

  const arenaDurationSeconds = uintEnv('EVENT_SEEDER_ARENA_DURATION_SECONDS', 900, 60)
  if (!PRICE_ARENA_SUPPORTED_DURATIONS.includes(arenaDurationSeconds)) {
    throw new SeederConfigError('EVENT_SEEDER_ARENA_DURATION_SECONDS must be one of 60, 300, 900, 3600')
  }

  const targetPriceMinBp = uintEnv('EVENT_SEEDER_TARGET_PRICE_MIN_BP', 100, 1)
  const targetPriceMaxBp = uintEnv('EVENT_SEEDER_TARGET_PRICE_MAX_BP', 300, 1)
  if (targetPriceMaxBp < targetPriceMinBp) {
    throw new SeederConfigError('EVENT_SEEDER_TARGET_PRICE_MAX_BP must be >= EVENT_SEEDER_TARGET_PRICE_MIN_BP')
  }

  return {
    rpcUrl,
    marketEnabled,
    marketAddress: rawMarketAddress && isAddress(rawMarketAddress) ? getAddress(rawMarketAddress) : undefined,
    marketOracleAddress: rawMarketOracleAddress && isAddress(rawMarketOracleAddress)
      ? getAddress(rawMarketOracleAddress)
      : undefined,
    arenaAddress: getAddress(rawArenaAddress),
    privateKey,
    dryRun,
    allowLive: boolEnv('EVENT_SEEDER_ALLOW_LIVE', false),
    runOnce: boolEnv('RUN_ONCE', false),
    expectedChainId: uintEnv('EVENT_SEEDER_CHAIN_ID', 4663, 1),
    marketTargetOpen: uintEnv('EVENT_SEEDER_MARKET_TARGET_OPEN', 3, 1),
    arenaTargetOpen: uintEnv('EVENT_SEEDER_ARENA_TARGET_OPEN', 2, 1),
    // contracts/src/PredictionMarket.sol:72 (MIN_MARKET_DURATION) is 1800s.
    marketDurationSeconds: uintEnv('EVENT_SEEDER_MARKET_DURATION_SECONDS', 21_600, 1_800),
    arenaDurationSeconds,
    targetPriceMinBp,
    targetPriceMaxBp,
    // Fast refill profile: this loop only creates when a configured target has
    // an open slot, so the shorter cadence increases reads rather than supply.
    pollIntervalMs: uintEnv('EVENT_SEEDER_POLL_INTERVAL_MS', DEFAULT_EVENT_SEEDER_POLL_INTERVAL_MS, 1_000),
    marketScanFrom: BigInt(uintEnv('EVENT_SEEDER_MARKET_SCAN_FROM', 0)),
    arenaScanFrom: BigInt(uintEnv('EVENT_SEEDER_ARENA_SCAN_FROM', 0)),
    assetRaceEnabled,
    raceAddress: raceAddressRaw && isAddress(raceAddressRaw) ? getAddress(raceAddressRaw) : undefined,
    raceTargetOpen: uintEnv('EVENT_SEEDER_RACE_TARGET_OPEN', 2, 1),
    raceDurationSeconds: uintEnv('EVENT_SEEDER_RACE_DURATION_SECONDS', 900, 60),
    raceAssetCount: uintEnv('EVENT_SEEDER_RACE_ASSET_COUNT', MIN_ASSETS_PER_RACE, MIN_ASSETS_PER_RACE),
    raceScanFrom: BigInt(uintEnv('EVENT_SEEDER_RACE_SCAN_FROM', 0)),
  }
}

export const predictionMarketAbi = [
  { type: 'function', name: 'marketCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
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
        { name: 'creator', type: 'address' },
      ],
    }],
  },
  {
    type: 'function', name: 'createMarket', stateMutability: 'payable',
    inputs: [
      { name: 'assetId', type: 'bytes32' },
      { name: 'targetPrice', type: 'int256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'initialYesAmount', type: 'uint256' },
      { name: 'initialNoAmount', type: 'uint256' },
    ],
    outputs: [{ name: 'id', type: 'uint256' }],
  },
]

export const priceArenaAbi = [
  { type: 'function', name: 'FEE_BP', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'CREATOR_FEE_SHARE_BP', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'arenaCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'getArena', stateMutability: 'view', inputs: [{ name: 'arenaId', type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
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
      ],
    }],
  },
  {
    type: 'function', name: 'createArena', stateMutability: 'nonpayable',
    inputs: [
      { name: 'assetId', type: 'bytes32' },
      { name: 'category', type: 'uint8' },
      { name: 'duration', type: 'uint256' },
      { name: 'title', type: 'string' },
    ],
    outputs: [{ name: 'arenaId', type: 'uint256' }],
  },
]

/** True if an item observed with this (status, deadline) still counts as
 * an open listing right now. Both contracts only ever transition a market
 * or arena away from OPEN at or after its deadline (settlement keepers
 * never resolve early), so once an item is observed OPEN with a given
 * deadline, "is it still open" is fully determined by comparing that
 * (immutable) deadline to the current time -- no further on-chain read is
 * ever needed for it again. */
export function isOpenNow(status, deadline, now) {
  return Number(status) === OPEN && BigInt(deadline) > BigInt(now)
}

/** Races have no single OPEN status (LOBBY/BETTING/RUNNING are all
 * non-terminal). Local lifecycle time is not authoritative: a delayed keeper
 * can leave a race non-terminal after its expected grace window. The seeder
 * must keep that slot occupied until an onchain terminal status is observed,
 * otherwise it can create an equivalent race alongside the still-open one. */
export function isRaceOpenNow(status) {
  return !RACE_TERMINAL_STATUSES.has(Number(status))
}

/** Incrementally scans new ids since the last discover() call, tracking
 * only currently-open items. Deliberately mirrors the scan-cursor shape
 * of ActiveMarketTracker/ActiveArenaTracker (used by the settlement
 * keepers) so RPC read volume stays bounded by "how many new items
 * appeared", not by the contract's ever-growing total item count. */
export class OpenItemTracker {
  constructor(scanFrom = 0n, isOpen = isOpenNow, { expireByDeadline = true } = {}) {
    this.nextId = BigInt(scanFrom)
    this.items = new Map()
    this.isOpen = isOpen
    this.expireByDeadline = expireByDeadline
  }

  async discover(publicClient, { address, abi, getFn, rowToItem }, count, now) {
    if (count < this.nextId) return
    while (this.nextId < count) {
      const remaining = count - this.nextId
      const size = Number(remaining > BigInt(DISCOVERY_MULTICALL_BATCH_SIZE)
        ? BigInt(DISCOVERY_MULTICALL_BATCH_SIZE)
        : remaining)
      const ids = Array.from({ length: size }, (_, index) => this.nextId + BigInt(index))
      const rows = typeof publicClient.multicall === 'function'
        ? await publicClient.multicall({
            contracts: ids.map((id) => ({ address, abi, functionName: getFn, args: [id] })),
            allowFailure: true,
            batchSize: 0,
          }).then((results) => results.map((result, index) => {
            if (result.status !== 'success') throw new Error(`DiscoveryReadFailed:${ids[index]}`)
            return result.result
          }))
        : await Promise.all(ids.map((id) => publicClient.readContract({ address, abi, functionName: getFn, args: [id] })))

      rows.forEach((row, index) => {
        const item = rowToItem(row)
        if (this.isOpen(item.status, item.deadline, now)) {
          this.items.set(ids[index], { assetId: item.assetId, deadline: BigInt(item.deadline) })
        }
      })
      this.nextId += BigInt(size)
    }
  }

  /**
   * Re-read only the small tracked-open set and discard authoritative terminal
   * transitions. Races can cancel before their conservative occupiedUntil;
   * without this refresh the seeder incorrectly considers that empty slot
   * occupied and leaves the public board without a replacement race.
   */
  async refresh(publicClient, { address, abi, getFn, rowToItem }, now) {
    for (const id of [...this.items.keys()]) {
      try {
        const row = await publicClient.readContract({ address, abi, functionName: getFn, args: [id] })
        const item = rowToItem(row)
        if (this.isOpen(item.status, item.deadline, now)) {
          this.items.set(id, { assetId: item.assetId, deadline: BigInt(item.deadline) })
        } else {
          this.items.delete(id)
        }
      } catch {
        // A transient RPC failure is not an authoritative lifecycle update.
        // Retain the tracked row and let the next seeder pass retry it.
      }
    }
  }

  /** Drops entries whose deadline has passed -- purely a local memory
   * cleanup, no RPC involved (see isOpenNow's comment). */
  prune(now) {
    if (!this.expireByDeadline) return
    for (const [id, item] of this.items) if (item.deadline <= BigInt(now)) this.items.delete(id)
  }

  isTrackedOpen(item, now) {
    return !this.expireByDeadline || item.deadline > BigInt(now)
  }

  openCount(now) {
    let count = 0
    for (const item of this.items.values()) if (this.isTrackedOpen(item, now)) count += 1
    return count
  }

  openAssetIdSet(now) {
    const set = new Set()
    for (const item of this.items.values()) if (this.isTrackedOpen(item, now)) set.add(item.assetId.toLowerCase())
    return set
  }

  openIds(now) {
    return [...this.items.entries()]
      .filter(([, item]) => this.isTrackedOpen(item, now))
      .map(([id]) => id)
  }
}

function marketRowToItem(market) {
  return { assetId: market.assetId, status: market.status, deadline: market.deadline }
}

function arenaRowToItem(arena) {
  return { assetId: arena.assetId, status: arena.status, deadline: arena.deadline }
}

/** A race has several candidate assets, not one -- assetId here is an
 * unused placeholder (openAssetIdSet() is never called for races, only
 * openCount()). occupiedUntil remains useful diagnostic lifecycle metadata;
 * race trackers deliberately do not expire from it. */
function raceRowToItem(race) {
  const occupiedUntil = BigInt(race.lobbyEndTime) + BigInt(race.bettingWindow) + BigInt(race.startGrace)
    + BigInt(race.raceDuration) + BigInt(race.resolutionGrace)
  return { assetId: `0x${'0'.repeat(64)}`, status: race.status, deadline: occupiedUntil }
}

/** Picks the first configured asset (in registry order) that doesn't
 * currently have an open market/arena, so two simultaneous listings never
 * share a ticker. Returns undefined once `targetOpen` is already met or
 * every configured asset is already represented. */
export function nextAssetToSeed(configs, openAssetIdSet, openCount, targetOpen) {
  if (openCount >= targetOpen) return undefined
  return configs.find((config) => !openAssetIdSet.has(stringToHex(config.assetId, { size: 32 }).toLowerCase()))
}

/** targetPrice = live pool price +/- a random offset in [minBp, maxBp],
 * randomly up or down -- deliberately not exactly the live price (a
 * trivial "will it move at all" question) nor a fixed guess. `random` is
 * injectable for deterministic tests. */
export function targetPriceFromSnapshot(priceRaw, { minBp = 100, maxBp = 300, random = Math.random } = {}) {
  if (priceRaw <= 0n) throw new Error('InvalidPriceForTargetOffset')
  const offsetBp = BigInt(minBp + Math.floor(random() * (maxBp - minBp + 1)))
  const sign = random() < 0.5 ? 1n : -1n
  const delta = (priceRaw * offsetBp) / 10_000n
  const target = priceRaw + sign * delta
  return target > 0n ? target : priceRaw
}

export function arenaTitleFor(config, durationSeconds) {
  const label = durationSeconds >= 3_600 ? `${durationSeconds / 3_600}h` : `${Math.round(durationSeconds / 60)}m`
  const title = `${config.assetId} ${label} Arena`
  if (Buffer.byteLength(title, 'utf8') > MAX_RACE_TITLE_BYTES) throw new Error('ArenaTitleTooLong')
  return title
}

function safeErrorName(error) {
  if (error instanceof Error) return error.shortMessage || error.message.split('\n')[0]
  return 'UnknownError'
}

function productionMarketConfigs(registry) {
  return poolConfigsFromRegistry(registry, { category: 'STOCK' })
}

function productionArenaConfigs(registry) {
  return poolConfigsFromRegistry(registry)
}

// --- Asset Race community races -------------------------------------
//
// createCommunityRace is permissionless and already enabled on mainnet
// (communityPolicyConfigured() reads true). Gated behind
// EVENT_SEEDER_ASSET_RACE_ENABLED (default false) -- when off, none of
// this runs; main() below skips seedRaceIfNeeded entirely.

export const assetRaceCommunityAbi = [
  { type: 'function', name: 'CREATOR_FEE_SHARE_BP', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'approvedAssets', stateMutability: 'view', inputs: [{ name: 'assetId', type: 'bytes32' }],
    outputs: [
      { name: 'registered', type: 'bool' }, { name: 'enabled', type: 'bool' }, { name: 'category', type: 'uint8' },
      { name: 'oracle', type: 'address' }, { name: 'oracleId', type: 'bytes32' },
      { name: 'expectedDecimals', type: 'uint8' }, { name: 'maxPriceAge', type: 'uint64' },
      { name: 'maxEndpointLag', type: 'uint64' },
    ],
  },
  { type: 'function', name: 'getApprovedAssetIds', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32[]' }] },
  { type: 'function', name: 'getApprovedRaceDurations', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64[]' }] },
  { type: 'function', name: 'communityPolicyConfigured', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  {
    type: 'function', name: 'communityPolicy', stateMutability: 'view', inputs: [],
    outputs: [
      { name: 'lobbyDuration', type: 'uint64' }, { name: 'bettingDuration', type: 'uint64' },
      { name: 'startGrace', type: 'uint64' }, { name: 'resolutionGrace', type: 'uint64' },
      { name: 'maxOracleTimestampSkew', type: 'uint64' }, { name: 'feeBp', type: 'uint16' },
      { name: 'minActiveContenders', type: 'uint8' }, { name: 'minStake', type: 'uint256' },
      { name: 'maxStakePerWallet', type: 'uint256' },
    ],
  },
  { type: 'function', name: 'raceCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'getRace', stateMutability: 'view', inputs: [{ name: 'raceId', type: 'uint256' }],
    outputs: [{
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
    }],
  },
  {
    type: 'function', name: 'getRaceAssets', stateMutability: 'view', inputs: [{ name: 'raceId', type: 'uint256' }],
    outputs: [{
      type: 'tuple[]',
      components: [
        { name: 'assetId', type: 'bytes32' }, { name: 'oracle', type: 'address' },
        { name: 'oracleId', type: 'bytes32' }, { name: 'expectedDecimals', type: 'uint8' },
        { name: 'maxPriceAge', type: 'uint64' }, { name: 'maxEndpointLag', type: 'uint64' },
        { name: 'active', type: 'bool' }, { name: 'pool', type: 'uint256' },
        { name: 'startPrice', type: 'uint256' }, { name: 'endPrice', type: 'uint256' },
        { name: 'startOracleUpdatedAt', type: 'uint256' }, { name: 'endOracleUpdatedAt', type: 'uint256' },
        { name: 'startObservationId', type: 'bytes32' }, { name: 'endObservationId', type: 'bytes32' },
        { name: 'returnValue', type: 'int256' },
      ],
    }],
  },
  {
    type: 'function', name: 'createCommunityRace', stateMutability: 'nonpayable',
    inputs: [
      { name: 'title', type: 'string' },
      { name: 'category', type: 'uint8' },
      { name: 'raceDuration', type: 'uint64' },
      { name: 'initialAssetIds', type: 'bytes32[]' },
    ],
    outputs: [{ name: 'raceId', type: 'uint256' }],
  },
]

function hasVisibleTitleByte(title) {
  return [...Buffer.from(title, 'utf8')].some((byte) => byte > 0x20)
}

/** Picks `count` asset ids (bytes32-encoded) from a single-category list
 * of registry configs, in registry order. */
export function pickCommunityRaceAssetIds(configsForCategory, count) {
  if (configsForCategory.length < count) throw new Error('NotEnoughApprovedAssetsForRace')
  return configsForCategory.slice(0, count).map((config) => stringToHex(config.assetId, { size: 32 }))
}

/** The `count` configs starting `offset` positions into the registry
 * (wrapping around) -- lets successive races cycle through different
 * asset pairs instead of always the same one. */
export function rotateConfigs(configsForCategory, count, offset) {
  const n = configsForCategory.length
  if (n < count) throw new Error('NotEnoughApprovedAssetsForRace')
  const start = ((offset % n) + n) % n
  return configsForCategory.slice(start).concat(configsForCategory.slice(0, start)).slice(0, count)
}

export function raceCombinationKey(assetIds) {
  return assetIds.map((assetId) => assetId.toLowerCase()).sort().join('|')
}

/** Choose the next rotation after the newest onchain race and skip every
 * combination that is already open. This makes the sequence restart-safe:
 * no process-local cursor is required, and an RPC/service restart cannot
 * recreate the same active race pair. */
export function nextRaceConfigsToSeed(
  configsForCategory,
  count,
  newestRaceAssetIds = [],
  openCombinationKeys = new Set(),
  openTitles = new Set(),
) {
  const configuredIds = configsForCategory.map((config) => stringToHex(config.assetId, { size: 32 }).toLowerCase())
  const newestFirst = newestRaceAssetIds[0]?.toLowerCase()
  const newestStart = newestFirst ? configuredIds.indexOf(newestFirst) : -1
  const preferredOffset = newestStart >= 0 ? newestStart + count : 0

  for (let attempt = 0; attempt < configsForCategory.length; attempt += 1) {
    const selected = rotateConfigs(configsForCategory, count, preferredOffset + attempt * count)
    const key = raceCombinationKey(selected.map((config) => stringToHex(config.assetId, { size: 32 })))
    const title = communityRaceTitleFor(selected).toLowerCase()
    if (!openCombinationKeys.has(key) && !openTitles.has(title)) return selected
  }
  return undefined
}

/** Same as pickCommunityRaceAssetIds, but starting `offset` positions into
 * the registry (wrapping around) -- lets successive races cycle through
 * different pairs instead of always the same two assets. Fewer candidates
 * per race (the contract minimum, by default) means fewer distinct
 * organic bettors are needed to actually start it -- see
 * AssetRace.startRace's minActiveContenders check. */
export function pickCommunityRaceAssetIdsFrom(configsForCategory, count, offset) {
  return pickCommunityRaceAssetIds(rotateConfigs(configsForCategory, count, offset), count)
}

export function communityRaceTitleFor(configs) {
  const title = configs.map((config) => config.assetId).join(' vs ')
  if (Buffer.byteLength(title, 'utf8') > MAX_RACE_TITLE_BYTES) throw new Error('RaceTitleTooLong')
  return title
}

/** Validates and shapes a createCommunityRace call. Mirrors the
 * contract's own checks (contracts/src/AssetRace.sol:405-446,937-949) so
 * a bad call fails here, in a unit test, rather than as a live revert. */
export function buildCommunityRacePayload({ title, category, raceDuration, assetIds, approvedDurations, approvedAssetIds }) {
  const titleBytes = Buffer.byteLength(title, 'utf8')
  if (titleBytes === 0 || titleBytes > MAX_RACE_TITLE_BYTES || !hasVisibleTitleByte(title)) throw new Error('InvalidTitle')
  if (!approvedDurations.map(Number).includes(Number(raceDuration))) throw new Error('DurationNotApproved')
  if (assetIds.length < MIN_ASSETS_PER_RACE || assetIds.length > MAX_ASSETS_PER_RACE) throw new Error('InvalidCandidateCount')
  const approved = new Set(approvedAssetIds.map((id) => id.toLowerCase()))
  for (const assetId of assetIds) if (!approved.has(assetId.toLowerCase())) throw new Error('AssetNotApproved')
  return { functionName: 'createCommunityRace', args: [title, category, BigInt(raceDuration), assetIds] }
}

// ----------------------------------------------------------------------

async function main() {
  const config = readSeederConfig()
  const bootstrapClient = createPublicClient({ transport: http(config.rpcUrl) })
  const chainId = await bootstrapClient.getChainId()
  if (chainId !== config.expectedChainId) {
    throw new SeederConfigError(`RPC chain ID ${chainId} does not match expected ${config.expectedChainId}`)
  }
  if (!config.dryRun && chainId !== 31_337 && !config.allowLive) {
    throw new SeederConfigError('Non-Anvil writes require EVENT_SEEDER_ALLOW_LIVE=true')
  }

  const chain = defineChain({
    id: chainId,
    name: `Event seeder chain ${chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
    contracts: poolChainContracts(chainId),
  })
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl, { batch: true }) })

  const registry = JSON.parse(readFileSync(fileURLToPath(new URL('../config/asset-race-assets.json', import.meta.url)), 'utf8'))
  const marketConfigs = productionMarketConfigs(registry)
  if (marketConfigs.length !== 10) throw new SeederConfigError('Registry must expose exactly 10 production Stock pools')
  const arenaConfigs = productionArenaConfigs(registry)
  if (arenaConfigs.length !== 23) throw new SeederConfigError('Registry must expose exactly 23 production pools')

  const engine = config.marketEnabled ? new PoolPriceEngine({ client: publicClient, configs: marketConfigs }) : undefined
  if (config.marketEnabled) {
    await verifyPredictionMarketRelease(publicClient, config.marketAddress, marketConfigs, {
      expectedOracleAddress: config.marketOracleAddress,
    })
    await engine.verify()
  }

  const account = config.privateKey ? privateKeyToAccount(config.privateKey) : undefined
  const walletClient = config.dryRun ? undefined : createWalletClient({ account, chain, transport: http(config.rpcUrl) })

  const [arenaFeeBp, arenaCreatorShare] = await Promise.all([
    publicClient.readContract({ address: config.arenaAddress, abi: priceArenaAbi, functionName: 'FEE_BP' }),
    publicClient.readContract({ address: config.arenaAddress, abi: priceArenaAbi, functionName: 'CREATOR_FEE_SHARE_BP' }),
  ])
  if (arenaFeeBp !== 200n) throw new SeederConfigError('PriceArena fee must be 200 bp')
  if (arenaCreatorShare !== 5_000n) throw new SeederConfigError('PriceArena creator fee share must be 5000 bp')

  // Duplicate prevention must see every still-open item after a service
  // restart. A configured historical cursor can sit ahead of a long-running
  // game (this happened in production and allowed the same race pair to be
  // seeded twice), so bootstrap from zero once and remain incremental after
  // that initial batched scan. Counts are append-only and discover() never
  // re-reads terminal history during the process lifetime.
  const marketTracker = config.marketEnabled ? new OpenItemTracker(0n) : undefined
  const arenaTracker = new OpenItemTracker(0n)
  const raceTracker = config.assetRaceEnabled
    ? new OpenItemTracker(0n, isRaceOpenNow, { expireByDeadline: false })
    : undefined
  if (config.assetRaceEnabled) {
    const [creatorShare, communityPolicyConfigured, communityPolicy, approvedRaceDurations] = await Promise.all([
      publicClient.readContract({ address: config.raceAddress, abi: assetRaceCommunityAbi, functionName: 'CREATOR_FEE_SHARE_BP' }),
      publicClient.readContract({ address: config.raceAddress, abi: assetRaceCommunityAbi, functionName: 'communityPolicyConfigured' }),
      publicClient.readContract({ address: config.raceAddress, abi: assetRaceCommunityAbi, functionName: 'communityPolicy' }),
      publicClient.readContract({ address: config.raceAddress, abi: assetRaceCommunityAbi, functionName: 'getApprovedRaceDurations' }),
    ])
    if (creatorShare !== 5_000n) throw new SeederConfigError('AssetRace creator fee share must be 5000 bp')
    if (!communityPolicyConfigured) throw new SeederConfigError('AssetRace community policy is not configured on-chain')
    if (Number(communityPolicy[5]) !== 200) throw new SeederConfigError('AssetRace fee must be 200 bp')
    if (!approvedRaceDurations.map(Number).includes(config.raceDurationSeconds)) {
      throw new SeederConfigError(`EVENT_SEEDER_RACE_DURATION_SECONDS must be one of: ${approvedRaceDurations.join(', ')}`)
    }
  }

  let stopping = false
  process.once('SIGINT', () => { stopping = true })
  process.once('SIGTERM', () => { stopping = true })

  async function seedMarketIfNeeded(now) {
    if (!config.marketEnabled || !marketTracker || !engine) return
    const count = await publicClient.readContract({ address: config.marketAddress, abi: predictionMarketAbi, functionName: 'marketCount' })
    await marketTracker.discover(publicClient, { address: config.marketAddress, abi: predictionMarketAbi, getFn: 'getMarket', rowToItem: marketRowToItem }, count, now)
    marketTracker.prune(now)
    const next = nextAssetToSeed(marketConfigs, marketTracker.openAssetIdSet(now), marketTracker.openCount(now), config.marketTargetOpen)
    if (!next) return

    const snapshot = await engine.latestSnapshot()
    const priceRaw = snapshot.assets[next.assetId]?.priceRaw
    if (priceRaw === undefined) throw new Error(`MissingPoolSnapshot:${next.assetId}`)
    const targetPrice = targetPriceFromSnapshot(priceRaw, { minBp: config.targetPriceMinBp, maxBp: config.targetPriceMaxBp })
    const deadline = BigInt(now) + BigInt(config.marketDurationSeconds)
    const assetIdHex = stringToHex(next.assetId, { size: 32 })

    const simulation = await publicClient.simulateContract({
      account: account || zeroAddress,
      address: config.marketAddress,
      abi: predictionMarketAbi,
      functionName: 'createMarket',
      args: [assetIdHex, targetPrice, deadline, 0n, 0n],
    })
    if (config.dryRun) {
      console.log(`[dry-run] createMarket simulation passed for ${next.assetId} target=${targetPrice} deadline=${deadline}`)
      return
    }
    const hash = await walletClient.writeContract(simulation.request)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error('TransactionReverted')
    console.log(`[event-seeder] market created on ${next.assetId} (${hash})`)
  }

  async function seedArenaIfNeeded(now) {
    const count = await publicClient.readContract({ address: config.arenaAddress, abi: priceArenaAbi, functionName: 'arenaCount' })
    await arenaTracker.discover(publicClient, { address: config.arenaAddress, abi: priceArenaAbi, getFn: 'getArena', rowToItem: arenaRowToItem }, count, now)
    arenaTracker.prune(now)
    const next = nextAssetToSeed(arenaConfigs, arenaTracker.openAssetIdSet(now), arenaTracker.openCount(now), config.arenaTargetOpen)
    if (!next) return

    const assetIdHex = stringToHex(next.assetId, { size: 32 })
    const category = next.category === 'MEME' ? 1 : 0
    const title = arenaTitleFor(next, config.arenaDurationSeconds)

    if (config.dryRun) {
      console.log(`[dry-run] would create arena on ${next.assetId} duration=${config.arenaDurationSeconds}`)
      return
    }
    const simulation = await publicClient.simulateContract({
      account, address: config.arenaAddress, abi: priceArenaAbi, functionName: 'createArena',
      args: [assetIdHex, category, BigInt(config.arenaDurationSeconds), title],
    })
    const hash = await walletClient.writeContract(simulation.request)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error('TransactionReverted')
    console.log(`[event-seeder] arena created on ${next.assetId} (${hash})`)
  }

  async function seedRaceIfNeeded(now) {
    const count = await publicClient.readContract({ address: config.raceAddress, abi: assetRaceCommunityAbi, functionName: 'raceCount' })
    const raceRead = { address: config.raceAddress, abi: assetRaceCommunityAbi, getFn: 'getRace', rowToItem: raceRowToItem }
    await raceTracker.discover(publicClient, raceRead, count, now)
    await raceTracker.refresh(publicClient, raceRead, now)
    raceTracker.prune(now)
    if (raceTracker.openCount(now) >= config.raceTargetOpen) return

    const openIds = raceTracker.openIds(now)
    const newestId = count > 0n ? count - 1n : undefined
    const assetReadIds = [...new Set([
      ...openIds.map(String),
      ...(newestId == null ? [] : [String(newestId)]),
    ])].map(BigInt)
    const assetResults = assetReadIds.length === 0 ? [] : await publicClient.multicall({
      contracts: assetReadIds.flatMap((raceId) => [
        {
          address: config.raceAddress,
          abi: assetRaceCommunityAbi,
          functionName: 'getRace',
          args: [raceId],
        },
        {
          address: config.raceAddress,
          abi: assetRaceCommunityAbi,
          functionName: 'getRaceAssets',
          args: [raceId],
        },
      ]),
      allowFailure: true,
      batchSize: 0,
    })
    if (assetResults.some((result) => result.status !== 'success')) {
      throw new Error('OpenRaceAssetReadFailed')
    }
    const assetIdsByRace = new Map(assetReadIds.map((raceId, index) => [
      raceId.toString(),
      assetResults[index * 2 + 1].result.map((asset) => asset.assetId),
    ]))
    const titlesByRace = new Map(assetReadIds.map((raceId, index) => [
      raceId.toString(),
      assetResults[index * 2].result.title.trim().toLowerCase(),
    ]))
    const openCombinationKeys = new Set(openIds.map((raceId) => (
      raceCombinationKey(assetIdsByRace.get(raceId.toString()) ?? [])
    )))
    const newestRaceAssetIds = newestId == null ? [] : assetIdsByRace.get(newestId.toString()) ?? []
    const openTitles = new Set(openIds.map((raceId) => titlesByRace.get(raceId.toString()) ?? ''))
    const selected = nextRaceConfigsToSeed(
      marketConfigs,
      config.raceAssetCount,
      newestRaceAssetIds,
      openCombinationKeys,
      openTitles,
    )
    if (!selected) throw new Error('NoUniqueRaceCombinationAvailable')
    const picked = selected.map((c) => stringToHex(c.assetId, { size: 32 }))
    const title = communityRaceTitleFor(selected)

    if (config.dryRun) {
      console.log(`[dry-run] would create race ${title} duration=${config.raceDurationSeconds}`)
      return
    }
    const simulation = await publicClient.simulateContract({
      account, address: config.raceAddress, abi: assetRaceCommunityAbi, functionName: 'createCommunityRace',
      args: [title, 0, BigInt(config.raceDurationSeconds), picked],
    })
    const hash = await walletClient.writeContract(simulation.request)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error('TransactionReverted')
    console.log(`[event-seeder] race created ${title} (${hash})`)
  }

  do {
    const block = await publicClient.getBlock({ blockTag: 'latest' })
    if (config.marketEnabled) {
      try { await seedMarketIfNeeded(block.timestamp) } catch (error) { console.error(`[event-seeder] market seeding failed (${safeErrorName(error)}); continuing`) }
    }
    try { await seedArenaIfNeeded(block.timestamp) } catch (error) { console.error(`[event-seeder] arena seeding failed (${safeErrorName(error)}); continuing`) }
    if (config.assetRaceEnabled) {
      try { await seedRaceIfNeeded(block.timestamp) } catch (error) { console.error(`[event-seeder] race seeding failed (${safeErrorName(error)}); continuing`) }
    }
    if (config.runOnce || stopping) break
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs))
  } while (!stopping)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const prefix = error instanceof SeederConfigError ? '[event-seeder] configuration error:' : '[event-seeder] stopped:'
    console.error(prefix, safeErrorName(error))
    process.exitCode = 1
  })
}
