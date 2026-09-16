#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { createPublicClient, defineChain, http } from 'viem'
import {
  StockPoolLiveCollector,
  poolLiveConfigsFromRegistry,
} from './asset-race-live-prices.mjs'
import { PoolPriceEngine } from './asset-race-pool-price-engine.mjs'

// Shared HTTP/SSE fan-out for Stock and Meme snapshots; no per-viewer RPC polls.
export function createAssetRaceLiveServer(collector) {
  const clients = new Set()
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
      request.on('close', () => clients.delete(response))
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
  server.on('close', unsubscribe)
  return { server, endClients: () => { for (const client of clients) client.end() } }
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
  const pollIntervalMs = Number(process.env.ASSET_RACE_LIVE_POLL_INTERVAL_MS || profile.livePollIntervalMs || 1_000)
  const staleAfterMs = Number(process.env.ASSET_RACE_LIVE_STALE_MS || profile.liveStaleAfterMs || 5_000)
  const rpcUrl = process.env.ASSET_RACE_POOL_RPC_URL?.trim() || 'https://rpc.mainnet.chain.robinhood.com'

  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('InvalidLiveServerPort')
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1_000) throw new Error('InvalidLivePollInterval')

  const chain = defineChain({
    id: registry.networks['robinhood-mainnet'].chainId,
    name: 'Robinhood Chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  })
  const client = createPublicClient({ chain, transport: http(rpcUrl, { batch: true }) })
  await verifyLiveChain(client, chain.id)
  const engine = new PoolPriceEngine({ client, configs })
  await engine.verify()
  const collector = new StockPoolLiveCollector({ engine, staleAfterMs })
  const { server, endClients } = createAssetRaceLiveServer(collector)

  let stopped = false
  async function pollContinuously() {
    while (!stopped) {
      const startedAt = Date.now()
      await collector.poll()
      const delay = Math.max(0, pollIntervalMs - (Date.now() - startedAt))
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  server.listen(port, host, () => {
    console.log(`Asset Race live display server listening on ${host}:${port}`)
    void pollContinuously()
  })

  function shutdown() {
    stopped = true
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
