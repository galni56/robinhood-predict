import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CREAM, INK, PINK, PIXEL, YELLOW } from '@/retro/scene'

// Price Shot's game chart: a live line that slides in real time and eases
// from tick to tick, a tight scale around the current price so every move
// shows, a draggable crosshair for the aim, and the other shots as lines
// (pinned to the edge with an arrow when they are off the scale). The recent
// past comes from GeckoTerminal's 1-minute candles, then live prices every
// second. Display only: settlement uses the signed pool price.

export interface ChartLine {
  price: number
  label: string
  mine?: boolean
  hit?: boolean
}

const W = 640
const H = 320
const PAD = { left: 8, right: 96, top: 16, bottom: 16 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom
/** Seconds of history on screen; the head sits a little left of the axis. */
const WINDOW = { aim: 15 * 60, live: 3 * 60 }
const HEAD_ROOM = 0.06

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

/** Decimals that resolve `step` (so a cent-sized move on $86 shows as 86.12 -> 86.13). */
const decimalsFor = (step: number) => Math.min(10, Math.max(0, Math.ceil(-Math.log10(step))))

export function formatChartValue(value: number, unit: 'price' | 'cap', supply: number | null, step?: number) {
  if (unit === 'cap' && supply) {
    const cap = value * supply
    const scaled = cap >= 1e9 ? [cap / 1e9, 'B'] : cap >= 1e6 ? [cap / 1e6, 'M'] : cap >= 1e3 ? [cap / 1e3, 'K'] : [cap, '']
    const n = scaled[0] as number
    const d = step ? decimalsFor((step * supply) / (cap / n)) : n >= 100 ? 1 : 2
    return `$${n.toFixed(Math.min(d, 4))}${scaled[1]}`
  }
  const d = step ? decimalsFor(step) : value >= 1000 ? 2 : value >= 1 ? 3 : Math.min(10, 2 + Math.ceil(-Math.log10(value)) + 2)
  return `$${value.toFixed(d)}`
}

export function ShotChart({ pool, live, unit = 'price', supply = null, aim, lines = [], mode = 'live' }: {
  pool: string
  /** Latest display price in USD. */
  live: number | null
  unit?: 'price' | 'cap'
  supply?: number | null
  /** The draggable crosshair: current value and setter (null = no crosshair). */
  aim?: { value: number | null; onChange: (value: number) => void } | null
  lines?: ChartLine[]
  mode?: 'aim' | 'live'
}) {
  const candles = useCandles(pool)
  const [ticks, setTicks] = useState<{ t: number; price: number }[]>([])
  const [zoom, setZoom] = useState(1)
  const [frame, setFrame] = useState(() => ({ now: Date.now() / 1000, shown: live ?? 0 }))
  const shownRef = useRef(live ?? 0)
  const dragging = useRef(false)
  const svg = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (live == null || !(live > 0)) return
    setTicks((prev) => (prev.length && prev[prev.length - 1].price === live ? prev : [...prev.slice(-1200), { t: Date.now() / 1000, price: live }]))
  }, [live])

  // ~30 fps: time slides continuously and the head eases to the latest price.
  useEffect(() => {
    let raf = 0
    let last = 0
    const loop = (ms: number) => {
      raf = requestAnimationFrame(loop)
      if (ms - last < 33) return
      last = ms
      const target = live ?? shownRef.current
      shownRef.current = shownRef.current > 0 ? shownRef.current + (target - shownRef.current) * 0.18 : target
      setFrame({ now: Date.now() / 1000, shown: shownRef.current })
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [live])

  const span = WINDOW[mode]
  const now = frame.now
  const t0 = now - span * (1 - HEAD_ROOM)
  const t1 = now + span * HEAD_ROOM

  // GeckoTerminal's candles and our pool price differ slightly: the history is
  // scaled to meet the first live price, so the line has no step where they join.
  const points = useMemo(() => {
    const history = candles.data ?? []
    const after = ticks.length ? ticks[0].t : Infinity
    const before = history.filter((p) => p.t < after)
    const last = before[before.length - 1]
    const k = last && ticks.length ? ticks[0].price / last.price : 1
    return [...before.map((p) => ({ t: p.t, price: p.price * k })), ...ticks]
  }, [candles.data, ticks])
  const visible = points.filter((p) => p.t >= t0 - 60)
  const head = frame.shown > 0 ? frame.shown : visible[visible.length - 1]?.price ?? aim?.value ?? 0

  // Tight scale: the moves of the visible window plus a small floor, so a
  // cent on a dollar coin is a visible step. Zoom widens or narrows it.
  const domain = useMemo(() => {
    if (!(head > 0)) return { lo: 0, hi: 1 }
    const dev = visible.reduce((m, p) => Math.max(m, Math.abs(p.price - head)), 0)
    const half = Math.max(dev * 1.25, head * 0.0005) * zoom
    return { lo: head - half, hi: head + half }
  }, [visible, head, zoom])
  const step = (domain.hi - domain.lo) / 200

  const y = (price: number) => PAD.top + (1 - (price - domain.lo) / (domain.hi - domain.lo || 1)) * PLOT_H
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * PLOT_W
  const fromY = (py: number) => domain.lo + (1 - (py - PAD.top) / PLOT_H) * (domain.hi - domain.lo)
  const clampY = (py: number) => Math.min(Math.max(py, PAD.top), H - PAD.bottom)
  const headX = x(now)
  const path = [...visible.map((p) => [x(p.t), y(p.price)] as const), [headX, y(head)] as const]
    .filter(([px]) => px >= PAD.left - 20)
    .map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${clampY(py).toFixed(1)}`)
    .join(' ')
  const area = path ? `${path} L${headX.toFixed(1)},${H - PAD.bottom} L${PAD.left},${H - PAD.bottom} Z` : ''

  const setFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!aim || !svg.current) return
    const box = svg.current.getBoundingClientRect()
    const value = fromY(clampY(((event.clientY - box.top) / box.height) * H))
    if (value > 0) aim.onChange(Math.round(value / step) * step)
  }
  const label = (value: number) => formatChartValue(value, unit, supply, step)
  const grid = [0.2, 0.4, 0.6, 0.8].map((f) => domain.lo + f * (domain.hi - domain.lo))

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
        <defs>
          <linearGradient id="shot-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={YELLOW} stopOpacity="0.28" />
            <stop offset="100%" stopColor={YELLOW} stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="rgba(255,246,223,0.07)" strokeWidth={1} />
            <text x={W - PAD.right + 6} y={y(v) + 4} fill="rgba(255,246,223,0.45)" fontSize={11} fontFamily="'Pixelify Sans', monospace">{label(v)}</text>
          </g>
        ))}
        {area && <path d={area} fill="url(#shot-area)" />}
        {path && <path d={path} fill="none" stroke={YELLOW} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}

        {placeLabels(lines.map((l) => {
          const off = l.price > domain.hi ? 'up' : l.price < domain.lo ? 'down' : null
          return { l, off, ly: off === 'up' ? PAD.top + 8 : off === 'down' ? H - PAD.bottom - 8 : y(l.price) }
        })).map(({ l, off, ly, chipY }) => {
          const color = l.mine ? PINK : l.hit ? '#45BF5C' : 'rgba(255,246,223,0.6)'
          // Chips sit at the left edge (clear of the live price on the right),
          // right of the zoom buttons when near the top.
          const cx = chipY < PAD.top + 30 ? PAD.left + 92 : PAD.left + 4
          return (
            <g key={`${l.label}-${l.price}`}>
              {!off && <line x1={PAD.left} x2={W - PAD.right} y1={ly} y2={ly} stroke={color} strokeWidth={l.mine ? 2 : 1.5} strokeDasharray={l.mine ? undefined : '6 5'} />}
              {Math.abs(chipY - ly) > 1 && <line x1={cx + 62} x2={cx + 72} y1={chipY} y2={ly} stroke={color} strokeWidth={1} />}
              <rect x={cx} y={chipY - 9} width={62} height={18} fill={l.mine ? PINK : INK} stroke={color} strokeWidth={1.5} />
              <text x={cx + 4} y={chipY + 4} fill={l.mine ? CREAM : color} fontSize={10} fontFamily={PIXEL}>{off === 'up' ? '▲' : off === 'down' ? '▼' : ''}{l.label}</text>
            </g>
          )
        })}

        {head > 0 && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(head)} y2={y(head)} stroke="rgba(255,210,63,0.35)" strokeWidth={1} strokeDasharray="2 4" />
            <circle cx={headX} cy={y(head)} r={5} fill={YELLOW}>
              <animate attributeName="r" values="5;8;5" dur="1s" repeatCount="indefinite" />
            </circle>
            <rect x={W - PAD.right + 2} y={y(head) - 10} width={PAD.right - 4} height={20} fill={YELLOW} />
            <text x={W - PAD.right + 6} y={y(head) + 4} fill={INK} fontSize={11} fontFamily={PIXEL}>{label(head)}</text>
          </g>
        )}

        {aim?.value != null && aim.value > 0 && (
          <g pointerEvents="none">
            <line x1={PAD.left} x2={W - PAD.right} y1={clampY(y(aim.value))} y2={clampY(y(aim.value))} stroke={PINK} strokeWidth={2.5} />
            <circle cx={PAD.left + PLOT_W / 2} cy={clampY(y(aim.value))} r={10} fill="none" stroke={PINK} strokeWidth={2.5} />
            <line x1={PAD.left + PLOT_W / 2 - 16} x2={PAD.left + PLOT_W / 2 + 16} y1={clampY(y(aim.value))} y2={clampY(y(aim.value))} stroke={PINK} strokeWidth={2.5} />
            <line x1={PAD.left + PLOT_W / 2} x2={PAD.left + PLOT_W / 2} y1={clampY(y(aim.value)) - 16} y2={clampY(y(aim.value)) + 16} stroke={PINK} strokeWidth={2.5} />
            <rect x={W - PAD.right + 2} y={clampY(y(aim.value)) - 10} width={PAD.right - 4} height={20} fill={PINK} />
            <text x={W - PAD.right + 6} y={clampY(y(aim.value)) + 4} fill={CREAM} fontSize={11} fontFamily={PIXEL}>{label(aim.value)}</text>
          </g>
        )}
        {!(head > 0) && <text x={W / 2 - 60} y={H / 2} fill={CREAM} fontSize={14} fontFamily="'Pixelify Sans', monospace">{candles.isLoading ? 'Loading chart…' : 'Waiting for prices…'}</text>}
      </svg>
      <div style={{ position: 'absolute', left: 10, top: 8, display: 'flex', gap: 4 }}>
        <button type="button" onClick={() => setZoom((z) => Math.min(z * 1.6, 60))} className="rx-btn rx-btn-white" style={{ padding: '2px 8px', fontWeight: 700 }} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => setZoom((z) => Math.max(z / 1.6, 0.2))} className="rx-btn rx-btn-white" style={{ padding: '2px 8px', fontWeight: 700 }} aria-label="Zoom in">+</button>
      </div>
    </div>
  )
}

/** Spreads label chips so they never overlap: sorted by height, at least one chip apart, inside the plot. */
function placeLabels<T extends { ly: number }>(items: T[]): (T & { chipY: number })[] {
  const gap = 20
  const sorted = [...items].sort((a, b) => a.ly - b.ly).map((it) => ({ ...it, chipY: it.ly }))
  for (let i = 1; i < sorted.length; i++) sorted[i].chipY = Math.max(sorted[i].chipY, sorted[i - 1].chipY + gap)
  const bottom = H - PAD.bottom - 9
  if (sorted.length && sorted[sorted.length - 1].chipY > bottom) {
    sorted[sorted.length - 1].chipY = bottom
    for (let i = sorted.length - 2; i >= 0; i--) sorted[i].chipY = Math.min(sorted[i].chipY, sorted[i + 1].chipY - gap)
  }
  return sorted
}

/** The crosshair's fine step at the chart's default scale, for nudge buttons. */
export const aimStep = (price: number) => Math.max(price * 0.0001, Number.EPSILON)
