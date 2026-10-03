import { useMemo } from 'react'
import { AnchorProvider, Program } from '@anchor-lang/core'
import { PublicKey, type Connection, type Transaction, type VersionedTransaction } from '@solana/web3.js'
import { useAnchorWallet, useConnection, type AnchorWallet } from '@solana/wallet-adapter-react'
import { PROGRAM_IDS } from '@/solana/config'
import nicknameRegistryIdl from '@/solana/idl/nickname_registry.json'
import gamesIdl from '@/solana/idl/prophet_games.json'
import type { NicknameRegistry } from '@/solana/idl/nickname_registry'
import type { ProphetGames } from '@/solana/idl/prophet_games'

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
  /** Asset Race and Price Arena (one program). */
  games: Program<ProphetGames>
  nicknameRegistry: Program<NicknameRegistry>
}

/** Anchor clients bound to this cluster's program IDs (the IDL files carry
 * the development IDs; the configured ones win). */
export function makePrograms(connection: Connection, wallet?: AnchorWallet): Programs {
  const provider = new AnchorProvider(connection, wallet ?? readOnlyWallet, { commitment: 'confirmed' })
  return {
    games: new Program<ProphetGames>({ ...gamesIdl, address: PROGRAM_IDS.games.toBase58() } as ProphetGames, provider),
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
