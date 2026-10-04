// PumpSwap coins for the meme category, refreshed by the game server (every
// 15 minutes by default). Pools come from GeckoTerminal's public API (most
// traded PumpSwap pools of the last 24h); the price service then reads each
// pool straight from the chain, so games still settle on signed on-chain
// prices, never on GeckoTerminal numbers.
//
// Minimal filter (owner decision, 2026-10-04): a real pump.fun coin (mint
// ends in "pump", or the PUMP token itself), paired with SOL or USDC, pool
// liquidity >= $10k, pool older than 1 hour, one coin per symbol (the one
// with the most liquidity). The top `limit` by liquidity are kept, plus any
// coin still used by a running game.

const GECKO = 'https://api.geckoterminal.com/api/v2/networks/solana/dexes/pumpswap/pools'
const WSOL = 'So11111111111111111111111111111111111111112'
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const PUMP_TOKEN = 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn'

export const PUMPSWAP_FILTER = { minLiquidityUsd: 10_000, minAgeHours: 1, limit: 15, pages: 5 }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const tokenAddress = (id) => String(id ?? '').replace(/^solana_/, '')

/** Enough decimals for ~6 significant digits of a USD price (8..18). */
export function priceDecimalsFor(priceUsd) {
  if (!(priceUsd > 0)) return 12
  return Math.min(18, Math.max(8, Math.ceil(-Math.log10(priceUsd)) + 6))
}

export async function fetchPumpSwapPools({ pages = PUMPSWAP_FILTER.pages, fetchImpl = fetch } = {}) {
  const pools = []
  for (let page = 1; page <= pages; page++) {
    let response
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetchImpl(`${GECKO}?page=${page}&sort=h24_volume_usd_desc&include=base_token,quote_token`, { signal: AbortSignal.timeout(20_000) })
      if (response.status !== 429) break
      await sleep(20_000) // rate limited: wait out the minute window
    }
    if (!response.ok) throw new Error(`GeckoTerminal ${response.status}`)
    const body = await response.json()
    if (!body.data?.length) break
    const tokens = new Map((body.included ?? []).map((t) => [t.id, t.attributes]))
    for (const p of body.data) {
      const a = p.attributes
      const base = tokens.get(p.relationships?.base_token?.data?.id)
      pools.push({
        pool: a.address,
        mint: base?.address ?? tokenAddress(p.relationships?.base_token?.data?.id),
        quote: tokenAddress(p.relationships?.quote_token?.data?.id),
        symbol: base?.symbol ?? String(a.name).split(' / ')[0],
        name: base?.name ?? a.name,
        logoUrl: base?.image_url && base.image_url !== 'missing.png' ? base.image_url : null,
        tokenDecimals: base?.decimals ?? 6,
        priceUsd: Number(a.base_token_price_usd),
        liquidityUsd: Number(a.reserve_in_usd),
        volume24hUsd: Number(a.volume_usd?.h24 ?? 0),
        createdAt: a.pool_created_at,
      })
    }
    await sleep(2_500) // GeckoTerminal allows ~30 requests a minute
  }
  return pools
}

/**
 * The PumpSwap catalog: registry-shaped assets (poolKind "pumpswap",
 * category MEME) plus display fields. `previous` keeps price decimals stable;
 * `keepSymbols` are coins used by running games (never dropped).
 */
export function selectPumpSwapAssets(pools, { takenSymbols, previous = [], keepSymbols = new Set(), now = Date.now(), filter = PUMPSWAP_FILTER } = {}) {
  const realCoin = (p) => p.mint === PUMP_TOKEN || p.mint.endsWith('pump')
  const bySymbol = new Map()
  for (const p of pools) {
    const symbol = String(p.symbol).trim()
    if (!/^[A-Za-z0-9$._-]{1,16}$/.test(symbol) || takenSymbols.has(symbol.toUpperCase())) continue
    if (!realCoin(p) || (p.quote !== WSOL && p.quote !== USDC)) continue
    if (!(p.liquidityUsd >= filter.minLiquidityUsd)) continue
    if ((now - Date.parse(p.createdAt)) / 3.6e6 < filter.minAgeHours) continue
    const key = symbol.toUpperCase()
    if (!bySymbol.has(key) || bySymbol.get(key).liquidityUsd < p.liquidityUsd) bySymbol.set(key, { ...p, symbol })
  }
  const prior = new Map(previous.map((a) => [a.symbol, a]))
  const picked = [...bySymbol.values()].sort((a, b) => b.liquidityUsd - a.liquidityUsd).slice(0, filter.limit)
  const asset = (p) => ({
    symbol: p.symbol,
    name: p.name,
    category: 'MEME',
    mint: p.mint,
    tokenDecimals: p.tokenDecimals,
    // Fixed once chosen: running games compare prices at this precision.
    priceDecimals: prior.get(p.symbol)?.mint === p.mint ? prior.get(p.symbol).priceDecimals : priceDecimalsFor(p.priceUsd),
    pool: prior.get(p.symbol)?.mint === p.mint ? prior.get(p.symbol).pool : p.pool,
    poolKind: 'pumpswap',
    quote: p.quote === USDC ? 'USDC' : 'SOL',
    icon: p.logoUrl,
    priceUrl: `https://dexscreener.com/solana/${p.pool}`,
    approved: true,
    source: 'pumpswap',
    liquidityUsd: Math.round(p.liquidityUsd),
    volume24hUsd: Math.round(p.volume24hUsd),
    poolCreatedAt: p.createdAt,
  })
  const out = picked.map(asset)
  for (const symbol of keepSymbols) {
    if (!out.some((a) => a.symbol === symbol) && prior.has(symbol)) out.push(prior.get(symbol))
  }
  return out
}
