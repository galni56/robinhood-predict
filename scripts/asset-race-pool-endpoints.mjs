import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { encodeAbiParameters } from 'viem'

export const SIGNED_POOL_ORACLE_NAME = 'SignedPoolRaceOracle'
export const SIGNED_POOL_ORACLE_VERSION = '1'

export const poolObservationComponents = [
  { name: 'oracleId', type: 'bytes32' },
  { name: 'price', type: 'uint256' },
  { name: 'decimals', type: 'uint8' },
  { name: 'blockNumber', type: 'uint256' },
  { name: 'blockHash', type: 'bytes32' },
  { name: 'parentBlockHash', type: 'bytes32' },
  { name: 'blockTimestamp', type: 'uint256' },
]

export const poolObservationTypes = { PoolObservation: poolObservationComponents }

function observationFromSnapshot(entry) {
  return {
    oracleId: entry.oracleId,
    price: BigInt(entry.priceRaw),
    decimals: entry.decimals,
    blockNumber: BigInt(entry.blockNumber),
    blockHash: entry.blockHash,
    parentBlockHash: entry.parentBlockHash,
    blockTimestamp: BigInt(entry.blockTimestamp),
  }
}

function proofForPair(previous, selected, previousSignature, selectedSignature) {
  return encodeAbiParameters(
    [
      { type: 'tuple', components: poolObservationComponents },
      { type: 'bytes' },
      { type: 'tuple', components: poolObservationComponents },
      { type: 'bytes' },
    ],
    [previous, previousSignature, selected, selectedSignature],
  )
}

function cacheKey(chainId, verifyingContract, targetTimestamp) {
  return `${chainId}:${verifyingContract.toLowerCase()}:${BigInt(targetTimestamp)}`
}

export class JsonEndpointProofCache {
  constructor(filePath, { maxEntries = 4_096 } = {}) {
    if (typeof filePath !== 'string' || !filePath.trim() || !Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new Error('InvalidEndpointProofCacheConfig')
    }
    this.filePath = filePath
    this.maxEntries = maxEntries
  }

  readState() {
    if (!existsSync(this.filePath)) return { version: 1, entries: {} }
    try {
      const state = JSON.parse(readFileSync(this.filePath, 'utf8'))
      if (state?.version !== 1 || !state.entries || typeof state.entries !== 'object') throw new Error()
      return state
    } catch {
      throw new Error('EndpointProofCacheCorrupt')
    }
  }

  get({ chainId, verifyingContract, targetTimestamp, oracleIds }) {
    const entry = this.readState().entries[cacheKey(chainId, verifyingContract, targetTimestamp)]
    const requested = oracleIds.map((value) => value.toLowerCase())
    if (!entry || requested.some((oracleId) => typeof entry.proofs?.[oracleId] !== 'string')) return undefined
    return {
      proofs: new Map(requested.map((oracleId) => [oracleId, entry.proofs[oracleId]])),
      endpointBlockHash: entry.endpointBlockHash,
      endpointBlockNumber: BigInt(entry.endpointBlockNumber),
      source: 'CACHE',
    }
  }

  set({ chainId, verifyingContract, targetTimestamp, result }) {
    const state = this.readState()
    const key = cacheKey(chainId, verifyingContract, targetTimestamp)
    const existing = state.entries[key]
    state.entries[key] = {
      updatedAt: Date.now(),
      endpointBlockHash: result.endpointBlockHash,
      endpointBlockNumber: result.endpointBlockNumber.toString(),
      proofs: { ...(existing?.proofs ?? {}), ...Object.fromEntries(result.proofs) },
    }
    const ordered = Object.entries(state.entries).sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    state.entries = Object.fromEntries(ordered.slice(0, this.maxEntries))
    mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 })
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(temporary, `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600 })
    renameSync(temporary, this.filePath)
    chmodSync(this.filePath, 0o600)
  }
}

export class PoolEndpointCollector {
  constructor({ account, chainId, engine, fallbackEngine, cache, primaryWindowSeconds = 30, nowSeconds, verifyingContract }) {
    if (!account?.signTypedData) throw new Error('PoolPriceSignerRequired')
    if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('InvalidCollectorChainId')
    if (!engine?.endpointPair) throw new Error('PoolPriceEngineRequired')
    if (fallbackEngine && !fallbackEngine.endpointPair) throw new Error('InvalidFallbackPoolPriceEngine')
    if (!Number.isSafeInteger(primaryWindowSeconds) || primaryWindowSeconds < 0) throw new Error('InvalidPrimaryEndpointWindow')
    this.account = account
    this.chainId = chainId
    this.engine = engine
    this.fallbackEngine = fallbackEngine
    this.cache = cache
    this.primaryWindowSeconds = BigInt(primaryWindowSeconds)
    this.nowSeconds = nowSeconds || (() => BigInt(Math.floor(Date.now() / 1_000)))
    this.verifyingContract = verifyingContract
    this.inflight = new Map()
  }

  async proofsFor(oracleIds, targetTimestamp) {
    const requested = new Set(oracleIds.map((value) => value.toLowerCase()))
    if (requested.size !== oracleIds.length) throw new Error('DuplicatePoolOracleId')
    const cacheRequest = { chainId: this.chainId, verifyingContract: this.verifyingContract, targetTimestamp, oracleIds }
    const cached = this.cache?.get(cacheRequest)
    if (cached) return cached
    const inflightKey = `${BigInt(targetTimestamp)}:${[...requested].sort().join(',')}`
    if (this.inflight.has(inflightKey)) return this.inflight.get(inflightKey)
    const pending = this.collectAndSign(oracleIds, targetTimestamp, cacheRequest)
    this.inflight.set(inflightKey, pending)
    try {
      return await pending
    } finally {
      this.inflight.delete(inflightKey)
    }
  }

  async collectAndSign(oracleIds, targetTimestamp, cacheRequest) {
    const requested = new Set(oracleIds.map((value) => value.toLowerCase()))
    let pair
    const target = BigInt(targetTimestamp)
    const timely = !this.fallbackEngine || this.nowSeconds() <= target + this.primaryWindowSeconds
    let source = timely ? 'PRIMARY' : 'ARCHIVE_FALLBACK'
    try {
      pair = await (timely ? this.engine : this.fallbackEngine).endpointPair(targetTimestamp, oracleIds)
    } catch (primaryError) {
      if (!timely || !this.fallbackEngine) throw primaryError
      try {
        pair = await this.fallbackEngine.endpointPair(targetTimestamp, oracleIds)
        source = 'ARCHIVE_FALLBACK'
      } catch (fallbackError) {
        throw new Error('PoolEndpointSourcesUnavailable', { cause: fallbackError })
      }
    }
    const domain = {
      name: SIGNED_POOL_ORACLE_NAME,
      version: SIGNED_POOL_ORACLE_VERSION,
      chainId: this.chainId,
      verifyingContract: this.verifyingContract,
    }
    const proofs = new Map()
    for (const [assetId, selectedEntry] of Object.entries(pair.selected.assets)) {
      if (!requested.has(selectedEntry.oracleId.toLowerCase())) continue
      const previousEntry = pair.previous.assets[assetId]
      if (!previousEntry || previousEntry.oracleId.toLowerCase() !== selectedEntry.oracleId.toLowerCase()) {
        throw new Error('PoolEndpointIdentityMismatch')
      }
      const previous = observationFromSnapshot(previousEntry)
      const selected = observationFromSnapshot(selectedEntry)
      const [previousSignature, selectedSignature] = await Promise.all([
        this.account.signTypedData({ domain, types: poolObservationTypes, primaryType: 'PoolObservation', message: previous }),
        this.account.signTypedData({ domain, types: poolObservationTypes, primaryType: 'PoolObservation', message: selected }),
      ])
      proofs.set(selectedEntry.oracleId.toLowerCase(), proofForPair(previous, selected, previousSignature, selectedSignature))
    }
    if (proofs.size !== requested.size) throw new Error('UnknownPoolOracleId')
    const result = {
      proofs,
      endpointBlockHash: pair.previous.block.hash,
      endpointBlockNumber: pair.previous.block.number,
      source,
    }
    this.cache?.set({ ...cacheRequest, result })
    return result
  }
}
