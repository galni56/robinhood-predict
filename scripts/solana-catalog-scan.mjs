#!/usr/bin/env node
// Scans candidate Solana assets for the Prophet catalog review.
//
// For each candidate symbol: take the Jupiter-verified mint with the exact
// symbol and the most liquidity, then list its DexScreener pools on the DEX
// programs the price collector can decode, quoted in USDC or SOL. Output is a
// review artifact (JSON + Markdown table), not an approved registry: every
// row still needs the owner's sign-off before it goes on-chain.
//
// Usage: node scripts/solana-catalog-scan.mjs [out-dir]

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const WSOL = 'So11111111111111111111111111111111111111112'

// Symbols are Jupiter symbols: dogwifhat is "$WIF", Portal-bridged Ether is "ETH".
// DexScreener dexId -> collector support. Bonding curves are excluded: their
// price is set by a launchpad formula, not a tradable pool.
const SUPPORTED_DEXES = new Set(['raydium', 'orca', 'meteora', 'pumpswap'])

// Owner-approved list (config/solana-catalog-approved.json). Jupiter symbols:
// Bitcoin is scanned as cbBTC and shown as BTC.
const CANDIDATES = {
  crypto: ['SOL', 'cbBTC', 'ETH', 'wXRP', 'ADA', 'SUI', 'BNB', 'DOGE', 'HYPE', 'wNEAR', 'ZEC', 'PUMP'],
  meme: ['TRUMP', 'PENGU', '$WIF', 'FARTCOIN', 'PONKE', 'PNUT', 'PIPPIN', 'BOME', 'POPCAT', 'MEW'],
  stock: ['NVDAx', 'TSLAx', 'AAPLx', 'METAx', 'MSTRx', 'AMZNx', 'MSFTx', 'GOOGLx', 'COINx', 'HOODx', 'CRCLx', 'SPYx', 'QQQx'],
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    if (res.status === 429) {
      await sleep(2000 * (attempt + 1))
      continue
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`)
    return res.json()
  }
  throw new Error(`rate limited: ${url}`)
}

async function verifiedMint(symbol) {
  if (symbol === 'SOL') return { id: WSOL, symbol: 'SOL', name: 'Wrapped SOL', decimals: 9, isVerified: true, tags: ['verified'], audit: {}, liquidity: null, tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }
  const results = await getJson(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(symbol)}`)
  const matches = results.filter((t) => t.isVerified && t.symbol.toLowerCase() === symbol.toLowerCase())
  matches.sort((a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0))
  return matches[0] ?? null
}

async function pools(mint) {
  const pairs = await getJson(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`)
  return pairs
    .filter((p) => SUPPORTED_DEXES.has(p.dexId))
    .map((p) => {
      const mintIsBase = p.baseToken.address === mint
      const other = mintIsBase ? p.quoteToken : p.baseToken
      return {
        pool: p.pairAddress,
        dex: p.dexId,
        kind: (p.labels ?? []).join('/') || 'standard',
        quote: other.address === USDC ? 'USDC' : other.address === WSOL ? 'SOL' : other.symbol,
        quoteMint: other.address,
        liquidityUsd: Math.round(p.liquidity?.usd ?? 0),
        volume24hUsd: Math.round(p.volume?.h24 ?? 0),
        priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
        url: p.url,
      }
    })
    .filter((p) => p.quote === 'USDC' || p.quote === 'SOL')
    .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
}

async function main() {
  const outDir = process.argv[2] ?? 'docs/solana-catalog'
  mkdirSync(outDir, { recursive: true })
  const report = []
  for (const [category, symbols] of Object.entries(CANDIDATES)) {
    for (const symbol of symbols) {
      try {
        const token = await verifiedMint(symbol)
        await sleep(1100)
        if (!token) {
          report.push({ category, symbol, status: 'no-verified-mint' })
          continue
        }
        // For SOL itself the USD price comes from the SOL/USDC pool.
        const candidates = await pools(token.id)
        await sleep(400)
        const usdcPools = candidates.filter((p) => p.quote === 'USDC')
        report.push({
          category,
          symbol,
          status: candidates.length ? 'ok' : 'no-supported-pool',
          mint: token.id,
          name: token.name,
          decimals: token.decimals,
          tokenProgram: token.tokenProgram,
          organicScore: token.organicScore ? Math.round(token.organicScore) : null,
          mintAuthorityDisabled: token.audit?.mintAuthorityDisabled ?? null,
          freezeAuthorityDisabled: token.audit?.freezeAuthorityDisabled ?? null,
          bestUsdcPool: usdcPools[0] ?? null,
          bestPool: candidates[0] ?? null,
          poolCount: candidates.length,
        })
        process.stderr.write(`${category} ${symbol}: ${candidates.length} pools\n`)
      } catch (error) {
        report.push({ category, symbol, status: 'error', error: String(error.message ?? error) })
        process.stderr.write(`${category} ${symbol}: ${error}\n`)
      }
    }
  }
  const stamp = new Date().toISOString()
  writeFileSync(join(outDir, 'scan.json'), JSON.stringify({ scannedAt: stamp, report }, null, 2) + '\n')

  const fmt = (n) => (n == null ? '—' : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}k`)
  const lines = [
    `# Solana catalog scan — ${stamp}`,
    '',
    'Generated by `scripts/solana-catalog-scan.mjs`. Review artifact only — nothing here is approved.',
    '',
  ]
  for (const category of Object.keys(CANDIDATES)) {
    lines.push(`## ${category}`, '', '| Symbol | Mint | Best USDC pool | DEX | Liquidity | 24h volume | Best pool overall | Mint/freeze authority off |', '|---|---|---|---|---|---|---|---|')
    for (const r of report.filter((x) => x.category === category)) {
      if (r.status !== 'ok') {
        lines.push(`| ${r.symbol} | ${r.status} | | | | | | |`)
        continue
      }
      const u = r.bestUsdcPool
      const b = r.bestPool
      lines.push(
        `| ${r.symbol} | \`${r.mint}\` | ${u ? `\`${u.pool}\`` : '—'} | ${u ? `${u.dex} ${u.kind}` : '—'} | ${fmt(u?.liquidityUsd)} | ${fmt(u?.volume24hUsd)} | ${b.quote} ${b.dex} ${fmt(b.liquidityUsd)} | ${r.mintAuthorityDisabled ?? '?'} / ${r.freezeAuthorityDisabled ?? '?'} |`,
      )
    }
    lines.push('')
  }
  writeFileSync(join(outDir, 'scan.md'), lines.join('\n'))
  console.log(`wrote ${join(outDir, 'scan.json')} and scan.md (${report.length} candidates)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
