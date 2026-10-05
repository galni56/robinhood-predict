import type { CSSProperties } from 'react'
import type { PxSpriteData } from '@/retro/spriteData'

/** Renders one of the mock's pixel-art sprites at any size, crisp. */
export function PxSprite({
  data,
  width,
  height,
  flip = false,
  className,
  style,
}: {
  data: PxSpriteData
  width?: number | string
  height?: number | string
  flip?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      viewBox={data.viewBox}
      width={width}
      height={height}
      aria-hidden="true"
      className={className}
      style={{ display: 'block', flex: 'none', shapeRendering: 'crispEdges', ...(flip ? { transform: 'scaleX(-1)' } : {}), ...style }}
    >
      {data.rects.map(([x, y, w, h, fill], index) => (
        <rect key={index} x={x} y={y} width={w} height={h} fill={fill} />
      ))}
    </svg>
  )
}
