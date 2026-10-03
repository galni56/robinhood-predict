#!/usr/bin/env node
// Sanity check: price every approved asset from its pool and compare with
// Jupiter's aggregated USD price. Read-only.
//
// Usage: node scripts/solana/price-service/check-prices.mjs [--all]
// Env: SOLANA_MAINNET_RPC_URL (default: public mainnet RPC)

import { readFileSync } from 'node:fs'
import { Connection } from '@solana/web3.js'
import { formatScaled } from './pools.mjs'
import { buildPlan, takeSnapshot } from './snapshot.mjs'

const RPC = process.env.SOLANA_MAINNET_RPC_URL ?? 'https://api.mainnet-beta.solana.com'
const MAX_DEVIATION = 0.02

const registry = JSON.parse(readFileSync(new URL('../../../config/solana-assets.json', import.meta.url), 'utf8'))
const connection = new Connection(RPC, 'confirmed')
const plan = await buildPlan(connection, registry, { approvedOnly: !process.argv.includes('--all') })
const snap = await takeSnapshot(connection, plan)

const mints = plan.assets.map((a) => a.mint).join(',')
const jup = await (await fetch(`https://lite-api.jup.ag/price/v3?ids=${mints}`)).json()

let failures = snap.errors.length
console.log(`slot ${snap.slot}, ${plan.accounts.length} accounts in one read\n`)
console.log('asset      pool price (USD)        jupiter (USD)        diff')
for (const asset of plan.assets) {
  const p = snap.prices.get(asset.symbol)
  const ref = jup[asset.mint]?.usdPrice
  if (!p) continue
  const ours = Number(formatScaled(p.scaled, p.decimals))
  const diff = ref ? (ours - ref) / ref : NaN
  const bad = !(Math.abs(diff) <= MAX_DEVIATION)
  if (bad) failures++
  console.log(`${asset.symbol.padEnd(10)} ${String(ours.toPrecision(8)).padEnd(20)} ${String(ref?.toPrecision(8) ?? '—').padEnd(20)} ${(diff * 100).toFixed(3)}%${bad ? '  <-- CHECK' : ''}`)
}
for (const e of snap.errors) console.log(`ERROR ${e}`)
console.log(failures ? `\n${failures} asset(s) need attention` : '\nall prices within 2% of Jupiter')
process.exit(failures ? 1 : 0)
