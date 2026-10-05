import { useMemo, type ReactNode } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'
import { SOLANA_RPC_URL, SOLANA_WS_URL } from '@/solana/config'
import { ProphetWalletAdapter, ProphetWalletName, prophetWalletStore } from '@/solana/prophetWallet'

/** External extension wallets are off by default: players get the platform
 * wallet ("personal account", src/solana/prophetWallet.ts) so no extension
 * ever shows an "unsafe site" prompt. VITE_EXTERNAL_WALLETS=true brings
 * Phantom/Solflare back alongside it. */
export const EXTERNAL_WALLETS_ENABLED = import.meta.env.VITE_EXTERNAL_WALLETS === 'true'

/** Solana connection + wallet context for the whole app. `autoConnect`
 * reconnects external wallets; the platform wallet only once this tab has
 * unlocked it (its key is password-encrypted, see prophetWallet.ts). */
const autoConnect = async (adapter: { name: string }) => adapter.name !== ProphetWalletName || prophetWalletStore.canConnect()

export function SolanaProvider({ children }: { children: ReactNode }) {
  const wallets = useMemo(
    () => [
      new ProphetWalletAdapter(),
      ...(EXTERNAL_WALLETS_ENABLED ? [new PhantomWalletAdapter(), new SolflareWalletAdapter()] : []),
    ],
    [],
  )
  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL} config={{ commitment: 'confirmed', wsEndpoint: SOLANA_WS_URL }}>
      <WalletProvider wallets={wallets} autoConnect={autoConnect}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  )
}
