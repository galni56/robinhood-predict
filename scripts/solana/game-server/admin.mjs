#!/usr/bin/env node
// Owner tools for the game server's database (works while the server runs;
// SQLite serialises the writes).
//
//   node scripts/solana/game-server/admin.mjs create-race <title> <category> <SYM,SYM,...> <bettingSeconds> <raceSeconds>
//   node scripts/solana/game-server/admin.mjs payouts [pending|sent|stuck|done]
//   node scripts/solana/game-server/admin.mjs retry <payoutId>    stuck -> pending
//
// Env: GAME_DB (same file as the server), ADMIN_WALLET (creator of platform
// races, default: the game wallet recorded in the database).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase } from './db.mjs'
import { catalogAssets, createEngine } from './engine.mjs'

const ROOT = new URL('../../../', import.meta.url)
const db = openDatabase(resolve(process.env.GAME_DB ?? fileURLToPath(new URL('.data/game-server.sqlite', ROOT))))
const gameWallet = db.getMeta('game_wallet')
if (!gameWallet) throw new Error('this database has not been used by a game server yet')
const assets = catalogAssets(JSON.parse(readFileSync(new URL('config/solana-assets.json', ROOT), 'utf8')))
// Only database work happens here; nothing touches the chain.
const engine = createEngine({ db, chain: { address: gameWallet }, prices: null, assets, cluster: 'admin', admin: process.env.ADMIN_WALLET || null })

const [command, ...args] = process.argv.slice(2)
if (command === 'create-race') {
  const [title, category, symbols, betting, duration] = args
  const now = Math.floor(Date.now() / 1000)
  const race = engine.createPlatform({
    title,
    category: String(category).toLowerCase(),
    symbols: String(symbols).split(','),
    bettingStartTime: now,
    bettingEndTime: now + Number(betting),
    raceDuration: Number(duration),
  })
  console.log(`race #${race.id} "${race.title}": betting until ${new Date(race.bettingEndTime * 1000).toISOString()}, ${race.assets.map((a) => a.symbol).join(' / ')}`)
} else if (command === 'payouts') {
  for (const p of db.payouts(args[0] ?? 'stuck')) {
    console.log(`#${p.id} ${p.status} ${p.kind} ${p.amount} -> ${p.wallet} attempts=${p.attempts} ${p.error ?? ''} ${p.signature ?? ''}`)
  }
} else if (command === 'retry') {
  // `stuck` is only ever set after a failed or expired transaction, so a new one is safe.
  const changed = db.raw.prepare("UPDATE payouts SET status = 'pending', attempts = 0 WHERE id = ? AND status = 'stuck'").run(Number(args[0])).changes
  console.log(changed ? `payout #${args[0]} queued again` : `payout #${args[0]} is not stuck`)
} else {
  console.log('commands: create-race <title> <category> <SYM,...> <bettingSeconds> <raceSeconds> | payouts [status] | retry <id>')
}
db.close()
