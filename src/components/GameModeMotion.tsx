import clsx from 'clsx'
import { RaceTelemetry } from '@/components/RaceTelemetry'
import { TokenLogo } from '@/components/TokenLogo'

export interface MotionAsset {
  symbol: string
  logoUrl?: string
}

type GameMode = 'market' | 'race' | 'arena'

const FALLBACK_RACERS: MotionAsset[] = [
  { symbol: 'NVDA' },
  { symbol: 'TSLA' },
  { symbol: 'AAPL' },
]

function MarketMotion({ asset }: { asset?: MotionAsset }) {
  return (
    <>
      <div className="game-motion-kicker">LIVE CONVICTION</div>
      <svg className="market-signal" viewBox="0 0 520 180" preserveAspectRatio="none">
        <defs>
          <linearGradient id="market-signal-gradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ff4f8b" stopOpacity="0" />
            <stop offset="0.35" stopColor="#ff4f8b" />
            <stop offset="1" stopColor="#D8D0FF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="market-target-line" d="M20 83 H500" />
        <path className="market-signal-path" d="M0 145 C70 136 84 110 134 118 S210 152 252 96 S328 24 372 64 S430 114 520 30" />
      </svg>

      <div className="market-orbit-wrap">
        <div className="market-orbit">
          <div className="market-orbit-chip market-orbit-chip--yes"><span>YES</span></div>
          <div className="market-orbit-chip market-orbit-chip--no"><span>NO</span></div>
        </div>
        <div className="market-core">
          <div className="market-core-halo" />
          <TokenLogo ticker={asset?.symbol ?? 'NVDA'} logoUrl={asset?.logoUrl} className="h-11 w-11 rounded-none" />
          <span>{asset?.symbol ?? 'NVDA'}</span>
        </div>
      </div>
      <div className="market-motion-caption">Pick a side. Let the deadline decide.</div>
    </>
  )
}

function RaceMotion({ assets }: { assets: readonly MotionAsset[] }) {
  const racers = assets.length > 0 ? assets : FALLBACK_RACERS

  return (
    <>
      <div className="game-motion-kicker">LIVE RACE TELEMETRY</div>
      <RaceTelemetry assets={racers} />
      <div className="race-motion-caption">
        Fastest move wins the lap<span className="race-motion-caption-dim"> · every lap reshuffles the lead</span>
      </div>
    </>
  )
}

function ArenaMotion({ asset }: { asset?: MotionAsset }) {
  return (
    <>
      <div className="game-motion-kicker">FORECAST GRAVITY</div>
      <div className="arena-target">
        <div className="arena-ring arena-ring--one" />
        <div className="arena-ring arena-ring--two" />
        <div className="arena-ring arena-ring--three" />
        <div className="arena-scan" />
        <div className="arena-core">
          <TokenLogo ticker={asset?.symbol ?? 'NVDA'} logoUrl={asset?.logoUrl} className="h-10 w-10 rounded-none" />
          <span>{asset?.symbol ?? 'NVDA'}</span>
        </div>
        <div className="arena-forecast-dots">
          {Array.from({ length: 6 }, (_, index) => (
            <i key={index} className={clsx('arena-forecast-dot', index === 3 && 'arena-forecast-dot--closest')} />
          ))}
        </div>
      </div>
      <div className="arena-motion-caption"><span>FAR</span><b>closest forecast wins</b><span>FINAL</span></div>
    </>
  )
}

export function GameModeMotion({
  mode,
  assets = [],
  className,
}: {
  mode: GameMode
  assets?: readonly MotionAsset[]
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={clsx('game-mode-motion', `game-mode-motion--${mode}`, className)}
    >
      <div className="game-motion-grid" />
      <div className="game-motion-glow" />
      {mode === 'market' && <MarketMotion asset={assets[0]} />}
      {mode === 'race' && <RaceMotion assets={assets} />}
      {mode === 'arena' && <ArenaMotion asset={assets[0]} />}
    </div>
  )
}
