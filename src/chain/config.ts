import { defineChain } from 'viem'
import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import registryJson from '../../config/asset-race-assets.json'
import type { AssetRaceNetworkKey } from '@/chain/assetRaceRegistry'

// Real Robinhood Chain mainnet - separate from the mock "RHChain" in
// src/market/tokens.ts, which simulates a chain entirely in the browser.
// This is the actual chain the deployed PredictionMarket contract lives on
// (switched from testnet to mainnet 2026-09-07, see ROADMAP.md).
// The canonical deterministic-deployment address, live on this chain
// (verified via eth_getCode) -- without this, wagmi's useReadContracts has
// no way to know a multicall aggregator exists here, so it falls back to one
// separate eth_call per contract read instead of batching a page's reads
// into one. Confirmed live 2026-09-25 after a page load fired 33 individual
// /api/rpc/ requests that should have been a handful of multicall batches.
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11'

export const robinhoodMainnet = defineChain({
  id: registryJson.networks['robinhood-mainnet'].chainId,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    // Direct browser calls to the real RPC URL are CORS-fine on a normal
    // response, but a 429 (rate limit) response has no CORS headers, which
    // the browser then reports as a blocked-by-CORS error with no usable
    // status for retry logic to act on -- confirmed live 2026-09-11 when
    // real traffic started tripping it. VITE_RPC_URL lets the VPS build
    // point this at our own nginx proxy (/api/rpc, same-origin, cached and
    // resilient to upstream 429s) instead; GitHub Pages has no server-side
    // proxy available, so it keeps hitting Robinhood directly, unchanged.
    default: { http: [import.meta.env.VITE_RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://robinhoodchain.blockscout.com' },
  },
  contracts: {
    multicall3: { address: MULTICALL3_ADDRESS },
  },
})

export const localAnvil = defineChain({
  id: registryJson.networks.local.chainId,
  name: 'Local Anvil',
  nativeCurrency: { name: 'Local Test Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_LOCAL_RPC_URL ?? 'http://127.0.0.1:8545'] },
  },
  testnet: true,
})

export const robinhoodTestnet = defineChain({
  id: registryJson.networks['robinhood-testnet'].chainId,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_ROBINHOOD_TESTNET_RPC_URL ?? 'https://rpc.testnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://explorer.testnet.chain.robinhood.com' },
  },
  testnet: true,
  contracts: {
    multicall3: { address: MULTICALL3_ADDRESS },
  },
})

const configuredAssetRaceNetwork = import.meta.env.VITE_ASSET_RACE_NETWORK?.trim()
export const assetRaceNetworkConfigError = configuredAssetRaceNetwork
  && !['local', 'robinhood-testnet', 'robinhood-mainnet', 'mainnet'].includes(configuredAssetRaceNetwork)
  ? `Unsupported VITE_ASSET_RACE_NETWORK: ${configuredAssetRaceNetwork}`
  : null
export const assetRaceNetworkKey: AssetRaceNetworkKey = configuredAssetRaceNetwork === 'local'
  ? 'local'
  : configuredAssetRaceNetwork === 'robinhood-testnet'
    ? 'robinhood-testnet'
    : 'robinhood-mainnet'
export const isLocalAssetRace = assetRaceNetworkKey === 'local'
export const assetRaceChain = assetRaceNetworkKey === 'local'
  ? localAnvil
  : assetRaceNetworkKey === 'robinhood-testnet'
    ? robinhoodTestnet
    : robinhoodMainnet

// Only MetaMask is supported. Disable EIP-6963 multi-provider discovery so
// other injected wallets (for example Phantom) cannot be added as connectors
// behind the explicitly targeted MetaMask connector.
export const wagmiConfig = createConfig({
  chains: [robinhoodMainnet, robinhoodTestnet, localAnvil],
  connectors: [injected({ target: 'metaMask' })],
  multiInjectedProviderDiscovery: false,
  transports: {
    [robinhoodMainnet.id]: http(),
    [robinhoodTestnet.id]: http(),
    [localAnvil.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
