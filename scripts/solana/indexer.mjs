#!/usr/bin/env node
// Prophet history indexer.
//
// Reads every transaction of the games program, decodes the Anchor events it
// emitted (bets, entries, results, claims, refunds), combines them with the
// current race/arena accounts, and serves one JSON snapshot for the
// portfolio, leaderboard and archive. One indexer per deployment keeps RPC
// load independent of how many people have the site open.
//
//   GET /history   full snapshot          GET /health
//
// Progress (decoded events + newest signature) persists to INDEXER_STATE so a
// restart only reads new transactions.
//
// Each race/arena row also carries its raw account data (base64) so the
// frontend decodes it with the same IDL code it uses for direct reads.
//
// Env: SOLANA_RPC_URL (game cluster, default localnet), GAMES_PROGRAM_ID
// (default: the IDL address), INDEXER_PORT (8791), INDEXER_INTERVAL_MS (5000), INDEXER_STATE (default ~/.prophet/indexer-<cluster>.json),
// ACTIVITY_LIMIT (500).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import anchor from '@anchor-lang/core'
import { Connection, PublicKey } from '@solana/web3.js'

const { AnchorProvider, BorshCoder, EventParser, Program } = anchor
const ROOT = new URL('../../', import.meta.url)
const RPC = process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899'
const PORT = Number(process.env.INDEXER_PORT ?? 8791)
const INTERVAL = Number(process.env.INDEXER_INTERVAL_MS ?? 5_000)
const ACTIVITY_LIMIT = Number(process.env.ACTIVITY_LIMIT ?? 500)
const cluster = /127\.0\.0\.1|localhost/.test(RPC) ? 'localnet' : /devnet/.test(RPC) ? 'devnet' : 'mainnet'
const STATE = process.env.INDEXER_STATE ?? join(homedir(), '.prophet', `indexer-${cluster}.json`)

const idl = JSON.parse(readFileSync(new URL('src/solana/idl/prophet_games.json', ROOT), 'utf8'))
const catalog = JSON.parse(readFileSync(new URL('config/solana-assets.json', ROOT), 'utf8'))
const connection = new Connection(RPC, 'confirmed')
const readOnly = { publicKey: PublicKey.default, signTransaction: async () => { throw new Error('read-only') }, signAllTransactions: async () => { throw new Error('read-only') } }
if (process.env.GAMES_PROGRAM_ID) idl.address = new PublicKey(process.env.GAMES_PROGRAM_ID).toBase58()
const program = new Program(idl, new AnchorProvider(connection, readOnly, { commitment: 'confirmed' }))
const parser = new EventParser(program.programId, new BorshCoder(idl))
const NATIVE_SOL = PublicKey.default.toBase58()
const symbolBySource = new Map(catalog.assets.map((a) => [a.pool, a.symbol]))

// ------------------------------------------------------------------ state

/** { genesis, newest: signature | null, events: [{ name, data, signature, slot, time }] } */
const genesis = await connection.getGenesisHash()
let state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null
if (!state || state.genesis !== genesis) {
  // New cluster or a reset local validator: saved history belongs to another chain.
  if (state) console.log('genesis changed; starting history from scratch')
  state = { genesis, newest: null, events: [] }
}
let snapshot = null

function save() {
  mkdirSync(dirname(STATE), { recursive: true })
  writeFileSync(STATE, JSON.stringify(state))
}

// Event fields come back as BN / PublicKey / enum objects; store plain JSON.
function plain(value) {
  if (value == null) return value
  if (value instanceof PublicKey) return value.toBase58()
  if (typeof value === 'object' && typeof value.toString === 'function' && value.constructor?.name === 'BN') return value.toString()
  if (Array.isArray(value)) return value.map(plain)
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    // Anchor enums decode as { variantName: {} }
    if (keys.length === 1 && value[keys[0]] && typeof value[keys[0]] === 'object' && Object.keys(value[keys[0]]).length === 0) return keys[0]
    return Object.fromEntries(keys.map((k) => [k, plain(value[k])]))
  }
  return value
}

// ------------------------------------------------------------------ fetch

async function newSignatures() {
  const found = []
  let before
  for (;;) {
    const page = await connection.getSignaturesForAddress(program.programId, { before, until: state.newest ?? undefined, limit: 1000 }, 'confirmed')
    found.push(...page)
    if (page.length < 1000) break
    before = page[page.length - 1].signature
  }
  return found.reverse() // oldest first
}

async function ingest() {
  const signatures = await newSignatures()
  let added = 0
  for (const sig of signatures) {
    if (sig.err) {
      state.newest = sig.signature
      continue
    }
    const tx = await connection.getTransaction(sig.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
    const logs = tx?.meta?.logMessages ?? []
    for (const event of parser.parseLogs(logs)) {
      state.events.push({ name: event.name, data: plain(event.data), signature: sig.signature, slot: sig.slot, time: sig.blockTime ?? null })
      added++
    }
    state.newest = sig.signature
  }
  if (signatures.length) save()
  return { transactions: signatures.length, events: added }
}

// ---------------------------------------------------------------- derive

const big = (v) => BigInt(v ?? 0)
const str = (v) => v.toString()

function raceView(address, r, data) {
  return {
    id: Number(r.id),
    address,
    data,
    title: r.title,
    category: plain(r.category),
    origin: plain(r.origin),
    status: plain(r.status),
    creator: r.creator.toBase58(),
    stakeMint: r.stakeMint.toBase58(),
    totalPool: str(r.totalPool),
    winningAssetIndex: r.winningAssetIndex === 255 ? null : r.winningAssetIndex,
    bettingEndTime: Number(r.bettingEndTime),
    raceEndTime: Number(r.raceEndTime),
    resolvedAt: Number(r.resolvedAt) || null,
    assets: r.assets.map((a) => ({
      symbol: symbolBySource.get(a.priceSource.toBase58()) ?? a.priceSource.toBase58(),
      pool: str(a.pool),
      startPrice: str(a.startPrice),
      endPrice: str(a.endPrice),
      priceDecimals: a.priceDecimals,
      returnValue: str(a.returnValue),
    })),
  }
}

function arenaView(address, a, data) {
  return {
    id: Number(a.id),
    address,
    data,
    title: a.title,
    symbol: symbolBySource.get(a.priceSource.toBase58()) ?? a.priceSource.toBase58(),
    category: plain(a.category),
    status: plain(a.status),
    cancelReason: plain(a.cancelReason),
    creator: a.creator.toBase58(),
    stakeMint: a.stakeMint.toBase58(),
    totalPool: str(a.totalPool),
    priceDecimals: a.priceDecimals,
    finalPrice: str(a.finalPrice),
    startsAt: Number(a.startsAt),
    deadline: Number(a.deadline),
    resolvedAt: Number(a.resolvedAt) || null,
    winnerCount: a.winnerCount,
    players: a.entries.map((e) => ({
      player: e.player.toBase58(),
      prediction: str(e.prediction),
      stake: str(e.stake),
      rank: e.rank,
      payout: str(e.payout),
      settled: e.settled,
    })),
  }
}

async function accountsOf(name) {
  const filter = program.coder.accounts.memcmp(name)
  const found = await connection.getProgramAccounts(program.programId, { filters: [{ memcmp: { offset: filter.offset, bytes: filter.bytes } }] })
  return found.map(({ pubkey, account }) => ({
    address: pubkey.toBase58(),
    account: program.coder.accounts.decode(name, account.data),
    data: account.data.toString('base64'),
  }))
}

async function build() {
  const races = (await accountsOf('race')).map((r) => raceView(r.address, r.account, r.data))
  const arenas = (await accountsOf('arena')).map((a) => arenaView(a.address, a.account, a.data))
  const raceByAddress = new Map(races.map((r) => [r.address, r]))
  const arenaByAddress = new Map(arenas.map((a) => [a.address, a]))

  const wallets = new Map()
  const wallet = (address) => {
    if (!wallets.has(address)) wallets.set(address, { staked: 0n, claimed: 0n, refunded: 0n, games: new Set(), wins: 0, lastActive: 0 })
    return wallets.get(address)
  }
  // Per game kind, for the race and arena list sidebars.
  const kindStats = { race: new Map(), arena: new Map() }
  const kindWallet = (kind, address) => {
    const map = kindStats[kind]
    if (!map.has(address)) map.set(address, { staked: 0n, claimed: 0n, refunded: 0n, symbols: new Set() })
    return map.get(address)
  }
  const arenaStake = new Map() // `${arena}:${player}` -> last total stake
  const activity = []
  const isSol = (game) => game?.stakeMint === NATIVE_SOL

  for (const e of state.events) {
    const d = e.data
    const base = { signature: e.signature, slot: e.slot, time: e.time }
    switch (e.name) {
      case 'BetPlaced': {
        const race = raceByAddress.get(d.race)
        activity.push({ ...base, type: 'bet', game: 'race', gameId: race?.id ?? null, gameAddress: d.race, wallet: d.bettor, amount: d.amount, assetIndex: d.assetIndex, symbol: race?.assets[d.assetIndex]?.symbol ?? null })
        if (isSol(race)) {
          const w = wallet(d.bettor)
          w.staked += big(d.amount)
          w.games.add(`race:${d.race}`)
          w.lastActive = Math.max(w.lastActive, e.time ?? 0)
          const k = kindWallet('race', d.bettor)
          k.staked += big(d.amount)
          const symbol = race?.assets[d.assetIndex]?.symbol
          if (symbol) k.symbols.add(symbol)
        }
        break
      }
      case 'EntryChanged': {
        const arena = arenaByAddress.get(d.arena)
        const key = `${d.arena}:${d.player}`
        const delta = big(d.totalStake) - (arenaStake.get(key) ?? 0n)
        arenaStake.set(key, big(d.totalStake))
        if (delta > 0n) activity.push({ ...base, type: 'entry', game: 'arena', gameId: arena?.id ?? null, gameAddress: d.arena, wallet: d.player, amount: str(delta), symbol: arena?.symbol ?? null })
        if (isSol(arena)) {
          const w = wallet(d.player)
          w.staked += delta
          w.games.add(`arena:${d.arena}`)
          w.lastActive = Math.max(w.lastActive, e.time ?? 0)
          const k = kindWallet('arena', d.player)
          k.staked += delta
          if (arena?.symbol) k.symbols.add(arena.symbol)
        }
        break
      }
      case 'RaceClaimed':
      case 'ArenaClaimed': {
        const game = e.name === 'RaceClaimed' ? raceByAddress.get(d.race) : arenaByAddress.get(d.arena)
        const who = d.owner ?? d.player
        activity.push({ ...base, type: 'claim', game: e.name === 'RaceClaimed' ? 'race' : 'arena', gameId: game?.id ?? null, gameAddress: d.race ?? d.arena, wallet: who, amount: d.payout })
        if (isSol(game)) {
          const w = wallet(who)
          w.claimed += big(d.payout)
          w.wins++
          kindWallet(e.name === 'RaceClaimed' ? 'race' : 'arena', who).claimed += big(d.payout)
        }
        break
      }
      case 'RaceRefunded':
      case 'ArenaRefunded': {
        const game = e.name === 'RaceRefunded' ? raceByAddress.get(d.race) : arenaByAddress.get(d.arena)
        const who = d.owner ?? d.player
        activity.push({ ...base, type: 'refund', game: e.name === 'RaceRefunded' ? 'race' : 'arena', gameId: game?.id ?? null, gameAddress: d.race ?? d.arena, wallet: who, amount: d.amount })
        if (isSol(game)) {
          wallet(who).refunded += big(d.amount)
          kindWallet(e.name === 'RaceRefunded' ? 'race' : 'arena', who).refunded += big(d.amount)
        }
        break
      }
      case 'RaceResolved':
      case 'ArenaResolved':
      case 'RaceVoided':
      case 'RaceCancelled':
      case 'ArenaCancelled':
      case 'RaceStarted':
        activity.push({ ...base, type: e.name, game: e.name.startsWith('Race') ? 'race' : 'arena', gameAddress: d.race ?? d.arena })
        break
      default:
        break
    }
  }

  const walletList = [...wallets].map(([address, w]) => ({
    wallet: address,
    staked: str(w.staked),
    claimed: str(w.claimed),
    refunded: str(w.refunded),
    // Net = everything received back - everything staked. Open stakes count as
    // out until the game settles, so it understates P&L while games run.
    net: str(w.claimed + w.refunded - w.staked),
    games: w.games.size,
    wins: w.wins,
    lastActive: w.lastActive || null,
  }))
  const byNet = (a, b) => (big(b.net) > big(a.net) ? 1 : big(b.net) < big(a.net) ? -1 : 0)
  const leaderboard = [...walletList].sort(byNet).slice(0, 100)
  const kindBoard = (kind) => [...kindStats[kind]]
    .map(([address, k]) => ({ wallet: address, staked: str(k.staked), claimed: str(k.claimed), refunded: str(k.refunded), net: str(k.claimed + k.refunded - k.staked), symbols: [...k.symbols].slice(0, 4) }))
    .sort(byNet)
    .slice(0, 20)

  snapshot = {
    cluster,
    programId: program.programId.toBase58(),
    updatedAt: Math.floor(Date.now() / 1000),
    eventCount: state.events.length,
    note: 'Wallet stats and leaderboard count SOL-staked games only.',
    races: races.sort((a, b) => b.id - a.id),
    arenas: arenas.sort((a, b) => b.id - a.id),
    activity: activity.slice(-ACTIVITY_LIMIT).reverse(),
    wallets: Object.fromEntries(walletList.map((w) => [w.wallet, w])),
    leaderboard,
    leaderboards: { race: kindBoard('race'), arena: kindBoard('arena') },
  }
}

// -------------------------------------------------------------------- loop

let running = false
async function cycle() {
  if (running) return
  running = true
  try {
    const { transactions, events } = await ingest()
    await build()
    if (transactions) console.log(`indexed ${transactions} tx, ${events} events (total ${state.events.length})`)
  } catch (error) {
    console.warn(`index cycle failed: ${error.message}`)
  } finally {
    running = false
  }
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'max-age=5' })
    res.end(JSON.stringify(body))
  }
  if (url.pathname === '/history') return snapshot ? send(200, snapshot) : send(503, { error: 'warming up' })
  if (url.pathname === '/health') return send(snapshot ? 200 : 503, { cluster, events: state.events.length, updatedAt: snapshot?.updatedAt ?? null })
  send(404, { error: 'not found' })
}).listen(PORT, () => console.log(`indexer on :${PORT} · ${cluster} · program ${program.programId.toBase58()} · state ${STATE}`))

await cycle()
setInterval(cycle, INTERVAL)
