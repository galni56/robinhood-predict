import assert from 'node:assert/strict'
import test from 'node:test'
import { stringToHex } from 'viem'
import { escapeHtml, loadShareMetadata, parseSharePath, renderShareHtml } from './share-preview-server.mjs'

test('parses only supported share paths with numeric ids', () => {
  assert.deepEqual(parseSharePath('/share/market/12'), { kind: 'market', id: 12n })
  assert.deepEqual(parseSharePath('/share/race/0/'), { kind: 'race', id: 0n })
  assert.deepEqual(parseSharePath('/share/arena/7'), { kind: 'arena', id: 7n })
  assert.equal(parseSharePath('/share/race/arenas'), null)
  assert.equal(parseSharePath('/share/other/1'), null)
  assert.equal(parseSharePath('/share/market/-1'), null)
})

test('escapes untrusted onchain titles and descriptions', () => {
  assert.equal(escapeHtml('<script>"x" & y</script>'), '&lt;script&gt;&quot;x&quot; &amp; y&lt;/script&gt;')
  const html = renderShareHtml({
    title: '<script>alert(1)</script>',
    description: 'A & B',
    imageUrl: 'https://example.com/image.png',
    canonicalUrl: 'https://example.com/share/race/1',
    destinationUrl: 'https://example.com/#/onchain/races/1',
  })
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /property="og:title"/)
  assert.match(html, /name="twitter:card" content="summary_large_image"/)
  assert.match(html, /window\.location\.replace\("https:\/\/example\.com\/#\/onchain\/races\/1"\)/)
})

test('builds specific metadata for all three game types', async () => {
  const client = {
    async readContract({ functionName }) {
      if (functionName.endsWith('Count')) return 20n
      if (functionName === 'getMarket') return {
        assetId: stringToHex('NVDA', { size: 32 }), priceDecimals: 18, targetPrice: 227_090000000000000000n,
      }
      if (functionName === 'getRace') return { title: 'Tech sprint', category: 0, raceDuration: 300n }
      if (functionName === 'getRaceAssets') return [
        { assetId: stringToHex('NVDA', { size: 32 }) },
        { assetId: stringToHex('TSLA', { size: 32 }) },
      ]
      if (functionName === 'getArena') return {
        assetId: stringToHex('AI', { size: 32 }), title: 'AI closing shot', duration: 60,
      }
      throw new Error(`Unexpected function ${functionName}`)
    },
  }
  const config = {
    client,
    marketAddress: '0x0000000000000000000000000000000000000001',
    raceAddress: '0x0000000000000000000000000000000000000002',
    arenaAddress: '0x0000000000000000000000000000000000000003',
    origin: 'https://prophetmarkets.fun',
    images: { market: 'market.png', race: 'race.png', arena: 'arena.png' },
  }

  const market = await loadShareMetadata({ kind: 'market', id: 2n }, config)
  const race = await loadShareMetadata({ kind: 'race', id: 3n }, config)
  const arena = await loadShareMetadata({ kind: 'arena', id: 4n }, config)

  assert.equal(market.title, 'Will NVDA be at or above $227.09 at the deadline?')
  assert.equal(market.destinationUrl, 'https://prophetmarkets.fun/#/onchain/2')
  assert.match(race.description, /NVDA vs TSLA · 5 min/)
  assert.equal(race.destinationUrl, 'https://prophetmarkets.fun/#/onchain/races/3')
  assert.match(arena.description, /AI · 1 min/)
  assert.equal(arena.destinationUrl, 'https://prophetmarkets.fun/#/onchain/arenas/4')
})
