// PumpSwap coins for the meme category, refreshed by the game server (every
// 15 minutes by default). Pools come from GeckoTerminal's public API (most
// traded PumpSwap pools of the last 24h); the price service then reads each
// pool straight from the chain, so games still settle on signed on-chain
// prices, never on GeckoTerminal numbers.
//
// Minimal filter (owner decision, 2026-10-04): a real pump.fun coin (mint
// ends in "pump", the PUMP token itself, or a mint whose pump.fun bonding
// curve exists - coins launched from our site have ordinary addresses),
// paired with SOL or USDC, pool
// liquidity >= $10k, pool older than 1 hour, one coin per symbol (the one
// with the most liquidity).
//
// The list accumulates (owner, 2026-10-06): a coin stays after it leaves the
// top pages, up to `limit` coins (40). It goes when we see it fail the filter
// (liquidity under $10k), when it is blocklisted, or after `staleDays` (7)
// without being seen. Over the limit the least liquid make room; Prophet
// launches and coins of running games are never dropped. 40 coins x 3
// accounts (pool + vaults) keeps the price service well under its 250 subscriptions.

const GECKO = 'https://api.geckoterminal.com/api/v2/networks/solana/dexes/pumpswap/pools'
const WSOL = 'So11111111111111111111111111111111111111112'
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const PUMP_TOKEN = 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn'

export const PUMPSWAP_FILTER = { minLiquidityUsd: 10_000, minAgeHours: 1, limit: 40, pages: 10, staleDays: 7 }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const tokenAddress = (id) => String(id ?? '').replace(/^solana_/, '')

/** Enough decimals for ~6 significant digits of a USD price (8..18). */
export function priceDecimalsFor(priceUsd) {
  if (!(priceUsd > 0)) return 12
  return Math.min(18, Math.max(8, Math.ceil(-Math.log10(priceUsd)) + 6))
}

const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'

/** Mints (among `mints`) that pump.fun created: their bonding curve account exists. */
export async function pumpFunMints(connection, mints, PublicKey) {
  const program = new PublicKey(PUMP_PROGRAM)
  const curves = mints.map((m) => PublicKey.findProgramAddressSync([Buffer.from('bonding-curve'), new PublicKey(m).toBuffer()], program)[0])
  const found = new Set()
  for (let i = 0; i < curves.length; i += 100) {
    const infos = await connection.getMultipleAccountsInfo(curves.slice(i, i + 100))
    infos.forEach((info, k) => { if (info && info.owner.toBase58() === PUMP_PROGRAM) found.add(mints[i + k]) })
  }
  return found
}

/** Two views of PumpSwap (10 pages each, the most the free API serves): by 24 h volume and by trade count. */
const SORTS = ['h24_volume_usd_desc', 'h24_tx_count_desc']

export async function fetchPumpSwapPools({ pages = PUMPSWAP_FILTER.pages, fetchImpl = fetch } = {}) {
  const byPool = new Map()
  for (const sort of SORTS) {
    try {
      for (const p of await fetchSorted(sort, pages, fetchImpl)) byPool.set(p.pool, p)
    } catch (error) {
      // The first view is required; a failed second one only means fewer candidates.
      if (sort === SORTS[0]) throw error
    }
  }
  return [...byPool.values()]
}

async function fetchSorted(sort, pages, fetchImpl) {
  const pools = []
  for (let page = 1; page <= pages; page++) {
    let response
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetchImpl(`${GECKO}?page=${page}&sort=${sort}&include=base_token,quote_token`, { signal: AbortSignal.timeout(20_000) })
      if (response.status !== 429) break
      await sleep(20_000) // rate limited: wait out the minute window
    }
    // GeckoTerminal's free API serves 10 pages; past what it serves, keep what we have.
    if (!response.ok) {
      if (page > 1) break
      throw new Error(`GeckoTerminal ${response.status}`)
    }
    const body = await response.json()
    if (!body.data?.length) break
    pools.push(...parsePools(body))
    await sleep(2_500) // GeckoTerminal allows ~30 requests a minute
  }
  return pools
}

/** GeckoTerminal pool rows -> our pool objects (PumpSwap pools only). */
function parsePools(body) {
  const tokens = new Map((body.included ?? []).map((t) => [t.id, t.attributes]))
  return (body.data ?? []).filter((p) => (p.relationships?.dex?.data?.id ?? 'pumpswap') === 'pumpswap').map((p) => {
    const a = p.attributes
    const base = tokens.get(p.relationships?.base_token?.data?.id)
    return {
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
    }
  })
}

/**
 * The PumpSwap pools of specific mints (coins launched on Prophet), which
 * the volume-sorted pages above may not reach. A coin still on its pump.fun
 * curve has none yet.
 */
export async function fetchTokenPools(mints, { fetchImpl = fetch } = {}) {
  const pools = []
  for (const mint of mints) {
    const response = await fetchImpl(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools?include=base_token,quote_token`, { signal: AbortSignal.timeout(20_000) })
    if (response.ok) pools.push(...parsePools(await response.json()).filter((p) => p.mint === mint))
    await sleep(2_500)
  }
  return pools
}

/**
 * The PumpSwap catalog: registry-shaped assets (poolKind "pumpswap",
 * category MEME) plus display fields. `previous` keeps price decimals stable;
 * `keepSymbols` are coins used by running games (never dropped).
 */
export function selectPumpSwapAssets(pools, { takenSymbols, previous = [], keepSymbols = new Set(), now = Date.now(), filter = PUMPSWAP_FILTER, pumpMints = new Set(), blocked = { mints: new Set(), symbols: new Set() }, launched = new Set() } = {}) {
  // Coins launched on Prophet are pump.fun coins by construction (verified at launch).
  const realCoin = (p) => p.mint === PUMP_TOKEN || p.mint.endsWith('pump') || pumpMints.has(p.mint) || launched.has(p.mint)
  const bySymbol = new Map()
  // Mints seen with a pool that fails only on liquidity: the one reason to drop a kept coin.
  const lowLiquidity = new Set()
  for (const p of pools) {
    const symbol = String(p.symbol).trim()
    if (!/^[A-Za-z0-9$._-]{1,16}$/.test(symbol) || takenSymbols.has(symbol.toUpperCase())) continue
    if (!realCoin(p) || (p.quote !== WSOL && p.quote !== USDC)) continue
    // Hand-picked honeypots and wash-traded coins (config/pumpswap-blocklist.json).
    if (blocked.mints.has(p.mint) || blocked.symbols.has(symbol.toUpperCase())) continue
    if (!(p.liquidityUsd >= filter.minLiquidityUsd)) {
      lowLiquidity.add(p.mint)
      continue
    }
    if ((now - Date.parse(p.createdAt)) / 3.6e6 < filter.minAgeHours) continue
    const key = symbol.toUpperCase()
    if (!bySymbol.has(key) || bySymbol.get(key).liquidityUsd < p.liquidityUsd) bySymbol.set(key, { ...p, symbol })
  }
  const prior = new Map(previous.map((a) => [a.symbol, a]))
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
    ...(launched.has(p.mint) ? { launchedOnProphet: true } : {}),
    liquidityUsd: Math.round(p.liquidityUsd),
    volume24hUsd: Math.round(p.volume24hUsd),
    poolCreatedAt: p.createdAt,
    addedAt: prior.get(p.symbol)?.mint === p.mint && prior.get(p.symbol).addedAt ? prior.get(p.symbol).addedAt : new Date(now).toISOString(),
    lastSeenAt: new Date(now).toISOString(),
  })
  const fresh = [...bySymbol.values()].map(asset)
  // Seen this time with liquidity under the floor (and no pool above it): out. A
  // young pool, another pair or a failed check never drops a coin we keep.
  const passingMints = new Set([...bySymbol.values()].map((p) => p.mint))
  const failedMints = new Set([...lowLiquidity].filter((m) => !passingMints.has(m)))
  const staleMs = (filter.staleDays ?? 7) * 86_400_000
  const kept = previous.filter((a) => {
    const key = String(a.symbol).toUpperCase()
    if (bySymbol.has(key) || takenSymbols.has(key)) return false
    if (blocked.mints.has(a.mint) || blocked.symbols.has(key)) return false
    if (keepSymbols.has(a.symbol)) return true
    if (failedMints.has(a.mint)) return false
    return now - Date.parse(a.lastSeenAt ?? a.addedAt ?? 0) < staleMs
  })
  const protectedCoin = (a) => launched.has(a.mint) || a.launchedOnProphet === true || keepSymbols.has(a.symbol)
  const all = [...fresh, ...kept]
  const others = all.filter((a) => !protectedCoin(a)).sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
  return [...all.filter(protectedCoin), ...others.slice(0, filter.limit)]
}
