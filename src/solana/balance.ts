import { useQuery } from '@tanstack/react-query'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'

/** The connected wallet's SOL balance in lamports. */
export function useSolBalance() {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  return useQuery({
    queryKey: ['sol-balance', connection.rpcEndpoint, publicKey?.toBase58()],
    queryFn: async () => BigInt(await connection.getBalance(publicKey!, 'confirmed')),
    enabled: !!publicKey,
    refetchInterval: 15_000,
  })
}
