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
//   GET /prices                      latest prices for display (not settlement);
//                                    meme entries also carry the mint supply
//   GET /attestation?program=..&target=..&sources=pool1,pool2
//       -> { message, instruction } base64; instruction is the Ed25519 precompile ix
//   GET /health
//
// RPC failover: SOLANA_MAINNET_RPC_URLS lists endpoints in order of preference
// (free ones are fine: the service holds subscriptions, so traffic does not
// grow with visitors). When the subscription feed goes silent or RPC calls
// keep failing (rate limit, outage), the service moves to the next endpoint,
// resubscribes, takes a fresh baseline and marks the switch as a gap, so no
// price from the unobserved window is ever signed.
//
// Env: SOLANA_MAINNET_RPC_URLS (comma list; or SOLANA_MAINNET_RPC_URL for one),
// SOLANA_MAINNET_WS_URLS / SOLANA_MAINNET_WS_URL (optional, same order),
// ORACLE_KEYPAIR (read here, never printed), PRICE_SERVICE_PORT (8790),
// PRICE_MAX_DEVIATION_BP (boundary sanity check, see sanity.mjs; 0 = off),
// PRICE_SANITY_WINDOW_SECONDS (30: the median window on each side),
// PRICE_SERVICE_HOST (127.0.0.1), BUFFER_SECONDS (1200), RESYNC_SECONDS (30),
// SUPPLY_REFRESH_SECONDS (600), STALE_NOTIFICATION_MS (30000),
// ALLOWED_PROGRAM_IDS (comma list; set in production),
// ALLOW_NON_MAINNET_PRICES=1 (explicit escape hatch for the mainnet genesis
// check).

import { readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { encodeAttestation, signedEd25519Instruction } from './attestation.mjs'
import { AccountHistory } from './history.mjs'
import { formatScaled } from './pools.mjs'
import { accountsFor, buildPlan, pricesFromData } from './snapshot.mjs'
import { checkBoundaryPrice } from './sanity.mjs'
import { poolDependencies } from './pools.mjs'

const list = (value) => (value ?? '').split(',').map((v) => v.trim()).filter(Boolean)
const RPC_URLS = list(process.env.SOLANA_MAINNET_RPC_URLS ?? process.env.SOLANA_MAINNET_RPC_URL)
if (RPC_URLS.length === 0) RPC_URLS.push('https://api.mainnet-beta.solana.com')
const WS_URLS = list(process.env.SOLANA_MAINNET_WS_URLS ?? process.env.SOLANA_MAINNET_WS_URL)
// Logs show the host only: provider URLs often carry an API key in the path or query.
const host = (url) => new URL(url).host
const FAILOVER_COOLDOWN_MS = 10_000
const RPC_FAILURES_BEFORE_FAILOVER = 3
const PORT = Number(process.env.PRICE_SERVICE_PORT ?? 8790)
// Loopback by default: nginx is the only public entry (and WSL forwards IPv4 loopback to Windows).
const HOST = process.env.PRICE_SERVICE_HOST ?? '127.0.0.1'
const BUFFER_SECONDS = Number(process.env.BUFFER_SECONDS ?? 1200)
// Boundary sanity check (owner sets the threshold; unset = off).
const MAX_DEVIATION_BP = Number(process.env.PRICE_MAX_DEVIATION_BP ?? 0)
const SANITY_WINDOW_SLOTS = Math.round(Number(process.env.PRICE_SANITY_WINDOW_SECONDS ?? 30) * 2.5)
const RESYNC_SECONDS = Number(process.env.RESYNC_SECONDS ?? 30)
const SUPPLY_REFRESH_SECONDS = Number(process.env.SUPPLY_REFRESH_SECONDS ?? 600)
if (!process.env.ORACLE_KEYPAIR) throw new Error('ORACLE_KEYPAIR is required')
const oracle = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.ORACLE_KEYPAIR, 'utf8'))))

const registry = JSON.parse(readFileSync(new URL('../../../config/solana-assets.json', import.meta.url), 'utf8'))
const connect = (index) => new Connection(RPC_URLS[index], { commitment: 'confirmed', ...(WS_URLS[index] ? { wsEndpoint: WS_URLS[index] } : {}) })

// Attestations sign real settlement prices, so refuse to track anything but
// Solana mainnet (a misconfigured RPC pointing at a test validator with
// cloned pools would otherwise get arbitrary prices signed). Localnet e2e
// also reads real mainnet pools, so this holds everywhere by default;
// ALLOW_NON_MAINNET_PRICES=1 is an explicit, deliberate escape hatch.
// Every endpoint is checked before it is used, including on failover.
const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
// Before the plan exists only one account can be probed; failover probes the
// full account list, since some endpoints accept small batches but not ours.
let probeAccounts = [new PublicKey(registry.assets[0].pool)]
async function usable(candidate, index) {
  try {
    const genesis = await candidate.getGenesisHash()
    if (genesis !== MAINNET_GENESIS && process.env.ALLOW_NON_MAINNET_PRICES !== '1') {
      console.warn(`skipping ${host(RPC_URLS[index])}: genesis ${genesis} is not Solana mainnet (set ALLOW_NON_MAINNET_PRICES=1 only if you mean it)`)
      return false
    }
    // The calls the service lives on; some free endpoints block them.
    const { context } = await candidate.getMultipleAccountsInfoAndContext(probeAccounts.slice(0, 100), { commitment: 'confirmed' })
    await candidate.getBlocks(context.slot - 5, context.slot, 'confirmed')
    return true
  } catch (error) {
    console.warn(`skipping ${host(RPC_URLS[index])}: ${error.message}`)
  }
  return false
}

let endpoint = -1
let connection
for (let index = 0; index < RPC_URLS.length && endpoint < 0; index++) {
  const candidate = connect(index)
  if (await usable(candidate, index)) {
    endpoint = index
    connection = candidate
  }
}
if (endpoint < 0) throw new Error('no usable Solana mainnet RPC endpoint')

// Optional allowlist of program ids /attestation may sign for. Unset, any
// requested program is signed (needed for localnet's generated ids) - set it
// in production.
const ALLOWED_PROGRAM_IDS = (process.env.ALLOWED_PROGRAM_IDS ?? '').split(',').map((v) => v.trim()).filter(Boolean)
if (ALLOWED_PROGRAM_IDS.length === 0) console.warn('ALLOWED_PROGRAM_IDS is unset; /attestation will sign for any requested program id')
const plan = await buildPlan(connection, registry)
probeAccounts = plan.accounts.map((a) => new PublicKey(a))
const assetBySource = new Map(plan.assets.map((a) => [a.pool, a]))
const history = new AccountHistory()
let maxSlotSeen = 0
let ready = false
// Wall-clock time of the last account notification (or baseline read). The
// tracked DEX pools change practically every slot on mainnet, so a silence
// longer than STALE_NOTIFICATION_MS means the subscription feed is dead even
// when the websocket never emitted `close`.
let lastNotificationAt = 0
const STALE_NOTIFICATION_MS = Number(process.env.STALE_NOTIFICATION_MS ?? 30_000)
const slotTimes = [] // [slot, wall ms] samples, to prune by age

// ---------------------------------------------------------------- tracking

let subscriptions = []
const subscribe = (account) => connection.onAccountChange(
  new PublicKey(account),
  (info, context) => {
    history.record(account, context.slot, info.data)
    if (context.slot > maxSlotSeen) maxSlotSeen = context.slot
    lastNotificationAt = Date.now()
  },
  { commitment: 'confirmed' },
)
function subscribeAll() {
  subscriptions = plan.accounts.map(subscribe)
  watchSocket(connection)
}

// getMultipleAccounts takes at most 100 accounts, so bigger plans are read
// in chunks; every account keeps the slot of the chunk that read it.
async function fetchAll() {
  const data = {}
  const slotOf = {}
  let slot = Infinity
  for (let i = 0; i < plan.accounts.length; i += 100) {
    const chunk = plan.accounts.slice(i, i + 100)
    const { context, value } = await connection.getMultipleAccountsInfoAndContext(chunk.map((a) => new PublicKey(a)), { commitment: 'confirmed' })
    chunk.forEach((a, k) => {
      data[a] = value[k]?.data
      slotOf[a] = context.slot
    })
    slot = Math.min(slot, context.slot)
  }
  return { slot, data, slotOf }
}

async function baseline() {
  const { slot, data, slotOf } = await fetchAll()
  for (const account of plan.accounts) history.record(account, slotOf[account], data[account])
  if (slot > maxSlotSeen) maxSlotSeen = slot
  lastNotificationAt = Date.now()
  return slot
}

// An outage opens a gap right away (nothing after the last slot seen is
// known) and only a successful baseline on a live subscription closes it, so
// a failed baseline can never let pre-outage state be signed as current.
function openGapsFrom(lostFrom) {
  for (const account of plan.accounts) history.openGap(account, lostFrom)
}

async function rebaseline(conn, label) {
  for (;;) {
    if (conn !== connection) return // superseded by a failover, which baselines itself
    try {
      const slot = await baseline()
      for (const account of plan.accounts) history.closeOpenGaps(account, slot)
      console.log(`${label}; baseline at slot ${slot}`)
      return slot
    } catch (error) {
      console.warn(`baseline (${label}) failed: ${error.message}; retrying`)
      noteRpcError(error)
      await new Promise((r) => setTimeout(r, 5_000))
    }
  }
}

// A dropped websocket can lose notifications: everything since the last slot
// we saw is unknown until a fresh baseline after the reconnect.
function watchSocket(conn) {
  const socket = conn._rpcWebSocket
  socket?.on?.('close', () => {
    if (conn !== connection) return // an endpoint we already left
    const lostFrom = maxSlotSeen
    openGapsFrom(lostFrom)
    console.warn(`websocket closed at slot ~${lostFrom}; prices after it are unknown until the next baseline`)
    socket.once('open', async () => {
      await new Promise((r) => setTimeout(r, 1500)) // let resubscriptions land
      await rebaseline(conn, 'websocket reopened')
    })
  })
}

// Moves to the next usable endpoint (or reconnects the only one). Everything
// after the last slot seen is a gap until the new baseline.
let switching = false
let lastSwitchAt = 0
let rpcFailures = 0
async function failover(reason) {
  if (switching || Date.now() - lastSwitchAt < FAILOVER_COOLDOWN_MS) return
  switching = true
  lastSwitchAt = Date.now()
  const lostFrom = maxSlotSeen
  const previous = connection
  openGapsFrom(lostFrom)
  try {
    for (let step = 1; step <= RPC_URLS.length; step++) {
      const index = (endpoint + step) % RPC_URLS.length
      const candidate = connect(index)
      if (await usable(candidate, index)) {
        endpoint = index
        connection = candidate
        break
      }
    }
    if (connection === previous) throw new Error('no other usable endpoint')
    for (const id of subscriptions) previous.removeAccountChangeListener(id).catch(() => {})
    previous._rpcWebSocket?.close?.()
    subscribeAll()
    await new Promise((r) => setTimeout(r, 1500)) // let subscriptions land
    rpcFailures = 0
    console.warn(`rpc failover (${reason}): now ${host(RPC_URLS[endpoint])}; gap from slot ${lostFrom}`)
    rebaseline(connection, `after failover to ${host(RPC_URLS[endpoint])}`)
  } catch (error) {
    console.warn(`rpc failover (${reason}) failed: ${error.message}`)
  } finally {
    switching = false
  }
}

// Rate limits and outages surface as failed calls; a few in a row move us on.
function noteRpcError(error) {
  if (!/\b(429|50[0-4])\b|Too Many|fetch failed|ECONN|ETIMEDOUT|socket hang up/i.test(String(error?.message ?? error))) return
  rpcFailures++
  if (rpcFailures >= RPC_FAILURES_BEFORE_FAILOVER) failover(`${rpcFailures} failed RPC calls`)
}

// Periodic resync: if reconstructed state disagrees with a fresh read, some
// change was missed — mark it unknown since the last recorded change.
async function resync() {
  try {
    const { slot: minSlot, data, slotOf } = await fetchAll()
    await new Promise((r) => setTimeout(r, 3000)) // in-flight notifications for <= slot
    for (const account of plan.accounts) {
      const slot = slotOf[account] ?? minSlot
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
    rpcFailures = 0
    slotTimes.push([minSlot, Date.now()])
    const cutoffMs = Date.now() - BUFFER_SECONDS * 1000
    while (slotTimes.length > 1 && slotTimes[1][1] < cutoffMs) slotTimes.shift()
    if (slotTimes[0][1] < cutoffMs) history.prune(slotTimes[0][0])
  } catch (error) {
    console.warn(`resync failed: ${error.message}`)
    noteRpcError(error)
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

/**
 * An asset's USD price at every recorded change of its accounts within
 * [fromSlot, toSlot] (plus the state at fromSlot), for the sanity median.
 * Slots inside a gap are skipped.
 */
function priceSamples(asset, accounts, fromSlot, toSlot) {
  const slots = new Set([fromSlot])
  for (const account of accounts) for (const e of history.entries.get(account) ?? []) if (e.slot > fromSlot && e.slot <= toSlot) slots.add(e.slot)
  const samples = []
  for (const slot of [...slots].sort((a, b) => a - b)) {
    try {
      const data = Object.fromEntries(accounts.map((account) => [account, history.stateAt(account, slot)]))
      const { prices } = pricesFromData(plan, data, [asset])
      const p = prices.get(asset.symbol)
      if (p) samples.push({ slot, price: p.scaled })
    } catch {
      // unknown state at this slot (gap): not a sample
    }
  }
  return samples
}

async function attestation({ program, target, sources }) {
  if (ALLOWED_PROGRAM_IDS.length > 0 && !ALLOWED_PROGRAM_IDS.includes(program)) {
    throw new Error(`program ${program} is not in ALLOWED_PROGRAM_IDS`)
  }
  const nowSec = Date.now() / 1000
  // The history buffer only spans BUFFER_SECONDS; a target outside it can
  // never be served honestly, and a future target is a malformed request.
  if (target > nowSec + 60) throw new Error('target is in the future')
  if (target < nowSec - BUFFER_SECONDS) throw new Error('target is older than the history buffer')
  const assets = [...new Set(sources)].map((source) => {
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
  if (MAX_DEVIATION_BP > 0) {
    // The median window reaches past the boundary: wait until it is observed.
    if (maxSlotSeen < prev.slot + SANITY_WINDOW_SLOTS) throw new Error('price window after the boundary not observed yet; retry shortly')
    for (const asset of assets) {
      const reason = checkBoundaryPrice({
        price: prices.get(asset.symbol).scaled,
        samples: priceSamples(asset, accountsFor(plan, asset, latestData), prev.slot - SANITY_WINDOW_SLOTS, prev.slot + SANITY_WINDOW_SLOTS),
        endSlot: prev.slot + SANITY_WINDOW_SLOTS,
        maxDeviationBp: MAX_DEVIATION_BP,
      })
      if (reason) {
        console.warn(`attestation target=${target}: ${asset.symbol} refused, ${reason}`)
        throw new Error(`price check failed for ${asset.symbol}: ${reason}`)
      }
    }
  }

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
    prevBlockTime: prev.blockTime,
    nextSlot: next.slot,
    nextBlockTime: next.blockTime,
    entries: entries.map((e) => ({ ...e, price: e.price.toString() })),
    message: message.toString('base64'),
    instruction: Buffer.from(ix.data).toString('base64'),
  }
}

// ------------------------------------------------------- display extras

// Meme mint supply, for the market cap the UI shows next to meme prices. One
// batched read every SUPPLY_REFRESH_SECONDS; display only, never signed.
// Mint layout (SPL Token and Token-2022): supply u64 at 36, decimals u8 at 44.
const memeMints = registry.assets.filter((a) => a.category === 'MEME').map((a) => ({ symbol: a.symbol, mint: new PublicKey(a.mint) }))

// ------------------------------------------------ extra assets (PumpSwap)

// The game server keeps a file of extra assets (EXTRA_ASSETS: the top
// PumpSwap coins, same shape as config/solana-assets.json). New ones are
// added on the fly, so the price history of running games is never lost.
// Nothing is removed until a restart. Reads are chunked by 100 accounts;
// MAX_ACCOUNTS caps the subscriptions.
const EXTRA_ASSETS = process.env.EXTRA_ASSETS
const MAX_ACCOUNTS = 250
let extraMtime = 0

async function loadExtraAssets() {
  if (!EXTRA_ASSETS) return
  let mtime
  try {
    mtime = statSync(EXTRA_ASSETS).mtimeMs
  } catch {
    return
  }
  if (mtime === extraMtime) return
  const list = JSON.parse(readFileSync(EXTRA_ASSETS, 'utf8')).assets ?? []
  const fresh = list.filter((a) => !assetBySource.has(a.pool) && !plan.assets.some((x) => x.symbol === a.symbol))
  const infos = fresh.length ? await connection.getMultipleAccountsInfo(fresh.map((a) => new PublicKey(a.pool)), 'confirmed') : []
  const added = []
  for (const [i, asset] of fresh.entries()) {
    if (!infos[i]) continue
    let deps
    try {
      deps = poolDependencies(asset.poolKind, infos[i].data)
    } catch (error) {
      console.warn(`extra asset ${asset.symbol}: ${error.message}`)
      continue
    }
    const accounts = [asset.pool, ...deps.vaults].filter((a) => !plan.accounts.includes(a))
    if (plan.accounts.length + accounts.length > MAX_ACCOUNTS) break
    const missing = deps.mints.filter((m) => plan.decimals[m] == null)
    if (missing.length) {
      const mintInfos = await connection.getMultipleAccountsInfo(missing.map((m) => new PublicKey(m)), 'confirmed')
      if (mintInfos.some((m) => !m)) continue
      missing.forEach((m, k) => { plan.decimals[m] = mintInfos[k].data[44] })
    }
    // Current state first, then live updates.
    const { context, value } = await connection.getMultipleAccountsInfoAndContext(accounts.map((a) => new PublicKey(a)), { commitment: 'confirmed' })
    accounts.forEach((a, k) => history.record(a, context.slot, value[k]?.data))
    plan.accounts.push(...accounts)
    plan.assets.push(asset)
    plan.kindByPool.set(asset.pool, asset.poolKind)
    assetBySource.set(asset.pool, asset)
    subscriptions.push(...accounts.map(subscribe))
    memeMints.push({ symbol: asset.symbol, mint: new PublicKey(asset.mint) })
    added.push(asset.symbol)
  }
  extraMtime = mtime
  if (added.length) console.log(`extra assets added: ${added.join(', ')} · ${plan.accounts.length} subscriptions`)
}
const supplies = new Map()

async function refreshSupplies() {
  try {
    const infos = await connection.getMultipleAccountsInfo(memeMints.map((m) => m.mint))
    infos.forEach((info, i) => {
      if (!info || info.data.length < 82) return
      supplies.set(memeMints[i].symbol, { raw: info.data.readBigUInt64LE(36).toString(), decimals: info.data[44] })
    })
  } catch (error) {
    console.warn(`supply refresh failed: ${error.message}`)
    noteRpcError(error)
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
        [...prices].map(([symbol, p]) => [symbol, {
          price: formatScaled(p.scaled, p.decimals),
          raw: p.scaled.toString(),
          decimals: p.decimals,
          ...(supplies.has(symbol) ? { supply: supplies.get(symbol) } : {}),
        }]),
      )
      // `updatedAt`/`now` share the server clock, so the client can compute
      // the real age of the snapshot instead of trusting its own receive time.
      return json(res, 200, { slot: maxSlotSeen, updatedAt: lastNotificationAt, now: Date.now(), prices: out })
    }
    if (url.pathname === '/attestation') {
      if (!ready) return json(res, 503, { error: 'warming up' })
      const program = url.searchParams.get('program')
      const target = Number(url.searchParams.get('target'))
      const sources = (url.searchParams.get('sources') ?? '').split(',').filter(Boolean)
      if (!program || !Number.isInteger(target) || sources.length === 0) {
        return json(res, 400, { error: 'program, target and sources are required' })
      }
      try {
        return json(res, 200, await attestation({ program, target, sources }))
      } catch (error) {
        noteRpcError(error)
        throw error
      }
    }
    if (url.pathname === '/health') {
      // A dead-but-not-closed websocket freezes the feed silently; surface it
      // so systemd/monitoring can restart the service instead of serving 200
      // while every attestation times out.
      const notificationAge = lastNotificationAt === 0 ? null : Date.now() - lastNotificationAt
      const feedStale = ready && (notificationAge === null || notificationAge > STALE_NOTIFICATION_MS)
      return json(res, ready && !feedStale ? 200 : 503, {
        slot: maxSlotSeen,
        oracle: oracle.publicKey.toBase58(),
        accounts: plan.accounts.length,
        rpc: host(RPC_URLS[endpoint]),
        rpcEndpoints: RPC_URLS.length,
        notificationAgeMs: notificationAge,
        feedStale,
      })
    }
    json(res, 404, { error: 'not found' })
  } catch (error) {
    json(res, 409, { error: error.message })
  }
}).listen(PORT, HOST, () => {
  console.log(`price service on :${PORT} · ${plan.assets.length} assets · ${plan.accounts.length} subscriptions · oracle ${oracle.publicKey.toBase58()} · rpc ${host(RPC_URLS[endpoint])} (${RPC_URLS.length} configured)`)
})

subscribeAll()
await new Promise((r) => setTimeout(r, 2000)) // subscriptions first, then the baseline
const start = await baseline()
slotTimes.push([start, Date.now()])
ready = true
console.log(`tracking from slot ${start}`)
setInterval(resync, RESYNC_SECONDS * 1000)
// Pools change practically every slot; a silent feed means a dead
// subscription even when the websocket never closed.
setInterval(() => {
  if (Date.now() - lastNotificationAt > STALE_NOTIFICATION_MS) failover('feed silent')
}, 5_000)
await refreshSupplies()
setInterval(refreshSupplies, SUPPLY_REFRESH_SECONDS * 1000)
await loadExtraAssets().catch((error) => console.warn(`extra assets: ${error.message}`))
setInterval(() => loadExtraAssets().catch((error) => console.warn(`extra assets: ${error.message}`)), 60_000)
