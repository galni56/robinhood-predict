import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { NATIVE_SOL, SOL_DECIMALS } from '@/solana/config'
import { formatCompactUnits, formatUnits } from '@/lib/format'

// Every game is staked in native SOL; amounts are lamports.

export interface StakeToken {
  mint: string
  symbol: string
  decimals: number
  native: boolean
}

export const SOL_STAKE_TOKEN: StakeToken = { mint: NATIVE_SOL.toBase58(), symbol: 'SOL', decimals: SOL_DECIMALS, native: true }

/** A game's stake currency (always SOL). */
export function useStakeTokenLookup() {
  return (_mint?: string): StakeToken => SOL_STAKE_TOKEN
}

export function useStakeToken(_mint?: string): StakeToken {
  return SOL_STAKE_TOKEN
}

/** "0.05 SOL". */
export function formatStakeAmount(raw: bigint, token: StakeToken | undefined = SOL_STAKE_TOKEN, fractionalSignificantDigits = 4) {
  return formatCompactUnits(raw, token.decimals, token.symbol, fractionalSignificantDigits)
}

export function formatStakeExact(raw: bigint, token: StakeToken | undefined = SOL_STAKE_TOKEN) {
  return `${formatUnits(raw, token.decimals)} ${token.symbol}`
}

/** The connected wallet's SOL balance in lamports. */
export function useStakeBalance(_token?: StakeToken) {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  return useQuery({
    queryKey: ['stake-balance', connection.rpcEndpoint, publicKey?.toBase58()],
    queryFn: async () => BigInt(await connection.getBalance(publicKey!, 'confirmed')),
    enabled: !!publicKey,
    refetchInterval: 15_000,
  })
}

/** Pushes balance changes as they confirm (websocket), instead of waiting
 * for the next poll. Mount once, next to the wallet button. */
export function useLiveStakeBalance() {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!publicKey) return
    const key = ['stake-balance', connection.rpcEndpoint, publicKey.toBase58()]
    let id: number | null = null
    try {
      id = connection.onAccountChange(publicKey, (info) => queryClient.setQueryData(key, BigInt(info.lamports)), { commitment: 'confirmed' })
    } catch {
      return // no websocket: the 15 s poll still updates the balance
    }
    return () => {
      if (id != null) void connection.removeAccountChangeListener(id).catch(() => {})
    }
  }, [connection, publicKey, queryClient])
}
