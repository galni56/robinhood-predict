// Borsh encoding of `PoolAttestation` (solana/crates/pool_attestation) and the
// Ed25519 precompile instruction that carries it.
//
// Field order must match the Rust struct exactly:
//   domain [u8;8] | version u8 | program_id [32] | target_timestamp i64 |
//   prev_slot u64 | prev_blockhash [32] | prev_block_time i64 |
//   next_slot u64 | next_parent_slot u64 | next_parent_blockhash [32] |
//   next_block_time i64 | entries Vec<{ price_source [32], price u64, decimals u8 }>

import bs58 from 'bs58'
import { Ed25519Program, PublicKey } from '@solana/web3.js'

export const ATTESTATION_DOMAIN = Buffer.from('PRPHPOOL')
export const ATTESTATION_VERSION = 1
export const MAX_ATTESTATION_ENTRIES = 12

const i64 = (value) => {
  const b = Buffer.alloc(8)
  b.writeBigInt64LE(BigInt(value))
  return b
}
const u64 = (value) => {
  const b = Buffer.alloc(8)
  b.writeBigUInt64LE(BigInt(value))
  return b
}
const hash32 = (base58) => {
  const bytes = Buffer.from(bs58.decode(base58))
  if (bytes.length !== 32) throw new Error('blockhash must be 32 bytes')
  return bytes
}

/**
 * @param {object} a
 * @param {string} a.programId  game program the attestation is bound to
 * @param {number} a.target     boundary unix time
 * @param {{slot:number, blockhash:string, blockTime:number}} a.prev  last block strictly before target
 * @param {{slot:number, parentSlot:number, previousBlockhash:string, blockTime:number}} a.next  its direct child
 * @param {{priceSource:string, price:bigint, decimals:number}[]} a.entries
 */
export function encodeAttestation({ programId, target, prev, next, entries }) {
  if (entries.length === 0 || entries.length > MAX_ATTESTATION_ENTRIES) {
    throw new Error(`attestation needs 1-${MAX_ATTESTATION_ENTRIES} entries, got ${entries.length}`)
  }
  const len = Buffer.alloc(4)
  len.writeUInt32LE(entries.length)
  return Buffer.concat([
    ATTESTATION_DOMAIN,
    Buffer.from([ATTESTATION_VERSION]),
    new PublicKey(programId).toBuffer(),
    i64(target),
    u64(prev.slot),
    hash32(prev.blockhash),
    i64(prev.blockTime),
    u64(next.slot),
    u64(next.parentSlot),
    hash32(next.previousBlockhash),
    i64(next.blockTime),
    len,
    ...entries.flatMap((e) => [new PublicKey(e.priceSource).toBuffer(), u64(e.price), Buffer.from([e.decimals])]),
  ])
}

/** Signs `message` with the oracle keypair; returns the Ed25519 precompile
 * instruction with key, signature and message inline (all three indexes are
 * u16::MAX, the only layout the programs accept). */
export function signedEd25519Instruction(oracle, message) {
  return Ed25519Program.createInstructionWithPrivateKey({ privateKey: oracle.secretKey, message })
}
