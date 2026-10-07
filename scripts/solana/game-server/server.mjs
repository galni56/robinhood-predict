#!/usr/bin/env node
// Prophet game server (server-wallet version): players stake by sending SOL
// to the game wallet with a `prophet:` memo; this server applies the stakes,
// runs Asset Races and Price Arenas with boundary prices from the price
// service, and pays winners, refunds and creator fees from the game wallet.
// Rules: rules.mjs. Money flow and crash safety: engine.mjs.
//
// HTTP (default 127.0.0.1:8792):
//   GET  /health              solvency, last deposit scan, payout queue
//   GET  /config              stake limits, durations, approved assets
//   GET  /state               every race and arena with its payouts
//   GET  /games/<kind>/<id>   one game
//   GET  /history             activity, wallet totals, leaderboards
//   GET  /wallet/<address>    one wallet's stakes, payouts and game balance
//   GET  /nicknames           wallet -> nickname
//   POST /deposit {signature} apply a stake right after it confirmed
//   POST /cheer   {duel, seat}  a free cheer for a duel racer (rate-limited)
//   POST /action  {message, signature}  a wallet-signed action (create a
//        race or arena, add a lobby asset, change a prediction, nickname)
//
// Env:
//   SOLANA_RPC_URL        game cluster RPC (default localnet)
//   GAME_WALLET_KEYPAIR   game wallet keypair file (read to sign, never
//                         printed). "ephemeral" = throwaway key, localnet only.
//   GAME_DB               SQLite file (default ./.data/game-server.sqlite)
//   PRICE_SERVICE_URL     default http://127.0.0.1:8790
//   ORACLE_PUBKEY         price oracle public key; boundary prices must carry
//                         its signature (required off localnet)
//   SIGNING_DOMAINS       hosts whose signed actions are accepted, comma
//                         separated (required on mainnet)
//   BACKUP_DIR            hourly VACUUM INTO copies (default <db dir>/backups)
//   BACKUP_KEEP           how many backups to keep (default 48)
//   ADOPT_WALLET=1        first start on a wallet that already has history
//                         (never set it to recover a lost database)
//   COLD_WALLET           owner's wallet for swept surplus (optional)
//   ADMIN_WALLET          creator of platform races (default: game wallet)
//   PLATFORM_RACES        schedule file (default config/platform-races.json)
//   GAME_SERVER_PORT / GAME_SERVER_HOST, TICK_MS (3000),
//   PRIORITY_MICROLAMPORTS (0), ALLOWED_ORIGINS (comma list, default *)
//   EXTRA_ASSETS          PumpSwap catalog file it writes and the price
//                         service reads (default ./.data/pumpswap-assets.json)
//   PUMPSWAP_REFRESH_MINUTES (15; 0 = off)
//   PUBLIC_DATA_DIR       last-known data the site shows while the services
//                         are off (pumpswap.json); nginx serves it as static
//                         files (default ./.data/public)

import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { openDatabase } from './db.mjs'
import { createChain, isAddress } from './chain.mjs'
import { catalogAssets, createEngine } from './engine.mjs'
import { createPriceClient } from './prices.mjs'
import { RuleError } from './rules.mjs'
import { fetchPumpSwapPools, fetchTokenPools, pumpFunMints, selectPumpSwapAssets } from './pumpswap.mjs'

// Coins launched from the Prophet launchpad (src/chain/pumpLaunch.ts): their
// create transaction carries this memo. Recorded mints join the PumpSwap
// list ahead of the rest once they graduate, marked "made on Prophet".
const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
const LAUNCH_MEMO = 'prophet:launch'
const MAX_LAUNCHES_WATCHED = 40
import { gameView, historyView, walletView } from './views.mjs'
import { toJson } from './db.mjs'

const ROOT = new URL('../../../', import.meta.url)
const RPC = process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899'
// The cluster comes from the genesis hash, never from the URL: a tunnel or
// local proxy to mainnet must not count as "localnet" (that would allow a
// throwaway game wallet to take real stakes), and signed messages bind to
// this label.
const GENESIS = {
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d': 'mainnet',
  EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG: 'devnet',
  '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY': 'testnet',
}
const CLUSTER = GENESIS[await new Connection(RPC, 'confirmed').getGenesisHash()] ?? 'localnet'
const PORT = Number(process.env.GAME_SERVER_PORT ?? 8792)
const HOST = process.env.GAME_SERVER_HOST ?? '127.0.0.1'
const TICK_MS = Number(process.env.TICK_MS ?? 3_000)
const DB_PATH = resolve(process.env.GAME_DB ?? fileURLToPath(new URL('.data/game-server.sqlite', ROOT)))
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim())
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

function loadWallet() {
  const path = process.env.GAME_WALLET_KEYPAIR
  if (!path) throw new Error('GAME_WALLET_KEYPAIR is required (a keypair file the owner created)')
  if (path === 'ephemeral') {
    if (CLUSTER !== 'localnet') throw new Error('an ephemeral game wallet is for localnet only')
    return Keypair.generate()
  }
  // The hot key must not be readable by other users on the box.
  if (process.platform !== 'win32' && (statSync(path).mode & 0o077) !== 0) {
    const message = `${path} is readable by group/others; run: chmod 600 ${path}`
    if (CLUSTER !== 'localnet') throw new Error(message)
    console.warn(message)
  }
  return Keypair.fromSecretKey(Uint8Array.from(readJson(path)))
}

// On mainnet the hot wallet must have somewhere to sweep surplus to.
if (CLUSTER === 'mainnet' && !process.env.COLD_WALLET) throw new Error('COLD_WALLET is required on mainnet')
for (const [name, value] of [['COLD_WALLET', process.env.COLD_WALLET], ['ADMIN_WALLET', process.env.ADMIN_WALLET]]) {
  if (value && !isAddress(value)) throw new Error(`${name} is not a valid address`)
}

const wallet = loadWallet()
mkdirSync(dirname(DB_PATH), { recursive: true })
const db = openDatabase(DB_PATH)
const chain = createChain({ rpcUrl: RPC, wallet, priorityMicroLamports: Number(process.env.PRIORITY_MICROLAMPORTS ?? 0) })
// Settlement prices must carry the pinned oracle's signature; only a
// localnet stand may run without one.
const ORACLE_PUBKEY = process.env.ORACLE_PUBKEY?.trim() || null
if (ORACLE_PUBKEY && !isAddress(ORACLE_PUBKEY)) throw new Error('ORACLE_PUBKEY is not a valid address')
if (!ORACLE_PUBKEY && CLUSTER !== 'localnet') throw new Error(`ORACLE_PUBKEY is required on ${CLUSTER}: settlement prices are verified against it`)
if (!ORACLE_PUBKEY) console.warn('ORACLE_PUBKEY unset: boundary prices are NOT signature-checked (localnet only)')
// Hosts (location.host) whose signed actions are accepted. Required on
// mainnet so signatures phished on look-alike domains are rejected.
const SIGNING_DOMAINS = process.env.SIGNING_DOMAINS ? process.env.SIGNING_DOMAINS.split(',').map((d) => d.trim()).filter(Boolean) : null
if (!SIGNING_DOMAINS && CLUSTER === 'mainnet') throw new Error('SIGNING_DOMAINS is required on mainnet (e.g. prophetmarkets.fun)')
const PRICE_SERVICE_URL = process.env.PRICE_SERVICE_URL ?? 'http://127.0.0.1:8790'
const prices = createPriceClient(PRICE_SERVICE_URL, chain.address, ORACLE_PUBKEY)
const baseCatalog = readJson(new URL('config/solana-assets.json', ROOT))
const EXTRA_ASSETS = resolve(process.env.EXTRA_ASSETS ?? fileURLToPath(new URL('.data/pumpswap-assets.json', ROOT)))
const readExtra = () => {
  try {
    return readJson(EXTRA_ASSETS).assets ?? []
  } catch {
    return []
  }
}
const allAssets = (extra) => catalogAssets({ assets: [...baseCatalog.assets, ...extra] })
const assets = allAssets(readExtra())
const schedulePath = process.env.PLATFORM_RACES ?? new URL('config/platform-races.json', ROOT)
const engine = createEngine({
  db,
  chain,
  prices,
  assets,
  cluster: CLUSTER,
  coldWallet: process.env.COLD_WALLET || null,
  admin: process.env.ADMIN_WALLET || null,
  adoptWallet: process.env.ADOPT_WALLET === '1',
  signingDomains: SIGNING_DOMAINS,
  // A short arena lobby makes the local stand quick to click through.
  options: CLUSTER === 'localnet' && process.env.ARENA_LOBBY_SECONDS ? { arenaLobbyDuration: Number(process.env.ARENA_LOBBY_SECONDS) } : {},
})

// ------------------------------------------------------------------- http

// Every visitor polls the same snapshot; build it at most once a second.
const cache = new Map()
function cached(key, build) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 1_000) return hit.body
  const body = toJson(build())
  cache.set(key, { at: Date.now(), body })
  return body
}
const invalidate = () => cache.clear()

let solvency = null
async function refreshSolvency() {
  try {
    const s = await engine.solvency()
    solvency = { balance: s.balance.toString(), owed: s.owed.toString(), surplus: s.surplus.toString(), solvent: s.balance >= s.owed, at: Date.now() }
    if (!solvency.solvent) console.error(`INSOLVENT: game wallet holds ${s.balance}, owes ${s.owed}`)
  } catch (error) {
    console.warn(`solvency check: ${error.message}`)
  }
}

// A few writes per minute per address is plenty for a player.
const buckets = new Map()
// Full buckets carry no information; drop them so the map cannot grow forever.
setInterval(() => {
  const cutoff = Date.now() - 120_000
  for (const [key, bucket] of buckets) if (bucket.at < cutoff) buckets.delete(key)
}, 60_000).unref()
/** `perMinute` writes a minute per key (an address, or cheer:<address>). */
function allowWrite(ip, perMinute = 30) {
  const now = Date.now()
  const bucket = buckets.get(ip) ?? { tokens: perMinute, at: now }
  bucket.tokens = Math.min(perMinute, bucket.tokens + ((now - bucket.at) / 60_000) * perMinute)
  bucket.at = now
  buckets.set(ip, bucket)
  if (bucket.tokens < 1) return false
  bucket.tokens -= 1
  return true
}

function send(req, res, status, body) {
  const origin = req.headers.origin
  const allow = ORIGINS.includes('*') ? '*' : ORIGINS.includes(origin) ? origin : ORIGINS[0]
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
  })
  res.end(typeof body === 'string' ? body : toJson(body))
}

async function readBody(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 16_384) throw new RuleError('BodyTooLarge')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    throw new RuleError('BadJson')
  }
}

const games = () => db.allGames()

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname.replace(/\/+$/, '') || '/'
  try {
    if (req.method === 'OPTIONS') return send(req, res, 204, '')
    if (req.method === 'GET') {
      if (path === '/health') {
        const pending = db.payouts('pending').length + db.payouts('sent').length
        const stuck = db.payouts('stuck').length
        const attention = db.attentionCount()
        const priceService = await fetch(`${PRICE_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3_000) }).then((r) => r.ok).catch(() => false)
        const healthy = solvency?.solvent !== false && stuck === 0 && priceService && Date.now() / 1000 - engine.lastScan.at < 60
        return send(req, res, healthy ? 200 : 503, { cluster: CLUSTER, gameWallet: chain.address, lastScan: engine.lastScan, payouts: { pending, stuck }, deposits: { needAttention: attention }, priceService, solvency })
      }
      if (path === '/config') return send(req, res, 200, cached('config', () => engine.config()))
      if (path === '/state') {
        return send(req, res, 200, cached('state', () => {
          const all = games()
          return {
            cluster: CLUSTER,
            gameWallet: chain.address,
            now: Math.floor(Date.now() / 1000),
            races: all.filter((g) => g.kind === 'race').map((g) => gameView(db, g)),
            arenas: all.filter((g) => g.kind === 'arena').map((g) => gameView(db, g)),
            duels: all.filter((g) => g.kind === 'duel').map((g) => gameView(db, g)),
            shots: all.filter((g) => g.kind === 'shot').map((g) => gameView(db, g)),
          }
        }))
      }
      const game = /^\/games\/(race|arena|duel|shot)\/(\d+)$/.exec(path)
      if (game) {
        const state = db.getGame(game[1], Number(game[2]))
        return state ? send(req, res, 200, gameView(db, state)) : send(req, res, 404, { error: 'GameNotFound' })
      }
      if (path === '/history') return send(req, res, 200, cached('history', () => historyView(db, CLUSTER, chain.address, games())))
      const walletPath = /^\/wallet\/([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(path)
      if (walletPath && isAddress(walletPath[1])) return send(req, res, 200, walletView(db, walletPath[1]))
      if (path === '/nicknames') return send(req, res, 200, cached('nicknames', () => db.nicknames()))
      if (path === '/launches') return send(req, res, 200, { launches: launches() })
      return send(req, res, 404, { error: 'NotFound' })
    }
    if (req.method === 'POST') {
      // Behind nginx every request comes from 127.0.0.1. The visitor is
      // X-Real-IP, or the RIGHTMOST X-Forwarded-For hop (the one nginx
      // appended) - the leftmost entries are whatever the client sent.
      const remote = req.socket.remoteAddress ?? ''
      const proxied = /^(::ffff:)?127\.0\.0\.1$|^::1$/.test(remote)
      const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',').map((h) => h.trim()).filter(Boolean)
      const ip = proxied ? String(req.headers['x-real-ip'] ?? forwarded.at(-1) ?? remote).trim() : remote
      if (path === '/cheer') {
        if (!allowWrite(`cheer:${ip}`, 60)) return send(req, res, 429, { error: 'TooManyRequests' })
        const body = await readBody(req)
        const cheers = engine.cheer(Number(body.duel), Number(body.seat))
        invalidate()
        return send(req, res, 200, { cheers })
      }
      if (!allowWrite(ip)) return send(req, res, 429, { error: 'TooManyRequests' })
      const body = await readBody(req)
      if (path === '/launch') {
        // Proof is on chain: a successful pump.fun create signed by the new
        // mint, with our memo. Nothing here moves money.
        const { mint, signature } = body
        if (!isAddress(mint) || typeof signature !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) throw new RuleError('BadLaunch')
        const known = launches().find((l) => l.mint === mint)
        if (known) return send(req, res, 200, known)
        // Version-1 transactions (not made by our launchpad) cannot be read: refused, not a crash.
        const tx = await chain.launchTransaction(signature).catch(() => { throw new RuleError('UnreadableLaunch') })
        if (!tx) return send(req, res, 202, { status: 'pending' })
        if (!tx.ok || !tx.signers.includes(mint) || !tx.programs.includes(PUMP_PROGRAM) || !tx.memos.some((m) => m.includes(LAUNCH_MEMO))) throw new RuleError('NotAProphetLaunch')
        const record = { mint, wallet: tx.signers[0], signature, at: tx.blockTime ?? Math.floor(Date.now() / 1000) }
        db.setMeta('prophet_launches', JSON.stringify([record, ...launches()].slice(0, 500)))
        console.log(`launch recorded: ${mint} by ${record.wallet}`)
        return send(req, res, 200, record)
      }
      if (path === '/deposit') {
        if (typeof body.signature !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(body.signature)) throw new RuleError('BadSignature')
        const result = await engine.ingest(body.signature)
        invalidate()
        return send(req, res, result.status === 'pending' ? 202 : 200, result)
      }
      if (path === '/action') {
        const result = engine.act({ message: body.message, signature: body.signature })
        invalidate()
        return send(req, res, 200, result)
      }
      return send(req, res, 404, { error: 'NotFound' })
    }
    return send(req, res, 405, { error: 'MethodNotAllowed' })
  } catch (error) {
    if (error instanceof RuleError) return send(req, res, 400, { error: error.code })
    console.warn(`${req.method} ${path}: ${error.message}`)
    return send(req, res, 500, { error: 'ServerError' })
  }
})

// The PumpSwap meme catalog: refreshed every PUMPSWAP_REFRESH_MINUTES and
// written for the price service, which starts tracking new pools on the fly.
const PUMPSWAP_MINUTES = Number(process.env.PUMPSWAP_REFRESH_MINUTES ?? 15)
// Read on every refresh: adding a coin to the file (and git pull) removes it
// within one refresh, no restart needed.
function readBlocklist() {
  try {
    const list = readJson(new URL('config/pumpswap-blocklist.json', ROOT))
    return { mints: new Set(list.mints ?? []), symbols: new Set((list.symbols ?? []).map((s) => String(s).toUpperCase())) }
  } catch {
    return { mints: new Set(), symbols: new Set() }
  }
}
function launches() {
  try {
    return JSON.parse(db.getMeta('prophet_launches') ?? '[]')
  } catch {
    return []
  }
}

async function refreshPumpSwap() {
  try {
    const previous = readExtra()
    const pools = await fetchPumpSwapPools()
    // Our launches may be too small for the volume-sorted pages: ask for them directly.
    const launched = new Set(launches().slice(0, MAX_LAUNCHES_WATCHED).map((l) => l.mint))
    const seen = new Set(pools.map((p) => p.mint))
    pools.push(...await fetchTokenPools([...launched].filter((m) => !seen.has(m))).catch(() => []))
    const takenSymbols = new Set(baseCatalog.assets.map((a) => a.symbol.toUpperCase()))
    // Coins launched from our site have ordinary mint addresses: confirm them by their pump.fun curve.
    const others = [...new Set(pools.map((p) => p.mint).filter((m) => m && !m.endsWith('pump')))]
    const pumpMints = others.length ? await pumpFunMints(chain.connection, others, PublicKey).catch(() => new Set()) : new Set()
    const extra = selectPumpSwapAssets(pools, { takenSymbols, previous, keepSymbols: engine.liveSymbols(), pumpMints, blocked: readBlocklist(), launched })
    mkdirSync(dirname(EXTRA_ASSETS), { recursive: true })
    writeFileSync(`${EXTRA_ASSETS}.tmp`, JSON.stringify({ updatedAt: new Date().toISOString(), source: 'pumpswap', assets: extra }, null, 1))
    renameSync(`${EXTRA_ASSETS}.tmp`, EXTRA_ASSETS)
    engine.setAssets(allAssets(extra))
    invalidate()
    console.log(`pumpswap: ${extra.length} coins (${extra.map((a) => a.symbol).join(', ')})`)
  } catch (error) {
    console.warn(`pumpswap refresh: ${error.message}`)
  }
}
if (PUMPSWAP_MINUTES > 0) {
  void refreshPumpSwap()
  setInterval(refreshPumpSwap, PUMPSWAP_MINUTES * 60_000)
}

// Last-known PumpSwap coins with prices, rewritten every few minutes. The
// site falls back to it when the game server is off, so nothing goes empty.
const PUBLIC_DATA_DIR = resolve(process.env.PUBLIC_DATA_DIR ?? fileURLToPath(new URL('.data/public', ROOT)))
async function writeLastData() {
  try {
    const prices = await fetch(`${process.env.PRICE_SERVICE_URL ?? 'http://127.0.0.1:8790'}/prices`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json())
    const assets = engine.config().assets.filter((a) => a.source === 'pumpswap').map((a) => ({
      ...a,
      price: prices.prices?.[a.symbol] ? { raw: prices.prices[a.symbol].raw, decimals: prices.prices[a.symbol].decimals } : null,
    }))
    if (assets.length === 0) return
    mkdirSync(PUBLIC_DATA_DIR, { recursive: true })
    const file = `${PUBLIC_DATA_DIR}/pumpswap.json`
    writeFileSync(`${file}.tmp`, toJson({ capturedAt: new Date().toISOString(), assets }))
    renameSync(`${file}.tmp`, file)
  } catch (error) {
    console.warn(`last data: ${error.message}`)
  }
}
setTimeout(writeLastData, 90_000)
setInterval(writeLastData, 5 * 60_000)

await engine.init()
await refreshSolvency()
// Listening starts only after init: before it, a POSTed historical signature
// could be applied as a fresh stake (and refunded) ahead of the history
// reconciliation that marks it pre-existing.
server.listen(PORT, HOST, () => {
  console.log(`game server on ${HOST}:${PORT} · ${CLUSTER} · game wallet ${chain.address} · ${assets.length} assets · db ${DB_PATH}`)
})
// Hourly online backups of the database (the only record of who staked
// what); the newest BACKUP_KEEP copies are kept.
const BACKUP_DIR = resolve(process.env.BACKUP_DIR ?? `${dirname(DB_PATH)}/backups`)
const BACKUP_KEEP = Number(process.env.BACKUP_KEEP ?? 48)
function backupDatabase() {
  try {
    mkdirSync(BACKUP_DIR, { recursive: true })
    db.backup(`${BACKUP_DIR}/game-server-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`)
    const files = readdirSync(BACKUP_DIR).filter((f) => f.startsWith('game-server-')).sort()
    for (const old of files.slice(0, Math.max(0, files.length - BACKUP_KEEP))) rmSync(`${BACKUP_DIR}/${old}`)
  } catch (error) {
    console.error(`backup: ${error.message}`)
  }
}
if (DB_PATH !== ':memory:') {
  backupDatabase()
  setInterval(backupDatabase, 60 * 60_000).unref()
}

let ticks = 0
let tickInFlight = null
const tickTimer = setInterval(async () => {
  if (tickInFlight) return
  let done
  tickInFlight = new Promise((r) => (done = r))
  try {
    await engine.tick()
    try {
      engine.fillSchedule(readJson(schedulePath))
    } catch (error) {
      console.warn(`schedule: ${error.message}`)
    }
    if (ticks++ % 10 === 0) await refreshSolvency()
    invalidate()
  } catch (error) {
    console.warn(`tick: ${error.message}`)
  } finally {
    tickInFlight = null
    done()
  }
}, TICK_MS)

// Graceful stop (systemd sends SIGTERM): no new ticks or requests, let the
// tick in flight finish (a payout may be between sign and store), close the
// database cleanly.
let stopping = false
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    if (stopping) return
    stopping = true
    console.log(`${signal}: stopping`)
    clearInterval(tickTimer)
    server.close()
    await tickInFlight
    db.close()
    process.exit(0)
  })
}
process.on('unhandledRejection', (error) => console.error(`unhandled rejection: ${error?.stack ?? error}`))
