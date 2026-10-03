// Reads every approved asset's pool (plus AMM vaults and the SOL/USDC pool)
// in ONE getMultipleAccountsInfo call, so all prices come from the same slot,
// and prices them in USD.

import { PublicKey } from '@solana/web3.js'
import { USDC_MINT, WSOL_MINT, assetPriceInQuote, mintDecimals, multiply, poolDependencies, toFixed } from './pools.mjs'

const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size))

/** Static plan: which accounts to read and the mint decimals, resolved once. */
export async function buildPlan(connection, registry, { approvedOnly = true } = {}) {
  const assets = registry.assets.filter((a) => !approvedOnly || a.approved)
  const solAsset = registry.assets.find((a) => a.symbol === 'SOL')
  const pools = [...new Set([...assets.map((a) => a.pool), solAsset.pool])]
  const poolInfos = await connection.getMultipleAccountsInfo(pools.map((p) => new PublicKey(p)), 'confirmed')

  const kindByPool = new Map([...assets, solAsset].map((a) => [a.pool, a.poolKind]))
  const vaults = []
  const mints = new Set([USDC_MINT, WSOL_MINT])
  pools.forEach((pool, i) => {
    if (!poolInfos[i]) throw new Error(`pool ${pool} not found`)
    const deps = poolDependencies(kindByPool.get(pool), poolInfos[i].data)
    deps.mints.forEach((m) => mints.add(m))
    vaults.push(...deps.vaults)
  })

  const decimals = {}
  for (const group of chunk([...mints], 100)) {
    const infos = await connection.getMultipleAccountsInfo(group.map((m) => new PublicKey(m)), 'confirmed')
    group.forEach((mint, i) => {
      if (!infos[i]) throw new Error(`mint ${mint} not found`)
      decimals[mint] = mintDecimals(infos[i].data)
    })
  }

  const accounts = [...pools, ...new Set(vaults)]
  if (accounts.length > 100) throw new Error(`plan reads ${accounts.length} accounts; split it`)
  return { assets, solAsset, kindByPool, accounts, decimals }
}

/**
 * One consistent snapshot: { slot, prices: Map(symbol -> { scaled, decimals, priceSource }) }.
 * Assets quoted in SOL are converted with the SOL/USDC pool from the same read.
 */
export async function takeSnapshot(connection, plan, commitment = 'confirmed') {
  const { context, value } = await connection.getMultipleAccountsInfoAndContext(
    plan.accounts.map((a) => new PublicKey(a)),
    { commitment },
  )
  const data = Object.fromEntries(plan.accounts.map((a, i) => [a, value[i]?.data]))
  return { slot: context.slot, ...pricesFromData(plan, data) }
}

/** Accounts an asset's USD price depends on: its pool, AMM vaults, and the
 * SOL/USDC pool (plus its vaults) when the asset is quoted in SOL. */
export function accountsFor(plan, asset, data) {
  const own = [asset.pool, ...poolDependencies(asset.poolKind, data[asset.pool]).vaults]
  const quotedInSol = poolDependencies(asset.poolKind, data[asset.pool]).mints.includes(WSOL_MINT) && asset.mint !== WSOL_MINT
  if (!quotedInSol && asset.symbol !== 'SOL') return own
  const sol = plan.solAsset
  return [...new Set([...own, sol.pool, ...poolDependencies(sol.poolKind, data[sol.pool]).vaults])]
}

/** USD prices from account data (account -> Buffer), however it was obtained. */
export function pricesFromData(plan, data, assets = plan.assets) {
  const priceOf = (asset) => assetPriceInQuote(asset.poolKind, data[asset.pool], asset.mint, plan.decimals, data)

  // SOL/USD is only needed for assets quoted in WSOL. Attestations pass only
  // the accounts the requested assets depend on (accountsFor), so for a
  // purely USDC-quoted set the SOL pool is absent from `data` - computing it
  // eagerly here used to abort the whole attestation with a TypeError.
  let solUsdCached
  const solUsd = () => {
    if (solUsdCached === undefined) {
      solUsdCached = priceOf(plan.solAsset)
      if (solUsdCached.quoteMint !== USDC_MINT) throw new Error('SOL pool must be quoted in USDC')
    }
    return solUsdCached
  }

  const prices = new Map()
  const errors = []
  for (const asset of assets) {
    try {
      const inQuote = priceOf(asset)
      const usd = inQuote.quoteMint === USDC_MINT
        ? inQuote
        : inQuote.quoteMint === WSOL_MINT
          ? multiply(inQuote, solUsd())
          : null
      if (!usd) throw new Error(`unsupported quote ${inQuote.quoteMint}`)
      prices.set(asset.symbol, {
        scaled: toFixed(usd, asset.priceDecimals),
        decimals: asset.priceDecimals,
        priceSource: asset.pool,
      })
    } catch (error) {
      errors.push(`${asset.symbol}: ${error.message}`)
    }
  }
  return { prices, errors }
}
