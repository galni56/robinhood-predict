import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CREAM, INK, PINK, PIXEL, YELLOW } from '@/retro/scene'

// Price chart of one pool with an optional draggable crosshair (Price Shot's
// aim) and horizontal lines for the other players' shots. The last hour comes
// from GeckoTerminal's public candles; live prices are appended as they come.
// Display only: settlement uses the signed pool price.

export interface ChartLine {
  price: number
  label: string
  mine?: boolean
  hit?: boolean
}

const W = 640
const H = 300
const PAD = { left: 8, right: 92, top: 14, bottom: 22 }

function useCandles(pool: string) {
  return useQuery({
    queryKey: ['candles', pool],
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const response = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/minute?aggregate=1&limit=60&currency=usd`)
      if (!response.ok) throw new Error(`candles ${response.status}`)
      const body = await response.json()
      const list: number[][] = body?.data?.attributes?.ohlcv_list ?? []
      return list.map(([t, , , , close]) => ({ t, price: close })).filter((p) => p.price > 0).sort((a, b) => a.t - b.t)
    },
  })
}

export const formatChartValue = (value: number, unit: 'price' | 'cap', supply: number | null) => {
  if (unit === 'cap' && supply) {
    const cap = value * supply
    return cap >= 1e9 ? `$${(cap / 1e9).toPrecision(3)}B` : cap >= 1e6 ? `$${(cap / 1e6).toPrecision(3)}M` : cap >= 1e3 ? `$${(cap / 1e3).toPrecision(3)}K` : `$${cap.toPrecision(3)}`
  }
  return `$${Number(value.toPrecision(5))}`
}

export function ShotChart({ pool, live, unit = 'price', supply = null, aim, lines = [] }: {
  pool: string
  /** Latest display price in USD. */
  live: number | null
  unit?: 'price' | 'cap'
  supply?: number | null
  /** The draggable crosshair: current value and setter (null = no crosshair). */
  aim?: { value: number | null; onChange: (value: number) => void } | null
  lines?: ChartLine[]
}) {
  const candles = useCandles(pool)
  const [ticks, setTicks] = useState<{ t: number; price: number }[]>([])
  const [zoom, setZoom] = useState(1)
  const dragging = useRef(false)
  const svg = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (live == null || !(live > 0)) return
    setTicks((prev) => [...prev.slice(-600), { t: Date.now() / 1000, price: live }])
  }, [live])

  const points = useMemo(() => {
    const history = candles.data ?? []
    const after = history.length ? history[history.length - 1].t : 0
    return [...history, ...ticks.filter((p) => p.t > after)]
  }, [candles.data, ticks])

  const ref = live ?? points[points.length - 1]?.price ?? aim?.value ?? lines[0]?.price ?? 0
  const domain = useMemo(() => {
    const values = [...points.map((p) => p.price), ...lines.map((l) => l.price)]
    if (ref > 0) values.push(ref)
    if (values.length === 0) return { lo: 0, hi: 1 }
    let lo = Math.min(...values)
    let hi = Math.max(...values)
    const span = Math.max(hi - lo, ref * 0.01)
    const mid = (hi + lo) / 2
    const half = (span / 2) * 1.4 * zoom
    lo = Math.max(mid - half, 0)
    hi = mid + half
    return { lo, hi }
  }, [points, lines, ref, zoom])

  const y = (price: number) => PAD.top + (1 - (price - domain.lo) / (domain.hi - domain.lo || 1)) * (H - PAD.top - PAD.bottom)
  const fromY = (py: number) => domain.lo + (1 - (py - PAD.top) / (H - PAD.top - PAD.bottom)) * (domain.hi - domain.lo)
  const t0 = points[0]?.t ?? 0
  const t1 = Math.max(points[points.length - 1]?.t ?? 1, t0 + 1)
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ')

  const setFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!aim || !svg.current) return
    const box = svg.current.getBoundingClientRect()
    const py = ((event.clientY - box.top) / box.height) * H
    const value = fromY(Math.min(Math.max(py, PAD.top), H - PAD.bottom))
    if (value > 0) aim.onChange(Number(value.toPrecision(6)))
  }

  const label = (value: number) => formatChartValue(value, unit, supply)

  return (
    <div className="rx-raised" style={{ position: 'relative', background: INK, color: CREAM }}>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', width: '100%', height: 'auto', touchAction: aim ? 'none' : 'auto', cursor: aim ? 'ns-resize' : 'default', userSelect: 'none' }}
        onPointerDown={(e) => {
          if (!aim) return
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          setFromPointer(e)
        }}
        onPointerMove={(e) => dragging.current && setFromPointer(e)}
        onPointerUp={() => { dragging.current = false }}
        onPointerCancel={() => { dragging.current = false }}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + f * (H - PAD.top - PAD.bottom)} y2={PAD.top + f * (H - PAD.top - PAD.bottom)} stroke="rgba(255,246,223,0.08)" strokeWidth={1} />
        ))}
        {path && <path d={path} fill="none" stroke={YELLOW} strokeWidth={2.5} strokeLinejoin="round" />}
        {lines.map((l) => (
          <g key={`${l.label}-${l.price}`}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(l.price)} y2={y(l.price)} stroke={l.mine ? PINK : l.hit ? '#45BF5C' : 'rgba(255,246,223,0.45)'} strokeWidth={l.mine ? 2 : 1.5} strokeDasharray={l.mine ? undefined : '5 4'} />
            <text x={W - PAD.right + 4} y={y(l.price) + 4} fill={l.mine ? PINK : CREAM} fontSize={11} fontFamily="'Pixelify Sans', monospace">{l.label}</text>
          </g>
        ))}
        {ref > 0 && (
          <g>
            <circle cx={points.length ? x(points[points.length - 1].t) : W - PAD.right} cy={y(ref)} r={4} fill={YELLOW} />
            <rect x={W - PAD.right + 2} y={y(ref) - 9} width={PAD.right - 4} height={18} fill={YELLOW} />
            <text x={W - PAD.right + 6} y={y(ref) + 4} fill={INK} fontSize={11} fontFamily={PIXEL}>{label(ref)}</text>
          </g>
        )}
        {aim?.value != null && aim.value > 0 && (
          <g pointerEvents="none">
            <line x1={PAD.left} x2={W - PAD.right} y1={y(aim.value)} y2={y(aim.value)} stroke={PINK} strokeWidth={2.5} />
            <circle cx={(W - PAD.right) / 2} cy={y(aim.value)} r={9} fill="none" stroke={PINK} strokeWidth={2.5} />
            <line x1={(W - PAD.right) / 2 - 14} x2={(W - PAD.right) / 2 + 14} y1={y(aim.value)} y2={y(aim.value)} stroke={PINK} strokeWidth={2.5} />
            <line x1={(W - PAD.right) / 2} x2={(W - PAD.right) / 2} y1={y(aim.value) - 14} y2={y(aim.value) + 14} stroke={PINK} strokeWidth={2.5} />
            <rect x={W - PAD.right + 2} y={y(aim.value) - 9} width={PAD.right - 4} height={18} fill={PINK} />
            <text x={W - PAD.right + 6} y={y(aim.value) + 4} fill={CREAM} fontSize={11} fontFamily={PIXEL}>{label(aim.value)}</text>
          </g>
        )}
        {points.length === 0 && <text x={W / 2 - 60} y={H / 2} fill={CREAM} fontSize={14} fontFamily="'Pixelify Sans', monospace">{candles.isLoading ? 'Loading chart…' : 'Waiting for prices…'}</text>}
      </svg>
      <div style={{ position: 'absolute', left: 10, top: 8, display: 'flex', gap: 4 }}>
        <button type="button" onClick={() => setZoom((z) => Math.min(z * 1.6, 40))} className="rx-btn rx-btn-white" style={{ padding: '2px 8px', fontWeight: 700 }} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => setZoom((z) => Math.max(z / 1.6, 0.15))} className="rx-btn rx-btn-white" style={{ padding: '2px 8px', fontWeight: 700 }} aria-label="Zoom in">+</button>
      </div>
    </div>
  )
}
