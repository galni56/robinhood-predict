import { useCallback } from 'react'
import { Transaction, type TransactionError, type TransactionInstruction } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PROGRAM_IDS } from '@/solana/config'
import { GAMES_ERRORS, NICKNAME_ERRORS } from '@/solana/programErrors'

/** `signing`: the wallet prompt is open. `confirming`: broadcast, waiting for
 * the cluster. Pages use this to show the right label at the right moment. */
export type TxPhase = 'signing' | 'confirming'

/**
 * The transaction WAS broadcast but its confirmation could not be observed
 * (RPC timeout, blockhash expiry window passed, network error). It may still
 * land. Callers must refetch state and must not present this as "nothing was
 * sent" - inviting a blind retry here is how stakes get doubled.
 */
export class TxUnconfirmedError extends Error {
  readonly signature: string

  constructor(signature: string, cause: unknown) {
    super('Transaction submitted; confirmation not observed yet', { cause })
    this.name = 'TxUnconfirmedError'
    this.signature = signature
  }
}

/** The transaction landed on-chain and failed. `errorName` is the Anchor
 * error name when the failure was a program `Custom` code. */
export class ProgramTxError extends Error {
  readonly signature: string
  readonly errorName?: string

  constructor(signature: string, err: TransactionError, errorName?: string) {
    super(errorName ? `Program error: ${errorName}` : `Transaction failed: ${JSON.stringify(err)}`)
    this.name = 'ProgramTxError'
    this.signature = signature
    this.errorName = errorName
  }
}

/** Resolves an on-chain `InstructionError` custom code to its Anchor error
 * name, picking the right program's table (their codes overlap from 6000).
 * Wallets may prepend their own instructions (compute budget), shifting the
 * reported index, so when the index does not resolve we fall back to the one
 * program family present in the instructions we built. */
function decodeCustomError(err: TransactionError, instructions: TransactionInstruction[]): string | undefined {
  if (typeof err !== 'object' || err === null || !('InstructionError' in err)) return undefined
  const [index, detail] = (err as { InstructionError: [number, unknown] }).InstructionError
  const code =
    typeof detail === 'object' && detail !== null && 'Custom' in detail
      ? (detail as { Custom: number }).Custom
      : undefined
  if (code === undefined) return undefined
  const nickname = PROGRAM_IDS.nicknameRegistry.toBase58()
  const programAt = instructions[index]?.programId.toBase58()
  const usesNickname =
    programAt === nickname || (programAt === undefined && instructions.some((ix) => ix.programId.toBase58() === nickname))
  return (usesNickname ? NICKNAME_ERRORS : GAMES_ERRORS)[code]
}

/** Sends instructions as one wallet-signed transaction and waits for
 * confirmation. Returns the signature. */
export function useSendInstructions() {
  const { connection } = useConnection()
  const { publicKey, sendTransaction } = useWallet()

  return useCallback(
    async (instructions: TransactionInstruction[], { onPhase }: { onPhase?: (phase: TxPhase) => void } = {}) => {
      if (!publicKey) throw new Error('Connect a wallet first')
      const latest = await connection.getLatestBlockhash('confirmed')
      const tx = new Transaction({ feePayer: publicKey, ...latest }).add(...instructions)
      onPhase?.('signing')
      const signature = await sendTransaction(tx, connection, { preflightCommitment: 'confirmed' })
      onPhase?.('confirming')
      let result
      try {
        result = await connection.confirmTransaction({ signature, ...latest }, 'confirmed')
      } catch (cause) {
        // Already broadcast: the outcome is unknown, not a failure.
        throw new TxUnconfirmedError(signature, cause)
      }
      if (result.value.err) throw new ProgramTxError(signature, result.value.err, decodeCustomError(result.value.err, instructions))
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

const REJECTED_NAMES = /WalletWindowClosedError|WalletSignTransactionError|WalletSendTransactionError.*reject/i

function collectLogs(error: unknown): string {
  // wallet-adapter wraps the original error: logs may sit on the error
  // itself, on `.error` (WalletSendTransactionError) or down the cause chain.
  let current: unknown = error
  for (let depth = 0; depth < 5 && current; depth++) {
    const logs = (current as { logs?: string[] }).logs
    if (Array.isArray(logs)) return logs.join('\n')
    current = (current as { error?: unknown; cause?: unknown }).error ?? (current as { cause?: unknown }).cause
  }
  return ''
}

/** Short, user-facing message for a failed wallet or program action. */
export function solanaTxError(error: unknown): string {
  if (error instanceof TxUnconfirmedError) {
    return `The transaction was submitted and may still confirm. Check your wallet activity before retrying (signature ${error.signature.slice(0, 8)}…).`
  }
  if (error instanceof ProgramTxError && error.errorName) {
    return FRIENDLY_ERRORS[error.errorName] ?? `Program error: ${error.errorName}`
  }
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  if (/User rejected|rejected the request|Transaction cancelled/i.test(text) || (error instanceof Error && REJECTED_NAMES.test(error.name))) {
    return 'Request rejected in wallet.'
  }
  if (/insufficient (lamports|funds)|Attempt to debit an account but found no record/i.test(text)) {
    return 'Not enough SOL for this transaction and its fees.'
  }
  const logs = collectLogs(error)
  const named = /Error Code: (\w+)/.exec(`${text}\n${logs}`)?.[1]
  if (named) return FRIENDLY_ERRORS[named] ?? `Program error: ${named}`
  // Raw node form, e.g. "custom program error: 0x177b". Wallet preflight
  // reports it for the program being simulated; games is the default table
  // (the nickname program's named form is caught above).
  const hex = /custom program error: 0x([0-9a-f]+)/i.exec(`${text}\n${logs}`)?.[1]
  if (hex) {
    const name = GAMES_ERRORS[parseInt(hex, 16)]
    if (name) return FRIENDLY_ERRORS[name] ?? `Program error: ${name}`
  }
  if (/blockhash not found|block height exceeded/i.test(text)) return 'The network was slow to confirm. Please try again.'
  return text.length > 160 ? `${text.slice(0, 157)}…` : text
}
