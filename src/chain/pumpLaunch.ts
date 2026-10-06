import { Buffer } from 'buffer'
import { ComputeBudgetProgram, PublicKey, SystemProgram, TransactionInstruction, type Keypair } from '@solana/web3.js'

// Token launch on pump.fun from our site: no program of our own. The token is
// created by pump.fun's program (create_v2, Token-2022) with the creator's
// wallet as payer and creator; it trades on pump.fun's bonding curve and moves
// to PumpSwap when it graduates, where the game server can pick it up.
//
// Account order, PDA seeds and argument layout were checked on 2026-10-05
// against pump.fun's public IDL (pump-fun/pump-public-docs, idl/pump.json)
// and a live mainnet create_v2 transaction: all nine derived addresses match.

export const PUMP_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P')
const MAYHEM_PROGRAM = new PublicKey('MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e')
const TOKEN_2022 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
const CREATE_V2 = Buffer.from([214, 144, 76, 236, 95, 139, 49, 180])

/** Metadata upload, forwarded by our VPS to pump.fun's IPFS endpoint. */
export const LAUNCH_IPFS_URL = (import.meta.env.VITE_LAUNCH_IPFS_URL?.trim() || 'https://prophetmarkets.fun/api/solana/ipfs')
/** Launches always happen on mainnet, whatever cluster the games use. */
export const LAUNCH_RPC_URL = (import.meta.env.VITE_LAUNCH_RPC_URL?.trim() || 'https://prophetmarkets.fun/api/solana/rpc')
export const LAUNCH_WS_URL = (import.meta.env.VITE_LAUNCH_WS_URL?.trim() || 'wss://prophetmarkets.fun/api/solana/ws')

export const LAUNCH_LIMITS = { name: 32, symbol: 10, description: 500, imageBytes: 4_500_000 }

const pda = (seeds: (Buffer | Uint8Array)[], program: PublicKey) => PublicKey.findProgramAddressSync(seeds, program)[0]
const ata = (mint: PublicKey, owner: PublicKey) => pda([owner.toBuffer(), TOKEN_2022.toBuffer(), mint.toBuffer()], ATA_PROGRAM)

function borshString(value: string) {
  const bytes = Buffer.from(value, 'utf8')
  const out = Buffer.alloc(4 + bytes.length)
  out.writeUInt32LE(bytes.length, 0)
  bytes.copy(out, 4)
  return out
}

export interface LaunchMetadata {
  name: string
  symbol: string
  description: string
  image: File
  twitter?: string
  telegram?: string
  website?: string
}

/** Uploads the image and the metadata; returns the metadata URI. */
export async function uploadLaunchMetadata(meta: LaunchMetadata): Promise<string> {
  const form = new FormData()
  form.append('file', meta.image)
  form.append('name', meta.name)
  form.append('symbol', meta.symbol)
  form.append('description', meta.description)
  // Always sent, empty when not given: a missing field came back from
  // pump.fun as "1", which terminals show as a broken X / Telegram link.
  form.append('twitter', meta.twitter ?? '')
  form.append('telegram', meta.telegram ?? '')
  form.append('website', meta.website ?? '')
  form.append('showName', 'true')
  const response = await fetch(LAUNCH_IPFS_URL, { method: 'POST', body: form })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || typeof body.metadataUri !== 'string') throw new Error('The image upload failed. Please try again.')
  return body.metadataUri
}

/** The memo that marks a create transaction as made on Prophet (the game server checks it). */
export const LAUNCH_MEMO = 'prophet:launch'
const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

export function launchMemoInstruction(user: PublicKey) {
  return new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [{ pubkey: user, isSigner: true, isWritable: false }], data: Buffer.from(LAUNCH_MEMO, 'utf8') })
}

/** create_v2 for a new mint, with the wallet as payer and creator. */
export function createTokenInstructions(args: { mint: Keypair; user: PublicKey; name: string; symbol: string; uri: string }): TransactionInstruction[] {
  const mint = args.mint.publicKey
  const bondingCurve = pda([Buffer.from('bonding-curve'), mint.toBuffer()], PUMP_PROGRAM)
  const solVault = pda([Buffer.from('sol-vault')], MAYHEM_PROGRAM)
  const keys = [
    { pubkey: mint, isSigner: true, isWritable: true },
    { pubkey: pda([Buffer.from('mint-authority')], PUMP_PROGRAM), isSigner: false, isWritable: false },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: ata(mint, bondingCurve), isSigner: false, isWritable: true },
    { pubkey: pda([Buffer.from('global')], PUMP_PROGRAM), isSigner: false, isWritable: false },
    { pubkey: args.user, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_2022, isSigner: false, isWritable: false },
    { pubkey: ATA_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: MAYHEM_PROGRAM, isSigner: false, isWritable: true },
    { pubkey: pda([Buffer.from('global-params')], MAYHEM_PROGRAM), isSigner: false, isWritable: false },
    { pubkey: solVault, isSigner: false, isWritable: true },
    { pubkey: pda([Buffer.from('mayhem-state'), mint.toBuffer()], MAYHEM_PROGRAM), isSigner: false, isWritable: true },
    { pubkey: ata(mint, solVault), isSigner: false, isWritable: true },
    { pubkey: pda([Buffer.from('__event_authority')], PUMP_PROGRAM), isSigner: false, isWritable: false },
    { pubkey: PUMP_PROGRAM, isSigner: false, isWritable: false },
  ]
  const data = Buffer.concat([
    CREATE_V2,
    borshString(args.name),
    borshString(args.symbol),
    borshString(args.uri),
    args.user.toBuffer(), // creator: earns pump.fun's creator fees
    // is_mayhem_mode = false, is_cashback_enabled = false, creator_fee_bps = 0
    // (program default), is_holder_reward = false.
    Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  ])
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 }),
    new TransactionInstruction({ programId: PUMP_PROGRAM, keys, data }),
  ]
}
