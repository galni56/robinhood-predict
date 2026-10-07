// Spot price decoding for the DEX pool kinds in config/solana-assets.json.
//
// Every price is an exact rational { num, den } of quote units per one whole
// asset token, computed with BigInt from raw account data. Offsets were
// checked against live mainnet accounts (mint addresses found at the
// expected positions for every kind).
//
// Kinds:
//   raydium standard  Raydium AMM v4   reserves = vault balances - pending PnL
//   raydium CPMM      Raydium CP-Swap  reserves = vault balances - protocol, fund
//                     and creator fees (vaults 72/104, mints 168/200, fees 341..)
//   raydium CLMM      Raydium CLMM     sqrt_price_x64
//   orca wp           Orca Whirlpool   sqrt_price (Q64.64)
//   meteora DLMM      Meteora DLMM     (1 + bin_step / 10^4) ^ active_id
//   pumpswap          PumpSwap AMM     reserves = the two pool vault balances
//                     (base mint 43, quote mint 75, base vault 139, quote vault 171)
//   pump curve        pump.fun bonding curve (coins launched on HasteFun, before
//                     they graduate): virtual token reserves u64 at 8, virtual
//                     SOL reserves u64 at 16, complete flag at 48. The account
//                     holds no mint, so the asset's mint is passed in; the quote
//                     is always SOL. A completed curve has moved to PumpSwap and
//                     prices nothing (checked on a live curve, 2026-10-07).

import { PublicKey } from '@solana/web3.js'

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
export const WSOL_MINT = 'So11111111111111111111111111111111111111112'

const Q128 = 1n << 128n
const pow10 = (n) => 10n ** BigInt(n)
const key = (data, at) => new PublicKey(data.subarray(at, at + 32)).toBase58()
const u64 = (data, at) => data.readBigUInt64LE(at)
const u128 = (data, at) => data.readBigUInt64LE(at) | (data.readBigUInt64LE(at + 8) << 64n)

/** SPL token account balance (offset 64). */
export const tokenAmount = (data) => u64(data, 64)
/** SPL mint decimals (offset 44). */
export const mintDecimals = (data) => data[44]

/** Layout facts per kind: where the two mints are, and (for AMM v4) the vaults. */
export const LAYOUTS = {
  'raydium standard': { mint0: 400, mint1: 432, vault0: 336, vault1: 368, pnl0: 192, pnl1: 200 },
  'raydium CPMM': { mint0: 168, mint1: 200, vault0: 72, vault1: 104, fees0: [341, 357, 397], fees1: [349, 365, 405] },
  'raydium CLMM': { mint0: 73, mint1: 105, decimals0: 233, decimals1: 234, sqrtPrice: 253 },
  'orca wp': { mint0: 101, mint1: 181, sqrtPrice: 65 },
  'meteora DLMM': { mint0: 88, mint1: 120, activeId: 76, binStep: 80 },
  pumpswap: { mint0: 43, mint1: 75, vault0: 139, vault1: 171 },
  'pump curve': { virtualToken: 8, virtualSol: 16, complete: 48 },
}

/** sha256("account:BondingCurve")[0..8]: the account really is a pump.fun curve. */
const CURVE_DISCRIMINATOR = Buffer.from([23, 183, 248, 55, 96, 216, 172, 96])

/** Mints and extra accounts (vaults) a pool needs read in the same request.
 * `assetMint` is required for a pump curve, whose account names no mint. */
export function poolDependencies(kind, data, assetMint) {
  const layout = LAYOUTS[kind]
  if (!layout) throw new Error(`unsupported pool kind: ${kind}`)
  if (kind === 'pump curve') {
    if (!assetMint) throw new Error('pump curve needs the asset mint')
    return { mints: [assetMint, WSOL_MINT], vaults: [] }
  }
  const mints = [key(data, layout.mint0), key(data, layout.mint1)]
  const vaults = layout.vault0 != null ? [key(data, layout.vault0), key(data, layout.vault1)] : []
  return { mints, vaults }
}

// (base / 10^4) ^ exp as a rational, exponentiation by squaring.
function binPrice(binStep, activeId) {
  let num = 1n
  let den = 1n
  let base = 10_000n + BigInt(binStep)
  let baseDen = 10_000n
  let e = BigInt(Math.abs(activeId))
  while (e > 0n) {
    if (e & 1n) {
      num *= base
      den *= baseDen
    }
    base *= base
    baseDen *= baseDen
    e >>= 1n
  }
  return activeId >= 0 ? { num, den } : { num: den, den: num }
}

/**
 * Price of token1 per token0 in whole-token units, as { num, den }.
 * `decimals` maps mint -> decimals; `vaultData` maps vault -> account data.
 */
function token1PerToken0(kind, data, mints, decimals, vaultData) {
  const layout = LAYOUTS[kind]
  const [d0, d1] = [decimals[mints[0]], decimals[mints[1]]]
  if (d0 == null || d1 == null) throw new Error('missing mint decimals')

  if (kind === 'pump curve') {
    if (data.length < 49 || !data.subarray(0, 8).equals(CURVE_DISCRIMINATOR)) throw new Error('not a pump.fun curve')
    if (data[layout.complete] !== 0) throw new Error('curve complete: the coin moved to PumpSwap')
    const tokens = u64(data, layout.virtualToken)
    const sol = u64(data, layout.virtualSol)
    if (tokens <= 0n || sol <= 0n) throw new Error('empty reserves')
    return { num: sol * pow10(d0), den: tokens * pow10(d1) }
  }

  if (kind === 'raydium standard') {
    const vaults = poolDependencies(kind, data).vaults
    const reserve0 = tokenAmount(vaultData[vaults[0]]) - u64(data, layout.pnl0)
    const reserve1 = tokenAmount(vaultData[vaults[1]]) - u64(data, layout.pnl1)
    if (reserve0 <= 0n || reserve1 <= 0n) throw new Error('empty reserves')
    return { num: reserve1 * pow10(d0), den: reserve0 * pow10(d1) }
  }
  if (kind === 'pumpswap') {
    const vaults = poolDependencies(kind, data).vaults
    const reserve0 = tokenAmount(vaultData[vaults[0]])
    const reserve1 = tokenAmount(vaultData[vaults[1]])
    if (reserve0 <= 0n || reserve1 <= 0n) throw new Error('empty reserves')
    return { num: reserve1 * pow10(d0), den: reserve0 * pow10(d1) }
  }
  if (kind === 'raydium CPMM') {
    // Vaults also hold fees owed to the protocol, fund and pool creator.
    const vaults = poolDependencies(kind, data).vaults
    const owed = (offsets) => offsets.reduce((sum, at) => sum + u64(data, at), 0n)
    const reserve0 = tokenAmount(vaultData[vaults[0]]) - owed(layout.fees0)
    const reserve1 = tokenAmount(vaultData[vaults[1]]) - owed(layout.fees1)
    if (reserve0 <= 0n || reserve1 <= 0n) throw new Error('empty reserves')
    return { num: reserve1 * pow10(d0), den: reserve0 * pow10(d1) }
  }
  if (kind === 'raydium CLMM' || kind === 'orca wp') {
    const sqrt = u128(data, layout.sqrtPrice)
    if (sqrt === 0n) throw new Error('zero sqrt price')
    return { num: sqrt * sqrt * pow10(d0), den: Q128 * pow10(d1) }
  }
  if (kind === 'meteora DLMM') {
    const activeId = data.readInt32LE(layout.activeId)
    const binStep = data.readUInt16LE(layout.binStep)
    const p = binPrice(binStep, activeId)
    return { num: p.num * pow10(d0), den: p.den * pow10(d1) }
  }
  throw new Error(`unsupported pool kind: ${kind}`)
}

/**
 * Quote units per one whole `assetMint`, oriented regardless of which side of
 * the pool the asset sits on. Returns { num, den, quoteMint }.
 */
export function assetPriceInQuote(kind, data, assetMint, decimals, vaultData) {
  const { mints } = poolDependencies(kind, data, assetMint)
  const p = token1PerToken0(kind, data, mints, decimals, vaultData)
  if (mints[0] === assetMint) return { ...p, quoteMint: mints[1] }
  if (mints[1] === assetMint) return { num: p.den, den: p.num, quoteMint: mints[0] }
  throw new Error(`pool does not contain ${assetMint}`)
}

/** Scales a rational to an integer with `decimals` digits, rounding down. */
export function toFixed(price, decimals) {
  return (price.num * pow10(decimals)) / price.den
}

export function multiply(a, b) {
  return { num: a.num * b.num, den: a.den * b.den }
}

/** Human-readable decimal string of a scaled integer (for logs and checks). */
export function formatScaled(value, decimals) {
  const s = value.toString().padStart(decimals + 1, '0')
  return `${s.slice(0, -decimals)}.${s.slice(-decimals)}`
}
