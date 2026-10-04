import type { CSSProperties, ReactNode } from 'react'
import { PxSprite } from '@/retro/Sprite'
import { cloud, coinPurple, crown, type PxSpriteData } from '@/retro/spriteData'
import { CREAM, INK, PINK, ROAD, YELLOW } from '@/retro/scene'

// Animated pieces for the landing and the leaderboard, in the mock's pixel
// style: a race that actually runs, a sky with a sun and drifting clouds,
// pixel dividers, a podium, a coin fighter wearing a token logo, and the
// arena scene (one coin, many price calls). Keyframes live in index.css
// (rx-fx-*); everything stops under prefers-reduced-motion.

const PIXEL = "'Press Start 2P', 'Courier New', monospace"

// ------------------------------------------------------------------ sky

export function Sun({ size = 88, style }: { size?: number; style?: CSSProperties }) {
  const ray = (rotate: number) => (
    <span key={rotate} style={{ position: 'absolute', left: '50%', top: '50%', width: size * 0.16, height: size * 1.5, marginLeft: -size * 0.08, marginTop: -size * 0.75, transform: `rotate(${rotate}deg)` }}>
      <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: size * 0.18, background: YELLOW, boxShadow: `0 0 0 3px ${INK}` }} />
      <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: size * 0.18, background: YELLOW, boxShadow: `0 0 0 3px ${INK}` }} />
    </span>
  )
  return (
    <div aria-hidden="true" style={{ position: 'absolute', width: size, height: size, ...style }}>
      <div className="rx-fx-spin" style={{ position: 'absolute', inset: 0 }}>{[0, 45, 90, 135].map(ray)}</div>
      <div style={{ position: 'absolute', inset: size * 0.14, background: YELLOW, border: `4px solid ${INK}`, boxShadow: 'inset -8px -8px 0 #F2B705', clipPath: 'polygon(25% 0, 75% 0, 100% 25%, 100% 75%, 75% 100%, 25% 100%, 0 75%, 0 25%)' }} />
    </div>
  )
}

/** A cloud crossing the whole sky, left to right, forever. */
export function DriftingCloud({ width, top, duration, delay = 0 }: { width: number; top: number; duration: number; delay?: number }) {
  return (
    <div aria-hidden="true" className="rx-fx-cross" style={{ position: 'absolute', top, left: 0, animationDuration: `${duration}s`, animationDelay: `${-delay}s` }}>
      <PxSprite data={cloud} width={width} height={(width * 6) / 14} />
    </div>
  )
}

// ----------------------------------------------------------- the race

export interface RaceRunner {
  sprite: PxSpriteData
  label: string
  /** Progress (0..1) at each fifth of the run; the leader changes on the way. */
  path: [number, number, number, number, number, number]
}

/** Four coins race to the checkered line; the winner gets a crown,
 * confetti pops and the flag waves, then the next heat starts. */
export function AnimatedRace({ runners, lane = 76, duration = 11 }: { runners: RaceRunner[]; lane?: number; duration?: number }) {
  const winner = runners.reduce((best, r, i) => (r.path[5] > runners[best].path[5] ? i : best), 0)
  // Running covers 0..80% of the loop, the finish celebration the rest.
  const keyframes = runners.map((r, i) => `@keyframes rx-fx-run-${i} {
    0% { left: 2%; } ${[1, 2, 3, 4].map((k) => `${k * 16}% { left: calc(${(r.path[k] * 86).toFixed(1)}% + 2%); }`).join(' ')}
    80%, 100% { left: calc(${(r.path[5] * 86).toFixed(1)}% + 2%); }
  }`).join('\n')
  return (
    <div aria-hidden="true" style={{ position: 'relative', background: ROAD, borderTop: `4px solid ${INK}`, borderBottom: `4px solid ${INK}` }}>
      <style>{keyframes}</style>
      <div style={{ position: 'absolute', top: 0, bottom: 0, right: '7%', width: 32, background: `repeating-conic-gradient(${INK} 0% 25%, ${CREAM} 0% 50%) 0 0 / 32px 32px` }} />
      <FinishFlag style={{ right: 'calc(7% - 4px)', top: -74 }} duration={duration} />
      {runners.map((r, i) => (
        <div key={r.label} style={{ position: 'relative', height: lane }}>
          <div className="rx-road-dashes" />
          <div style={{ position: 'absolute', top: 4, left: '2%', display: 'flex', alignItems: 'center', gap: 6, animation: `rx-fx-run-${i} ${duration}s cubic-bezier(.45,.05,.55,.95) infinite` }}>
            <span className="rx-plate rx-font-pixel" style={{ fontSize: 10, lineHeight: 1, color: INK, background: CREAM, padding: '7px 8px', whiteSpace: 'nowrap' }}>{r.label}</span>
            <div style={{ position: 'relative', animation: 'rx-bob 0.4s steps(1) infinite', animationDelay: `${i * 0.1}s` }}>
              {i === winner && (
                <span className="rx-fx-crown" style={{ position: 'absolute', left: 18, top: -16, animationDuration: `${duration}s` }}>
                  <PxSprite data={crown} width={28} height={16} />
                </span>
              )}
              <PxSprite data={r.sprite} width={64} height={68} />
            </div>
          </div>
        </div>
      ))}
      <Confetti duration={duration} />
    </div>
  )
}

function FinishFlag({ style, duration }: { style: CSSProperties; duration: number }) {
  return (
    <div style={{ position: 'absolute', zIndex: 2, ...style }}>
      <span style={{ position: 'absolute', left: 0, top: 0, width: 6, height: 70, background: INK }} />
      <span className="rx-fx-flag" style={{ position: 'absolute', left: 6, top: 0, width: 44, height: 30, border: `3px solid ${INK}`, background: `repeating-conic-gradient(${INK} 0% 25%, ${CREAM} 0% 50%) 0 0 / 12px 12px`, animationDuration: `${duration}s` }} />
    </div>
  )
}

const CONFETTI = [
  [86, 18, PINK], [90, 30, YELLOW], [82, 42, '#4DB5FF'], [94, 54, '#5FD46E'], [88, 66, PINK],
  [80, 24, '#A77BFF'], [92, 12, YELLOW], [84, 72, '#4DB5FF'], [96, 36, PINK], [78, 58, YELLOW],
] as const

function Confetti({ duration }: { duration: number }) {
  return (
    <>
      {CONFETTI.map(([x, y, color], i) => (
        <span key={i} className="rx-fx-confetti" style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: 10, height: 10, background: color, boxShadow: `0 0 0 2px ${INK}`, animationDuration: `${duration}s`, animationDelay: `${(i % 5) * 0.05}s`, ['--rx-dx' as string]: `${(i % 2 ? 1 : -1) * (14 + i * 4)}px` }} />
      ))}
    </>
  )
}

// ------------------------------------------------------------ dividers

/** Pixel divider between sections: grass tufts, a picket fence or a finish tape. */
export function PixelDivider({ kind, from, to }: { kind: 'grass' | 'fence' | 'finish'; from: string; to: string }) {
  if (kind === 'finish') {
    return (
      <div aria-hidden="true" style={{ position: 'relative', height: 28, background: `linear-gradient(${from} 50%, ${to} 50%)` }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 6, height: 16, borderTop: `4px solid ${INK}`, borderBottom: `4px solid ${INK}`, background: `repeating-conic-gradient(${INK} 0% 25%, ${CREAM} 0% 50%) 0 0 / 16px 16px` }} />
      </div>
    )
  }
  if (kind === 'fence') {
    return (
      <div aria-hidden="true" style={{ position: 'relative', height: 48, background: from }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 12, background: to, borderTop: `4px solid ${INK}` }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 18, height: 8, background: CREAM, borderTop: `3px solid ${INK}`, borderBottom: `3px solid ${INK}` }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 4, bottom: 12, backgroundImage: `linear-gradient(90deg, transparent 0 12px, ${INK} 12px 14px, ${CREAM} 14px 26px, ${INK} 26px 28px, transparent 28px 40px)`, backgroundSize: '40px 100%', clipPath: 'polygon(0 6px, 100% 6px, 100% 100%, 0 100%)' }} />
      </div>
    )
  }
  return (
    <div aria-hidden="true" style={{ position: 'relative', height: 24, background: to }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 24, background: from, clipPath: 'polygon(0 0, 100% 0, 100% 40%, 97% 40%, 97% 70%, 94% 70%, 94% 40%, 90% 40%, 90% 60%, 86% 60%, 86% 40%, 80% 40%, 80% 75%, 77% 75%, 77% 40%, 70% 40%, 70% 60%, 66% 60%, 66% 40%, 58% 40%, 58% 70%, 55% 70%, 55% 40%, 47% 40%, 47% 60%, 43% 60%, 43% 40%, 35% 40%, 35% 75%, 32% 75%, 32% 40%, 24% 40%, 24% 60%, 20% 60%, 20% 40%, 12% 40%, 12% 70%, 9% 70%, 9% 40%, 4% 40%, 4% 60%, 0 60%)' }} />
    </div>
  )
}

// -------------------------------------------------------------- podium

export interface PodiumPlace {
  name: ReactNode
  value: string
  sprite: PxSpriteData
}

/** Three coins on steps 2-1-3 with a trophy over the winner. */
export function Podium({ places }: { places: [PodiumPlace?, PodiumPlace?, PodiumPlace?] }) {
  const order = [1, 0, 2] as const
  const heights = [120, 84, 60]
  const colors = [YELLOW, '#C7D2E6', '#E3A06A']
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 8 }}>
      {order.map((rank) => {
        const place = places[rank]
        return (
          <div key={rank} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 'min(30%, 200px)' }}>
            <div className="rx-hop" style={{ position: 'relative', marginBottom: 4 }}>
              {rank === 0 && <Trophy />}
              <PxSprite data={place?.sprite ?? coinPurple} width={rank === 0 ? 72 : 60} height={(rank === 0 ? 72 : 60) * 17 / 16} style={place ? undefined : { opacity: 0.45, filter: 'grayscale(1)' }} />
            </div>
            <div style={{ width: '100%', minWidth: 0, textAlign: 'center', fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place?.name ?? 'You?'}</div>
            <div style={{ fontFamily: PIXEL, fontSize: 10, margin: '4px 0 8px' }}>{place?.value ?? '—'}</div>
            <div className="rx-raised" style={{ width: '100%', height: heights[rank], background: colors[rank], display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: PIXEL, fontSize: 28 }}>{rank + 1}</div>
          </div>
        )
      })}
    </div>
  )
}

function Trophy() {
  return (
    <span className="rx-fx-shine" style={{ position: 'absolute', left: '50%', top: -44, marginLeft: -18, width: 36, height: 38 }}>
      <span style={{ position: 'absolute', left: 6, top: 0, width: 24, height: 18, background: YELLOW, border: `3px solid ${INK}`, borderTop: 'none', borderRadius: '0 0 10px 10px' }} />
      <span style={{ position: 'absolute', left: 0, top: 2, width: 8, height: 10, border: `3px solid ${INK}`, borderRight: 'none' }} />
      <span style={{ position: 'absolute', right: 0, top: 2, width: 8, height: 10, border: `3px solid ${INK}`, borderLeft: 'none' }} />
      <span style={{ position: 'absolute', left: 15, top: 18, width: 6, height: 8, background: INK }} />
      <span style={{ position: 'absolute', left: 8, top: 26, width: 20, height: 8, background: YELLOW, border: `3px solid ${INK}` }} />
    </span>
  )
}

// --------------------------------------------------------- coin fighter

/** A pixel coin character whose face is a token logo; hops on hover. */
export function CoinFighter({ body, logoUrl, symbol, size = 56 }: { body: PxSpriteData; logoUrl?: string | null; symbol: string; size?: number }) {
  return (
    <span className="rx-hop" style={{ position: 'relative', display: 'inline-block', width: size, height: (size * 17) / 16, flex: 'none' }}>
      <PxSprite data={body} width={size} height={(size * 17) / 16} />
      <span style={{ position: 'absolute', left: size * 0.19, top: size * 0.13, width: size * 0.62, height: size * 0.62, overflow: 'hidden', borderRadius: '50%', boxShadow: `0 0 0 2px ${INK}`, background: CREAM, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: PIXEL, fontSize: size * 0.22, color: INK }}>
        {logoUrl ? <img src={logoUrl} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated' }} /> : symbol.slice(0, 1)}
      </span>
    </span>
  )
}

// --------------------------------------------------------- arena scene

/** Price Arena: one coin in the ring, every player calls its final price. */
export function ArenaCallsScene({ coin, calls }: { coin: PxSpriteData; calls: string[] }) {
  const spots = [[6, 12], [70, 10], [4, 52], [74, 50], [24, 32]]
  return (
    <>
      {calls.slice(0, spots.length).map((call, i) => (
        <span key={call} className="rx-plate rx-fx-float" style={{ position: 'absolute', left: `${spots[i][0]}%`, top: `${spots[i][1]}%`, fontFamily: PIXEL, fontSize: 10, background: i === 1 ? YELLOW : CREAM, padding: '7px 8px', animationDelay: `${i * 0.4}s` }}>
          {call}
        </span>
      ))}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 40, display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', animation: 'rx-bob 0.6s steps(1) infinite' }}>
          <span className="rx-plate" style={{ position: 'absolute', left: '50%', top: -34, transform: 'translateX(-50%)', fontFamily: PIXEL, fontSize: 12, background: PINK, padding: '6px 8px', whiteSpace: 'nowrap' }}>$ ???</span>
          <PxSprite data={coin} width={96} height={102} />
        </div>
      </div>
    </>
  )
}
