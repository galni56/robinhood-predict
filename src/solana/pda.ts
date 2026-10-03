import { PublicKey } from '@solana/web3.js'
import { PROGRAM_IDS } from '@/solana/config'

// PDA derivations mirroring the seeds in solana/programs/*/src/constants.rs.

const enc = (value: string) => new TextEncoder().encode(value)

function u64le(value: bigint | number) {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true)
  return bytes
}

const find = (seeds: Uint8Array[], program: PublicKey) => PublicKey.findProgramAddressSync(seeds, program)[0]

export const nicknamePda = (owner: PublicKey) => find([enc('nickname'), owner.toBytes()], PROGRAM_IDS.nicknameRegistry)

export const raceConfigPda = () => find([enc('config')], PROGRAM_IDS.assetRace)
export const raceStakeMintPda = (mint: PublicKey) => find([enc('stake_mint'), mint.toBytes()], PROGRAM_IDS.assetRace)
export const raceTreasuryPda = (mint: PublicKey) => find([enc('treasury'), mint.toBytes()], PROGRAM_IDS.assetRace)
export const raceAssetPda = (assetId: Uint8Array) => find([enc('asset'), assetId], PROGRAM_IDS.assetRace)
export const racePda = (raceId: bigint | number) => find([enc('race'), u64le(raceId)], PROGRAM_IDS.assetRace)
export const racePositionPda = (race: PublicKey, owner: PublicKey) =>
  find([enc('position'), race.toBytes(), owner.toBytes()], PROGRAM_IDS.assetRace)
export const raceCreatorPda = (mint: PublicKey, creator: PublicKey) =>
  find([enc('creator'), mint.toBytes(), creator.toBytes()], PROGRAM_IDS.assetRace)

export const arenaConfigPda = () => find([enc('config')], PROGRAM_IDS.priceArena)
export const arenaStakeMintPda = (mint: PublicKey) => find([enc('stake_mint'), mint.toBytes()], PROGRAM_IDS.priceArena)
export const arenaTreasuryPda = (mint: PublicKey) => find([enc('treasury'), mint.toBytes()], PROGRAM_IDS.priceArena)
export const arenaAssetPda = (assetId: Uint8Array) => find([enc('asset'), assetId], PROGRAM_IDS.priceArena)
export const arenaPda = (arenaId: bigint | number) => find([enc('arena'), u64le(arenaId)], PROGRAM_IDS.priceArena)
export const arenaCreatorPda = (mint: PublicKey, creator: PublicKey) =>
  find([enc('creator'), mint.toBytes(), creator.toBytes()], PROGRAM_IDS.priceArena)

/** On-chain asset ids are the UTF-8 symbol, zero-padded to 32 bytes. */
export function assetIdFromSymbol(symbol: string) {
  const bytes = enc(symbol)
  if (bytes.length === 0 || bytes.length > 32) throw new Error(`Bad asset symbol: ${symbol}`)
  const id = new Uint8Array(32)
  id.set(bytes)
  return id
}

export function symbolFromAssetId(assetId: ArrayLike<number>) {
  const bytes = Uint8Array.from(assetId)
  const end = bytes.indexOf(0)
  return new TextDecoder().decode(end === -1 ? bytes : bytes.subarray(0, end))
}
