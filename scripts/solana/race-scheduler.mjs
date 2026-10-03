#!/usr/bin/env node
// Prophet race scheduler: keeps the featured (platform) race schedule filled.
// For every entry in config/platform-races.json it keeps one race with that
// title open for betting and creates the next one when the current race stops
// taking bets. The keeper then runs each race through its timers.
//
// Disabled unless the schedule has "enabled": true (each race costs ~0.009 SOL
// of rent that is not refunded).
//
// Signs with the race operator key (`admin.mjs set-operator <pubkey>`), which
// may create platform races and nothing else; the admin key stays offline.
// On localnet the admin key works too. Creator fees always go to the admin.
//
// Env: SOLANA_RPC_URL (game cluster, default localnet), SOLANA_KEYPAIR
// (operator keypair file, default ~/.config/solana/id.json; read, never
// printed), GAMES_PROGRAM_ID (default: the IDL address), PLATFORM_RACES
// (default config/platform-races.json), SCHEDULER_INTERVAL_MS (15000).

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import anchor from '@anchor-lang/core'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'

const { AnchorProvider, Program, Wallet, BN } = anchor
const ROOT = new URL('../../', import.meta.url)
const RPC = process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899'
const INTERVAL = Number(process.env.SCHEDULER_INTERVAL_MS ?? 15_000)
const readJson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'))
const schedule = process.env.PLATFORM_RACES
  ? JSON.parse(readFileSync(process.env.PLATFORM_RACES, 'utf8'))
  : readJson('config/platform-races.json')
const catalog = readJson('config/solana-assets.json')
// Off unless the schedule says otherwise: every race account costs rent.
if (schedule.enabled !== true) {
  console.log('race scheduler is disabled ("enabled": false in the schedule); nothing to do')
  process.exit(0)
}

const keypairPath = process.env.SOLANA_KEYPAIR ?? join(homedir(), '.config/solana/id.json')
const operator = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf8'))))
const connection = new Connection(RPC, 'confirmed')
const idl = readJson('src/solana/idl/prophet_games.json')
if (process.env.GAMES_PROGRAM_ID) idl.address = new PublicKey(process.env.GAMES_PROGRAM_ID).toBase58()
const games = new Program(idl, new AnchorProvider(connection, new Wallet(operator), { commitment: 'confirmed' }))

const NATIVE_SOL = PublicKey.default
const enc = (s) => Buffer.from(s)
const pda = (seeds) => PublicKey.findProgramAddressSync(seeds, games.programId)[0]
const u64 = (n) => new BN(n).toArrayLike(Buffer, 'le', 8)
const assetId = (symbol) => {
  const id = Buffer.alloc(32)
  enc(symbol).copy(id)
  return id
}
const CATEGORY = { STOCK: { stock: {} }, MEME: { meme: {} }, CRYPTO: { crypto: {} } }
const variant = (value) => Object.keys(value)[0]

// The validator's clock, not the machine's: the program rejects races that
// start in the past.
async function chainNow() {
  const clock = await connection.getAccountInfo(new PublicKey('SysvarC1ock11111111111111111111111111111111'))
  return Number(clock.data.readBigInt64LE(32))
}

/** Template problems found once at start, so a typo cannot create broken races. */
function validate(entry) {
  const bySymbol = new Map(catalog.assets.map((a) => [a.symbol, a]))
  if (!CATEGORY[entry.category]) return `unknown category ${entry.category}`
  if (!Array.isArray(entry.symbols) || entry.symbols.length < 2 || entry.symbols.length > 6) return 'needs 2-6 symbols'
  for (const symbol of entry.symbols) {
    const asset = bySymbol.get(symbol)
    if (!asset) return `${symbol} is not in the catalog`
    if (asset.category !== entry.category) return `${symbol} is ${asset.category}, not ${entry.category}`
  }
  if (!(entry.bettingSeconds > 0 && entry.raceSeconds > 0)) return 'bettingSeconds and raceSeconds must be positive'
  return null
}

const templates = schedule.races.filter((entry) => {
  const problem = validate(entry)
  if (problem) console.warn(`skipping "${entry.title}": ${problem}`)
  return !problem
})
const defaults = schedule.defaults ?? {}

async function createRace(entry, config, stake) {
  const raceId = Number(config.raceCount)
  const raceKey = pda([enc('race'), u64(raceId)])
  const start = (await chainNow()) + 5
  await games.methods
    .createPlatformRace(entry.title, {
      category: CATEGORY[entry.category],
      stakeMint: NATIVE_SOL,
      bettingStartTime: new BN(start),
      bettingEndTime: new BN(start + entry.bettingSeconds),
      raceDuration: new BN(entry.raceSeconds),
      startGrace: new BN(defaults.startGraceSeconds ?? 300),
      resolutionGrace: new BN(defaults.resolutionGraceSeconds ?? 600),
      feeBp: defaults.feeBp ?? 200,
      minActiveContenders: defaults.minActiveContenders ?? 2,
      // Same limits as community games in SOL.
      minStake: stake.minStake,
      maxStakePerWallet: stake.maxStake,
    })
    .accountsPartial({
      authority: operator.publicKey,
      race: raceKey,
      creatorEarnings: pda([enc('creator'), NATIVE_SOL.toBuffer(), config.admin.toBuffer()]),
      tokenMint: null,
      raceVault: null,
      creatorVault: null,
      tokenProgram: null,
      associatedTokenProgram: null,
    })
    .remainingAccounts(entry.symbols.map((s) => ({ pubkey: pda([enc('asset'), assetId(s)]), isSigner: false, isWritable: false })))
    .rpc()
  console.log(`race #${raceId} "${entry.title}": betting ${entry.bettingSeconds}s, race ${entry.raceSeconds}s`)
}

let running = false
async function cycle() {
  if (running) return
  running = true
  try {
    const config = await games.account.config.fetch(pda([enc('config')]))
    if (config.paused) return
    const isAdmin = config.admin.equals(operator.publicKey)
    if (!isAdmin && !config.raceOperator.equals(operator.publicKey)) {
      console.warn(`${operator.publicKey.toBase58()} is neither the admin nor the race operator; run admin.mjs set-operator`)
      return
    }
    const stake = await games.account.stakeMintConfig.fetch(pda([enc('stake_mint'), NATIVE_SOL.toBuffer()]))
    if (!stake.enabled) return
    const now = await chainNow()
    const races = (await games.account.race.all()).map((r) => r.account).filter((r) => variant(r.origin) === 'platform')
    for (const entry of templates) {
      const open = races.some((r) => r.title === entry.title && variant(r.status) === 'betting' && Number(r.bettingEndTime) > now)
      if (open) continue
      // Re-read the counter: each creation advances it.
      await createRace(entry, await games.account.config.fetch(pda([enc('config')])), stake)
    }
  } catch (error) {
    console.warn(`scheduler cycle failed: ${error.message?.split('\n')[0] ?? error}`)
  } finally {
    running = false
  }
}

console.log(`race scheduler · rpc ${RPC} · program ${games.programId.toBase58()} · signer ${operator.publicKey.toBase58()} · ${templates.length} templates`)
await cycle()
setInterval(cycle, INTERVAL)
