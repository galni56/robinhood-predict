import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Keypair, PublicKey } from '@solana/web3.js'
import { USDC_MINT, WSOL_MINT } from './pools.mjs'
import { pricesFromData } from './snapshot.mjs'

// Minimal fabricated "orca wp" pool: mint0 at 101, mint1 at 181, u128
// sqrtPrice at 65. sqrt = 2^64 makes sqrt^2 equal Q128, so the price in
// whole-token units is exactly 10^(decimals0 - decimals1).
function orcaPool(mint0, mint1, sqrt = 1n << 64n) {
  const data = Buffer.alloc(260)
  new PublicKey(mint0).toBuffer().copy(data, 101)
  new PublicKey(mint1).toBuffer().copy(data, 181)
  data.writeBigUInt64LE(sqrt & 0xffffffffffffffffn, 65)
  data.writeBigUInt64LE(sqrt >> 64n, 73)
  return data
}

const NVDAX_MINT = Keypair.generate().publicKey.toBase58()
const MEME_MINT = Keypair.generate().publicKey.toBase58()

const plan = {
  solAsset: { symbol: 'SOL', pool: 'POOL_SOL', poolKind: 'orca wp', mint: WSOL_MINT, priceDecimals: 6 },
  assets: [
    { symbol: 'NVDAx', pool: 'POOL_NVDAX', poolKind: 'orca wp', mint: NVDAX_MINT, priceDecimals: 6 },
    { symbol: 'MEME', pool: 'POOL_MEME', poolKind: 'orca wp', mint: MEME_MINT, priceDecimals: 6 },
  ],
  decimals: { [USDC_MINT]: 6, [WSOL_MINT]: 9, [NVDAX_MINT]: 9, [MEME_MINT]: 9 },
  accounts: ['POOL_SOL', 'POOL_NVDAX', 'POOL_MEME'],
}

const nvdaxAsset = plan.assets[0]
const memeAsset = plan.assets[1]

test('attests a USDC-quoted asset without the SOL pool in data', () => {
  // The attestation path passes only accountsFor(asset) - for a USDC-quoted
  // asset that is just its own pool. This used to crash on the eager SOL/USD
  // read before any per-asset handling ran.
  const data = { POOL_NVDAX: orcaPool(NVDAX_MINT, USDC_MINT) }
  const { prices, errors } = pricesFromData(plan, data, [nvdaxAsset])
  assert.deepEqual(errors, [])
  // 10^(9-6) = 1000 USDC per whole token, scaled to priceDecimals.
  assert.equal(prices.get('NVDAx').scaled, 1000n * 10n ** 6n)
})

test('still converts a WSOL-quoted asset through the SOL pool', () => {
  const data = {
    POOL_MEME: orcaPool(MEME_MINT, WSOL_MINT),
    POOL_SOL: orcaPool(WSOL_MINT, USDC_MINT),
  }
  const { prices, errors } = pricesFromData(plan, data, [memeAsset])
  assert.deepEqual(errors, [])
  // MEME/WSOL = 10^(9-9) = 1; SOL/USDC = 10^(9-6) = 1000 -> 1000 USD.
  assert.equal(prices.get('MEME').scaled, 1000n * 10n ** 6n)
})

test('a WSOL-quoted asset without SOL pool data errors per-asset, not fatally', () => {
  const data = { POOL_MEME: orcaPool(MEME_MINT, WSOL_MINT) }
  const { prices, errors } = pricesFromData(plan, data, [memeAsset])
  assert.equal(prices.size, 0)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /^MEME:/)
})

test('rejects a SOL pool not quoted in USDC', () => {
  const notUsdc = Keypair.generate().publicKey.toBase58()
  const badPlan = {
    ...plan,
    solAsset: { ...plan.solAsset, pool: 'POOL_SOL_BAD' },
    decimals: { ...plan.decimals, [notUsdc]: 6 },
  }
  const data = {
    POOL_MEME: orcaPool(MEME_MINT, WSOL_MINT),
    POOL_SOL_BAD: orcaPool(WSOL_MINT, notUsdc),
  }
  const { errors } = pricesFromData(badPlan, data, [memeAsset])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /SOL pool must be quoted in USDC/)
})
