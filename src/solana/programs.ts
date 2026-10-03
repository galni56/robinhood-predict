import { useMemo } from 'react'
import { AnchorProvider, Program } from '@anchor-lang/core'
import { PublicKey, type Connection, type Transaction, type VersionedTransaction } from '@solana/web3.js'
import { useAnchorWallet, useConnection, type AnchorWallet } from '@solana/wallet-adapter-react'
import { PROGRAM_IDS } from '@/solana/config'
import assetRaceIdl from '@/solana/idl/asset_race.json'
import nicknameRegistryIdl from '@/solana/idl/nickname_registry.json'
import priceArenaIdl from '@/solana/idl/price_arena.json'
import type { AssetRace } from '@/solana/idl/asset_race'
import type { NicknameRegistry } from '@/solana/idl/nickname_registry'
import type { PriceArena } from '@/solana/idl/price_arena'

// Reads need no wallet. Anchor still wants one, so reads use a placeholder
// that refuses to sign.
const readOnlyWallet: AnchorWallet = {
  publicKey: PublicKey.default,
  signTransaction: async <T extends Transaction | VersionedTransaction>(): Promise<T> => {
    throw new Error('Connect a wallet to sign')
  },
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(): Promise<T[]> => {
    throw new Error('Connect a wallet to sign')
  },
}

export interface Programs {
  assetRace: Program<AssetRace>
  priceArena: Program<PriceArena>
  nicknameRegistry: Program<NicknameRegistry>
}

/** Anchor clients bound to this cluster's program IDs (the IDL files carry
 * the development IDs; the configured ones win). */
export function makePrograms(connection: Connection, wallet?: AnchorWallet): Programs {
  const provider = new AnchorProvider(connection, wallet ?? readOnlyWallet, { commitment: 'confirmed' })
  return {
    assetRace: new Program<AssetRace>({ ...assetRaceIdl, address: PROGRAM_IDS.assetRace.toBase58() } as AssetRace, provider),
    priceArena: new Program<PriceArena>({ ...priceArenaIdl, address: PROGRAM_IDS.priceArena.toBase58() } as PriceArena, provider),
    nicknameRegistry: new Program<NicknameRegistry>(
      { ...nicknameRegistryIdl, address: PROGRAM_IDS.nicknameRegistry.toBase58() } as NicknameRegistry,
      provider,
    ),
  }
}

export function usePrograms(): Programs {
  const { connection } = useConnection()
  const wallet = useAnchorWallet()
  return useMemo(() => makePrograms(connection, wallet), [connection, wallet])
}
