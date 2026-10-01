import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { uniswapRobinhoodPoolUrl } from '../src/chain/priceSourceLinks.ts'

const registryPath = fileURLToPath(new URL('../config/asset-race-assets.json', import.meta.url))
const registry = JSON.parse(readFileSync(registryPath, 'utf8'))

test('builds direct Uniswap links for exact Robinhood V3 pairs and V4 pool IDs', () => {
  const v3Pair = '0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3'
  const v4Pool = '0xc748f4671a867db48b552f6b7650bf3255e05f80f00e3f7aad1b17ccb7898fdb'

  assert.equal(uniswapRobinhoodPoolUrl(v3Pair), `https://app.uniswap.org/explore/pools/robinhood/${v3Pair}`)
  assert.equal(uniswapRobinhoodPoolUrl(`  ${v4Pool}  `), `https://app.uniswap.org/explore/pools/robinhood/${v4Pool}`)
})

test('rejects token searches, malformed pool identifiers and non-address values', () => {
  assert.equal(uniswapRobinhoodPoolUrl('NVDA'), undefined)
  assert.equal(uniswapRobinhoodPoolUrl('0x1234'), undefined)
  assert.equal(uniswapRobinhoodPoolUrl('https://example.com'), undefined)
  assert.equal(uniswapRobinhoodPoolUrl(), undefined)
})

test('every production-enabled asset links to its exact registered settlement pool', () => {
  const enabledAssets = registry.assets.filter((asset) => asset.networks['robinhood-mainnet'].enabled)
  assert.equal(enabledAssets.length, 25)

  for (const asset of enabledAssets) {
    assert.equal(
      uniswapRobinhoodPoolUrl(asset.marketSource?.poolIdentifier),
      `https://app.uniswap.org/explore/pools/robinhood/${asset.marketSource.poolIdentifier}`,
      asset.symbol,
    )
  }
})
