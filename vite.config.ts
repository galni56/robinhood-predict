import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { isAddress, zeroAddress } from 'viem'

export function validateAssetRaceProductionBuild(env: Record<string, unknown>) {
  const network = typeof env.VITE_ASSET_RACE_NETWORK === 'string' ? env.VITE_ASSET_RACE_NETWORK.trim() : ''
  if (network && !['local', 'robinhood-testnet', 'robinhood-mainnet', 'mainnet'].includes(network)) {
    throw new Error('Unsupported VITE_ASSET_RACE_NETWORK')
  }
  if (network === 'local' || network === 'robinhood-testnet') return
  if (!network && !env.VITE_ASSET_RACE_ADDRESS) return // Deliberately unconfigured, labelled preview.
  for (const name of ['VITE_ASSET_RACE_ADDRESS', 'VITE_ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS']) {
    const value = env[name]
    if (typeof value !== 'string' || !isAddress(value.trim()) || value.trim().toLowerCase() === zeroAddress) {
      throw new Error(`Production Asset Race requires a nonzero ${name}`)
    }
  }
  if (String(env.VITE_ASSET_RACE_ADDRESS).trim().toLowerCase()
    === String(env.VITE_ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS).trim().toLowerCase()) {
    throw new Error('AssetRace and signed oracle must use different contract addresses')
  }
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves a project site from /<repo-name>/, not the domain
  // root — every asset URL needs this prefix or they 404 once deployed there.
  // The VPS deploy (prophetmarkets.fun) serves from the domain root instead,
  // so it builds with VITE_BASE_PATH=/ to override this default.
  base: process.env.VITE_BASE_PATH ?? '/robinhood-predict/',
  // Vite blocks requests with an unrecognized Host header by default (DNS-
  // rebinding protection) — needed here because `vite preview` gets proxied
  // through a Cloudflare quick tunnel, which arrives with a *.trycloudflare.com
  // Host. Only affects local `vite preview`, not the production build/GitHub
  // Pages deploy.
  preview: {
    allowedHosts: ['.trycloudflare.com'],
  },
  // Mirrors the nginx reverse-proxy on the VPS (/api/robinhood/ ->
  // https://api.robinhood.com/rhj/) so `npm run dev` behaves the same as
  // prod — the browser can't call api.robinhood.com directly (no CORS
  // headers on that API), so both dev and prod proxy it server-side under
  // our own origin instead.
  server: {
    proxy: {
      '/api/robinhood': {
        target: 'https://api.robinhood.com/rhj',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/robinhood/, ''),
      },
      // Mirrors the VPS's /api/rpc proxy (see src/chain/config.ts) so a dev
      // session with VITE_RPC_URL=/api/rpc/ set locally behaves the same way.
      '/api/rpc': {
        target: 'https://rpc.mainnet.chain.robinhood.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/rpc/, ''),
      },
      '/api/asset-race/live': {
        target: process.env.ASSET_RACE_LIVE_PROXY_URL ?? 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), tailwindcss(), {
    name: 'asset-race-production-config',
    apply: 'build',
    configResolved(config) { validateAssetRaceProductionBuild(config.env) },
  }],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
