import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Keypair } from '@solana/web3.js'
import { encodeAttestation, signedEd25519Instruction } from '../price-service/attestation.mjs'
import { verifiedBoundary } from './prices.mjs'

const oracle = Keypair.generate()
const game = Keypair.generate().publicKey.toBase58()
const poolA = Keypair.generate().publicKey.toBase58()
const poolB = Keypair.generate().publicKey.toBase58()
const hash = () => Keypair.generate().publicKey.toBase58()

function attest({ signer = oracle, programId = game, target = 1_000, entries } = {}) {
  const message = encodeAttestation({
    programId,
    target,
    prev: { slot: 41, blockhash: hash(), blockTime: target - 1 },
    next: { slot: 42, parentSlot: 41, previousBlockhash: hash(), blockTime: target },
    entries: entries ?? [
      { priceSource: poolA, price: 150n, decimals: 6 },
      { priceSource: poolB, price: 20n, decimals: 6 },
    ],
  })
  const ix = signedEd25519Instruction(signer, message)
  return { message: message.toString('base64'), instruction: Buffer.from(ix.data).toString('base64') }
}

const expect = { oracle: oracle.publicKey.toBase58(), tag: game, target: 1_000, sources: [poolA, poolB] }

test('a valid attestation yields exactly the signed prices', () => {
  const b = verifiedBoundary(attest(), expect)
  assert.equal(b.prices[poolA], 150n)
  assert.equal(b.prices[poolB], 20n)
  assert.equal(b.prevSlot, 41)
  assert.equal(b.prevBlockTime, 999)
})

test('a different signer is rejected', () => {
  assert.throws(() => verifiedBoundary(attest({ signer: Keypair.generate() }), expect), /pinned oracle/)
})

test('a message swapped next to a valid signature is rejected', () => {
  const good = attest()
  const other = attest({ entries: [{ priceSource: poolA, price: 999n, decimals: 6 }, { priceSource: poolB, price: 20n, decimals: 6 }] })
  assert.throws(() => verifiedBoundary({ instruction: good.instruction, message: other.message }, expect), /does not match/)
})

test('bound to another game, boundary or source set: rejected', () => {
  assert.throws(() => verifiedBoundary(attest({ programId: Keypair.generate().publicKey.toBase58() }), expect), /another game/)
  assert.throws(() => verifiedBoundary(attest({ target: 1_060 }), expect), /boundary time/)
  assert.throws(() => verifiedBoundary(attest({ entries: [{ priceSource: poolA, price: 1n, decimals: 6 }] }), expect), /sources differ/)
})

test('a tampered signature byte is rejected', () => {
  const a = attest()
  const data = Buffer.from(a.instruction, 'base64')
  data[2 + 14 + 32] ^= 0xff // first signature byte (after header, offsets and key)
  assert.throws(() => verifiedBoundary({ ...a, instruction: data.toString('base64') }, expect), /signature|oracle/)
})
