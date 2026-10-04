// Off-chain services the frontend reads:
// - price service: display prices and the SOL/USD rate for stake quotes
//   (games settle on the boundary prices the game server gets from it);
// - game server: every race and arena, activity, leaderboards and wallet
//   history; it applies stakes sent to the game wallet and pays winners.
//
// Defaults are same-origin paths: the Vite dev server proxies them to the local
// services (vite.config.ts) and the VPS nginx proxies them in production.
// `off` disables a service (a static preview without servers).

function serviceUrl(value: string | undefined, fallback: string) {
  const trimmed = value?.trim()
  if (trimmed === 'off') return null
  return (trimmed || fallback).replace(/\/+$/, '')
}

export const PRICE_SERVICE_URL = serviceUrl(import.meta.env.VITE_PRICE_SERVICE_URL, '/price-service')
export const GAME_SERVER_URL = serviceUrl(import.meta.env.VITE_GAME_SERVER_URL, '/game-server')
