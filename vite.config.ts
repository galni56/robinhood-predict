import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { isAddress, zeroAddress } from 'viem'

const LEGACY_USDG_BINDINGS: Record<string, string[]> = {
  VITE_MARKET_ADDRESS: [
    '0x1a62098aced3f7f8c41fff1bc1395a541678b0f1',
    '0xd95ed19edbcd330498cade7ba8569ac940a4182f',
  ],
  VITE_ASSET_RACE_ADDRESS: ['0x63e582bb395527ced97f2f94662ea93a7edf65ff'],
  VITE_PRICE_ARENA_ADDRESS: ['0xbaca2605914d8f7f0df5663aa01f79fb8a6da8ae'],
}

export const APPROVED_NATIVE_ETH_BINDINGS = {
  VITE_MARKET_ADDRESS: '0xF62CF5Db594c4b706555584ccEC9Fb9a61541D4a',
  VITE_DEPLOY_BLOCK: '76951947',
  VITE_ASSET_RACE_ADDRESS: '0xebA246E4B548b93079Bf4D85faA50fa8b7Ff9c6e',
  VITE_ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS: '0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7',
  VITE_PRICE_ARENA_ADDRESS: '0x541be0c7c1011a63465Ff53408e9F76DA870b29f',
} as const

export const STOCK_MEME_ONLY_V2_BINDINGS = {
  VITE_ASSET_RACE_ADDRESS: '0x98f9af1756148c8995729E9ccEA770fd15124bC9',
  VITE_PRICE_ARENA_ADDRESS: '0x8c1c5544E00C2f8ea2C564B179CdEB38504805d5',
} as const

export function validateNativeEthProductionBindings(env: Record<string, unknown>) {
  for (const [name, legacyAddresses] of Object.entries(LEGACY_USDG_BINDINGS)) {
    const value = env[name]
    if (typeof value === 'string' && legacyAddresses.includes(value.trim().toLowerCase())) {
      throw new Error(`${name} points to a legacy USDG contract, not a native-ETH deployment`)
    }
  }
  const releaseEnabled = typeof env.VITE_NATIVE_ETH_RELEASE === 'string'
    ? env.VITE_NATIVE_ETH_RELEASE.trim()
    : ''
  if (releaseEnabled && !['true', 'false'].includes(releaseEnabled)) {
    throw new Error('VITE_NATIVE_ETH_RELEASE must be true or false')
  }
  if (releaseEnabled !== 'true') return

  for (const [name, expected] of Object.entries(APPROVED_NATIVE_ETH_BINDINGS)) {
    const actual = typeof env[name] === 'string' ? env[name].trim() : ''
    if (actual.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(`${name} does not match the approved native-ETH deployment`)
    }
  }
}

export function validateAssetRaceProductionBuild(env: Record<string, unknown>) {
  const network = typeof env.VITE_ASSET_RACE_NETWORK === 'string' ? env.VITE_ASSET_RACE_NETWORK.trim() : ''
  const liveEnabled = typeof env.VITE_ASSET_RACE_LIVE_ENABLED === 'string'
    ? env.VITE_ASSET_RACE_LIVE_ENABLED.trim()
    : ''
  if (network && !['local', 'robinhood-testnet', 'robinhood-mainnet', 'mainnet'].includes(network)) {
    throw new Error('Unsupported VITE_ASSET_RACE_NETWORK')
  }
  if (liveEnabled && !['true', 'false'].includes(liveEnabled)) {
    throw new Error('VITE_ASSET_RACE_LIVE_ENABLED must be true or false')
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

export function validateCryptoAssetsBuild(env: Record<string, unknown>) {
  const enabled = typeof env.VITE_ALL_ASSET_TYPES_ENABLED === 'string'
    ? env.VITE_ALL_ASSET_TYPES_ENABLED.trim()
    : ''
  if (enabled && !['true', 'false'].includes(enabled)) {
    throw new Error('VITE_ALL_ASSET_TYPES_ENABLED must be true or false')
  }
  if (enabled !== 'true') return
  for (const name of ['VITE_ASSET_RACE_ADDRESS', 'VITE_PRICE_ARENA_ADDRESS'] as const) {
    const actual = typeof env[name] === 'string' ? env[name].trim().toLowerCase() : ''
    const approved = APPROVED_NATIVE_ETH_BINDINGS[name].toLowerCase()
    if (!actual || actual !== approved) {
      throw new Error(`${name} must match the reviewed all-asset deployment before the complete asset UI is enabled`)
    }
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
    configResolved(config) {
      validateNativeEthProductionBindings(config.env)
      validateAssetRaceProductionBuild(config.env)
      validateCryptoAssetsBuild(config.env)
    },
  }],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
