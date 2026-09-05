import { defineChain } from 'viem'
import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'

// Real Robinhood Chain testnet — separate from the mock "RHChain" in
// src/market/tokens.ts, which simulates a chain entirely in the browser.
// This is the actual chain the deployed PredictionMarket contract lives on.
export const robinhoodTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://explorer.testnet.chain.robinhood.com' },
  },
  testnet: true,
})

// `injected()` auto-discovers every EIP-6963-announcing wallet in the
// browser (MetaMask, Phantom, etc.) rather than hardcoding one — the
// connect UI lists whichever of these the user actually has installed.
export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet],
  connectors: [injected()],
  transports: {
    [robinhoodTestnet.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
