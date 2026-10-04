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
// Payouts: once a game is final it sends winnings, refunds and losing-position
// rent straight to each player's wallet (settle_race_position /
// settle_arena_entry). The program only lets those funds reach the player;
// the keeper pays the transaction fees. Players may still claim themselves.
// SOL and SPL stake currencies are both handled.
//
// Env: SOLANA_RPC_URL (game cluster, default localnet), SOLANA_KEYPAIR (fee
// payer, never printed), PRICE_SERVICE_URL (default http://127.0.0.1:8790),
// KEEPER_INTERVAL_MS (default 3000), SETTLE_DELAY_S (default 3),
// AUTO_PAYOUT (default on; 0 disables), PAYOUT_EVERY_TICKS (default 5).

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import anchor from '@anchor-lang/core'
import { Connection, Ed25519Program, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token'

const { AnchorProvider, Program, Wallet } = anchor
const ROOT = new URL('../../', import.meta.url)
const RPC = process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899'
const PRICE_SERVICE = process.env.PRICE_SERVICE_URL ?? 'http://127.0.0.1:8790'
const INTERVAL = Number(process.env.KEEPER_INTERVAL_MS ?? 3000)
const SETTLE_DELAY = Number(process.env.SETTLE_DELAY_S ?? 3)
const AUTO_PAYOUT = process.env.AUTO_PAYOUT !== '0'
const PAYOUT_EVERY_TICKS = Number(process.env.PAYOUT_EVERY_TICKS ?? 5)
// Settlements per transaction; each one is a handful of accounts.
const PAYOUTS_PER_TX = 4

const readJson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'))
const keypairPath = process.env.SOLANA_KEYPAIR ?? join(homedir(), '.config/solana/id.json')
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf8'))))
const connection = new Connection(RPC, 'confirmed')
const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: 'confirmed' })
// Asset Race and Price Arena live in one program.
const games = new Program(readJson('src/solana/idl/prophet_games.json'), provider)
const race = games
const arena = games
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
  // Timeout: a hung price-service call must not stall the whole tick while
  // other games pass their grace windows.
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`price service ${res.status}: ${body.error ?? 'unexpected response'}`)
  return body
}

const ed25519Ix = (attestation) =>
  new TransactionInstruction({ programId: Ed25519Program.programId, keys: [], data: Buffer.from(attestation.instruction, 'base64') })

async function send(instructions) {
  const tx = new Transaction().add(...instructions)
  return provider.sendAndConfirm(tx, [])
}

// SPL games use associated token accounts of the game PDA (vault), the
// treasury, the creator earnings and the players; native-SOL games pass none.
const tokenPrograms = new Map()
async function stakeToken(stakeMint) {
  if (stakeMint.equals(NATIVE_SOL)) return null
  const key = stakeMint.toBase58()
  if (!tokenPrograms.has(key)) {
    const info = await connection.getAccountInfo(stakeMint)
    if (!info) throw new Error(`stake mint ${key} not found`)
    tokenPrograms.set(key, info.owner)
  }
  return { mint: stakeMint, program: tokenPrograms.get(key) }
}
const ata = (token, owner) => getAssociatedTokenAddressSync(token.mint, owner, true, token.program)

/** Token accounts for resolve_race / resolve_arena (`vaultName`: raceVault or arenaVault). */
async function resolveTokenAccounts(game, gameKey, vaultName) {
  const token = await stakeToken(game.stakeMint)
  if (!token) return { tokenMint: null, [vaultName]: null, treasuryVault: null, creatorVault: null, tokenProgram: null }
  const { treasury, creatorEarnings } = feeAccounts(games, game)
  return { tokenMint: token.mint, [vaultName]: ata(token, gameKey), treasuryVault: ata(token, treasury), creatorVault: ata(token, creatorEarnings), tokenProgram: token.program }
}

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
          .accountsPartial({ race: publicKey, instructions: SYSVAR_INSTRUCTIONS, ...feeAccounts(race, r), ...(await resolveTokenAccounts(r, publicKey, 'raceVault')) })
          .instruction()
        await send([ed25519Ix(att), resolveIx])
        const after = await race.account.race.fetch(publicKey)
        const outcome = status(after.status) === 'resolved' ? `winner index ${after.winningAssetIndex}` : status(after.status)
        console.log(`${label}: resolved (P1 slot ${att.prevSlot}) -> ${outcome}`)
      }
    } catch (error) {
      logGameError(label, error)
    }
  }
}

async function tickArenas(now) {
  for (const { publicKey, account: a } of await arena.account.arena.all()) {
    if (status(a.status) !== 'open') continue
    const label = `arena #${Number(a.id)}`
    try {
      if (now >= Number(a.startsAt) && a.entries.length < 2 && now < Number(a.deadline)) {
        await arena.methods.cancelArenaIfInsufficient().accountsPartial({ arena: publicKey }).rpc()
        console.log(`${label}: cancelled (fewer than two players)`)
      } else if (now > Number(a.deadline) + 3600) {
        await arena.methods.cancelExpiredArena().accountsPartial({ arena: publicKey }).rpc()
        console.log(`${label}: cancelled (resolution window expired)`)
      } else if (now >= Number(a.deadline) + SETTLE_DELAY) {
        const resolveIx = await arena.methods
          .resolveArena()
          .accountsPartial({ arena: publicKey, instructions: SYSVAR_INSTRUCTIONS, ...feeAccounts(arena, a), ...(await resolveTokenAccounts(a, publicKey, 'arenaVault')) })
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
      logGameError(label, error)
    }
  }
}

// ---------------------------------------------------------------- payouts

// Games with nothing left to pay; skipped until the keeper restarts.
const paidOut = new Set()

async function sendPayouts(label, instructions) {
  for (let i = 0; i < instructions.length; i += PAYOUTS_PER_TX) {
    const batch = instructions.slice(i, i + PAYOUTS_PER_TX).flat()
    try {
      await send(batch)
    } catch (error) {
      logGameError(label, error)
    }
  }
}

async function payoutRaces() {
  for (const { publicKey, account: r } of await race.account.race.all()) {
    const key = publicKey.toBase58()
    if (paidOut.has(key) || !['resolved', 'cancelled', 'void'].includes(status(r.status))) continue
    // Open positions only: a settled position's account is closed.
    const positions = await race.account.position.all([{ memcmp: { offset: 8, bytes: key } }])
    if (positions.length === 0) {
      paidOut.add(key)
      continue
    }
    const token = await stakeToken(r.stakeMint)
    const instructions = []
    for (const { publicKey: position, account: p } of positions) {
      const ix = await race.methods
        .settleRacePosition()
        .accountsPartial({
          cranker: payer.publicKey,
          race: publicKey,
          position,
          owner: p.owner,
          tokenMint: token?.mint ?? null,
          raceVault: token ? ata(token, publicKey) : null,
          ownerToken: token ? ata(token, p.owner) : null,
          tokenProgram: token?.program ?? null,
        })
        .instruction()
      // A token payout needs the owner's token account; recreate it if they closed it.
      instructions.push(token ? [createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata(token, p.owner), p.owner, token.mint, token.program), ix] : [ix])
    }
    await sendPayouts(`race #${Number(r.id)}`, instructions)
    console.log(`race #${Number(r.id)}: settled ${positions.length} position(s) to their owners`)
  }
}

async function payoutArenas() {
  for (const { publicKey, account: a } of await arena.account.arena.all()) {
    const key = publicKey.toBase58()
    const s = status(a.status)
    if (paidOut.has(key) || (s !== 'resolved' && s !== 'cancelled')) continue
    const due = a.entries.filter((e) => !e.settled && (s === 'cancelled' || e.payout.gtn(0)))
    if (due.length === 0) {
      paidOut.add(key)
      continue
    }
    const token = await stakeToken(a.stakeMint)
    const instructions = []
    for (const entry of due) {
      const ix = await arena.methods
        .settleArenaEntry()
        .accountsPartial({
          cranker: payer.publicKey,
          arena: publicKey,
          player: entry.player,
          tokenMint: token?.mint ?? null,
          arenaVault: token ? ata(token, publicKey) : null,
          playerToken: token ? ata(token, entry.player) : null,
          tokenProgram: token?.program ?? null,
        })
        .instruction()
      instructions.push(token ? [createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata(token, entry.player), entry.player, token.mint, token.program), ix] : [ix])
    }
    await sendPayouts(`arena #${Number(a.id)}`, instructions)
    console.log(`arena #${Number(a.id)}: paid ${due.length} player(s) to their wallets`)
  }
}

// One line per failure, but keep the parts that make it diagnosable: the
// Anchor error code line and the program logs ("Simulation failed." alone
// told us nothing in production).
function logGameError(label, error) {
  const firstLine = error.message?.split('\n')[0]
  const codeLine = error.message?.split('\n').find((line) => line.includes('Error Code:'))
  const logs = error.logs ?? error.transactionLogs
  console.warn(`${label}: ${codeLine ?? firstLine}`)
  if (!codeLine && Array.isArray(logs) && logs.length > 0) console.warn(`${label}: logs: ${logs.slice(-5).join(' | ')}`)
}

console.log(`keeper · rpc ${RPC} · price service ${PRICE_SERVICE} · payer ${payer.publicKey.toBase58()} · auto payout ${AUTO_PAYOUT ? 'on' : 'off'}`)
let running = false
let tick = 0
setInterval(async () => {
  if (running) return
  running = true
  const startedAt = Date.now()
  try {
    const now = await chainNow()
    await tickRaces(now)
    await tickArenas(now)
    if (AUTO_PAYOUT && tick++ % PAYOUT_EVERY_TICKS === 0) {
      await payoutRaces()
      await payoutArenas()
    }
  } catch (error) {
    console.warn(`tick failed: ${error.message}`)
  } finally {
    const elapsed = Date.now() - startedAt
    if (elapsed > 30_000) console.error(`tick took ${Math.round(elapsed / 1000)}s; games may miss their grace windows`)
    running = false
  }
}, INTERVAL)
