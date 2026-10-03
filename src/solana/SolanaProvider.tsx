import { useMemo, type ReactNode } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'
import { UnsafeBurnerWalletAdapter } from '@solana/wallet-adapter-unsafe-burner'
import { SOLANA_CLUSTER, SOLANA_RPC_URL } from '@/solana/config'

/** Solana connection + wallet context for the whole app. Phantom and Solflare
 * are listed explicitly so they show (with an install link) even when the
 * extension is missing; other Wallet Standard wallets are detected too.
 * `autoConnect` reconnects a previously chosen wallet and also completes the
 * connect after a wallet is selected from the list.
 *
 * Localnet only: a throwaway in-browser "Burner Wallet" (fresh keypair in
 * memory, gone on reload) so the local stand can be clicked through without
 * an extension. Temporary; remove before launch. */
export function SolanaProvider({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    ...(SOLANA_CLUSTER === 'localnet' ? [new UnsafeBurnerWalletAdapter()] : []),
  ], [])
  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL} config={{ commitment: 'confirmed' }}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  )
}
