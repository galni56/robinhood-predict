#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { poolConfigsFromRegistry } from './asset-race-pool-price-engine.mjs'

const registry = JSON.parse(readFileSync(fileURLToPath(new URL('../config/asset-race-assets.json', import.meta.url)), 'utf8'))
const configs = poolConfigsFromRegistry(registry)
const stocks = configs.filter((config) => config.category === 'STOCK')
const memes = configs.filter((config) => config.category === 'MEME')

if (stocks.length !== 10 || memes.length !== 13) {
  throw new Error(`Expected 10 Stock and 13 Meme pools, got ${stocks.length} and ${memes.length}`)
}

console.log(`STOCK_SYMBOLS=${stocks.map((config) => config.assetId).join(',')}`)
console.log(`STOCK_ORACLE_IDS=${stocks.map((config) => config.oracleId).join(',')}`)
console.log(`MEME_SYMBOLS=${memes.map((config) => config.assetId).join(',')}`)
console.log(`MEME_ORACLE_IDS=${memes.map((config) => config.oracleId).join(',')}`)
