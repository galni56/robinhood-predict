#!/usr/bin/env node
// Prophet keeper: moves games through their timers. Everything it calls is
// permissionless; it decides nothing about outcomes. Prices come from the
// price service as signed attestations.
//
// Asset Race: open_betting (lobby end) -> start_race (betting end, signed P0;
// cancels itself if too few assets have bets) -> resolve_race (race end,
// signed P1) / cancel_unstarted_race / void_expired_race on timeouts.
// Price Arena: cancel_if_insufficient (lobby end) -> resolve (deadline,
// signed final price) / cancel_expired_arena on timeout.
//
// Env: SOLANA_RPC_URL (game cluster, default localnet), SOLANA_KEYPAIR (fee
// payer, never printed), PRICE_SERVICE_URL (default http://127.0.0.1:8790),
// KEEPER_INTERVAL_MS (default 3000), SETTLE_DELAY_S (default 3).

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import anchor from '@anchor-lang/core'
import { Connection, Ed25519Program, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'

const { AnchorProvider, Program, Wallet } = anchor
const ROOT = new URL('../../', import.meta.url)
const RPC = process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899'
const PRICE_SERVICE = process.env.PRICE_SERVICE_URL ?? 'http://127.0.0.1:8790'
const INTERVAL = Number(process.env.KEEPER_INTERVAL_MS ?? 3000)
const SETTLE_DELAY = Number(process.env.SETTLE_DELAY_S ?? 3)

const readJson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'))
const keypairPath = process.env.SOLANA_KEYPAIR ?? join(homedir(), '.config/solana/id.json')
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf8'))))
const connection = new Connection(RPC, 'confirmed')
const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: 'confirmed' })
const race = new Program(readJson('src/solana/idl/asset_race.json'), provider)
const arena = new Program(readJson('src/solana/idl/price_arena.json'), provider)
const NATIVE_SOL = PublicKey.default
const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111')
const status = (enumValue) => Object.keys(enumValue)[0]
const pda = (program, seeds) => PublicKey.findProgramAddressSync(seeds, program.programId)[0]
const feeAccounts = (program, game) => ({
  treasury: pda(program, [Buffer.from('treasury'), game.stakeMint.toBuffer()]),
  creatorEarnings: pda(program, [Buffer.from('creator'), game.stakeMint.toBuffer(), game.creator.toBuffer()]),
})

async function chainNow() {
  const clock = await connection.getAccountInfo(new PublicKey('SysvarC1ock11111111111111111111111111111111'))
  return Number(clock.data.readBigInt64LE(32))
}

async function fetchAttestation(programId, target, sources) {
  const url = `${PRICE_SERVICE}/attestation?program=${programId.toBase58()}&target=${target}&sources=${sources.join(',')}`
  const res = await fetch(url)
  const body = await res.json()
  if (!res.ok) throw new Error(`price service: ${body.error}`)
  return body
}

const ed25519Ix = (attestation) =>
  new TransactionInstruction({ programId: Ed25519Program.programId, keys: [], data: Buffer.from(attestation.instruction, 'base64') })

async function send(instructions) {
  const tx = new Transaction().add(...instructions)
  return provider.sendAndConfirm(tx, [])
}

// SPL games need their token accounts; native-SOL games pass none.
function tokenAccountsFor(stakeMint) {
  if (!stakeMint.equals(NATIVE_SOL)) throw new Error('SPL games are not automated yet')
  return {}
}

const nullTokenAccounts = { tokenMint: null, raceVault: null, treasuryVault: null, creatorVault: null, tokenProgram: null }
const nullArenaTokenAccounts = { tokenMint: null, arenaVault: null, treasuryVault: null, creatorVault: null, tokenProgram: null }

async function tickRaces(now) {
  for (const { publicKey, account: r } of await race.account.race.all()) {
    const s = status(r.status)
    const id = Number(r.id)
    const label = `race #${id}`
    const at = (t) => now >= Number(t)
    try {
      if (s === 'lobby' && at(r.lobbyEndTime)) {
        await race.methods.openBetting().accountsPartial({ race: publicKey }).rpc()
        console.log(`${label}: betting opened`)
      } else if (s === 'betting' && now > Number(r.bettingEndTime) + Number(r.startGrace)) {
        await race.methods.cancelUnstartedRace().accountsPartial({ race: publicKey }).rpc()
        console.log(`${label}: cancelled (start window expired)`)
      } else if (s === 'betting' && now >= Number(r.bettingEndTime) + SETTLE_DELAY) {
        tokenAccountsFor(r.stakeMint)
        const active = r.assets.filter((a) => a.pool.gtn(0))
        const startIx = await race.methods.startRace().accountsPartial({ race: publicKey, instructions: SYSVAR_INSTRUCTIONS }).instruction()
        if (active.length < r.minActiveContenders) {
          await send([startIx])
          console.log(`${label}: cancelled at start (${active.length} active assets)`)
          continue
        }
        const att = await fetchAttestation(race.programId, Number(r.bettingEndTime), active.map((a) => a.priceSource.toBase58()))
        if (now < att.nextBlockTime) continue // our clock has not reached the proof's child block yet
        await send([ed25519Ix(att), startIx])
        console.log(`${label}: started (P0 slot ${att.prevSlot}, ${active.length} assets)`)
      } else if (s === 'running' && now > Number(r.raceEndTime) + Number(r.resolutionGrace)) {
        await race.methods.voidExpiredRace().accountsPartial({ race: publicKey }).rpc()
        console.log(`${label}: voided (resolution window expired)`)
      } else if (s === 'running' && now >= Number(r.raceEndTime) + SETTLE_DELAY) {
        const active = r.assets.filter((a) => a.active)
        const att = await fetchAttestation(race.programId, Number(r.raceEndTime), active.map((a) => a.priceSource.toBase58()))
        if (now < att.nextBlockTime) continue
        const resolveIx = await race.methods
          .resolveRace()
          .accountsPartial({ race: publicKey, instructions: SYSVAR_INSTRUCTIONS, ...feeAccounts(race, r), ...nullTokenAccounts })
          .instruction()
        await send([ed25519Ix(att), resolveIx])
        const after = await race.account.race.fetch(publicKey)
        const outcome = status(after.status) === 'resolved' ? `winner index ${after.winningAssetIndex}` : status(after.status)
        console.log(`${label}: resolved (P1 slot ${att.prevSlot}) -> ${outcome}`)
      }
    } catch (error) {
      console.warn(`${label}: ${error.message?.split('\n')[0]}`)
    }
  }
}

async function tickArenas(now) {
  for (const { publicKey, account: a } of await arena.account.arena.all()) {
    if (status(a.status) !== 'open') continue
    const label = `arena #${Number(a.id)}`
    try {
      if (now >= Number(a.startsAt) && a.entries.length < 2 && now < Number(a.deadline)) {
        await arena.methods.cancelIfInsufficient().accountsPartial({ arena: publicKey }).rpc()
        console.log(`${label}: cancelled (fewer than two players)`)
      } else if (now > Number(a.deadline) + 3600) {
        await arena.methods.cancelExpiredArena().accountsPartial({ arena: publicKey }).rpc()
        console.log(`${label}: cancelled (resolution window expired)`)
      } else if (now >= Number(a.deadline) + SETTLE_DELAY) {
        tokenAccountsFor(a.stakeMint)
        const resolveIx = await arena.methods
          .resolve()
          .accountsPartial({ arena: publicKey, instructions: SYSVAR_INSTRUCTIONS, ...feeAccounts(arena, a), ...nullArenaTokenAccounts })
          .instruction()
        if (a.entries.length < 2) {
          await send([resolveIx])
          console.log(`${label}: cancelled at deadline (fewer than two players)`)
          continue
        }
        const att = await fetchAttestation(arena.programId, Number(a.deadline), [a.priceSource.toBase58()])
        if (now < att.nextBlockTime) continue
        await send([ed25519Ix(att), resolveIx])
        const after = await arena.account.arena.fetch(publicKey)
        console.log(`${label}: ${status(after.status)} (final price ${after.finalPrice.toString()}, ${after.winnerCount} winners)`)
      }
    } catch (error) {
      console.warn(`${label}: ${error.message?.split('\n')[0]}`)
    }
  }
}

console.log(`keeper · rpc ${RPC} · price service ${PRICE_SERVICE} · payer ${payer.publicKey.toBase58()}`)
let running = false
setInterval(async () => {
  if (running) return
  running = true
  try {
    const now = await chainNow()
    await tickRaces(now)
    await tickArenas(now)
  } catch (error) {
    console.warn(`tick failed: ${error.message}`)
  } finally {
    running = false
  }
}, INTERVAL)
