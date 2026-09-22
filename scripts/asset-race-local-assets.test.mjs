import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { localAssetSymbols } from './asset-race-local-assets.mjs'

const registry = JSON.parse(readFileSync(new URL('../config/asset-race-assets.json', import.meta.url), 'utf8'))

test('local symbols come from every enabled MOCK_LOCAL registry entry without fixed counts', () => {
  assert.equal(localAssetSymbols(registry, 'STOCK').length, 13)
  assert.equal(localAssetSymbols(registry, 'MEME').length, 16)

  const expanded = structuredClone(registry)
  expanded.assets.push({
    assetId: 'FUTURE',
    symbol: 'FUTURE',
    displayName: 'Future local demo asset',
    category: 'MEME',
    networks: { local: { enabled: true, oracle: { type: 'MOCK_LOCAL' } } },
  })
  assert.equal(localAssetSymbols(expanded, 'MEME').at(-1), 'FUTURE')
})

test('disabled entries are excluded and invalid local identity/oracle configuration fails closed', () => {
  const disabled = structuredClone(registry)
  disabled.assets.find((asset) => asset.category === 'MEME').networks.local.enabled = false
  assert.equal(localAssetSymbols(disabled, 'MEME').length, 15)

  for (const mutate of [
    (asset) => { asset.symbol = 'MISMATCH' },
    (asset) => { asset.networks.local.oracle.type = 'SIGNED_POOL_BLOCK_PAIR' },
  ]) {
    const invalid = structuredClone(registry)
    mutate(invalid.assets.find((asset) => asset.category === 'MEME'))
    assert.throws(() => localAssetSymbols(invalid, 'MEME'), /InvalidLocalMEME/)
  }
})
