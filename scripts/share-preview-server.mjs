#!/usr/bin/env node

import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { createPublicClient, defineChain, formatUnits, hexToString, http, isAddress } from 'viem'

const DEFAULT_ORIGIN = 'https://prophetmarkets.fun'
const DEFAULT_MARKET_ADDRESS = '0x1a62098AcEd3F7F8C41fff1bc1395A541678b0F1'
const DEFAULT_RACE_ADDRESS = '0x63E582bb395527CED97F2F94662eA93A7EDf65Ff'
const DEFAULT_ARENA_ADDRESS = '0xBAca2605914d8f7f0DF5663AA01f79FB8a6DA8ae'

const marketAbi = [
  { type: 'function', name: 'marketCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'getMarket', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ type: 'tuple', components: [
      { name: 'assetId', type: 'bytes32' }, { name: 'oracleId', type: 'bytes32' },
      { name: 'priceDecimals', type: 'uint8' }, { name: 'targetPrice', type: 'int256' },
      { name: 'createdAt', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
      { name: 'poolYes', type: 'uint256' }, { name: 'poolNo', type: 'uint256' },
      { name: 'weightedPoolYes', type: 'uint256' }, { name: 'weightedPoolNo', type: 'uint256' },
      { name: 'status', type: 'uint8' }, { name: 'outcome', type: 'uint8' }, { name: 'feeBp', type: 'uint256' },
    ] }],
  },
]

const raceAbi = [
  { type: 'function', name: 'raceCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'getRace', stateMutability: 'view', inputs: [{ name: 'raceId', type: 'uint256' }],
    outputs: [{ type: 'tuple', components: [
      { name: 'category', type: 'uint8' }, { name: 'status', type: 'uint8' },
      { name: 'bettingStartTime', type: 'uint64' }, { name: 'bettingEndTime', type: 'uint64' },
      { name: 'actualStartTime', type: 'uint64' }, { name: 'raceEndTime', type: 'uint64' },
      { name: 'resolvedAt', type: 'uint64' }, { name: 'raceDuration', type: 'uint64' },
      { name: 'startGrace', type: 'uint64' }, { name: 'resolutionGrace', type: 'uint64' },
      { name: 'maxOracleTimestampSkew', type: 'uint64' }, { name: 'feeBp', type: 'uint16' },
      { name: 'minActiveContenders', type: 'uint8' }, { name: 'candidateCount', type: 'uint8' },
      { name: 'activeCount', type: 'uint8' }, { name: 'winningAssetIndex', type: 'uint8' },
      { name: 'endSnapshotsCaptured', type: 'bool' }, { name: 'minStake', type: 'uint256' },
      { name: 'maxStakePerWallet', type: 'uint256' }, { name: 'totalPool', type: 'uint256' },
      { name: 'winningPool', type: 'uint256' }, { name: 'distributableLosingPool', type: 'uint256' },
      { name: 'protocolFee', type: 'uint256' }, { name: 'remainingLiability', type: 'uint256' },
      { name: 'origin', type: 'uint8' }, { name: 'creator', type: 'address' },
      { name: 'title', type: 'string' }, { name: 'lobbyEndTime', type: 'uint64' },
      { name: 'bettingWindow', type: 'uint64' },
    ] }],
  },
  {
    type: 'function', name: 'getRaceAssets', stateMutability: 'view', inputs: [{ name: 'raceId', type: 'uint256' }],
    outputs: [{ type: 'tuple[]', components: [
      { name: 'assetId', type: 'bytes32' }, { name: 'oracle', type: 'address' },
      { name: 'oracleId', type: 'bytes32' }, { name: 'expectedDecimals', type: 'uint8' },
      { name: 'maxPriceAge', type: 'uint64' }, { name: 'maxEndpointLag', type: 'uint64' },
      { name: 'active', type: 'bool' }, { name: 'pool', type: 'uint256' },
      { name: 'startPrice', type: 'uint256' }, { name: 'endPrice', type: 'uint256' },
      { name: 'startOracleUpdatedAt', type: 'uint256' }, { name: 'endOracleUpdatedAt', type: 'uint256' },
      { name: 'startObservationId', type: 'bytes32' }, { name: 'endObservationId', type: 'bytes32' },
      { name: 'returnValue', type: 'int256' },
    ] }],
  },
]

const arenaAbi = [
  { type: 'function', name: 'arenaCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'getArena', stateMutability: 'view', inputs: [{ name: 'arenaId', type: 'uint256' }],
    outputs: [{ type: 'tuple', components: [
      { name: 'assetId', type: 'bytes32' }, { name: 'oracleId', type: 'bytes32' },
      { name: 'oracle', type: 'address' }, { name: 'creator', type: 'address' },
      { name: 'priceDecimals', type: 'uint8' }, { name: 'category', type: 'uint8' },
      { name: 'status', type: 'uint8' }, { name: 'createdAt', type: 'uint64' },
      { name: 'startsAt', type: 'uint64' }, { name: 'deadline', type: 'uint64' },
      { name: 'resolvedAt', type: 'uint64' }, { name: 'duration', type: 'uint32' },
      { name: 'participantCount', type: 'uint16' }, { name: 'winnerCount', type: 'uint16' },
      { name: 'feeBp', type: 'uint16' }, { name: 'totalPool', type: 'uint256' },
      { name: 'finalPrice', type: 'uint256' }, { name: 'finalUpdatedAt', type: 'uint256' },
      { name: 'observationId', type: 'bytes32' }, { name: 'protocolFee', type: 'uint256' },
      { name: 'remainingLiability', type: 'uint256' }, { name: 'title', type: 'string' },
    ] }],
  },
]

class ShareNotFoundError extends Error {}

function envAddress(name, fallback) {
  const value = process.env[name]?.trim() || fallback
  if (!isAddress(value)) throw new Error(`${name} is invalid`)
  return value
}

function requiredRpcUrl() {
  const value = process.env.SHARE_RPC_URL?.trim()
    || process.env.PREDICTION_MARKET_RPC_URL?.trim()
    || process.env.PRICE_ARENA_RPC_URL?.trim()
    || process.env.ASSET_RACE_POOL_RPC_URL?.trim()
  if (!value) throw new Error('SHARE_RPC_URL (or an existing keeper RPC URL) is required')
  return value
}

function normalizeOrigin(value) {
  return value.replace(/\/+$/, '')
}

function tickerFromBytes32(value) {
  try {
    return hexToString(value, { size: 32 }).replace(/\0+$/, '') || 'Asset'
  } catch {
    return 'Asset'
  }
}

function durationLabel(seconds) {
  const value = Number(seconds)
  if (value % 3600 === 0) return `${value / 3600} hour${value === 3600 ? '' : 's'}`
  return `${Math.max(1, Math.round(value / 60))} min`
}

function displayTarget(raw, decimals) {
  const value = Number(formatUnits(raw, decimals))
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: value < 1 ? 6 : 2 })}`
}

export function parseSharePath(pathname) {
  const match = pathname.match(/^\/share\/(market|race|arena)\/(\d+)\/?$/)
  if (!match) return null
  try {
    return { kind: match[1], id: BigInt(match[2]) }
  } catch {
    return null
  }
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderShareHtml({ title, description, imageUrl, canonicalUrl, destinationUrl }) {
  const safeTitle = escapeHtml(title)
  const safeDescription = escapeHtml(description)
  const safeImage = escapeHtml(imageUrl)
  const safeCanonical = escapeHtml(canonicalUrl)
  const safeDestination = escapeHtml(destinationUrl)
  const destinationJson = JSON.stringify(destinationUrl).replaceAll('<', '\\u003c')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Prophet Markets" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDescription}" />
  <meta property="og:url" content="${safeCanonical}" />
  <meta property="og:image" content="${safeImage}" />
  <meta property="og:image:alt" content="${safeTitle}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDescription}" />
  <meta name="twitter:image" content="${safeImage}" />
  <link rel="canonical" href="${safeCanonical}" />
  <meta http-equiv="refresh" content="0;url=${safeDestination}" />
  <style>body{margin:0;background:#17101f;color:#f7f1e3;font:16px system-ui;display:grid;min-height:100vh;place-items:center}a{color:#b3a7fa}</style>
</head>
<body>
  <p>Opening <a href="${safeDestination}">${safeTitle}</a>…</p>
  <script>window.location.replace(${destinationJson})</script>
</body>
</html>`
}

function createChainClient(rpcUrl) {
  const chain = defineChain({
    id: 4663,
    name: 'Robinhood Chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  })
  return createPublicClient({ chain, transport: http(rpcUrl, { timeout: 10_000, retryCount: 2 }) })
}

async function requireExisting(client, address, abi, countFunction, id) {
  const count = await client.readContract({ address, abi, functionName: countFunction })
  if (id < 0n || id >= count) throw new ShareNotFoundError('Game not found')
}

export async function loadShareMetadata({ kind, id }, config) {
  const { client, marketAddress, raceAddress, arenaAddress, origin, images } = config
  const canonicalUrl = `${origin}/share/${kind}/${id}`

  if (kind === 'market') {
    await requireExisting(client, marketAddress, marketAbi, 'marketCount', id)
    const market = await client.readContract({ address: marketAddress, abi: marketAbi, functionName: 'getMarket', args: [id] })
    const ticker = tickerFromBytes32(market.assetId)
    const target = displayTarget(market.targetPrice, market.priceDecimals)
    return {
      title: `Will ${ticker} be at or above ${target} at the deadline?`,
      description: `Make your YES or NO call in Prediction Market #${id} on Prophet Markets.`,
      imageUrl: images.market,
      canonicalUrl,
      destinationUrl: `${origin}/#/onchain/${id}`,
    }
  }

  if (kind === 'race') {
    await requireExisting(client, raceAddress, raceAbi, 'raceCount', id)
    const [race, assets] = await Promise.all([
      client.readContract({ address: raceAddress, abi: raceAbi, functionName: 'getRace', args: [id] }),
      client.readContract({ address: raceAddress, abi: raceAbi, functionName: 'getRaceAssets', args: [id] }),
    ])
    const tickers = assets.map((asset) => tickerFromBytes32(asset.assetId)).join(' vs ')
    const title = race.title || tickers || `Asset Race #${id}`
    const category = Number(race.category) === 1 ? 'Meme Race' : 'Stock Race'
    return {
      title: `${title} — ${category}`,
      description: `${tickers || category} · ${durationLabel(race.raceDuration)}. Pick the fastest asset in Race #${id} on Prophet Markets.`,
      imageUrl: images.race,
      canonicalUrl,
      destinationUrl: `${origin}/#/onchain/races/${id}`,
    }
  }

  await requireExisting(client, arenaAddress, arenaAbi, 'arenaCount', id)
  const arena = await client.readContract({ address: arenaAddress, abi: arenaAbi, functionName: 'getArena', args: [id] })
  const ticker = tickerFromBytes32(arena.assetId)
  const title = arena.title || `${ticker} Price Arena`
  return {
    title: `${title} — Price Arena`,
    description: `${ticker} · ${durationLabel(arena.duration)}. Predict the final price in Arena #${id} on Prophet Markets.`,
    imageUrl: images.arena,
    canonicalUrl,
    destinationUrl: `${origin}/#/onchain/arenas/${id}`,
  }
}

export function createShareServer(config) {
  const cache = new Map()
  return createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end()
      return
    }

    const url = new URL(request.url || '/', config.origin)
    if (url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ ok: true }))
      return
    }

    const route = parseSharePath(url.pathname)
    if (!route) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found')
      return
    }

    const key = `${route.kind}:${route.id}`
    try {
      let metadata = cache.get(key)
      if (!metadata) {
        metadata = await loadShareMetadata(route, config)
        cache.set(key, metadata)
      }
      const html = renderShareHtml(metadata)
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        'X-Content-Type-Options': 'nosniff',
      })
      response.end(request.method === 'HEAD' ? undefined : html)
    } catch (error) {
      if (error instanceof ShareNotFoundError) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('Game not found')
        return
      }
      console.error(`[share-preview] ${key}:`, error instanceof Error ? error.message : error)
      response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '5' }).end('Preview temporarily unavailable')
    }
  })
}

export function readShareServerConfig() {
  const origin = normalizeOrigin(process.env.SHARE_CANONICAL_ORIGIN?.trim() || DEFAULT_ORIGIN)
  const rpcUrl = requiredRpcUrl()
  return {
    host: process.env.SHARE_PREVIEW_HOST?.trim() || '127.0.0.1',
    port: Number(process.env.SHARE_PREVIEW_PORT || 8790),
    origin,
    client: createChainClient(rpcUrl),
    marketAddress: envAddress('SHARE_MARKET_ADDRESS', DEFAULT_MARKET_ADDRESS),
    raceAddress: envAddress('SHARE_RACE_ADDRESS', DEFAULT_RACE_ADDRESS),
    arenaAddress: envAddress('SHARE_ARENA_ADDRESS', DEFAULT_ARENA_ADDRESS),
    images: {
      market: process.env.SHARE_MARKET_IMAGE_URL?.trim() || `${origin}/share-images/market-invite.jpg`,
      race: process.env.SHARE_RACE_IMAGE_URL?.trim() || `${origin}/share-images/race-invite.jpg`,
      arena: process.env.SHARE_ARENA_IMAGE_URL?.trim() || `${origin}/share-images/arena-invite.jpg`,
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = readShareServerConfig()
  const server = createShareServer(config)
  server.listen(config.port, config.host, () => {
    console.log(`[share-preview] listening on http://${config.host}:${config.port}`)
  })
}
