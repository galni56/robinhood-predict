// Off-chain services the frontend reads:
// - price service: display prices and the SOL/USD rate for stake quotes
//   (settlement prices are signed attestations the keeper submits, never these);
// - history indexer: one shared snapshot of games, activity, leaderboard and
//   wallet stats, so lists do not scan the program per visitor.
//
// Defaults are same-origin paths: the Vite dev server proxies them to the local
// services (vite.config.ts) and the VPS nginx proxies them in production.
// `off` disables a service (a static host such as GitHub Pages has neither):
// lists then read the program directly and USD stake quotes are unavailable.

function serviceUrl(value: string | undefined, fallback: string) {
  const trimmed = value?.trim()
  if (trimmed === 'off') return null
  return (trimmed || fallback).replace(/\/+$/, '')
}

export const PRICE_SERVICE_URL = serviceUrl(import.meta.env.VITE_PRICE_SERVICE_URL, '/price-service')
export const INDEXER_URL = serviceUrl(import.meta.env.VITE_INDEXER_URL, '/indexer')
