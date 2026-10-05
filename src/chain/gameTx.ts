import { Buffer } from 'buffer'
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'

// A stake is one plain SOL transfer to the game wallet plus one memo naming
// its purpose; the game server applies it (scripts/solana/game-server/rules.mjs):
//   prophet:race:<raceId>:<assetIndex>
//   prophet:arena:<arenaId>:<prediction>   (0 keeps the prediction: a top-up)
// Anything the server cannot apply (late, over the limit...) is refunded.

export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

export const raceStakeMemo = (raceId: bigint | number, assetIndex: number) => `prophet:race:${raceId}:${assetIndex}`
export const arenaStakeMemo = (arenaId: bigint | number, prediction: bigint) => `prophet:arena:${arenaId}:${prediction}`

export function stakeInstructions(args: { player: PublicKey; gameWallet: string; lamports: bigint; memo: string }): TransactionInstruction[] {
  return [
    SystemProgram.transfer({ fromPubkey: args.player, toPubkey: new PublicKey(args.gameWallet), lamports: args.lamports }),
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: args.player, isSigner: true, isWritable: false }],
      data: Buffer.from(args.memo, 'utf8'),
    }),
  ]
}
