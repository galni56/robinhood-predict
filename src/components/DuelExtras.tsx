import { useEffect, useState } from 'react'
import { HowItWorksStrip, COIN_BODIES } from '@/components/GamePickers'
import { useLivePrices } from '@/chain/livePrices'
import type { ApprovedRaceAsset } from '@/chain/assetRaces'
import { assetRaceCatalog } from '@/chain/assetRaceRegistry'
import pumpswapSnapshot from '@/chain/pumpswapSnapshot.json'
import { assetIconUrl } from '@/lib/assetIcons'
import { formatUnits } from '@/lib/format'
import { life, seeded } from '@/lib/life'
import { AnimatedRace, CoinFighter } from '@/retro/landingFx'
import { PxSprite } from '@/retro/Sprite'
import { CREAM, GrassStrip, Hills, INK, YELLOW, PIXEL } from '@/retro/scene'
import { coinBlue, coinBlueGrin, coinGreen, coinOrangeGrin, coinPinkGrin, coinPurple, coinPurpleGrin } from '@/retro/spriteData'

// Shared blocks of the duel pages (list and lobby): the four steps, the rules
// in numbers, the practice lap and the coins a racer can bring.

export const RACE_ORANGE = '#ED8F3A'

/** Every coin a duel can use: the catalog (no stocks) and the PumpSwap list. */
export const DUEL_COIN_NAMES = [...new Set([
  ...assetRaceCatalog.filter((a) => a.category !== 'STOCK').map((a) => a.symbol),
  ...pumpswapSnapshot.assets.map((a) => a.symbol),
])].filter((name) => name.length <= 9)

const STEPS = [
  { sprite: coinOrangeGrin, title: 'Bring a coin', timing: 'LOBBY', body: 'Pick a meme or crypto coin nobody here has. The first racer sets the stake, the time and price or cap.' },
  { sprite: coinPinkGrin, title: 'Pay the stake', timing: '2 MIN', body: 'Everyone pays the same $1-$50. Until someone is ready you can leave with all of it back.' },
  { sprite: coinBlueGrin, title: 'Hit READY', timing: '1 MIN', body: 'The first READY starts a minute for the rest. Miss it and you are kicked with a 10% tax.' },
  { sprite: coinPurple, title: 'Biggest gain wins', timing: '1-30 MIN', body: "The coin that grows the most takes the pot. Backers of the winner share the losing backers' money." },
]

/** The four steps of a duel (the lobby list). */
export function DuelSteps() {
  return <HowItWorksStrip accent={RACE_ORANGE} steps={STEPS} />
}

const NUMBERS = [
  { big: '2-6', label: 'racers, one coin each', sprite: coinOrangeGrin },
  { big: '$1-$50', label: 'same stake for everyone', sprite: coinBlueGrin },
  { big: '2%', label: 'only from winnings', sprite: coinPurpleGrin },
  { big: '30/70', label: "losing backers' money: winner / his backers", sprite: coinGreen },
]

/** The duel rules in four numbers, each tile with its own idle coin. */
export function DuelNumbers() {
  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
      {NUMBERS.map((n, i) => (
        <div key={n.big} className="rx-raised" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, background: CREAM }}>
          <span className="rx-life-idle" style={life(31 + i, 1, 1.3, 2.9)}><PxSprite data={n.sprite} width={44} height={47} /></span>
          <div>
            <div style={{ fontFamily: PIXEL, fontSize: 20, textShadow: `3px 3px 0 ${i % 2 ? YELLOW : RACE_ORANGE}` }}>{n.big}</div>
            <div style={{ fontSize: 15, fontWeight: 700, opacity: 0.75 }}>{n.label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

const PRACTICE_BODIES = [coinOrangeGrin, coinPinkGrin, coinPurple, coinBlue]

/** A full-width practice heat: hills, the grandstand, random coins and winner, no money. */
export function PracticeLap() {
  return (
    <div aria-hidden="true" style={{ position: 'relative', marginTop: 56 }}>
      <span className="rx-plate rx-life-blink" style={{ position: 'absolute', zIndex: 2, left: '50%', top: 8, transform: 'translateX(-50%)', background: CREAM, fontFamily: PIXEL, fontSize: 10, padding: '8px 12px', whiteSpace: 'nowrap', ...life(77, 1, 1.6, 2.2) }}>PRACTICE LAP · NO MONEY</span>
      <Hills />
      <GrassStrip height={20} top />
      <AnimatedRace names={DUEL_COIN_NAMES} bodies={PRACTICE_BODIES} />
      <GrassStrip height={28} />
    </div>
  )
}

/**
 * A faded coin that keeps changing (BTC, SOL, WIF…) in an empty lane: what
 * could race here. Each lane changes at its own pace.
 */
export function GhostCoin({ seed, size = 40 }: { seed: number; size?: number }) {
  const [tick, setTick] = useState(() => Math.floor(seeded(seed, 1) * 1000))
  useEffect(() => {
    const every = 1600 + Math.round(seeded(seed, 2) * 1600)
    const timer = setInterval(() => setTick((t) => t + 1), every)
    return () => clearInterval(timer)
  }, [seed])
  const symbol = DUEL_COIN_NAMES[(tick * 7 + seed) % DUEL_COIN_NAMES.length] ?? '?'
  return (
    <span className="rx-life-idle" style={{ opacity: 0.45, ...life(seed, 3, 1.2, 2.4) }} title={symbol}>
      <CoinFighter body={COIN_BODIES[(tick + seed) % COIN_BODIES.length]} logoUrl={assetIconUrl(symbol)} symbol={symbol} size={size} />
    </span>
  )
}

/** Coins shown per group before "Show all". */
const COINS_FOLDED = 12

const price = (raw: bigint, decimals: number) => `$${Number(Number(formatUnits(raw, decimals)).toPrecision(4))}`

/**
 * The coins a racer can bring, crypto and memes, with live prices. A tap
 * picks the coin in the join form; coins already in the lobby are greyed.
 */
export function CoinsToBring({ assets, taken, category, onPick }: {
  assets: ApprovedRaceAsset[]
  taken: string[]
  /** Set once the first racer locked the lobby to one category. */
  category: 'meme' | 'crypto' | null
  onPick?: (asset: ApprovedRaceAsset) => void
}) {
  const live = useLivePrices()
  // Long groups (memes) start folded so the page stays short on phones.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const groups = [
    { key: 'crypto' as const, title: 'CRYPTO', list: assets.filter((a) => a.category === 2) },
    { key: 'meme' as const, title: 'MEMES', list: assets.filter((a) => a.category === 1) },
  ].filter((g) => g.list.length > 0 && (!category || g.key === category))
  return (
    <div className="rx-raised" style={{ background: CREAM, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span style={{ fontFamily: PIXEL, fontSize: 10 }}>COINS YOU CAN BRING{category ? ` · ${category === 'meme' ? 'MEMES' : 'CRYPTO'} ONLY` : ''}</span>
      {groups.map((group) => (
        <div key={group.key}>
          <div style={{ fontFamily: PIXEL, fontSize: 9, opacity: 0.6, marginBottom: 8 }}>{group.title} · {group.list.length}</div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))' }}>
            {(expanded[group.key] ? group.list : group.list.slice(0, COINS_FOLDED)).map((asset, i) => {
              const used = taken.includes(asset.symbol)
              const p = live.assets[asset.symbol]
              return (
                <button
                  key={asset.symbol}
                  type="button"
                  disabled={used || !onPick}
                  onClick={() => onPick?.(asset)}
                  className="rx-plate rx-hop-host"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: used ? 'rgba(27,19,64,0.06)' : '#FFFFFF', color: INK, cursor: used || !onPick ? 'default' : 'pointer', opacity: used ? 0.45 : 1, textAlign: 'left', minWidth: 0 }}
                >
                  <CoinFighter body={COIN_BODIES[i % COIN_BODIES.length]} logoUrl={asset.logoUrl ?? assetIconUrl(asset.symbol)} symbol={asset.symbol} size={28} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.symbol}</span>
                    <span style={{ display: 'block', fontSize: 11, opacity: 0.6 }}>{used ? 'in the race' : p ? price(p.raw, p.decimals) : '…'}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {group.list.length > COINS_FOLDED && (
            <button type="button" onClick={() => setExpanded((e) => ({ ...e, [group.key]: !e[group.key] }))} style={{ marginTop: 8, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: INK, fontWeight: 700, fontSize: 15, textDecoration: 'underline', textUnderlineOffset: 4 }}>
              {expanded[group.key] ? 'Show fewer' : `Show all ${group.list.length}`}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
