import { useCallback } from 'react'
import { Transaction, type TransactionError, type TransactionInstruction } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { GameServerError, gameServerMessage } from '@/chain/gameServer'

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

/** The transaction landed and failed (nothing moved except the fee). */
export class TxFailedError extends Error {
  readonly signature: string

  constructor(signature: string, err: TransactionError) {
    super(`Transaction failed: ${JSON.stringify(err)}`)
    this.name = 'TxFailedError'
    this.signature = signature
  }
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
      if (result.value.err) throw new TxFailedError(signature, result.value.err)
      return signature
    },
    [connection, publicKey, sendTransaction],
  )
}

const REJECTED_NAMES = /WalletWindowClosedError|WalletSignTransactionError|WalletSignMessageError|WalletSendTransactionError.*reject/i

/** Short, user-facing message for a failed wallet, transaction or game server action. */
export function solanaTxError(error: unknown): string {
  if (error instanceof GameServerError) return gameServerMessage(error.code)
  if (error instanceof TxUnconfirmedError) {
    return `The transaction was submitted and may still confirm. Check your wallet activity before retrying (signature ${error.signature.slice(0, 8)}…).`
  }
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  if (/User rejected|rejected the request|Transaction cancelled/i.test(text) || (error instanceof Error && REJECTED_NAMES.test(error.name))) {
    return 'Request rejected in wallet.'
  }
  if (/insufficient (lamports|funds)|Attempt to debit an account but found no record/i.test(text)) {
    return 'Not enough SOL for this transaction and its fees.'
  }
  if (/blockhash not found|block height exceeded/i.test(text)) return 'The network was slow to confirm. Please try again.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(text)) return 'The game server is unreachable right now. Please retry in a moment.'
  return text.length > 160 ? `${text.slice(0, 157)}…` : text
}
