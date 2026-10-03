import { PublicKey } from '@solana/web3.js'

// Solana cluster and program bindings for the frontend.
//
// Defaults point at devnet with the development program IDs built in
// `solana/` (see docs/SOLANA_CHANGELOG.md). A mainnet build must name every
// program explicitly; vite.config.ts refuses to build otherwise.

export type SolanaCluster = 'localnet' | 'devnet' | 'mainnet-beta'

const DEV_PROGRAM_IDS = {
  // Asset Race and Price Arena share one program.
  games: 'G1xjFqQ976m5xsybUCjLxjJxRCcx3PCwpxBgj7VM6ME7',
  nicknameRegistry: '9hbJLs2EGPdvVLcxQs2N2QqZUhh8r2J86PK8rYBRxJdt',
} as const

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

function programId(envValue: string | undefined, fallback: string) {
  return new PublicKey(envValue?.trim() || fallback)
}

export const PROGRAM_IDS = {
  games: programId(import.meta.env.VITE_GAMES_PROGRAM_ID, DEV_PROGRAM_IDS.games),
  nicknameRegistry: programId(import.meta.env.VITE_NICKNAME_PROGRAM_ID, DEV_PROGRAM_IDS.nicknameRegistry),
}

/** Stake-mint sentinel for native SOL, mirroring `NATIVE_SOL` on-chain. */
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
