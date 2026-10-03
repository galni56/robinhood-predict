// Off-chain services the frontend reads:
// - price service: display prices and the SOL/USD rate for stake quotes
//   (settlement prices are signed attestations the keeper submits, never these);
// - history indexer: one shared snapshot of games, activity, leaderboard and
//   wallet stats, so lists do not scan the program per visitor.
//
// Defaults are same-origin paths: the Vite dev server proxies them to the local
// services (vite.config.ts) and the VPS nginx proxies them in production.

function serviceUrl(value: string | undefined, fallback: string) {
  return (value?.trim() || fallback).replace(/\/+$/, '')
}

export const PRICE_SERVICE_URL = serviceUrl(import.meta.env.VITE_PRICE_SERVICE_URL, '/price-service')
export const INDEXER_URL = serviceUrl(import.meta.env.VITE_INDEXER_URL, '/indexer')
