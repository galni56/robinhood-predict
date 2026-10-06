import { useQuery } from '@tanstack/react-query'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import type { ParsedInstruction, ParsedTransactionWithMeta, PartiallyDecodedInstruction } from '@solana/web3.js'
import { useGameServerConfig } from '@/chain/gameServer'

// The account's SOL history, read from the chain: top-ups, withdrawals,
// stakes sent to the game wallet and payouts from it. Each row is the
// account's balance change in one transaction (fees included).

export type WalletHistoryKind = 'topup' | 'withdrawal' | 'stake' | 'payout' | 'other'

export interface WalletHistoryRow {
  signature: string
  time: number | null
  kind: WalletHistoryKind
  /** Signed balance change in lamports. */
  change: bigint
  /** "Duel #12", "Arena #4"... for stakes. */
  game: string | null
  failed: boolean
}

const LIMIT = 40
const GAME_LABEL: Record<string, string> = { duel: 'Duel', arena: 'Arena', race: 'Race' }

type Ix = ParsedInstruction | PartiallyDecodedInstruction
const transfers = (tx: ParsedTransactionWithMeta) => {
  const all: Ix[] = [...tx.transaction.message.instructions, ...(tx.meta?.innerInstructions ?? []).flatMap((g) => g.instructions)]
  return all.flatMap((ix) => ('parsed' in ix && ix.program === 'system' && ix.parsed?.type === 'transfer' ? [ix.parsed.info as { source: string; destination: string }] : []))
}
const memos = (tx: ParsedTransactionWithMeta) =>
  tx.transaction.message.instructions.flatMap((ix) => ('parsed' in ix && ix.program === 'spl-memo' && typeof ix.parsed === 'string' ? [ix.parsed] : []))

export function classify(tx: ParsedTransactionWithMeta, me: string, gameWallet: string | undefined): WalletHistoryRow | null {
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58())
  const index = keys.indexOf(me)
  if (index < 0 || !tx.meta) return null
  const change = BigInt(tx.meta.postBalances[index]) - BigInt(tx.meta.preBalances[index])
  const moves = transfers(tx)
  const toGame = gameWallet != null && moves.some((t) => t.source === me && t.destination === gameWallet)
  const fromGame = gameWallet != null && moves.some((t) => t.source === gameWallet && t.destination === me)
  const stakeMemo = memos(tx).map((m) => /prophet:(duel|arena|race):(\d+)/.exec(m)).find(Boolean)
  const kind: WalletHistoryKind = toGame ? 'stake' : fromGame ? 'payout' : moves.some((t) => t.destination === me) && change > 0n ? 'topup' : moves.some((t) => t.source === me) ? 'withdrawal' : 'other'
  return {
    signature: tx.transaction.signatures[0],
    time: tx.blockTime ?? null,
    kind,
    change,
    game: stakeMemo ? `${GAME_LABEL[stakeMemo[1]]} #${stakeMemo[2]}` : null,
    failed: tx.meta.err != null,
  }
}

/** The connected account's latest transactions, newest first. */
export function useWalletHistory(enabled: boolean) {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const gameWallet = useGameServerConfig().data?.gameWallet
  return useQuery({
    queryKey: ['wallet-history', connection.rpcEndpoint, publicKey?.toBase58(), gameWallet],
    enabled: enabled && !!publicKey,
    staleTime: 10_000,
    queryFn: async () => {
      const me = publicKey!.toBase58()
      const signatures = await connection.getSignaturesForAddress(publicKey!, { limit: LIMIT }, 'confirmed')
      if (signatures.length === 0) return []
      const txs = await connection.getParsedTransactions(signatures.map((s) => s.signature), { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
      return txs.flatMap((tx) => {
        const row = tx ? classify(tx, me, gameWallet) : null
        return row ? [row] : []
      })
    },
  })
}
