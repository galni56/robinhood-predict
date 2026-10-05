import type { CSSProperties, ReactNode } from 'react'
import { PxSprite } from '@/retro/Sprite'
import { cloud, crown, type PxSpriteData } from '@/retro/spriteData'

// Scene pieces copied 1:1 from the approved mock: clouds, stepped hills,
// grass strips and the race road with bobbing coin characters.

/** Headline/label font (Press Start 2P) and body font (Pixelify Sans). */
export const PIXEL = "'Press Start 2P', 'Courier New', monospace"
export const BODY_FONT = "'Pixelify Sans', 'Courier New', monospace"

export const INK = '#1B1340'
export const CREAM = '#FFF6DF'
export const SKY = '#6FD3FF'
export const ROAD = '#4A3F78'
export const NIGHT = '#24184F'
export const YELLOW = '#FFD23F'
export const PINK = '#FF5C8A'
export const GREEN_UP = '#1E7A36'
export const RED_DOWN = '#C2245A'

export function Cloud({ width, duration, style }: { width: number; duration: string; style?: CSSProperties }) {
  return (
    <PxSprite
      data={cloud}
      width={width}
      height={(width * 6) / 14}
      style={{ position: 'absolute', animation: `rx-drift ${duration} steps(6) infinite alternate`, ...style }}
    />
  )
}

const HILL_BIG =
  'polygon(0% 100%, 0% 83.33%, 8.33% 83.33%, 8.33% 66.67%, 16.67% 66.67%, 16.67% 50%, 25% 50%, 25% 33.33%, 33.33% 33.33%, 33.33% 16.67%, 41.67% 16.67%, 41.67% 0%, 50% 0%, 58.33% 0%, 58.33% 16.67%, 66.67% 16.67%, 66.67% 33.33%, 75% 33.33%, 75% 50%, 83.33% 50%, 83.33% 66.67%, 91.67% 66.67%, 91.67% 83.33%, 100% 83.33%, 100% 100%)'
const HILL_SMALL =
  'polygon(0% 100%, 0% 75%, 12.5% 75%, 12.5% 50%, 25% 50%, 25% 25%, 37.5% 25%, 37.5% 0%, 50% 0%, 62.5% 0%, 62.5% 25%, 75% 25%, 75% 50%, 87.5% 50%, 87.5% 75%, 100% 75%, 100% 100%)'
const HILL_MID =
  'polygon(0% 100%, 0% 80%, 10% 80%, 10% 60%, 20% 60%, 20% 40%, 30% 40%, 30% 20%, 40% 20%, 40% 0%, 50% 0%, 60% 0%, 60% 20%, 70% 20%, 70% 40%, 80% 40%, 80% 60%, 90% 60%, 90% 80%, 100% 80%, 100% 100%)'

export function Hills() {
  return (
    <div style={{ position: 'relative', height: 96 }}>
      <div style={{ position: 'absolute', bottom: 0, left: '5%', width: 384, height: 96, background: '#2E9E48', clipPath: HILL_BIG }} />
      <div style={{ position: 'absolute', bottom: 0, left: '22%', width: 288, height: 64, background: '#45BF5C', clipPath: HILL_SMALL }} />
      <div style={{ position: 'absolute', bottom: 0, right: '9%', width: 336, height: 80, background: '#2E9E48', clipPath: HILL_MID }} />
    </div>
  )
}

export function GrassStrip({ height, top, bottom }: { height: number; top?: boolean; bottom?: boolean }) {
  return (
    <div
      className="rx-grass"
      style={{
        height,
        ...(top ? { borderTop: `4px solid ${INK}` } : {}),
        ...(bottom ? { borderBottom: `4px solid ${INK}` } : {}),
      }}
    />
  )
}

/** One road lane: sliding dashes, optional ticker plate + dust pixel, and a
 * bobbing coin at `x` percent of the lane. */
export function RoadLane({
  height,
  coinSprite,
  coinWidth = 64,
  x,
  label,
  blinkDelay = '0s',
  crowned = false,
  coinTop = 4,
}: {
  height: number
  coinSprite: PxSpriteData
  coinWidth?: number
  x: number
  label?: string
  blinkDelay?: string
  crowned?: boolean
  coinTop?: number
}) {
  return (
    <div style={{ position: 'relative', height }}>
      <div className="rx-road-dashes" />
      {label && (
        <span
          className="rx-plate rx-font-pixel"
          style={{
            position: 'absolute',
            right: `calc(100% - ${x}% + 16px)`,
            top: 26,
            fontSize: 10,
            lineHeight: 1,
            color: INK,
            background: CREAM,
            padding: '7px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      )}
      <span
        style={{
          position: 'absolute',
          right: `calc(100% - ${x}% + 2px)`,
          bottom: 10,
          width: 8,
          height: 8,
          background: CREAM,
          animation: `rx-blink 0.5s steps(1) ${blinkDelay} infinite`,
        }}
      />
      <div style={{ position: 'absolute', left: `${x}%`, top: coinTop, animation: `rx-bob 0.5s steps(1) ${blinkDelay} infinite` }}>
        {crowned && (
          <PxSprite
            data={crown}
            width={(coinWidth * 7) / 16}
            height={(coinWidth * 4) / 16}
            style={{ position: 'absolute', left: coinWidth * 0.28, top: -coinWidth * 0.19 }}
          />
        )}
        <PxSprite data={coinSprite} width={coinWidth} height={(coinWidth * 17) / 16} />
      </div>
    </div>
  )
}

/** The purple road band with its checkered finish column. */
export function RoadBand({
  children,
  checkerRight = '7%',
  checkerWidth = 32,
  bordered = true,
}: {
  children: ReactNode
  checkerRight?: string
  checkerWidth?: number
  bordered?: boolean
}) {
  return (
    <div
      style={{
        position: 'relative',
        background: ROAD,
        ...(bordered ? { borderTop: `4px solid ${INK}`, borderBottom: `4px solid ${INK}` } : {}),
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: checkerRight,
          width: checkerWidth,
          background: `repeating-conic-gradient(${INK} 0% 25%, ${CREAM} 0% 50%) 0 0 / ${checkerWidth}px ${checkerWidth}px`,
        }}
      />
      {children}
    </div>
  )
}

/** Blinking star field for night scenes. */
export function Stars({ stars }: { stars: [string, number, number, number][] }) {
  return (
    <>
      {stars.map(([left, top, size, duration], index) => (
        <span
          key={index}
          style={{
            position: 'absolute',
            left,
            top,
            width: size,
            height: size,
            background: CREAM,
            animation: `rx-blink ${duration}s steps(1) infinite`,
          }}
        />
      ))}
    </>
  )
}
