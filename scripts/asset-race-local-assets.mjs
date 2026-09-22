#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function localAssetSymbols(registry, category) {
  if (!['STOCK', 'MEME'].includes(category)) throw new Error('LocalAssetCategoryInvalid')
  const assets = registry?.assets?.filter((asset) => asset.category === category && asset.networks?.local?.enabled)
  if (!assets?.length) throw new Error(`NoEnabledLocal${category}Assets`)

  const symbols = assets.map(({ assetId, symbol, displayName, networks }) => {
    if (assetId !== symbol || typeof symbol !== 'string' || !symbol
      || Buffer.byteLength(symbol) > 32 || typeof displayName !== 'string' || !displayName) {
      throw new Error(`InvalidLocal${category}Asset`)
    }
    if (networks.local.oracle?.type !== 'MOCK_LOCAL') throw new Error(`InvalidLocal${category}Oracle`)
    return symbol
  })
  if (new Set(symbols).size !== symbols.length) throw new Error(`DuplicateLocal${category}Symbol`)
  return symbols
}

export function localAssetSymbolsFromFile(registryPath, category) {
  return localAssetSymbols(JSON.parse(readFileSync(registryPath, 'utf8')), category)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , registryPath, category] = process.argv
  if (!registryPath || !category) throw new Error('Usage: asset-race-local-assets.mjs <registry.json> <STOCK|MEME>')
  process.stdout.write(localAssetSymbolsFromFile(registryPath, category).join(','))
}
