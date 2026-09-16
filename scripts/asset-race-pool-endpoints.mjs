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

export class PoolEndpointCollector {
  constructor({ account, chainId, engine, verifyingContract }) {
    if (!account?.signTypedData) throw new Error('PoolPriceSignerRequired')
    if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('InvalidCollectorChainId')
    if (!engine?.endpointPair) throw new Error('PoolPriceEngineRequired')
    this.account = account
    this.chainId = chainId
    this.engine = engine
    this.verifyingContract = verifyingContract
  }

  async proofsFor(oracleIds, targetTimestamp) {
    const requested = new Set(oracleIds.map((value) => value.toLowerCase()))
    if (requested.size !== oracleIds.length) throw new Error('DuplicatePoolOracleId')
    const pair = await this.engine.endpointPair(targetTimestamp, oracleIds)
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
    return {
      proofs,
      endpointBlockHash: pair.previous.block.hash,
      endpointBlockNumber: pair.previous.block.number,
    }
  }
}
