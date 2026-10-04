import type { ReactNode } from 'react'
import { PxSprite } from '@/retro/Sprite'
import { coinSkin } from '@/retro/coins'
import { crown } from '@/retro/spriteData'
import { CREAM, GREEN_UP, INK, RED_DOWN, ROAD, YELLOW } from '@/retro/scene'
import { calculateReturnWad, formatReturnWad, type AssetRaceViewModel } from '@/chain/assetRaces'

// The mock's RACE screen pieces (Race.dc.html), generalized over our race
// view model: lane board with the cream info cells, the scoreboard and the
// yellow "your bet" card. All sizes and colors come from the mock.

export const PIXEL = "'Press Start 2P', 'Courier New', monospace"

export interface LaneEntry {
  assetIndex: number
  symbol: string
  /** Display percent, already formatted (e.g. "+3.8%"). */
  percent: string
  up: boolean
  /** 0..1 progress along the road. */
  progress: number
  returnValue: bigint
}

/** Lanes in asset order with display returns; progress maps the field onto
 * the mock's 0.2-0.82 road span, leader in front. */
export function raceLanes(race: AssetRaceViewModel, final: boolean): { lanes: LaneEntry[]; leaderIndex: number } {
  const running = race.status !== 0
  const rows = race.assets
    .filter((asset) => asset.active || race.status === 0)
    .map((asset) => {
      const returnValue = final ? asset.returnValue : calculateReturnWad(asset.startPrice, asset.livePrice ?? asset.startPrice)
      return { asset, returnValue }
    })
  const sorted = [...rows].sort((a, b) => (a.returnValue > b.returnValue ? -1 : a.returnValue < b.returnValue ? 1 : a.asset.assetIndex - b.asset.assetIndex))
  const rank = new Map(sorted.map((row, index) => [row.asset.assetIndex, index]))
  const count = Math.max(sorted.length - 1, 1)
  const lanes = rows.map(({ asset, returnValue }) => {
    const position = rank.get(asset.assetIndex) ?? 0
    return {
      assetIndex: asset.assetIndex,
      symbol: asset.symbol,
      percent: running ? formatReturnWad(returnValue) : '—',
      up: returnValue >= 0n,
      // Leader at 82%, last at 20%, like the mock's field spread.
      progress: running ? 0.82 - (position * 0.62) / count : 0.08,
      returnValue,
    }
  })
  return { lanes, leaderIndex: sorted[0]?.asset.assetIndex ?? -1 }
}

/** One board row: cream info cell + road with dashes, checker and the coin. */
function BoardLane({ lane, crowned, seat }: { lane: LaneEntry; crowned: boolean; seat: number }) {
  const skin = coinSkin(lane.symbol, seat)
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: 84 }}>
      <div
        style={{
          flex: 'none',
          width: 116,
          boxSizing: 'border-box',
          background: CREAM,
          borderRight: `4px solid ${INK}`,
          boxShadow: 'inset 0 -4px 0 0 rgba(27, 19, 64, 0.14)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 8,
          padding: '0 12px',
        }}
      >
        <span style={{ fontFamily: PIXEL, fontSize: lane.symbol.length > 6 ? 9 : 12, lineHeight: 1 }}>{lane.symbol}</span>
        <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1, color: lane.up ? GREEN_UP : RED_DOWN }}>{lane.percent}</span>
      </div>
      <div aria-hidden="true" style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <div className="rx-road-dashes" />
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 40,
            width: 24,
            background: `repeating-conic-gradient(${INK} 0% 25%, ${CREAM} 0% 50%) 0 0 / 24px 24px`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `calc((100% - 150px) * ${lane.progress.toFixed(3)})`,
            top: 8,
            animation: `rx-bob 0.5s steps(1) ${(seat * 0.1).toFixed(2)}s infinite`,
            transition: 'left 1s steps(8)',
          }}
        >
          {crowned && <PxSprite data={crown} width={28} height={16} style={{ position: 'absolute', left: 18, top: -12 }} />}
          <PxSprite data={skin.sprite} width={64} height={68} />
        </div>
      </div>
    </div>
  )
}

/** The raised road board: grass, one lane per asset, grass. */
export function RaceBoard({ race, final = false }: { race: AssetRaceViewModel; final?: boolean }) {
  const { lanes, leaderIndex } = raceLanes(race, final)
  return (
    <div className="rx-raised" style={{ background: ROAD }}>
      <div className="rx-grass" style={{ height: 16, borderBottom: `4px solid ${INK}` }} />
      {lanes.map((lane, seat) => (
        <BoardLane key={lane.assetIndex} lane={lane} crowned={race.status !== 0 && lane.assetIndex === leaderIndex} seat={seat} />
      ))}
      <div className="rx-grass" style={{ height: 16, borderTop: `4px solid ${INK}` }} />
    </div>
  )
}

/** The cream scoreboard card (ТАБЛО): ranks, swatches, percents, bank. */
export function ScoreBoard({ race, final = false, bank, footer }: { race: AssetRaceViewModel; final?: boolean; bank: string; footer?: ReactNode }) {
  const { lanes } = raceLanes(race, final)
  const sorted = [...lanes].sort((a, b) => (a.returnValue > b.returnValue ? -1 : a.returnValue < b.returnValue ? 1 : a.assetIndex - b.assetIndex))
  return (
    <section className="rx-raised" style={{ display: 'flex', flexDirection: 'column', gap: 10, background: CREAM, padding: 20, color: INK }}>
      <h2 style={{ margin: 0, fontFamily: PIXEL, fontSize: 14, fontWeight: 400, lineHeight: 1.4 }}>SCOREBOARD</h2>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {sorted.map((lane, index) => (
          <li key={lane.assetIndex} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, borderBottom: '4px solid rgba(27, 19, 64, 0.12)' }}>
            <span style={{ width: 24, fontFamily: PIXEL, fontSize: 14 }}>{index + 1}</span>
            <span aria-hidden="true" className="rx-plate" style={{ flex: 'none', width: 16, height: 16, background: coinSkin(lane.symbol, lane.assetIndex).color }} />
            <span style={{ flex: 1, fontSize: 22, fontWeight: 700 }}>{lane.symbol}</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: lane.up ? GREEN_UP : RED_DOWN }}>{lane.percent}</span>
          </li>
        ))}
      </ol>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingTop: 8 }}>
        <span style={{ fontSize: 20, fontWeight: 600 }}>Race bank</span>
        <span style={{ fontFamily: PIXEL, fontSize: 16 }}>{bank}</span>
      </div>
      {footer}
    </section>
  )
}

/** The yellow YOUR BET card. */
export function YourBetCard({ symbol, line1, line2 }: { symbol: string; line1: string; line2: string }) {
  const skin = coinSkin(symbol, 0)
  return (
    <section className="rx-raised" style={{ display: 'flex', flexDirection: 'column', gap: 14, background: YELLOW, padding: 20, color: INK }}>
      <h2 style={{ margin: 0, fontFamily: PIXEL, fontSize: 14, fontWeight: 400, lineHeight: 1.4 }}>YOUR BET</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <PxSprite data={skin.sprite} width={48} height={51} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{line1}</span>
          <span style={{ fontSize: 20, fontWeight: 500 }}>{line2}</span>
        </div>
      </div>
    </section>
  )
}

/** Press Start timer on an ink block, as in the mock header. */
export function TimerBox({ label, value, invert = false }: { label: string; value: string; invert?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ fontSize: 20, fontWeight: 600 }}>{label}</span>
      <span
        style={{
          fontFamily: PIXEL,
          fontSize: 24,
          lineHeight: 1,
          color: invert ? INK : YELLOW,
          background: invert ? YELLOW : INK,
          padding: '14px 16px',
        }}
      >
        {value}
      </span>
    </div>
  )
}
