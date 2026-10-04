import { Link } from 'react-router-dom'
import { usePumpSwapAssets } from '@/chain/gameServer'
import { useLivePrices } from '@/chain/livePrices'
import { TokenLogo } from '@/components/TokenLogo'
import { formatUnits, formatUsdPrice } from '@/lib/format'
import { CREAM, INK, YELLOW } from '@/retro/scene'

const PIXEL = "'Press Start 2P', 'Courier New', monospace"

const usd = (value?: number) => (value == null ? '—' : value >= 1e6 ? `$${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `$${Math.round(value / 1e3)}K` : `$${Math.round(value)}`)

function age(iso?: string) {
  if (!iso) return '—'
  const hours = (Date.now() - Date.parse(iso)) / 3.6e6
  return hours < 48 ? `${Math.max(1, Math.round(hours))}h` : `${Math.round(hours / 24)}d`
}

/** Meme coins the game server picks from PumpSwap every 15 minutes, with
 * live prices read from their pools. `limit` shows the top N (landing). */
export function PumpSwapCoins({ limit }: { limit?: number }) {
  const { assets, isLoading, error } = usePumpSwapAssets()
  const live = useLivePrices()
  const shown = limit ? assets.slice(0, limit) : assets
  return (
    <div style={{ color: CREAM, fontFamily: "'Pixelify Sans', 'Courier New', monospace" }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: PIXEL, fontSize: 'clamp(16px, 2vw, 24px)', fontWeight: 400, lineHeight: 1.5, textShadow: `4px 4px 0 ${INK}` }}>FRESH FROM PUMPSWAP</h2>
          <p style={{ margin: '8px 0 0', fontSize: 18, fontWeight: 500, opacity: 0.8 }}>
            Coins that graduated from pump.fun, picked automatically every 15 minutes. Race them or call their price in an arena.
          </p>
        </div>
        {limit && assets.length > limit && <Link to="/onchain/pumpswap" style={{ color: YELLOW, fontSize: 18, fontWeight: 700 }}>All {assets.length} coins →</Link>}
      </div>
      {isLoading ? <p style={{ marginTop: 24, opacity: 0.7 }}>Loading coins…</p>
        : error ? <p style={{ marginTop: 24, opacity: 0.7 }}>The coin list is unavailable right now.</p>
          : shown.length === 0 ? <p style={{ marginTop: 24, opacity: 0.7 }}>No coins pass the filter yet.</p> : (
            <div style={{ marginTop: 24, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {shown.map((asset) => {
                const price = live.assets[asset.symbol]
                return (
                  <div key={asset.symbol} className="rx-raised" style={{ background: CREAM, color: INK, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <TokenLogo ticker={asset.symbol} logoUrl={asset.logoUrl ?? undefined} className="h-10 w-10 shrink-0 rounded-none" />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.symbol}</div>
                        <div style={{ fontSize: 14, opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</div>
                      </div>
                      <div style={{ marginLeft: 'auto', fontFamily: PIXEL, fontSize: 11 }}>{price ? formatUsdPrice(Number(formatUnits(price.raw, price.decimals))) : '…'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 14, fontWeight: 600, opacity: 0.75 }}>
                      <span>Liquidity {usd(asset.liquidityUsd)}</span>
                      <span>Vol 24h {usd(asset.volume24hUsd)}</span>
                      <span>Pool {age(asset.poolCreatedAt)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Link to="/onchain/races/create?mode=memes" className="rx-btn rx-btn-yellow" style={{ padding: '8px 12px', fontSize: 14, fontWeight: 700 }}>Race it</Link>
                      <Link to="/onchain/arenas/create?mode=memes" className="rx-btn rx-btn-pink" style={{ padding: '8px 12px', fontSize: 14, fontWeight: 700 }}>Arena</Link>
                      {asset.priceUrl && <a href={asset.priceUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 14, fontWeight: 700 }}>Chart ↗</a>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
    </div>
  )
}
