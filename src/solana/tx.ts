import { useCallback } from 'react'
import { Transaction, type TransactionInstruction } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'

/** Sends instructions as one wallet-signed transaction and waits for
 * confirmation. Returns the signature. */
export function useSendInstructions() {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()

  return useCallback(
    async (instructions: TransactionInstruction[]) => {
      if (!publicKey) throw new Error('Connect a wallet first')
      const latest = await connection.getLatestBlockhash('confirmed')
      const tx = new Transaction({ feePayer: publicKey, ...latest }).add(...instructions)
      const signature = await sendTransaction(tx, connection, { preflightCommitment: 'confirmed' })
      const result = await connection.confirmTransaction({ signature, ...latest }, 'confirmed')
      if (result.value.err) throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`)
      return signature
    },
    [connection, publicKey, sendTransaction],
  )
}

// Program error names (Anchor `#[error_code]`) the UI can explain in plain words.
const FRIENDLY_ERRORS: Record<string, string> = {
  ActivityPaused: 'New games and bets are paused right now.',
  BettingNotOpen: 'Betting is not open for this race.',
  StakeBelowMinimum: 'The stake is below the minimum.',
  StakeExceedsMaximum: 'That would exceed the per-wallet maximum.',
  InvalidStake: 'The stake is outside this arena’s limits.',
  WrongAsset: 'You already backed another asset in this race.',
  LobbyClosed: 'The lobby has closed.',
  ArenaFull: 'This arena is full.',
  AlreadyEntered: 'You already entered this arena.',
  NothingChanged: 'Nothing to change.',
  AlreadySettled: 'Already claimed or refunded.',
  NoWinningPosition: 'This position did not win.',
  NoWinningPayout: 'This entry did not win.',
  UnsupportedStakeMint: 'That stake currency is not accepted.',
  NicknameTooLong: 'Nicknames are at most 24 bytes.',
}

/** Short, user-facing message for a failed wallet or program action. */
export function solanaTxError(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  if (/User rejected|rejected the request|WalletSignTransactionError.*reject/i.test(text)) return 'Request rejected in wallet.'
  if (/insufficient (lamports|funds)|Attempt to debit an account but found no record/i.test(text)) {
    return 'Not enough SOL for this transaction and its fees.'
  }
  const logs = (error as { logs?: string[] } | undefined)?.logs?.join('\n') ?? ''
  const code = /Error Code: (\w+)/.exec(`${text}\n${logs}`)?.[1]
  if (code) return FRIENDLY_ERRORS[code] ?? `Program error: ${code}`
  if (/blockhash not found|block height exceeded/i.test(text)) return 'The network was slow to confirm. Please try again.'
  return text.length > 160 ? `${text.slice(0, 157)}…` : text
}
