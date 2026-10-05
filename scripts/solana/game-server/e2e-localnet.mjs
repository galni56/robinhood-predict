#!/usr/bin/env node
// Full race lifecycle against a local validator with live mainnet prices.
// Needs: scripts/solana/localnet.sh, the price service and the game server
// (GAME_WALLET_KEYPAIR=ephemeral) running; GAME_DB must be the server's file.
// Players are throwaway in-memory wallets funded by airdrop. They stake by
// plain memo transfers and sign nothing afterwards; every payout and refund
// is checked to the lamport.

import { readFileSync } from 'node:fs'
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import { openDatabase } from './db.mjs'
import { catalogAssets, createEngine } from './engine.mjs'
import { BASE_FEE, memoInstruction } from './chain.mjs'
import { raceMemo } from './rules.mjs'

const RPC = process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899'
const SERVER = process.env.GAME_SERVER_URL ?? 'http://127.0.0.1:8792'
const connection = new Connection(RPC, 'confirmed')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sol = (l) => (Number(l) / LAMPORTS_PER_SOL).toFixed(6)
let failures = 0
const check = (ok, text) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`)
  if (!ok) failures++
}
const getJson = async (path) => (await fetch(`${SERVER}${path}`)).json()
const balance = async (key) => BigInt(await connection.getBalance(key, 'confirmed'))

const health = await getJson('/health')
const gameWallet = new PublicKey(health.gameWallet)
console.log(`game wallet ${health.gameWallet} (${health.cluster})`)

async function funded() {
  const k = Keypair.generate()
  const sig = await connection.requestAirdrop(k.publicKey, 2 * LAMPORTS_PER_SOL)
  await connection.confirmTransaction(sig, 'confirmed')
  return k
}

async function stake(player, lamports, memo, report) {
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: player.publicKey, toPubkey: gameWallet, lamports }),
    memoInstruction(memo, player.publicKey),
  )
  const signature = await sendAndConfirmTransaction(connection, tx, [player], { commitment: 'confirmed' })
  if (report) {
    for (let i = 0; i < 10; i++) {
      const r = await fetch(`${SERVER}/deposit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signature }) })
      const body = await r.json()
      if (r.status !== 202) return body
      await sleep(1000)
    }
  }
  return { signature, status: 'sent' }
}

// The platform race goes straight into the server's database.
const db = openDatabase(process.env.GAME_DB)
const assets = catalogAssets(JSON.parse(readFileSync(new URL('../../../config/solana-assets.json', import.meta.url), 'utf8')))
const admin = createEngine({ db, chain: { address: health.gameWallet }, prices: null, assets, cluster: 'admin', log: { log() {}, warn() {} } })
const now = Math.floor(Date.now() / 1000)
const race = admin.createPlatform({ title: 'E2E majors', category: 'crypto', symbols: ['SOL', 'BTC', 'ETH'], bettingStartTime: now, bettingEndTime: now + 40, raceDuration: 40 })
db.close()
console.log(`race #${race.id}: betting 40s, race 40s`)

const bettors = await Promise.all([funded(), funded(), funded(), funded()])
const stakes = [LAMPORTS_PER_SOL / 10, LAMPORTS_PER_SOL / 5, (3 * LAMPORTS_PER_SOL) / 10]
for (let i = 0; i < 3; i++) {
  const r = await stake(bettors[i], stakes[i], raceMemo(race.id, i), i < 2)
  if (i < 2) check(r.status === 'accepted', `bet ${i} accepted through the API`)
}
const bad = await stake(bettors[3], LAMPORTS_PER_SOL / 20, raceMemo(9999, 0), true)
check(bad.status === 'refunded' && bad.reason === 'GameNotFound', 'stake for a missing race is refunded (GameNotFound)')
const after = await Promise.all(bettors.map((b) => balance(b.publicKey)))

let state
for (let i = 0; i < 150; i++) {
  state = await getJson(`/games/race/${race.id}`)
  const final = ['resolved', 'cancelled', 'void'].includes(state.status)
  if (final && state.payouts.every((p) => p.status === 'done')) break
  await sleep(2000)
}
console.log(`race status ${state.status}${state.cancelReason ? ` (${state.cancelReason})` : ''}`)
check(state.positions.length === 3, 'the scanner found the bet nobody reported')
for (const a of state.assets) console.log(`  ${a.symbol}: P0 ${a.startPrice} -> P1 ${a.endPrice}, return ${(Number(a.returnValue) / 1e16).toFixed(4)}%`)

const gained = await Promise.all(bettors.map(async (b, i) => (await balance(b.publicKey)) - after[i]))
// A refund carries its own network fee.
check(gained[3] === BigInt(LAMPORTS_PER_SOL / 20) - BASE_FEE, `refund of the bad stake arrived: ${sol(gained[3])} SOL`)
if (state.status === 'resolved') {
  const w = state.winningAssetIndex
  const losing = BigInt(state.totalPool) - BigInt(state.winningPool)
  const expected = BigInt(stakes[w]) + (losing - (losing * 200n) / 10_000n)
  console.log(`winner: ${state.assets[w].symbol}`)
  for (let i = 0; i < 3; i++) {
    if (i === w) check(gained[i] === expected, `winner paid ${sol(gained[i])} SOL (expected ${sol(expected)})`)
    else check(gained[i] === 0n, `loser ${state.assets[i].symbol} got nothing`)
  }
} else {
  for (let i = 0; i < 3; i++) check(gained[i] === BigInt(stakes[i]), `bettor ${i} refunded ${sol(gained[i])} SOL`)
}
const end = await getJson('/health')
check(end.solvency == null || end.solvency.solvent !== false, `game wallet solvent (${JSON.stringify(end.solvency)})`)
console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
