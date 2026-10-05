// Boundary prices from the price service (scripts/solana/price-service): the
// price of each pool at the last block before a game boundary. The response
// is a signed attestation, and settlement uses ONLY what the oracle signed:
// the JSON fields next to it are ignored once the signature checks out, so a
// spoofed or compromised price-service URL cannot pick winners.

import { createPublicKey, verify } from 'node:crypto'
import { base58, fromBase58 } from './chain.mjs'

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
const DOMAIN = Buffer.from('PRPHPOOL')
const VERSION = 1

/** Pulls key, signature and message out of an Ed25519 precompile
 * instruction (one signature, all data inline - the price service layout). */
export function parseEd25519Instruction(data) {
  if (data.length < 16 || data[0] !== 1) throw new Error('attestation: expected one ed25519 signature')
  const u16 = (at) => data.readUInt16LE(at)
  const sigOffset = u16(2)
  const keyOffset = u16(6)
  const msgOffset = u16(10)
  const msgSize = u16(12)
  return {
    publicKey: data.subarray(keyOffset, keyOffset + 32),
    signature: data.subarray(sigOffset, sigOffset + 64),
    message: data.subarray(msgOffset, msgOffset + msgSize),
  }
}

/** Decodes the Borsh `PoolAttestation` (see price-service/attestation.mjs). */
export function decodeAttestation(message) {
  let at = 0
  const take = (n) => {
    if (at + n > message.length) throw new Error('attestation: truncated message')
    const slice = message.subarray(at, at + n)
    at += n
    return slice
  }
  const i64 = () => Number(take(8).readBigInt64LE())
  const u64 = () => take(8).readBigUInt64LE()
  if (!take(8).equals(DOMAIN)) throw new Error('attestation: wrong domain')
  if (take(1)[0] !== VERSION) throw new Error('attestation: unsupported version')
  const programId = base58(take(32))
  const target = i64()
  const prevSlot = Number(u64())
  take(32) // prev blockhash
  const prevBlockTime = i64()
  take(8 + 8 + 32 + 8) // next slot, next parent slot, next parent blockhash, next block time
  const count = take(4).readUInt32LE()
  if (count === 0 || count > 12) throw new Error('attestation: bad entry count')
  const entries = []
  for (let i = 0; i < count; i++) {
    entries.push({ priceSource: base58(take(32)), price: take(8).readBigUInt64LE(), decimals: take(1)[0] })
  }
  if (at !== message.length) throw new Error('attestation: trailing bytes')
  return { programId, target, prevSlot, prevBlockTime, entries }
}

/**
 * Verifies a price-service attestation and returns ONLY the signed values.
 * Throws unless: the ed25519 signature is valid, the signer is the pinned
 * oracle, the signed message is bound to `tag` (the game wallet) and the
 * requested `target`, and it covers exactly the requested `sources`.
 */
export function verifiedBoundary({ instruction, message }, { oracle, tag, target, sources }) {
  const ix = parseEd25519Instruction(Buffer.from(instruction, 'base64'))
  if (!ix.message.equals(Buffer.from(message, 'base64'))) throw new Error('attestation: message does not match the signed bytes')
  if (base58(ix.publicKey) !== oracle) throw new Error('attestation: not signed by the pinned oracle')
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, ix.publicKey]), format: 'der', type: 'spki' })
  if (!verify(null, ix.message, key, ix.signature)) throw new Error('attestation: bad signature')
  const a = decodeAttestation(ix.message)
  if (a.programId !== tag) throw new Error('attestation: bound to another game')
  if (a.target !== target) throw new Error('attestation: wrong boundary time')
  const signed = new Set(a.entries.map((e) => e.priceSource))
  if (signed.size !== sources.length || sources.some((s) => !signed.has(s))) throw new Error('attestation: sources differ from the request')
  if (a.entries.some((e) => e.price <= 0n)) throw new Error('attestation: zero price')
  return {
    prevSlot: a.prevSlot,
    prevBlockTime: a.prevBlockTime,
    prices: Object.fromEntries(a.entries.map((e) => [e.priceSource, e.price])),
    decimals: Object.fromEntries(a.entries.map((e) => [e.priceSource, e.decimals])),
  }
}

/**
 * @param baseUrl price service URL
 * @param tag     the game wallet address the attestations must be bound to
 * @param oracle  pinned oracle public key (base58). Null skips verification -
 *                allowed for localnet stands only; server.mjs enforces that.
 */
export function createPriceClient(baseUrl, tag, oracle = null) {
  if (oracle != null) fromBase58(oracle)
  return {
    /** Display SOL/USD (for the duel spectator cap; never for settlement). */
    async solUsd() {
      const body = await (await fetch(`${baseUrl}/prices`, { signal: AbortSignal.timeout(10_000) })).json()
      const sol = body.prices?.SOL
      return sol ? { raw: BigInt(sol.raw), decimals: sol.decimals } : null
    },
    async boundary(target, sources) {
      const url = `${baseUrl}/attestation?program=${tag}&target=${target}&sources=${sources.join(',')}`
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(`price service ${response.status}: ${body.error ?? 'no body'}`)
      const attestation = { message: body.message, instruction: body.instruction }
      const signed = oracle
        ? verifiedBoundary(attestation, { oracle, tag, target, sources })
        : {
            prevSlot: body.prevSlot,
            prevBlockTime: body.prevBlockTime,
            prices: Object.fromEntries(body.entries.map((e) => [e.priceSource, BigInt(e.price)])),
            decimals: Object.fromEntries(body.entries.map((e) => [e.priceSource, e.decimals])),
          }
      return { ...signed, attestation }
    },
  }
}
