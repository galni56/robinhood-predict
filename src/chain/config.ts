import { defineChain } from 'viem'
import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'

// Real Robinhood Chain mainnet — separate from the mock "RHChain" in
// src/market/tokens.ts, which simulates a chain entirely in the browser.
// This is the actual chain the deployed PredictionMarket contract lives on
// (switched from testnet to mainnet 2026-09-07, see ROADMAP.md).
export const robinhoodMainnet = defineChain({
  id: 4663,
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
})

// `injected()` auto-discovers every EIP-6963-announcing wallet in the
// browser (MetaMask, Phantom, etc.) rather than hardcoding one — the
// connect UI lists whichever of these the user actually has installed.
export const wagmiConfig = createConfig({
  chains: [robinhoodMainnet],
  connectors: [injected()],
  transports: {
    [robinhoodMainnet.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
