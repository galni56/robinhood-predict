import { useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { reportDepositSafely, useGameServerConfig } from '@/chain/gameServer'
import { stakeInstructions } from '@/chain/gameTx'
import { useSendInstructions, type TxPhase } from '@/solana/tx'

/**
 * Sends a stake (SOL transfer + memo) to the game wallet, waits for it to
 * confirm and reports it to the game server. Resolves to the message to show
 * under the form (refund reason, slow server), or null when it was accepted.
 * Throws the same errors as useSendInstructions - TxUnconfirmedError means
 * the stake may still land, so callers refetch instead of inviting a retry.
 */
export function useStakeTransfer() {
  const { publicKey } = useWallet()
  const send = useSendInstructions()
  const config = useGameServerConfig()
  const gameWallet = config.data?.gameWallet

  return useCallback(
    async (lamports: bigint, memo: string, onPhase?: (phase: TxPhase | 'recording') => void) => {
      if (!publicKey) throw new Error('Log in first')
      if (!gameWallet) throw new Error('The game server is not reachable right now')
      const signature = await send(stakeInstructions({ player: publicKey, gameWallet, lamports, memo }), { onPhase })
      onPhase?.('recording')
      return reportDepositSafely(signature)
    },
    [publicKey, gameWallet, send],
  )
}
