#!/usr/bin/env node
// Admin setup for the Prophet Solana programs on localnet or devnet.
//
//   node scripts/solana/admin.mjs setup   # initialize, accept SOL, approve catalog assets, community rules
//   node scripts/solana/admin.mjs seed    # localnet only: sample races/arenas with bets from throwaway wallets
//   node scripts/solana/admin.mjs set-operator <pubkey|none>  # key allowed to create platform races (the scheduler)
//   node scripts/solana/admin.mjs quick-race  # localnet only: SOL/BTC/ETH race, 60 s betting + 60 s race
//   node scripts/solana/admin.mjs test-token  # localnet only: new SPL mint accepted as a stake currency
//   node scripts/solana/admin.mjs fund-token <mint> <wallet> [amount]  # localnet only: mint test tokens
//                                             # (QUICK_BETTING_S, QUICK_RACE_S), for clicking through the UI
//
// Env: SOLANA_RPC_URL (default http://127.0.0.1:8899), SOLANA_KEYPAIR (admin
// keypair file, default ~/.config/solana/id.json), ORACLE_PUBKEY (default: the
// admin, acceptable on localnet only). The keypair is read from disk and never
// printed. Refuses to run against mainnet.

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import anchor from '@anchor-lang/core'
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from '@solana/web3.js'
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, createMint, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token'

const { AnchorProvider, Program, Wallet, BN } = anchor
const ROOT = new URL('../../', import.meta.url)
const RPC = process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899'
if (/mainnet/i.test(RPC)) throw new Error('admin.mjs refuses to run against mainnet')
const isLocal = /127\.0\.0\.1|localhost/.test(RPC)

const readJson = (path) => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'))
const keypairPath = process.env.SOLANA_KEYPAIR ?? join(homedir(), '.config/solana/id.json')
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf8'))))
const oracle = new PublicKey(process.env.ORACLE_PUBKEY ?? admin.publicKey.toBase58())
const connection = new Connection(RPC, 'confirmed')
const provider = new AnchorProvider(connection, new Wallet(admin), { commitment: 'confirmed' })
// Asset Race and Price Arena live in one program.
const games = new Program(readJson('src/solana/idl/prophet_games.json'), provider)
const race = games
const arena = games
const catalog = readJson('config/solana-assets.json')

const NATIVE_SOL = PublicKey.default
const enc = (s) => Buffer.from(s)
const assetId = (symbol) => {
  const id = Buffer.alloc(32)
  enc(symbol).copy(id)
  return [...id]
}
const category = (c) => ({ STOCK: { stock: {} }, MEME: { meme: {} }, CRYPTO: { crypto: {} } })[c]
const pda = (program, seeds) => PublicKey.findProgramAddressSync(seeds, program.programId)[0]
const u64 = (n) => new BN(n).toArrayLike(Buffer, 'le', 8)
const programData = (program) =>
  PublicKey.findProgramAddressSync([program.programId.toBuffer()], new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'))[0]

async function exists(address) {
  return (await connection.getAccountInfo(address)) !== null
}

async function setupProgram(program, label, { initArgs }) {
  const config = pda(program, [enc('config')])
  if (!(await exists(config))) {
    await program.methods
      .initialize(...initArgs)
      .accountsPartial({ admin: admin.publicKey, config, program: program.programId, programData: programData(program) })
      .rpc()
    console.log(`${label}: initialized (oracle ${oracle.toBase58()})`)
  } else {
    console.log(`${label}: already initialized`)
  }

  // SOL stakes; the UI keeps the $1-$50 product range with a live SOL/USD quote.
  await program.methods
    .setStakeMint(NATIVE_SOL, true, new BN(LAMPORTS_PER_SOL / 200), new BN(LAMPORTS_PER_SOL))
    .accountsPartial({ admin: admin.publicKey, tokenMint: null, treasuryVault: null, tokenProgram: null, associatedTokenProgram: null })
    .rpc()
  console.log(`${label}: SOL accepted as stake currency`)

  const toApprove = catalog.assets.filter((a) => isLocal || a.approved)
  for (const asset of toApprove) {
    await program.methods
      .setApprovedAsset(assetId(asset.symbol), category(asset.category), new PublicKey(asset.pool), asset.priceDecimals, true)
      .accountsPartial({ admin: admin.publicKey })
      .rpc()
  }
  console.log(`${label}: ${toApprove.length} assets approved${isLocal ? ' (localnet: all proposed)' : ''}`)
}

async function setup() {
  await setupProgram(games, 'prophet_games', { initArgs: [oracle] })
  await race.methods
    .setCommunityPolicy({
      lobbyDuration: new BN(600),
      bettingDuration: new BN(600),
      startGrace: new BN(300),
      resolutionGrace: new BN(600),
      feeBp: 200,
      minActiveContenders: 2,
    })
    .accountsPartial({ admin: admin.publicKey })
    .rpc()
  for (const duration of [300, 900, 3600]) {
    await race.methods.setDurationPreset(new BN(duration), true).accountsPartial({ admin: admin.publicKey }).rpc()
  }
  console.log('prophet_games: community race policy and durations (5m, 15m, 1h) set')
}

async function fundedWallet(sol) {
  const wallet = Keypair.generate() // throwaway, localnet only, never stored
  const sig = await connection.requestAirdrop(wallet.publicKey, sol * LAMPORTS_PER_SOL)
  await connection.confirmTransaction(sig, 'confirmed')
  return wallet
}

const bySymbol = (symbol) => catalog.assets.find((a) => a.symbol === symbol)

// The validator's clock, not the machine's: they can drift apart, and the
// programs reject games that start in the past.
async function chainNow() {
  const clock = await connection.getAccountInfo(new PublicKey('SysvarC1ock11111111111111111111111111111111'))
  return Number(clock.data.readBigInt64LE(32))
}

async function waitForChainTime(target) {
  while ((await chainNow()) < target) await new Promise((r) => setTimeout(r, 400))
}

async function createPlatformRace(raceId, spec, now) {
  const raceKey = pda(race, [enc('race'), u64(raceId)])
  // Platform races credit the configured admin even when the race operator signs.
  const { admin: configAdmin } = await race.account.config.fetch(pda(race, [enc('config')]))
  await race.methods
    .createPlatformRace(spec.title, {
      category: category(spec.category),
      stakeMint: NATIVE_SOL,
      bettingStartTime: new BN(now),
      bettingEndTime: new BN(now + spec.betting),
      raceDuration: new BN(spec.duration),
      startGrace: new BN(300),
      resolutionGrace: new BN(600),
      feeBp: 200,
      minActiveContenders: 2,
      minStake: new BN(LAMPORTS_PER_SOL / 200),
      maxStakePerWallet: new BN(LAMPORTS_PER_SOL),
    })
    .accountsPartial({
      authority: admin.publicKey,
      race: raceKey,
      creatorEarnings: pda(race, [enc('creator'), NATIVE_SOL.toBuffer(), configAdmin.toBuffer()]),
      tokenMint: null,
      raceVault: null,
      creatorVault: null,
      tokenProgram: null,
      associatedTokenProgram: null,
    })
    .remainingAccounts(spec.symbols.map((s) => ({ pubkey: pda(race, [enc('asset'), Buffer.from(assetId(s))]), isSigner: false, isWritable: false })))
    .rpc()
  return raceKey
}

async function placeBet(raceKey, assetIndex, lamports) {
  const bettor = await fundedWallet(2)
  await race.methods
    .bet(assetIndex, new BN(lamports))
    .accountsPartial({
      bettor: bettor.publicKey,
      race: raceKey,
      tokenMint: null,
      bettorToken: null,
      raceVault: null,
      tokenProgram: null,
    })
    .signers([bettor])
    .rpc()
}

async function seed() {
  if (!isLocal) throw new Error('seed only runs on localnet')
  const raceConfig = await race.account.config.fetch(pda(race, [enc('config')]))

  const platformRaces = [
    { title: 'Magnificent tech sprint', category: 'STOCK', symbols: ['NVDAx', 'TSLAx', 'METAx', 'MSFTx'], betting: 1800, duration: 3600 },
    { title: 'Meme mayhem', category: 'MEME', symbols: ['WIF', 'POPCAT', 'PENGU', 'FARTCOIN'], betting: 900, duration: 900 },
    { title: 'Majors showdown', category: 'CRYPTO', symbols: ['SOL', 'BTC', 'ETH'], betting: 1200, duration: 3600 },
  ]
  let raceId = Number(raceConfig.raceCount)
  for (const spec of platformRaces) {
    // Read per race: earlier races' bets take long enough for a start time
    // computed once to fall into the past.
    const now = (await chainNow()) + 5
    const raceKey = await createPlatformRace(raceId, spec, now)
    await waitForChainTime(now)
    // A few bettors on different assets.
    for (let i = 0; i < spec.symbols.length; i++) {
      await placeBet(raceKey, i, Math.round(LAMPORTS_PER_SOL * (0.02 + 0.03 * i)))
    }
    console.log(`race #${raceId} "${spec.title}" with ${spec.symbols.length} bets`)
    raceId++
  }

  const arenaConfig = await arena.account.config.fetch(pda(arena, [enc('config')]))
  let arenaId = Number(arenaConfig.arenaCount)
  for (const [symbol, duration, guesses] of [
    ['SOL', 900, [148.5, 151.2, 149.9]],
    ['NVDAx', 3600, [182.1, 179.4]],
    ['WIF', 300, [0.71, 0.69, 0.74, 0.7]],
  ]) {
    const asset = bySymbol(symbol)
    const arenaKey = pda(arena, [enc('arena'), u64(arenaId)])
    await arena.methods
      .createArena(`Where will ${symbol} close?`, new BN(duration), NATIVE_SOL)
      .accountsPartial({
        creator: admin.publicKey,
        approvedAsset: pda(arena, [enc('asset'), Buffer.from(assetId(symbol))]),
        arena: arenaKey,
        tokenMint: null,
        arenaVault: null,
        creatorVault: null,
        tokenProgram: null,
        associatedTokenProgram: null,
      })
      .rpc()
    for (const guess of guesses) {
      const player = await fundedWallet(2)
      const prediction = new BN(Math.round(guess * 10 ** Math.min(asset.priceDecimals, 8))).mul(new BN(10).pow(new BN(Math.max(asset.priceDecimals - 8, 0))))
      await arena.methods
        .enterArena(prediction, new BN(LAMPORTS_PER_SOL / 20))
        .accountsPartial({
          player: player.publicKey,
          arena: arenaKey,
          tokenMint: null,
          playerToken: null,
          arenaVault: null,
          tokenProgram: null,
        })
        .signers([player])
        .rpc()
    }
    console.log(`arena #${arenaId} ${symbol} (${duration / 60}m) with ${guesses.length} entries`)
    arenaId++
  }
}

/** A short race for clicking through betting, the live view and claims in the
 * UI. Two throwaway bettors back BTC and ETH so the race has a losing pool;
 * SOL is left for the person testing. */
async function quickRace() {
  if (!isLocal) throw new Error('quick-race only runs on localnet')
  const config = await race.account.config.fetch(pda(race, [enc('config')]))
  const raceId = Number(config.raceCount)
  const betting = Number(process.env.QUICK_BETTING_S ?? 60)
  const duration = Number(process.env.QUICK_RACE_S ?? 60)
  const now = (await chainNow()) + 5
  const raceKey = await createPlatformRace(raceId, { title: 'Quick test race', category: 'CRYPTO', symbols: ['SOL', 'BTC', 'ETH'], betting, duration }, now)
  await waitForChainTime(now)
  await placeBet(raceKey, 1, LAMPORTS_PER_SOL / 20)
  await placeBet(raceKey, 2, LAMPORTS_PER_SOL / 20)
  console.log(`race #${raceId} quick: betting ${betting}s, race ${duration}s`)
}

/** Lets a separate hot key (the race scheduler) create platform races; it
 * gets no other admin power. `none` revokes it. */
async function setOperator(value) {
  if (!value) throw new Error('usage: admin.mjs set-operator <pubkey|none>')
  const operator = value === 'none' ? PublicKey.default : new PublicKey(value)
  await games.methods.setRaceOperator(operator).accountsPartial({ admin: admin.publicKey }).rpc()
  console.log(`race operator: ${value === 'none' ? 'revoked' : operator.toBase58()}`)
}

const TEST_TOKEN_DECIMALS = 6

/** A plain SPL mint (admin = mint authority) accepted for stakes of 1 to
 * 1000 tokens, for clicking through SPL-staked games. */
async function testToken() {
  if (!isLocal) throw new Error('test-token only runs on localnet')
  const mint = await createMint(connection, admin, admin.publicKey, null, TEST_TOKEN_DECIMALS, undefined, { commitment: 'confirmed' }, TOKEN_PROGRAM_ID)
  const unit = 10 ** TEST_TOKEN_DECIMALS
  const treasury = pda(games, [enc('treasury'), mint.toBuffer()])
  await games.methods
    .setStakeMint(mint, true, new BN(unit), new BN(1_000 * unit))
    .accountsPartial({
      admin: admin.publicKey,
      tokenMint: mint,
      treasuryVault: getAssociatedTokenAddressSync(mint, treasury, true, TOKEN_PROGRAM_ID),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc()
  console.log(`test token ${mint.toBase58()} (${TEST_TOKEN_DECIMALS} decimals) accepted for stakes of 1-1000`)
}

async function fundToken(mintArg, walletArg, amountArg = '500') {
  if (!isLocal) throw new Error('fund-token only runs on localnet')
  if (!mintArg || !walletArg) throw new Error('usage: admin.mjs fund-token <mint> <wallet> [amount]')
  const mint = new PublicKey(mintArg)
  const owner = new PublicKey(walletArg)
  const account = await getOrCreateAssociatedTokenAccount(connection, admin, mint, owner, true, 'confirmed')
  await mintTo(connection, admin, mint, account.address, admin, BigInt(Math.round(Number(amountArg) * 10 ** TEST_TOKEN_DECIMALS)))
  console.log(`minted ${amountArg} to ${owner.toBase58()}`)
}

const command = process.argv[2]
if (command === 'setup') await setup()
else if (command === 'seed') await seed()
else if (command === 'quick-race') await quickRace()
else if (command === 'set-operator') await setOperator(process.argv[3])
else if (command === 'test-token') await testToken()
else if (command === 'fund-token') await fundToken(process.argv[3], process.argv[4], process.argv[5])
else {
  console.error('usage: admin.mjs setup|seed|quick-race|set-operator <pubkey|none>|test-token|fund-token <mint> <wallet> [amount]')
  process.exit(1)
}
