#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { createPublicClient, defineChain, http } from 'viem'
import {
  EthUsdQuoteCache,
  StockPoolLiveCollector,
  poolLiveConfigsFromRegistry,
} from './asset-race-live-prices.mjs'
import { PoolPriceEngine, poolChainContracts } from './asset-race-pool-price-engine.mjs'

export const DEFAULT_ASSET_RACE_LIVE_RPC_URL = 'https://rpc.mainnet.chain.robinhood.com'

export function resolveLiveRpcUrl(env = process.env) {
  return env.ASSET_RACE_LIVE_RPC_URL?.trim() || DEFAULT_ASSET_RACE_LIVE_RPC_URL
}

// Shared HTTP/SSE fan-out for Stock and Meme snapshots; no per-viewer RPC polls.
export function createAssetRaceLiveServer(collector, { pollIntervalMs } = {}) {
  const clients = new Set()
  let timer
  let polling = false
  let stopped = false

  function stopPolling() {
    if (timer) clearTimeout(timer)
    timer = undefined
  }

  async function pollWhileDemanded() {
    if (stopped || clients.size === 0 || polling || !pollIntervalMs) return
    polling = true
    const startedAt = Date.now()
    try {
      await collector.poll()
    } catch {
      // The production collector already publishes a redacted stale snapshot.
      // A custom collector must not terminate the demand loop on one failure.
    } finally {
      polling = false
      if (!stopped && clients.size > 0) {
        const delay = Math.max(0, pollIntervalMs - (Date.now() - startedAt))
        timer = setTimeout(() => { void pollWhileDemanded() }, delay)
      }
    }
  }

  function removeClient(response) {
    if (!clients.delete(response)) return
    if (clients.size === 0) stopPolling()
  }

  const unsubscribe = collector.subscribe((snapshot) => {
    const message = `data: ${JSON.stringify(snapshot)}\n\n`
    for (const client of clients) client.write(message)
  })
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    if (request.method === 'GET' && pathname === '/api/asset-race/live') {
      response.writeHead(200, {
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'content-type': 'text/event-stream',
        'x-accel-buffering': 'no',
      })
      clients.add(response)
      response.write(`data: ${JSON.stringify(collector.snapshot())}\n\n`)
      request.on('close', () => removeClient(response))
      if (clients.size === 1) void pollWhileDemanded()
      return
    }
    if (request.method === 'GET' && pathname === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(`${JSON.stringify({ ok: true, clients: clients.size, upstreamRequests: collector.upstreamRequestCount })}\n`)
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end('{"error":"not found"}\n')
  })
  server.on('close', () => {
    stopped = true
    stopPolling()
    unsubscribe()
  })
  return { server, endClients: () => {
    for (const client of clients) client.end()
    clients.clear()
    stopPolling()
  } }
}

export async function verifyLiveChain(client, expectedChainId) {
  if (await client.getChainId() !== expectedChainId) throw new Error('Live RPC chain ID mismatch')
}

async function main() {
  const registryPath = fileURLToPath(new URL('../config/asset-race-assets.json', import.meta.url))
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'))
  const configs = poolLiveConfigsFromRegistry(registry)
  const profile = registry.poolInfrastructure
  const host = process.env.ASSET_RACE_LIVE_HOST?.trim() || '127.0.0.1'
  const port = Number(process.env.ASSET_RACE_LIVE_PORT || 8787)
  const pollIntervalMs = Number(process.env.ASSET_RACE_LIVE_POLL_INTERVAL_MS || profile.livePollIntervalMs || 2_000)
  const staleAfterMs = Number(process.env.ASSET_RACE_LIVE_STALE_MS || profile.liveStaleAfterMs || 5_000)
  const ethUsdStaleAfterMs = Number(process.env.ETH_USD_STALE_MS || 45_000)
  const rpcUrl = resolveLiveRpcUrl()

  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('InvalidLiveServerPort')
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1_000) throw new Error('InvalidLivePollInterval')

  const chain = defineChain({
    id: registry.networks['robinhood-mainnet'].chainId,
    name: 'Robinhood Chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    contracts: poolChainContracts(registry.networks['robinhood-mainnet'].chainId),
  })
  const client = createPublicClient({ chain, transport: http(rpcUrl, { batch: true }) })
  await verifyLiveChain(client, chain.id)
  const engine = new PoolPriceEngine({ client, configs })
  await engine.verify()
  const ethUsdQuoteCache = new EthUsdQuoteCache({ staleAfterMs: ethUsdStaleAfterMs })
  const collector = new StockPoolLiveCollector({ engine, ethUsdQuoteCache, staleAfterMs })
  const { server, endClients } = createAssetRaceLiveServer(collector, { pollIntervalMs })

  server.listen(port, host, () => {
    console.log(`Asset Race live display server listening on ${host}:${port}`)
  })

  function shutdown() {
    endClients()
    server.close()
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // RPC startup errors may contain credential-bearing URLs; never log messages.
  main().catch((error) => { console.error(`[asset-race-live] stopped (${error instanceof Error ? error.name : 'UnknownError'})`); process.exitCode = 1 })
}
