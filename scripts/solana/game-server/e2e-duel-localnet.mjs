#!/usr/bin/env node
// Full coin-duel lifecycle against a local validator with live mainnet prices.
// Needs: scripts/solana/localnet.sh, the price service and the game server
// (GAME_WALLET_KEYPAIR=ephemeral) running. Wallets are throwaway in-memory
// keys funded by airdrop; they sign actions like the Prophet wallet does
// ("Prophet\n" + JSON, ed25519) and stake by memo transfers.
//
// Script: three racers bring WIF, POPCAT and PENGU (memes, 1 min). Two
// spectators back racers A and B, one backs C; racer A also tries to back
// (refunded). A and B press READY, C does not: after the ready minute C is
// kicked (20% tax: he was backed), C's backer is refunded in full, A and B
// share half the tax. The duel then runs and every payout is checked to the
// lamport against the rules.
//
// Usage: node scripts/solana/game-server/e2e-duel-localnet.mjs

import { randomBytes } from 'node:crypto'
import { ed25519 } from '@noble/curves/ed25519.js'
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import { BASE_FEE, memoInstruction } from './chain.mjs'
import { duelMemo } from './rules.mjs'

const RPC = process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899'
const SERVER = process.env.GAME_SERVER_URL ?? 'http://127.0.0.1:8792'
const connection = new Connection(RPC, 'confirmed')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sol = (l) => (Number(l) / LAMPORTS_PER_SOL).toFixed(9)
let failures = 0
const check = (ok, text) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`)
  if (!ok) failures++
}
const getJson = async (path) => (await fetch(`${SERVER}${path}`)).json()
const balance = async (key) => BigInt(await connection.getBalance(key, 'confirmed'))

const health = await getJson('/health')
const config = await getJson('/config')
const gameWallet = new PublicKey(health.gameWallet)
console.log(`game wallet ${health.gameWallet} (${health.cluster})`)

async function funded() {
  const k = Keypair.generate()
  const sig = await connection.requestAirdrop(k.publicKey, 2 * LAMPORTS_PER_SOL)
  await connection.confirmTransaction(sig, 'confirmed')
  return k
}

/** A signed action, built the way src/chain/gameServer.ts builds it. */
async function act(wallet, fields) {
  const payload = { ...fields, wallet: wallet.publicKey.toBase58(), cluster: config.cluster, domain: 'localhost:5173', nonce: randomBytes(16).toString('hex'), issuedAt: Math.floor(Date.now() / 1000) }
  const message = `Prophet\n${JSON.stringify(payload)}`
  const signature = Buffer.from(ed25519.sign(new TextEncoder().encode(message), wallet.secretKey.slice(0, 32))).toString('base64')
  const r = await fetch(`${SERVER}/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, signature }) })
  const body = await r.json()
  if (!r.ok) throw new Error(`${fields.action}: ${r.status} ${JSON.stringify(body)}`)
  return body
}

/** A memo transfer to the game wallet, reported to /deposit until the server decides. */
async function stake(player, lamports, memo) {
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: player.publicKey, toPubkey: gameWallet, lamports }),
    memoInstruction(memo, player.publicKey),
  )
  const signature = await sendAndConfirmTransaction(connection, tx, [player], { commitment: 'confirmed' })
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${SERVER}/deposit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signature }) })
    const body = await r.json()
    if (r.status !== 202) return { ...body, signature }
    await sleep(1000)
  }
  return { signature, status: 'unknown' }
}

const duelState = (id) => getJson(`/games/duel/${id}`)
async function waitFor(id, test, seconds, label) {
  for (let i = 0; i < seconds / 2; i++) {
    const d = await duelState(id)
    if (test(d)) return d
    await sleep(2000)
  }
  throw new Error(`timed out waiting for ${label}`)
}

const [A, B, C, S1, S2, S3] = await Promise.all(Array.from({ length: 6 }, funded))
const STAKE = BigInt(LAMPORTS_PER_SOL / 20) // 0.05 SOL
const BACK = { S1: BigInt(LAMPORTS_PER_SOL / 10), S2: BigInt(LAMPORTS_PER_SOL / 5), S3: BigInt((3 * LAMPORTS_PER_SOL) / 20) }

const { id } = await act(A, { action: 'duel-create' })
console.log(`duel #${id}`)
await act(A, { action: 'duel-join', duel: id, asset: 'WIF', stake: STAKE.toString(), duration: 60, unit: 'price' })
await act(B, { action: 'duel-join', duel: id, asset: 'POPCAT' })
await act(C, { action: 'duel-join', duel: id, asset: 'PENGU' })
let wrongCoin = null
try {
  await act(S1, { action: 'duel-join', duel: id, asset: 'WIF' })
} catch (error) {
  wrongCoin = error.message
}
check(wrongCoin?.includes('CoinTaken'), 'a coin already in the lobby cannot be brought twice')

for (const racer of [A, B, C]) check((await stake(racer, STAKE, duelMemo(id, 0))).status === 'accepted', `racer ${racer.publicKey.toBase58().slice(0, 4)} paid the stake`)
let d = await duelState(id)
check(d.status === 'ready', `three paid racers: ready check (${d.status})`)
const seat = Object.fromEntries(d.racers.map((r) => [r.symbol, r.seat]))

// Balances are taken after each wallet's own stake; A's refused back is
// counted from before it, so A's expected change includes its network fee.
const baseA = await balance(A.publicKey)
const self = await stake(A, BACK.S1, duelMemo(id, seat.POPCAT))
const selfFee = BigInt((await connection.getTransaction(self.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })).meta.fee)
check(self.status === 'refunded' && self.reason === 'RacersCannotBack', `a racer cannot back (${self.status} ${self.reason ?? ''})`)
check((await stake(S1, BACK.S1, duelMemo(id, seat.WIF))).status === 'accepted', 'spectator 1 backed WIF')
check((await stake(S2, BACK.S2, duelMemo(id, seat.PENGU))).status === 'accepted', 'spectator 2 backed PENGU')
check((await stake(S3, BACK.S3, duelMemo(id, seat.POPCAT))).status === 'accepted', 'spectator 3 backed POPCAT')
const wallets = { A, B, C, S1, S2, S3 }
const base = {}
for (const [name, k] of Object.entries(wallets)) base[name] = name === 'A' ? baseA : await balance(k.publicKey)

await act(A, { action: 'duel-ready', duel: id })
d = await duelState(id)
const deadlineC = d.racers.find((r) => r.seat === seat.PENGU).readyDeadline
check(deadlineC > 0, `the first READY started the others' minute (PENGU deadline in ${deadlineC - Math.floor(Date.now() / 1000)} s)`)
await act(B, { action: 'duel-ready', duel: id })
console.log('A and B are ready; C stays away for the ready minute...')

d = await waitFor(id, (x) => !x.racers.some((r) => r.seat === seat.PENGU), 120, 'the kick')
check(d.racers.length === 2, `PENGU was kicked; ${d.racers.map((r) => r.symbol).join(' + ')} race on (${d.status})`)
const tax = (STAKE * 2_000n) / 10_000n
const share = tax / 2n / 2n

d = await waitFor(id, (x) => ['resolved', 'void'].includes(x.status) && x.payouts.every((p) => p.status === 'done'), 240, 'the finish and payouts')
console.log(`duel ${d.status}${d.cancelReason ? ` (${d.cancelReason})` : ''}`)
for (const r of d.racers) console.log(`  ${r.symbol}: ${r.startPrice} -> ${r.endPrice}, return ${(Number(r.returnValue) / 1e16).toFixed(4)}%`)

// A refund carries its own network fee (BASE_FEE).
const expected = { A: share - selfFee - BASE_FEE, B: share, C: STAKE - tax, S1: 0n, S2: BACK.S2, S3: 0n }
if (d.status === 'resolved') {
  const winner = d.racers.find((r) => r.seat === d.winnerSeat)
  const [winName, winBacker, loseBacker] = winner.symbol === 'WIF' ? ['A', 'S1', 'S3'] : ['B', 'S3', 'S1']
  const loserBacked = BACK[loseBacker]
  const racerCut = (loserBacked * 3_000n) / 10_000n
  const backersCut = loserBacked - racerCut
  const fee = (gain) => (gain * 200n) / 10_000n
  const racerGain = STAKE + racerCut // the losing racer's stake + 30% of the losing backers
  expected[winName] += STAKE + racerGain - fee(racerGain)
  expected[winBacker] += BACK[winBacker] + backersCut - fee(backersCut)
  console.log(`winner: ${winner.symbol}`)
} else {
  expected.A += STAKE
  expected.B += STAKE
  expected.S1 += BACK.S1
  expected.S3 += BACK.S3
}
for (const [name, k] of Object.entries(wallets)) {
  const got = (await balance(k.publicKey)) - base[name]
  check(got === expected[name], `${name} received ${sol(got)} SOL (expected ${sol(expected[name])})`)
}
const end = await getJson('/health')
check(end.solvency == null || end.solvency.solvent !== false, `game wallet solvent (${JSON.stringify(end.solvency)})`)
console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
