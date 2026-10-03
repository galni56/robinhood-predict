import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL, SOLANA_CLUSTER } from '@/solana/config'

const AIRDROP_SOL = 2n

/** Localnet only: mints test SOL to the connected wallet from the local
 * validator's faucet. Temporary, together with the burner wallet. */
export function LocalnetAirdropButton({ onDone }: { onDone?: () => void }) {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const queryClient = useQueryClient()
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle')
  if (SOLANA_CLUSTER !== 'localnet' || !publicKey) return null

  async function airdrop() {
    setState('pending')
    try {
      const signature = await connection.requestAirdrop(publicKey!, Number(AIRDROP_SOL * LAMPORTS_PER_SOL))
      const latest = await connection.getLatestBlockhash('confirmed')
      await connection.confirmTransaction({ signature, ...latest }, 'confirmed')
      await queryClient.invalidateQueries({ queryKey: ['sol-balance'] })
      setState('done')
      onDone?.()
    } catch (error) {
      console.error('[localnet-airdrop]', error)
      setState('error')
    }
  }

  return (
    <button
      onClick={airdrop}
      disabled={state === 'pending'}
      className="w-full text-left px-3 py-2 text-emerald-300 hover:bg-white/5 disabled:opacity-50"
    >
      {state === 'pending' ? 'Requesting test SOL…' : state === 'done' ? `+${AIRDROP_SOL} test SOL received` : state === 'error' ? 'Airdrop failed - retry' : `Get ${AIRDROP_SOL} test SOL (localnet)`}
    </button>
  )
}
