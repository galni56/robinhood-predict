import { useMemo, useState } from 'react'
import type { ApprovedRaceAsset } from '@/chain/assetRaces'
import { useLivePrices } from '@/chain/livePrices'
import { useProphetLaunches } from '@/chain/gameServer'
import { Link } from 'react-router-dom'
import { formatUnits } from '@/lib/format'
import { assetIconUrl } from '@/lib/assetIcons'
import { CoinFighter } from '@/retro/landingFx'
import { PxSprite } from '@/retro/Sprite'
import { CREAM, INK, PINK, ROAD, YELLOW, PIXEL } from '@/retro/scene'
import { coinBlueGrin, coinGreen, coinOrangeGrin, coinPinkGrin, coinPurpleGrin, type PxSpriteData } from '@/retro/spriteData'

// Game-style building blocks for the create pages: a searchable coin picker
// of pixel fighters, a live track that fills as coins join, and a compact
// four-step "how it works" strip.

export const COIN_BODIES: PxSpriteData[] = [coinOrangeGrin, coinPinkGrin, coinBlueGrin, coinPurpleGrin, coinGreen]

const shortPrice = (raw: bigint, decimals: number) => `$${Number(Number(formatUnits(raw, decimals)).toPrecision(4))}`

/** Searchable grid of coins; `max` 1 is a single choice (arena). */
/** Coin groups in the picker. Category codes: 1 meme, 2 crypto. */
const COIN_FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'crypto', label: 'Crypto', test: (a: ApprovedRaceAsset) => a.category === 2 },
  { key: 'memes', label: 'Memes', test: (a: ApprovedRaceAsset) => a.category === 1 && a.source !== 'pumpswap' },
  { key: 'fresh', label: 'Fresh PumpSwap', test: (a: ApprovedRaceAsset) => a.source === 'pumpswap' && !a.launchedOnProphet },
  { key: 'prophet', label: 'Made on Prophet', test: (a: ApprovedRaceAsset) => a.launchedOnProphet === true },
] as const

export function CoinPicker({ assets, selected, onToggle, max, accent = YELLOW }: {
  assets: ApprovedRaceAsset[]
  selected: string[]
  onToggle: (asset: ApprovedRaceAsset) => void
  max: number
  accent?: string
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<(typeof COIN_FILTERS)[number]['key']>('all')
  const launches = useProphetLaunches()
  const live = useLivePrices()
  // A coin the price service does not price cannot start or settle a game:
  // hide it (unless the feed is down altogether, then show everything).
  const priced = useMemo(() => (live.disconnected ? assets : assets.filter((a) => live.assets[a.symbol] != null)), [assets, live])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const group = COIN_FILTERS.find((f) => f.key === filter) ?? COIN_FILTERS[0]
    const inGroup = priced.filter((a) => group.test(a))
    return q ? inGroup.filter((a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)) : inGroup
  }, [priced, query, filter])
  const waiting = (launches.data ?? []).filter((l) => !priced.some((a) => a.launchedOnProphet && a.mint === l.mint)).length
  return (
    <div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={`Search ${priced.length} coins…`}
        className="rx-input w-full px-3.5 font-medium"
        style={{ height: 48 }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {COIN_FILTERS.map((f) => {
          const count = priced.filter((a) => f.test(a)).length
          // Groups with no coin are hidden, except our own launches (it explains how to get one in).
          if (count === 0 && f.key !== 'prophet' && f.key !== 'all') return null
          return (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={`rx-btn ${filter === f.key ? 'rx-btn-yellow' : 'rx-btn-white'}`} style={{ padding: '6px 10px', fontSize: 13, fontWeight: 700 }}>
              {f.label} · {count}
            </button>
          )
        })}
      </div>
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 8, maxHeight: 360, overflowY: 'auto', padding: 4 }}>
        {shown.map((asset, index) => {
          const isSelected = selected.includes(asset.assetId)
          const full = !isSelected && max > 1 && selected.length >= max
          const price = live.assets[asset.symbol]
          return (
            <button
              key={asset.assetId}
              type="button"
              disabled={full}
              onClick={() => onToggle(asset)}
              className="rx-hop-host"
              style={{
                position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 6px',
                background: isSelected ? accent : CREAM, color: INK, border: `3px solid ${INK}`, boxShadow: isSelected ? `0 4px 0 ${INK}` : 'none',
                cursor: full ? 'not-allowed' : 'pointer', opacity: full ? 0.45 : 1, fontFamily: 'inherit',
              }}
            >
              {isSelected && <span style={{ position: 'absolute', top: 4, right: 4, fontFamily: PIXEL, fontSize: 8 }}>✓</span>}
              <CoinFighter body={COIN_BODIES[index % COIN_BODIES.length]} logoUrl={assetIconUrl(asset.symbol) ?? asset.logoUrl} symbol={asset.symbol} size={40} />
              <span style={{ fontWeight: 700, fontSize: 14, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.symbol}</span>
              <span style={{ fontFamily: PIXEL, fontSize: 8, opacity: 0.7 }}>{price ? shortPrice(price.raw, price.decimals) : ' '}</span>
            </button>
          )
        })}
        {shown.length === 0 && (filter === 'prophet' && !query.trim() ? (
          <p style={{ gridColumn: '1 / -1', padding: 16, textAlign: 'center', fontWeight: 600 }}>
            {waiting > 0 ? `${waiting} coin${waiting === 1 ? '' : 's'} launched on Prophet ${waiting === 1 ? 'is' : 'are'} still on the pump.fun curve. ` : 'No coin launched on Prophet has graduated yet. '}
            A coin can race once it graduates to PumpSwap. <Link to="/onchain/launch" style={{ textDecoration: 'underline' }}>Launch one</Link>
          </p>
        ) : <p style={{ gridColumn: '1 / -1', padding: 16, textAlign: 'center', opacity: 0.6 }}>No coin matches “{query}”.</p>)}
      </div>
    </div>
  )
}

/** The starting grid: chosen coins line up on lanes, empty lanes wait. */
export function GridPreview({ coins, lanes = 6, minimum = 2 }: { coins: ApprovedRaceAsset[]; lanes?: number; minimum?: number }) {
  const ready = coins.length >= minimum
  return (
    <div className="rx-raised" style={{ background: ROAD, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: INK, color: CREAM, fontFamily: PIXEL, fontSize: 10 }}>
        <span>STARTING GRID</span>
        <span style={{ color: ready ? '#8BE89A' : YELLOW, animation: ready ? undefined : 'rx-blink 0.8s steps(1) infinite' }}>{ready ? 'READY TO RACE' : `PICK ${minimum - coins.length} MORE`}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 24, width: 20, background: `repeating-conic-gradient(${INK} 0% 25%, ${CREAM} 0% 50%) 0 0 / 20px 20px` }} />
        {Array.from({ length: lanes }, (_, i) => {
          const coin = coins[i]
          return (
            <div key={i} style={{ position: 'relative', height: 58, borderTop: i ? `2px dashed rgba(255, 246, 223, 0.25)` : 'none' }}>
              <span style={{ position: 'absolute', left: 10, top: 20, fontFamily: PIXEL, fontSize: 9, color: CREAM, opacity: 0.5 }}>{i + 1}</span>
              {coin ? (
                <div className="rx-fx-enter" style={{ position: 'absolute', left: 32, top: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ animation: 'rx-bob 0.5s steps(1) infinite', animationDelay: `${i * 0.12}s` }}>
                    <CoinFighter body={COIN_BODIES[i % COIN_BODIES.length]} logoUrl={assetIconUrl(coin.symbol) ?? coin.logoUrl} symbol={coin.symbol} size={44} />
                  </div>
                  <span className="rx-plate" style={{ fontFamily: PIXEL, fontSize: 9, background: CREAM, color: INK, padding: '5px 6px' }}>{coin.symbol}</span>
                </div>
              ) : (
                <span style={{ position: 'absolute', left: 36, top: 14, width: 30, height: 30, border: `3px dashed rgba(255, 246, 223, 0.35)`, color: CREAM, opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: PIXEL, fontSize: 10 }}>?</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export interface HowStep {
  sprite: PxSpriteData
  title: string
  timing: string
  body: string
}

/** Four steps in one row: icon, title, timing chip and one line. */
export function HowItWorksStrip({ steps, accent = YELLOW }: { steps: HowStep[]; accent?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
      {steps.map((step, i) => (
        <div key={step.title} className="rx-raised rx-hop-host" style={{ position: 'relative', background: CREAM, color: INK, padding: '16px 16px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ position: 'absolute', top: -14, left: 12, background: i === steps.length - 1 ? PINK : accent, border: `3px solid ${INK}`, fontFamily: PIXEL, fontSize: 10, padding: '4px 6px' }}>{i + 1}</span>
          <span className="rx-hop" style={{ display: 'inline-block', flex: 'none', marginTop: 6 }}><PxSprite data={step.sprite} width={36} height={38} /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{step.title}</div>
            <div style={{ fontFamily: PIXEL, fontSize: 8, margin: '4px 0 6px', opacity: 0.7 }}>{step.timing}</div>
            <div style={{ fontSize: 14, lineHeight: 1.35, opacity: 0.8 }}>{step.body}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
