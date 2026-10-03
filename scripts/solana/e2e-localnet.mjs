#!/usr/bin/env node
// End-to-end lifecycle on localnet with live mainnet prices:
// create race (+ optional arena) -> bets from throwaway wallets -> the keeper
// starts/resolves with signed attestations from the price service -> winners
// claim, losers close positions, payouts are checked against program math.
//
// Needs: local validator with programs + `admin.mjs setup`, the price service
// (oracle = the localnet admin key) and the keeper running.
//
// Usage: node scripts/solana/e2e-localnet.mjs [--arena]

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import anchor from '@anchor-lang/core'
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'

const { AnchorProvider, Program, Wallet, BN } = anchor
const ROOT = new URL('../../', import.meta.url)
const RPC = process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899'
if (!/127\.0\.0\.1|localhost/.test(RPC)) throw new Error('e2e-localnet runs on localnet only')
const PRICE_SERVICE = process.env.PRICE_SERVICE_URL ?? 'http://127.0.0.1:8790'
const withArena = process.argv.includes('--arena')

const readJson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'))
const admin = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(process.env.SOLANA_KEYPAIR ?? join(homedir(), '.config/solana/id.json'), 'utf8'))),
)
const connection = new Connection(RPC, 'confirmed')
const provider = new AnchorProvider(connection, new Wallet(admin), { commitment: 'confirmed' })
const race = new Program(readJson('src/solana/idl/asset_race.json'), provider)
const arena = new Program(readJson('src/solana/idl/price_arena.json'), provider)
const catalog = readJson('config/solana-assets.json')
const NATIVE_SOL = PublicKey.default
const enc = (s) => Buffer.from(s)
const pda = (program, seeds) => PublicKey.findProgramAddressSync(seeds, program.programId)[0]
const u64 = (n) => new BN(n).toArrayLike(Buffer, 'le', 8)
const assetId = (symbol) => {
  const id = Buffer.alloc(32)
  enc(symbol).copy(id)
  return id
}
const status = (e) => Object.keys(e)[0]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sol = (lamports) => (Number(lamports) / LAMPORTS_PER_SOL).toFixed(6)
let failures = 0
const check = (ok, message) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`)
  if (!ok) failures++
}

async function chainNow() {
  const clock = await connection.getAccountInfo(new PublicKey('SysvarC1ock11111111111111111111111111111111'))
  return Number(clock.data.readBigInt64LE(32))
}

async function wallet(solAmount) {
  const w = Keypair.generate() // throwaway, localnet only
  await connection.confirmTransaction(await connection.requestAirdrop(w.publicKey, solAmount * LAMPORTS_PER_SOL), 'confirmed')
  return w
}

async function waitFor(label, fetch, done, timeoutS) {
  const deadline = Date.now() + timeoutS * 1000
  for (;;) {
    const value = await fetch()
    if (done(value)) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
    await sleep(2000)
  }
}

async function raceLifecycle() {
  const symbols = ['SOL', 'BTC', 'ETH']
  const config = await race.account.config.fetch(pda(race, [enc('config')]))
  const raceId = Number(config.raceCount)
  const raceKey = pda(race, [enc('race'), u64(raceId)])
  const now = (await chainNow()) + 5
  await race.methods
    .createPlatformRace('E2E majors sprint', {
      category: { crypto: {} },
      stakeMint: NATIVE_SOL,
      bettingStartTime: new BN(now),
      bettingEndTime: new BN(now + 30),
      raceDuration: new BN(45),
      startGrace: new BN(300),
      resolutionGrace: new BN(600),
      feeBp: 200,
      minActiveContenders: 2,
      minStake: new BN(LAMPORTS_PER_SOL / 200),
      maxStakePerWallet: new BN(LAMPORTS_PER_SOL),
    })
    .accountsPartial({ admin: admin.publicKey, race: raceKey, tokenMint: null, raceVault: null, creatorVault: null, tokenProgram: null, associatedTokenProgram: null })
    .remainingAccounts(symbols.map((s) => ({ pubkey: pda(race, [enc('asset'), assetId(s)]), isSigner: false, isWritable: false })))
    .rpc()
  console.log(`race #${raceId} created: ${symbols.join(' / ')}, betting 30s, race 45s`)

  while ((await chainNow()) < now) await sleep(400)
  const stakes = [0.1, 0.2, 0.3].map((x) => Math.round(x * LAMPORTS_PER_SOL))
  const bettors = []
  for (let i = 0; i < symbols.length; i++) {
    const bettor = await wallet(2)
    await race.methods
      .bet(i, new BN(stakes[i]))
      .accountsPartial({ bettor: bettor.publicKey, race: raceKey, tokenMint: null, bettorToken: null, raceVault: null, tokenProgram: null })
      .signers([bettor])
      .rpc()
    bettors.push(bettor)
  }
  console.log(`bets placed: ${symbols.map((s, i) => `${s} ${sol(stakes[i])} SOL`).join(', ')}`)

  const started = await waitFor('race start', () => race.account.race.fetch(raceKey), (r) => status(r.status) !== 'betting', 180)
  check(status(started.status) === 'running', `race started by keeper (status ${status(started.status)}, P0 slot ${started.startSlot})`)
  started.assets.forEach((a, i) => console.log(`  P0 ${symbols[i]} = ${a.startPrice.toString()} (${a.priceDecimals} dp)`))

  const done = await waitFor('race resolution', () => race.account.race.fetch(raceKey), (r) => status(r.status) !== 'running', 240)
  check(['resolved', 'void'].includes(status(done.status)), `race finished: ${status(done.status)} (P1 slot ${done.endSlot})`)
  done.assets.forEach((a, i) => console.log(`  ${symbols[i]}: P0 ${a.startPrice} -> P1 ${a.endPrice}, return ${(Number(a.returnValue.toString()) / 1e16).toFixed(4)}%`))

  if (status(done.status) === 'void') {
    for (const bettor of bettors) {
      await race.methods.refund().accountsPartial({ owner: bettor.publicKey, race: raceKey, tokenMint: null, raceVault: null, ownerToken: null, tokenProgram: null }).signers([bettor]).rpc()
    }
    check(true, 'tie: every bettor refunded')
    return
  }

  const winner = done.winningAssetIndex
  const losing = BigInt(done.totalPool.toString()) - BigInt(done.winningPool.toString())
  const fee = (losing * 200n) / 10_000n
  const expectedPayout = BigInt(stakes[winner]) + (losing - fee)
  console.log(`winner: ${symbols[winner]}`)
  for (let i = 0; i < bettors.length; i++) {
    const bettor = bettors[i]
    const accounts = { owner: bettor.publicKey, race: raceKey, tokenMint: null, raceVault: null, ownerToken: null, tokenProgram: null }
    const position = pda(race, [enc('position'), raceKey.toBuffer(), bettor.publicKey.toBuffer()])
    const rent = BigInt(await connection.getBalance(position))
    const before = BigInt(await connection.getBalance(bettor.publicKey))
    if (i === winner) {
      await race.methods.claim().accountsPartial(accounts).signers([bettor]).rpc()
      const gained = BigInt(await connection.getBalance(bettor.publicKey)) - before
      // gained = payout + position rent (the admin provider pays the tx fee)
      check(gained === expectedPayout + rent, `winner claimed ${sol(expectedPayout)} SOL (stake ${sol(stakes[i])} + losers' pool minus 2%)`)
    } else {
      await race.methods.closeLosingPosition().accountsPartial(accounts).signers([bettor]).rpc()
      check(true, `loser ${symbols[i]} closed position, rent returned`)
    }
  }
  const after = await race.account.race.fetch(raceKey)
  check(after.remainingLiability.isZero(), 'race escrow owes nothing after claims')
}

async function arenaLifecycle() {
  const prices = await (await fetch(`${PRICE_SERVICE}/prices`)).json()
  const solAsset = catalog.assets.find((a) => a.symbol === 'SOL')
  const live = BigInt(prices.prices.SOL.raw)
  const config = await arena.account.config.fetch(pda(arena, [enc('config')]))
  const arenaId = Number(config.arenaCount)
  const arenaKey = pda(arena, [enc('arena'), u64(arenaId)])
  await arena.methods
    .createArena('E2E SOL close', new BN(60), NATIVE_SOL)
    .accountsPartial({ creator: admin.publicKey, approvedAsset: pda(arena, [enc('asset'), assetId('SOL')]), arena: arenaKey, tokenMint: null, arenaVault: null, creatorVault: null, tokenProgram: null, associatedTokenProgram: null })
    .rpc()
  const guesses = [live, (live * 1001n) / 1000n, (live * 990n) / 1000n]
  const players = []
  for (const guess of guesses) {
    const player = await wallet(2)
    await arena.methods
      .enter(new BN(guess.toString()), new BN(LAMPORTS_PER_SOL / 10))
      .accountsPartial({ player: player.publicKey, arena: arenaKey, tokenMint: null, playerToken: null, arenaVault: null, tokenProgram: null })
      .signers([player])
      .rpc()
    players.push(player)
  }
  const a = await arena.account.arena.fetch(arenaKey)
  console.log(`arena #${arenaId} SOL: 3 players, lobby until +${Number(a.startsAt) - (await chainNow())}s, deadline +${Number(a.deadline) - (await chainNow())}s (live ${prices.prices.SOL.price}, ${solAsset.priceDecimals} dp)`)

  const done = await waitFor('arena resolution', () => arena.account.arena.fetch(arenaKey), (x) => status(x.status) !== 'open', 900)
  check(status(done.status) === 'resolved', `arena ${status(done.status)}: final ${done.finalPrice.toString()}, ${done.winnerCount} winner(s)`)
  for (let i = 0; i < players.length; i++) {
    const entry = done.entries.find((e) => e.player.equals(players[i].publicKey))
    if (entry.payout.isZero()) continue
    await arena.methods.claim().accountsPartial({ player: players[i].publicKey, arena: arenaKey, tokenMint: null, arenaVault: null, playerToken: null, tokenProgram: null }).signers([players[i]]).rpc()
    check(true, `player ${i} (rank ${entry.rank}) claimed ${sol(entry.payout)} SOL`)
  }
  const after = await arena.account.arena.fetch(arenaKey)
  check(after.remainingLiability.isZero(), 'arena escrow owes nothing after claims')
}

await raceLifecycle()
if (withArena) await arenaLifecycle()
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
