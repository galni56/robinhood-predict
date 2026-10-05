#!/usr/bin/env node
// Turns docs/solana-catalog/scan.json into a proposed catalog for owner review
// (docs/SOLANA_ASSET_CATALOG.md + docs/solana-catalog/proposed.json).
//
// Rules: prefer the deepest USDC pool; fall back to the deepest SOL pool (USD
// price via SOL/USDC at the same slot) when the USDC pool is below the floor;
// only pool kinds the collector can decode; per-category liquidity floors.

import { readFileSync, writeFileSync } from 'node:fs'

const FLOORS = { crypto: 500_000, meme: 500_000, stock: 250_000 }
const DECODABLE = new Set([
  'raydium standard', // AMM v4
  'raydium CPMM',
  'raydium CLMM',
  'orca wp', // Whirlpool
  'meteora DLMM',
  'pumpswap standard',
])

const scan = JSON.parse(readFileSync('docs/solana-catalog/scan.json', 'utf8'))
const approval = JSON.parse(readFileSync('config/solana-catalog-approved.json', 'utf8'))
// Assets the owner took below the floor, knowing a thin pool's price is cheaper
// to move (keyed by display symbol; scan symbols may carry a "w" wrapper prefix).
const thinAccepted = approval.thinPoolsAccepted ?? {}
const display = { cbBTC: 'BTC', wXRP: 'XRP', wNEAR: 'NEAR' }
const kind = (p) => `${p.dex} ${p.kind}`
const fmt = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}k`)

const proposed = []
const rejected = []
for (const r of scan.report) {
  if (r.status !== 'ok') {
    rejected.push({ ...r, reason: r.status })
    continue
  }
  const floor = thinAccepted[display[r.symbol] ?? r.symbol] ? 0 : FLOORS[r.category]
  const pick = [r.bestUsdcPool, r.bestPool]
    .filter(Boolean)
    .filter((p) => DECODABLE.has(kind(p)) && p.liquidityUsd >= floor)
    // Above the floor a USDC pool wins; a thin pool takes the deepest one.
    .sort((a, b) => (floor === 0 ? b.liquidityUsd - a.liquidityUsd : (a.quote === 'USDC' ? -1 : 1) - (b.quote === 'USDC' ? -1 : 1)))[0]
  if (!pick) {
    const best = r.bestPool
    rejected.push({
      ...r,
      reason: best.liquidityUsd < floor ? `liquidity ${fmt(best.liquidityUsd)} < ${fmt(floor)}` : `pool kind ${kind(best)} not decodable`,
    })
    continue
  }
  proposed.push({
    category: r.category,
    symbol: r.symbol,
    mint: r.mint,
    decimals: r.decimals,
    tokenProgram: r.tokenProgram,
    pool: pick.pool,
    poolKind: kind(pick),
    quote: pick.quote,
    liquidityUsd: pick.liquidityUsd,
    volume24hUsd: pick.volume24hUsd,
    priceUsdAtScan: pick.priceUsd,
    freezeAuthorityDisabled: r.freezeAuthorityDisabled,
    url: pick.url,
  })
}

writeFileSync('docs/solana-catalog/proposed.json', JSON.stringify({ scannedAt: scan.scannedAt, floors: FLOORS, proposed, rejected: rejected.map(({ category, symbol, reason }) => ({ category, symbol, reason })) }, null, 2) + '\n')

const titles = { crypto: 'Крипта', meme: 'Мемы', stock: 'Акции (xStocks)' }
const lines = [
  '# Каталог активов на Solana',
  '',
  `Собрано скриптами \`scripts/solana-catalog-scan.mjs\` → \`scripts/solana-catalog-propose.mjs\` по живым данным Jupiter и DexScreener (${scan.scannedAt}).`,
  'Адреса токенов — только «verified» в Jupiter.',
  '',
  `**Утверждено владельцем ${approval.approvedAt}** (\`config/solana-catalog-approved.json\`): ${Object.values(approval.symbols).flat().length} активов. В программы и интерфейс mainnet попадают только они.`,
  '',
  '## Правила отбора',
  '',
  '- Пул к USDC в приоритете (цена в долларах напрямую). Если пул к USDC тонкий, берём самый глубокий пул к SOL — цена переводится в доллары через SOL/USDC в том же слоте.',
  `- Минимальная ликвидность выбранного пула: крипта ${fmt(FLOORS.crypto)}, мемы ${fmt(FLOORS.meme)}, акции ${fmt(FLOORS.stock)}. Чем тоньше пул, тем дешевле сдвинуть цену в момент старта/финиша.`,
  '- Только типы пулов, которые умеет читать сервис цен: Raydium AMM v4 / CPMM / CLMM, Orca Whirlpool, Meteora DLMM, PumpSwap.',
  '- Ликвидность и объём — снимок на момент скана; перед mainnet скан повторяется.',
  '',
]
for (const category of ['crypto', 'meme', 'stock']) {
  const rows = proposed.filter((p) => p.category === category)
  lines.push(`## ${titles[category]} — предлагается (${rows.length})`, '', '| Актив | Пул | Тип | Котировка | Ликвидность | Объём 24ч | Mint токена |', '|---|---|---|---|---|---|---|')
  for (const p of rows) {
    lines.push(`| ${p.symbol} | [\`${p.pool.slice(0, 6)}…${p.pool.slice(-4)}\`](${p.url}) | ${p.poolKind} | ${p.quote} | ${fmt(p.liquidityUsd)} | ${fmt(p.volume24hUsd)} | \`${p.mint}\` |`)
  }
  lines.push('')
}
lines.push('## Отклонены владельцем', '', '| Актив | Причина |', '|---|---|')
for (const [symbol, reason] of Object.entries(approval.rejected ?? {})) lines.push(`| ${symbol} | ${reason} |`)
lines.push('', '## Не прошли автоматический отбор', '', '| Категория | Актив | Причина |', '|---|---|---|')
for (const r of rejected) lines.push(`| ${r.category} | ${r.symbol} | ${r.reason} |`)
lines.push(
  '',
  '## Что учесть при утверждении',
  '',
  '- **SOL** — актив в гонках и аренах (цена из SOL/USDC), хотя ставки тоже в SOL.',
  '- **Акции xStocks** торгуются 24/7, но базовая биржа работает по расписанию. Вне торговых часов цена пула почти стоит или дрейфует — гонки акций лучше запускать в часы торгов NYSE/Nasdaq.',
  '- **xStocks: freeze authority у эмитента не отключена** (регулируемый токен). Нам это не мешает — мы только читаем цену пула и не держим сами токены.',
  '- Полные адреса пулов и параметры — в `docs/solana-catalog/proposed.json`.',
  '',
)
writeFileSync('docs/SOLANA_ASSET_CATALOG.md', lines.join('\n'))
console.log(`proposed ${proposed.length}, rejected ${rejected.length}`)
for (const c of ['crypto', 'meme', 'stock']) console.log(c, proposed.filter((p) => p.category === c).map((p) => `${p.symbol}(${p.quote})`).join(' '))
console.log('rejected:', rejected.map((r) => `${r.symbol}: ${r.reason}`).join('; '))
