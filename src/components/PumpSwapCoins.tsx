import { Link } from 'react-router-dom'
import { usePumpSwapAssets } from '@/chain/gameServer'
import { useLivePrices } from '@/chain/livePrices'
import { formatUnits } from '@/lib/format'
import { CoinFighter } from '@/retro/landingFx'
import { CREAM, INK, PINK, YELLOW, PIXEL } from '@/retro/scene'
import { coinBlueGrin, coinOrangeGrin, coinPinkGrin, coinPurpleGrin } from '@/retro/spriteData'

const BODIES = [coinOrangeGrin, coinPinkGrin, coinBlueGrin, coinPurpleGrin]

const usd = (value?: number) => (value == null ? '—' : value >= 1e6 ? `$${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `$${Math.round(value / 1e3)}K` : `$${Math.round(value)}`)
const price = (raw: bigint, decimals: number) => `$${Number(Number(formatUnits(raw, decimals)).toPrecision(4))}`

function ago(iso?: string) {
  if (!iso) return '—'
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`
}

const cell = { padding: '10px 12px', borderTop: `3px solid ${INK}`, whiteSpace: 'nowrap' } as const
const head = { ...cell, borderTop: 'none', fontFamily: PIXEL, fontSize: 10, fontWeight: 400, textAlign: 'left', opacity: 0.7 } as const

/**
 * Meme coins the game server picks from PumpSwap every 15 minutes, as a
 * table. `feed` (the landing) lists the newest additions first; otherwise
 * the most liquid come first. While the services are off the last known data
 * is shown, so the table is never empty.
 */
export function PumpSwapCoins({ limit, feed = false }: { limit?: number; feed?: boolean }) {
  const { assets, snapshotAt, isLoading } = usePumpSwapAssets()
  const live = useLivePrices()
  const ordered = feed ? [...assets].sort((a, b) => Date.parse(b.addedAt ?? '0') - Date.parse(a.addedAt ?? '0') || (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0)) : assets
  const shown = limit ? ordered.slice(0, limit) : ordered
  const newest = Math.max(...assets.map((a) => Date.parse(a.addedAt ?? '0')))
  return (
    <div style={{ color: CREAM, fontFamily: "'Prophet Digits', 'Pixelify Sans', 'Courier New', monospace" }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: PIXEL, fontSize: 'clamp(16px, 2vw, 24px)', fontWeight: 400, lineHeight: 1.5, textShadow: `4px 4px 0 ${INK}` }}>FRESH FROM PUMPSWAP</h2>
          <p style={{ margin: '8px 0 0', fontSize: 18, fontWeight: 500, opacity: 0.8 }}>
            Coins that graduated from pump.fun to PumpSwap join the game automatically. Race them or call their price in an arena.
          </p>
          {!feed && (
            <ul style={{ margin: '12px 0 0', paddingLeft: 20, maxWidth: 820, fontSize: 16, fontWeight: 500, opacity: 0.85, lineHeight: 1.5 }}>
              <li>Checked every 15 minutes: a real pump.fun coin paired with SOL or USDC, at least $10,000 of liquidity, a pool older than one hour.</li>
              <li>The list grows up to 40 coins. A coin leaves when its liquidity falls under $10,000 or it has not been seen for 7 days; when the list is full, the least liquid make room.</li>
              <li>Coins launched on Prophet always get a place once they graduate, marked MADE ON PROPHET. A coin in a running game never leaves mid-race.</li>
              <li>Known honeypots and wash-traded coins are blocked by hand.</li>
            </ul>
          )}
        </div>
        {limit && assets.length > limit && <Link to="/onchain/pumpswap" style={{ color: YELLOW, fontSize: 18, fontWeight: 700 }}>All {assets.length} coins →</Link>}
      </div>
      {isLoading && assets.length === 0 ? <p style={{ marginTop: 24, opacity: 0.7 }}>Loading coins…</p> : (
        <div className="rx-raised" style={{ marginTop: 24, background: CREAM, color: INK, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 16, fontWeight: 600 }}>
            <thead>
              <tr>
                <th style={head}>#</th>
                <th style={head}>COIN</th>
                <th style={{ ...head, textAlign: 'right' }}>PRICE</th>
                <th style={{ ...head, textAlign: 'right' }}>LIQUIDITY</th>
                <th style={{ ...head, textAlign: 'right' }}>VOL 24H</th>
                <th style={{ ...head, textAlign: 'right' }}>{feed ? 'ADDED' : 'POOL AGE'}</th>
                <th style={head} />
              </tr>
            </thead>
            <tbody>
              {shown.map((asset, index) => {
                const livePrice = live.assets[asset.symbol]
                const p = livePrice ? price(livePrice.raw, livePrice.decimals) : asset.price ? price(BigInt(asset.price.raw), asset.price.decimals) : '…'
                const fresh = Date.parse(asset.addedAt ?? '0') === newest && Date.now() - newest < 15 * 60_000
                return (
                  <tr key={asset.symbol} className="rx-hop-host" style={{ background: index % 2 ? 'rgba(27, 19, 64, 0.04)' : 'transparent' }}>
                    <td style={{ ...cell, fontFamily: PIXEL, fontSize: 11, opacity: 0.6 }}>{index + 1}</td>
                    <td style={cell}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <CoinFighter body={BODIES[index % BODIES.length]} logoUrl={asset.logoUrl} symbol={asset.symbol} size={40} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 18 }}>
                            {asset.symbol}
                            {fresh && <span style={{ marginLeft: 8, background: PINK, fontFamily: PIXEL, fontSize: 8, padding: '4px 6px', border: `2px solid ${INK}`, verticalAlign: 'middle' }}>NEW</span>}
                            {asset.launchedOnProphet && <span style={{ marginLeft: 8, background: YELLOW, fontFamily: PIXEL, fontSize: 8, padding: '4px 6px', border: `2px solid ${INK}`, verticalAlign: 'middle' }}>MADE ON PROPHET</span>}
                          </div>
                          <div style={{ fontSize: 13, opacity: 0.55, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.name}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: PIXEL, fontSize: 11 }}>{p}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{usd(asset.liquidityUsd)}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{usd(asset.volume24hUsd)}</td>
                    <td style={{ ...cell, textAlign: 'right', opacity: 0.75 }}>{feed ? `${ago(asset.addedAt)} ago` : ago(asset.poolCreatedAt)}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Link to="/onchain/races" className="rx-btn rx-btn-yellow" style={{ padding: '6px 10px', fontSize: 13, fontWeight: 700, margin: '4px 4px 10px' }}>Race</Link>
                        <Link to="/onchain/arenas/create?mode=memes" className="rx-btn rx-btn-pink" style={{ padding: '6px 10px', fontSize: 13, fontWeight: 700, margin: '4px 4px 10px' }}>Arena</Link>
                        {asset.priceUrl && <a href={asset.priceUrl} target="_blank" rel="noreferrer" style={{ padding: '0 6px', fontSize: 14, fontWeight: 700 }}>Chart ↗</a>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {snapshotAt && <p style={{ margin: '12px 0 0', fontSize: 13, opacity: 0.55 }}>Prices as of {new Date(snapshotAt).toLocaleString()}.</p>}
    </div>
  )
}
