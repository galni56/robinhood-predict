import { PublicKey } from '@solana/web3.js'

// Solana cluster settings for the frontend. Games run on the game server
// (src/chain/gameServer.ts); the cluster is only where wallets send stakes
// and receive payouts. A mainnet build must name its RPC explicitly
// (vite.config.ts refuses to build otherwise).

export type SolanaCluster = 'localnet' | 'devnet' | 'mainnet-beta'

function parseCluster(value: string | undefined): SolanaCluster {
  const trimmed = value?.trim()
  if (trimmed === 'mainnet-beta' || trimmed === 'mainnet') return 'mainnet-beta'
  if (trimmed === 'localnet' || trimmed === 'local') return 'localnet'
  return 'devnet'
}

export const SOLANA_CLUSTER: SolanaCluster = parseCluster(import.meta.env.VITE_SOLANA_CLUSTER)

const DEFAULT_RPC: Record<SolanaCluster, string> = {
  localnet: 'http://127.0.0.1:8899',
  devnet: 'https://api.devnet.solana.com',
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
}

function absoluteRpcUrl(value: string) {
  // Relative values (the VPS proxy, e.g. "/api/solana-rpc/") resolve against
  // the page origin; web3.js needs an absolute URL.
  return value.startsWith('/') ? new URL(value, window.location.origin).toString() : value
}

export const SOLANA_RPC_URL = absoluteRpcUrl(import.meta.env.VITE_SOLANA_RPC_URL?.trim() || DEFAULT_RPC[SOLANA_CLUSTER])
/** Optional websocket endpoint (transaction confirmations); by default web3.js
 * derives it from the RPC URL. The VPS proxies one at /api/solana/ws. */
export const SOLANA_WS_URL = import.meta.env.VITE_SOLANA_WS_URL?.trim() || undefined

/** Stake currency id of native SOL (the only stake currency). */
export const NATIVE_SOL = PublicKey.default

export const LAMPORTS_PER_SOL = 1_000_000_000n
export const SOL_DECIMALS = 9

const EXPLORER_CLUSTER_PARAM: Record<SolanaCluster, string> = {
  localnet: `?cluster=custom&customUrl=${encodeURIComponent(DEFAULT_RPC.localnet)}`,
  devnet: '?cluster=devnet',
  'mainnet-beta': '',
}

export function explorerUrl(kind: 'tx' | 'address', value: string) {
  return `https://explorer.solana.com/${kind}/${value}${EXPLORER_CLUSTER_PARAM[SOLANA_CLUSTER]}`
}
