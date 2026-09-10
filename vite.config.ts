import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
