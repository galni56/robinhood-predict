#!/usr/bin/env node
// Prophet price service.
//
// Subscribes (accountSubscribe, confirmed) to every approved pool on mainnet,
// plus AMM vaults and the SOL/USDC pool, and records each change with its
// slot. This reconstructs exact state at any recent slot, which polling
// cannot. On request it signs a boundary attestation: prices from the last
// block strictly before T plus that block's direct child, bound to one
// game program.
//
// Missed updates are never papered over: a websocket reconnect, or a periodic
// resync that disagrees with the reconstructed state, marks a gap, and the
// service refuses to sign prices inside it (the game then cancels/voids and
// refunds by rule).
//
//   GET /prices                      latest prices for display (not settlement)
//   GET /attestation?program=..&target=..&sources=pool1,pool2
//       -> { message, instruction } base64; instruction is the Ed25519 precompile ix
//   GET /health
//
// Env: SOLANA_MAINNET_RPC_URL (use a paid RPC), SOLANA_MAINNET_WS_URL (optional),
// ORACLE_KEYPAIR (read here, never printed), PRICE_SERVICE_PORT (8790),
// BUFFER_SECONDS (1200), RESYNC_SECONDS (30).

import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { encodeAttestation, signedEd25519Instruction } from './attestation.mjs'
import { AccountHistory } from './history.mjs'
import { formatScaled } from './pools.mjs'
import { accountsFor, buildPlan, pricesFromData } from './snapshot.mjs'

const RPC = process.env.SOLANA_MAINNET_RPC_URL ?? 'https://api.mainnet-beta.solana.com'
const WS = process.env.SOLANA_MAINNET_WS_URL
const PORT = Number(process.env.PRICE_SERVICE_PORT ?? 8790)
const BUFFER_SECONDS = Number(process.env.BUFFER_SECONDS ?? 1200)
const RESYNC_SECONDS = Number(process.env.RESYNC_SECONDS ?? 30)
if (!process.env.ORACLE_KEYPAIR) throw new Error('ORACLE_KEYPAIR is required')
const oracle = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.ORACLE_KEYPAIR, 'utf8'))))

const registry = JSON.parse(readFileSync(new URL('../../../config/solana-assets.json', import.meta.url), 'utf8'))
const connection = new Connection(RPC, { commitment: 'confirmed', ...(WS ? { wsEndpoint: WS } : {}) })
const plan = await buildPlan(connection, registry)
const assetBySource = new Map(plan.assets.map((a) => [a.pool, a]))
const history = new AccountHistory()
let maxSlotSeen = 0
let ready = false
const slotTimes = [] // [slot, wall ms] samples, to prune by age

// ---------------------------------------------------------------- tracking

for (const account of plan.accounts) {
  connection.onAccountChange(
    new PublicKey(account),
    (info, context) => {
      history.record(account, context.slot, info.data)
      if (context.slot > maxSlotSeen) maxSlotSeen = context.slot
    },
    { commitment: 'confirmed' },
  )
}

async function fetchAll() {
  const { context, value } = await connection.getMultipleAccountsInfoAndContext(
    plan.accounts.map((a) => new PublicKey(a)),
    { commitment: 'confirmed' },
  )
  return { slot: context.slot, data: Object.fromEntries(plan.accounts.map((a, i) => [a, value[i]?.data])) }
}

async function baseline() {
  const { slot, data } = await fetchAll()
  for (const account of plan.accounts) history.record(account, slot, data[account])
  if (slot > maxSlotSeen) maxSlotSeen = slot
  return slot
}

// A dropped websocket can lose notifications. Everything since the last slot
// we saw is unknown until a fresh baseline after reconnect.
const socket = connection._rpcWebSocket
socket?.on?.('close', () => {
  const lostFrom = maxSlotSeen
  console.warn(`websocket closed at slot ~${lostFrom}; marking a gap until the next baseline`)
  socket.once('open', async () => {
    await new Promise((r) => setTimeout(r, 1500)) // let resubscriptions land
    try {
      const slot = await baseline()
      for (const account of plan.accounts) history.markGap(account, lostFrom, slot)
      console.log(`websocket reopened; baseline at slot ${slot}`)
    } catch (error) {
      console.warn(`baseline after reconnect failed: ${error.message}`)
    }
  })
})

// Periodic resync: if reconstructed state disagrees with a fresh read, some
// change was missed — mark it unknown since the last recorded change.
async function resync() {
  try {
    const { slot, data } = await fetchAll()
    await new Promise((r) => setTimeout(r, 3000)) // in-flight notifications for <= slot
    for (const account of plan.accounts) {
      let known
      try {
        known = history.stateAt(account, slot)
      } catch {
        known = undefined
      }
      if (!known || !known.equals(data[account])) {
        const last = [...(history.entries.get(account) ?? [])].filter((e) => e.slot <= slot).pop()?.slot ?? slot
        history.markGap(account, last, slot)
        history.record(account, slot, data[account])
        if (known) console.warn(`resync: ${account} differed at slot ${slot}; gap (${last}, ${slot})`)
      }
    }
    slotTimes.push([slot, Date.now()])
    const cutoffMs = Date.now() - BUFFER_SECONDS * 1000
    while (slotTimes.length > 1 && slotTimes[1][1] < cutoffMs) slotTimes.shift()
    if (slotTimes[0][1] < cutoffMs) history.prune(slotTimes[0][0])
  } catch (error) {
    console.warn(`resync failed: ${error.message}`)
  }
}

// --------------------------------------------------------------- boundaries

const blockCache = new Map()
async function block(slot) {
  if (!blockCache.has(slot)) {
    const b = await connection.getBlock(slot, {
      commitment: 'confirmed',
      transactionDetails: 'none',
      rewards: false,
      maxSupportedTransactionVersion: 0,
    })
    if (!b) throw new Error(`block ${slot} unavailable`)
    blockCache.set(slot, { slot, blockhash: b.blockhash, previousBlockhash: b.previousBlockhash, parentSlot: b.parentSlot, blockTime: b.blockTime })
    if (blockCache.size > 5000) blockCache.delete(blockCache.keys().next().value)
  }
  return blockCache.get(slot)
}

/** Slot whose block time is roughly `unix`, from recorded slot/time samples. */
function approximateSlot(unix) {
  const samples = slotTimes.length ? slotTimes : [[maxSlotSeen, Date.now()]]
  let best = samples[0]
  for (const s of samples) if (Math.abs(s[1] - unix * 1000) < Math.abs(best[1] - unix * 1000)) best = s
  return Math.max(0, best[0] + Math.round((unix * 1000 - best[1]) / 400))
}

const timeCache = new Map()
async function blockTime(slot) {
  if (!timeCache.has(slot)) {
    const t = await connection.getBlockTime(slot)
    if (t == null) throw new Error(`no block time for slot ${slot}`)
    timeCache.set(slot, t)
    if (timeCache.size > 20000) timeCache.delete(timeCache.keys().next().value)
  }
  return timeCache.get(slot)
}

/** Last produced block strictly before `target` and its direct child, found
 * by binary search over produced slots (block times are non-decreasing). */
async function boundaryBlocks(target) {
  if (maxSlotSeen === 0) throw new Error('not tracking yet')
  let from = Math.max(0, approximateSlot(target) - 60)
  let to = Math.min(maxSlotSeen, approximateSlot(target) + 60)
  for (let attempt = 0; attempt < 6; attempt++) {
    const range = await connection.getBlocks(from, to, 'confirmed')
    if (range.length < 2) throw new Error('boundary not yet observed; retry after the target time')
    if ((await blockTime(range[0])) >= target) { from -= 150; continue }
    if ((await blockTime(range[range.length - 1])) < target) {
      if (to >= maxSlotSeen) throw new Error('boundary not yet observed; retry after the target time')
      to = Math.min(maxSlotSeen, to + 150)
      continue
    }
    // range[lo] < target <= range[hi]
    let lo = 0
    let hi = range.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if ((await blockTime(range[mid])) < target) lo = mid
      else hi = mid
    }
    const prev = await block(range[lo])
    const next = await block(range[hi])
    if (next.parentSlot !== prev.slot || next.previousBlockhash !== prev.blockhash) {
      throw new Error(`block ${next.slot} is not the child of ${prev.slot}`)
    }
    if (prev.blockTime >= target || next.blockTime < target) throw new Error('block times disagree with getBlockTime')
    return { prev, next }
  }
  throw new Error('could not bracket the boundary')
}

async function attestation({ program, target, sources }) {
  const assets = sources.map((source) => {
    const asset = assetBySource.get(source)
    if (!asset) throw new Error(`unknown price source ${source}`)
    return asset
  })
  const { prev, next } = await boundaryBlocks(target)
  const latestData = Object.fromEntries(plan.accounts.map((a) => [a, history.latest(a)]))
  const needed = [...new Set(assets.flatMap((a) => accountsFor(plan, a, latestData)))]
  const data = Object.fromEntries(needed.map((account) => [account, history.stateAt(account, prev.slot)]))
  const { prices, errors } = pricesFromData(plan, data, assets)
  if (errors.length) throw new Error(errors.join('; '))

  const entries = assets.map((asset) => {
    const p = prices.get(asset.symbol)
    return { priceSource: asset.pool, price: p.scaled, decimals: p.decimals }
  })
  const message = encodeAttestation({ programId: program, target, prev, next, entries })
  const ix = signedEd25519Instruction(oracle, message)
  console.log(`attestation target=${target} prev=${prev.slot} next=${next.slot} entries=${entries.length}`)
  return {
    target,
    prevSlot: prev.slot,
    nextSlot: next.slot,
    nextBlockTime: next.blockTime,
    entries: entries.map((e) => ({ ...e, price: e.price.toString() })),
    message: message.toString('base64'),
    instruction: Buffer.from(ix.data).toString('base64'),
  }
}

// --------------------------------------------------------------------- http

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
  res.end(JSON.stringify(body))
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  try {
    if (url.pathname === '/prices') {
      if (!ready) return json(res, 503, { error: 'warming up' })
      const data = Object.fromEntries(plan.accounts.map((a) => [a, history.latest(a)]))
      const { prices } = pricesFromData(plan, data)
      const out = Object.fromEntries(
        [...prices].map(([symbol, p]) => [symbol, { price: formatScaled(p.scaled, p.decimals), raw: p.scaled.toString(), decimals: p.decimals }]),
      )
      return json(res, 200, { slot: maxSlotSeen, prices: out })
    }
    if (url.pathname === '/attestation') {
      const program = url.searchParams.get('program')
      const target = Number(url.searchParams.get('target'))
      const sources = (url.searchParams.get('sources') ?? '').split(',').filter(Boolean)
      if (!program || !Number.isInteger(target) || sources.length === 0) {
        return json(res, 400, { error: 'program, target and sources are required' })
      }
      return json(res, 200, await attestation({ program, target, sources }))
    }
    if (url.pathname === '/health') {
      return json(res, ready ? 200 : 503, { slot: maxSlotSeen, oracle: oracle.publicKey.toBase58(), accounts: plan.accounts.length })
    }
    json(res, 404, { error: 'not found' })
  } catch (error) {
    json(res, 409, { error: error.message })
  }
}).listen(PORT, () => {
  console.log(`price service on :${PORT} · ${plan.assets.length} assets · ${plan.accounts.length} subscriptions · oracle ${oracle.publicKey.toBase58()} · rpc ${new URL(RPC).host}`)
})

await new Promise((r) => setTimeout(r, 2000)) // subscriptions first, then the baseline
const start = await baseline()
slotTimes.push([start, Date.now()])
ready = true
console.log(`tracking from slot ${start}`)
setInterval(resync, RESYNC_SECONDS * 1000)
