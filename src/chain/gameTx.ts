import { BN, type Program } from '@anchor-lang/core'
import { PublicKey, type Connection, type TransactionInstruction } from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import type { ProphetGames } from '@/solana/idl/prophet_games'
import { NATIVE_SOL } from '@/solana/config'
import {
  arenaPda,
  assetPda,
  configPda,
  creatorEarningsPda,
  racePda,
  racePositionPda,
  stakeMintPda,
} from '@/solana/pda'

// Instruction builders for every player-facing action of `prophet_games`.
// Native-SOL games pass `null` for the optional token accounts; SPL games use
// associated token accounts of the player and of the game PDA (the vault).

type Games = Program<ProphetGames>
const bn = (value: bigint | number) => new BN(value.toString())

interface StakeToken {
  mint: PublicKey
  tokenProgram: PublicKey
}

async function stakeToken(connection: Connection, stakeMint: PublicKey): Promise<StakeToken | null> {
  if (stakeMint.equals(NATIVE_SOL)) return null
  const info = await connection.getAccountInfo(stakeMint)
  if (!info) throw new Error('Stake token mint not found')
  return { mint: stakeMint, tokenProgram: info.owner }
}

const ata = (token: StakeToken, owner: PublicKey) => getAssociatedTokenAddressSync(token.mint, owner, true, token.tokenProgram)

/** Payouts go to the player's associated token account; make sure it exists. */
function ensureAta(token: StakeToken | null, owner: PublicKey): TransactionInstruction[] {
  if (!token) return []
  return [createAssociatedTokenAccountIdempotentInstruction(owner, ata(token, owner), owner, token.mint, token.tokenProgram)]
}

function categoryArg(category: number) {
  if (category === 1) return { meme: {} }
  if (category === 2) return { crypto: {} }
  return { stock: {} }
}

// ---------------------------------------------------------------- Asset Race

export async function betInstructions(games: Games, args: {
  race: string
  stakeMint: string
  bettor: PublicKey
  assetIndex: number
  amount: bigint
}) {
  const race = new PublicKey(args.race)
  const token = await stakeToken(games.provider.connection, new PublicKey(args.stakeMint))
  return [await games.methods
    .bet(args.assetIndex, bn(args.amount))
    .accountsPartial({
      bettor: args.bettor,
      race,
      position: racePositionPda(race, args.bettor),
      tokenMint: token?.mint ?? null,
      bettorToken: token ? ata(token, args.bettor) : null,
      raceVault: token ? ata(token, race) : null,
      tokenProgram: token?.tokenProgram ?? null,
    })
    .instruction()]
}

export type RaceSettlementAction = 'claim' | 'refund' | 'closeLosing'

export async function settleRaceInstructions(games: Games, args: {
  race: string
  stakeMint: string
  owner: PublicKey
  action: RaceSettlementAction
}) {
  const race = new PublicKey(args.race)
  const token = await stakeToken(games.provider.connection, new PublicKey(args.stakeMint))
  const method = args.action === 'claim'
    ? games.methods.claimRace()
    : args.action === 'refund'
      ? games.methods.refundRace()
      : games.methods.closeLosingPosition()
  const instruction = await method
    .accountsPartial({
      owner: args.owner,
      race,
      position: racePositionPda(race, args.owner),
      tokenMint: token?.mint ?? null,
      raceVault: token ? ata(token, race) : null,
      ownerToken: token ? ata(token, args.owner) : null,
      tokenProgram: token?.tokenProgram ?? null,
    })
    .instruction()
  return [...ensureAta(token, args.owner), instruction]
}

export async function addLobbyAssetInstructions(games: Games, args: { race: string; adder: PublicKey; assetId: Uint8Array }) {
  return [await games.methods
    .addLobbyAsset()
    .accountsPartial({ adder: args.adder, race: new PublicKey(args.race), approvedAsset: assetPda(args.assetId) })
    .instruction()]
}

/** Permissionless lobby → betting transition (the keeper also sends it). */
export async function openBettingInstructions(games: Games, args: { race: string }) {
  return [await games.methods.openBetting().accountsPartial({ race: new PublicKey(args.race) }).instruction()]
}

export async function createCommunityRaceInstructions(games: Games, args: {
  creator: PublicKey
  title: string
  category: number
  raceDuration: bigint
  stakeMint: PublicKey
  assetIds: Uint8Array[]
}) {
  const config = await games.account.config.fetch(configPda())
  const raceId = BigInt(config.raceCount.toString())
  const race = racePda(raceId)
  const creatorEarnings = creatorEarningsPda(args.stakeMint, args.creator)
  const token = await stakeToken(games.provider.connection, args.stakeMint)
  const instruction = await games.methods
    .createCommunityRace(args.title, categoryArg(args.category), bn(args.raceDuration), args.stakeMint)
    .accountsPartial({
      creator: args.creator,
      stakeMintConfig: stakeMintPda(args.stakeMint),
      race,
      creatorEarnings,
      tokenMint: token?.mint ?? null,
      raceVault: token ? ata(token, race) : null,
      creatorVault: token ? ata(token, creatorEarnings) : null,
      tokenProgram: token?.tokenProgram ?? null,
      associatedTokenProgram: token ? ASSOCIATED_TOKEN_PROGRAM_ID : null,
    })
    .remainingAccounts(args.assetIds.map((id) => ({ pubkey: assetPda(id), isSigner: false, isWritable: false })))
    .instruction()
  return { raceId, instructions: [instruction] }
}

// --------------------------------------------------------------- Price Arena

export async function createArenaInstructions(games: Games, args: {
  creator: PublicKey
  title: string
  assetId: Uint8Array
  duration: bigint
  stakeMint: PublicKey
}) {
  const config = await games.account.config.fetch(configPda())
  const arenaId = BigInt(config.arenaCount.toString())
  const arena = arenaPda(arenaId)
  const creatorEarnings = creatorEarningsPda(args.stakeMint, args.creator)
  const token = await stakeToken(games.provider.connection, args.stakeMint)
  const instruction = await games.methods
    .createArena(args.title, bn(args.duration), args.stakeMint)
    .accountsPartial({
      creator: args.creator,
      stakeMintConfig: stakeMintPda(args.stakeMint),
      approvedAsset: assetPda(args.assetId),
      arena,
      creatorEarnings,
      tokenMint: token?.mint ?? null,
      arenaVault: token ? ata(token, arena) : null,
      creatorVault: token ? ata(token, creatorEarnings) : null,
      tokenProgram: token?.tokenProgram ?? null,
      associatedTokenProgram: token ? ASSOCIATED_TOKEN_PROGRAM_ID : null,
    })
    .instruction()
  return { arenaId, instructions: [instruction] }
}

/** New entry, or a prediction change and/or top-up of an existing one
 * (`prediction == 0` keeps the current prediction on update). */
export async function arenaEntryInstructions(games: Games, args: {
  arena: string
  stakeMint: string
  player: PublicKey
  prediction: bigint
  amount: bigint
  update: boolean
}) {
  const arena = new PublicKey(args.arena)
  const token = await stakeToken(games.provider.connection, new PublicKey(args.stakeMint))
  const method = args.update
    ? games.methods.updateArenaEntry(bn(args.prediction), bn(args.amount))
    : games.methods.enterArena(bn(args.prediction), bn(args.amount))
  return [await method
    .accountsPartial({
      player: args.player,
      arena,
      tokenMint: token?.mint ?? null,
      playerToken: token ? ata(token, args.player) : null,
      arenaVault: token ? ata(token, arena) : null,
      tokenProgram: token?.tokenProgram ?? null,
    })
    .instruction()]
}

export async function settleArenaInstructions(games: Games, args: {
  arena: string
  stakeMint: string
  player: PublicKey
  action: 'claim' | 'refund'
}) {
  const arena = new PublicKey(args.arena)
  const token = await stakeToken(games.provider.connection, new PublicKey(args.stakeMint))
  const method = args.action === 'claim' ? games.methods.claimArena() : games.methods.refundArena()
  const instruction = await method
    .accountsPartial({
      player: args.player,
      arena,
      tokenMint: token?.mint ?? null,
      arenaVault: token ? ata(token, arena) : null,
      playerToken: token ? ata(token, args.player) : null,
      tokenProgram: token?.tokenProgram ?? null,
    })
    .instruction()
  return [...ensureAta(token, args.player), instruction]
}

// ------------------------------------------------------------------ creators

export async function withdrawCreatorFeesInstructions(games: Games, args: { creator: PublicKey; stakeMint: PublicKey }) {
  const creatorEarnings = creatorEarningsPda(args.stakeMint, args.creator)
  const token = await stakeToken(games.provider.connection, args.stakeMint)
  const instruction = await games.methods
    .withdrawCreatorFees(args.stakeMint)
    .accountsPartial({
      creator: args.creator,
      creatorEarnings,
      tokenMint: token?.mint ?? null,
      creatorVault: token ? ata(token, creatorEarnings) : null,
      creatorToken: token ? ata(token, args.creator) : null,
      tokenProgram: token?.tokenProgram ?? null,
    })
    .instruction()
  return [...ensureAta(token, args.creator), instruction]
}
