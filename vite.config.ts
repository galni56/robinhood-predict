import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const CLUSTERS = ['localnet', 'local', 'devnet', 'mainnet-beta', 'mainnet']
/** Refuses builds that would point a mainnet site at the default RPC or at
 * no game server, or carry malformed Solana settings. */
export function validateSolanaBuild(env: Record<string, unknown>) {
  const read = (name: string) => (typeof env[name] === 'string' ? (env[name] as string).trim() : '')
  const cluster = read('VITE_SOLANA_CLUSTER')
  if (cluster && !CLUSTERS.includes(cluster)) throw new Error(`Unsupported VITE_SOLANA_CLUSTER: ${cluster}`)
  const flag = read('VITE_ALL_ASSET_TYPES_ENABLED')
  if (flag && !['true', 'false'].includes(flag)) throw new Error('VITE_ALL_ASSET_TYPES_ENABLED must be true or false')
  if (cluster === 'mainnet-beta' || cluster === 'mainnet') {
    if (!read('VITE_SOLANA_RPC_URL')) throw new Error('A mainnet build must set VITE_SOLANA_RPC_URL explicitly')
    if (read('VITE_GAME_SERVER_URL') === 'off') throw new Error('A mainnet build needs the game server')
  }
}

// Strips the path prefix so `/price-service/prices` reaches `/prices`.
function localService(prefix: string, target: string) {
  return { target, changeOrigin: true, rewrite: (p: string) => p.slice(prefix.length) || '/' }
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves a project site from /<repo-name>/, not the domain
  // root — every asset URL needs this prefix or they 404 once deployed there.
  // The VPS deploy (hastefun.xyz) serves from the domain root instead,
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
  // Same-origin paths for the off-chain services (src/solana/services.ts).
  // In dev they reach the local price service and game server; on the VPS
  // nginx proxies the same paths.
  server: {
    proxy: {
      '/price-service': localService('/price-service', process.env.PRICE_SERVICE_PROXY_URL ?? 'http://127.0.0.1:8790'),
      '/game-server': localService('/game-server', process.env.GAME_SERVER_PROXY_URL ?? 'http://127.0.0.1:8792'),
    },
  },
  plugins: [react(), tailwindcss(), {
    name: 'solana-build-config',
    apply: 'build',
    configResolved(config) {
      validateSolanaBuild(config.env)
    },
  }],
  // web3.js and its dependencies reference Node's `global`.
  define: { global: 'globalThis' },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
