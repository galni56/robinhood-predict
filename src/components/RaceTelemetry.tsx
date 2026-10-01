import { useEffect, useRef } from 'react'
import { TokenLogo } from '@/components/TokenLogo'
import type { MotionAsset } from '@/components/GameModeMotion'

const ORANGE = '242, 166, 90'
const MAX_LANES = 4

/** Per-lane phase offsets chosen so leadership visibly trades hands every
 * few seconds without any two lanes moving in sync. */
const LANE_PHASES = [0.0, 2.1, 4.4, 5.9]

function lanePosition(t: number, lane: number): number {
  const phase = LANE_PHASES[lane % LANE_PHASES.length]
  const p =
    0.5 +
    0.24 * Math.sin(t * 0.42 + phase) +
    0.16 * Math.sin(t * 0.93 + phase * 1.7) +
    0.07 * Math.sin(t * 1.78 + phase * 2.3)
  return Math.min(0.96, Math.max(0.04, p))
}

/** Live race telemetry: horizontal lanes, glowing momentum trails and a
 * finish gate, drawn on one canvas. The logo chips are DOM nodes moved by
 * the same animation frame so the artwork stays crisp at any size. Purely
 * decorative (the parent is aria-hidden) - every number here is synthetic. */
export function RaceTelemetry({ assets }: { assets: readonly MotionAsset[] }) {
  const racers = assets.slice(0, MAX_LANES)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chipRefs = useRef<(HTMLDivElement | null)[]>([])
  const deltaRefs = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = canvas?.parentElement
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const laneCount = Math.max(racers.length, 1)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0
    let raf = 0
    let visible = true
    const started = performance.now()

    function resize() {
      if (!canvas || !wrap) return
      const rect = wrap.getBoundingClientRect()
      width = rect.width
      height = rect.height
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function laneY(lane: number) {
      // Leave room above lane 0 for the flag + mascot stack so the top
      // runner never collides with the kicker label.
      const top = 50
      const bottom = 26
      return top + ((lane + 0.5) * (height - top - bottom)) / laneCount
    }

    function draw(now: number) {
      if (!ctx || width === 0) return
      const t = reducedMotion ? 7.3 : (now - started) / 1000
      const startX = 26
      const finishX = width - 44
      ctx.clearRect(0, 0, width, height)

      // Distance hairlines scrolling left: the track moves, not the field.
      const spacing = 64
      const offset = spacing - ((t * 34) % spacing)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)'
      ctx.lineWidth = 1
      for (let x = startX + offset; x < finishX; x += spacing) {
        ctx.beginPath()
        ctx.moveTo(x, 26)
        ctx.lineTo(x, height - 22)
        ctx.stroke()
      }

      // Lane separators.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
      for (let lane = 0; lane < laneCount; lane++) {
        const y = laneY(lane)
        ctx.beginPath()
        ctx.moveTo(startX, y)
        ctx.lineTo(finishX, y)
        ctx.stroke()
      }

      // Start line and checkered finish gate.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
      ctx.fillRect(startX, 26, 1, height - 48)
      const cell = 5
      const gatePulse = 0.1 + 0.08 * (0.5 + 0.5 * Math.sin(t * 2.2))
      for (let row = 0; row * cell < height - 52; row++) {
        for (let col = 0; col < 2; col++) {
          ctx.fillStyle =
            (row + col) % 2 === 0 ? `rgba(247, 241, 227, ${0.06 + gatePulse})` : 'rgba(247, 241, 227, 0.03)'
          ctx.fillRect(finishX + col * cell, 26 + row * cell, cell, cell)
        }
      }

      // Momentum trails. The leading lane burns brighter.
      const positions = racers.map((_, lane) => lanePosition(t, lane))
      const leader = positions.indexOf(Math.max(...positions))
      racers.forEach((_, lane) => {
        const y = laneY(lane)
        const x = startX + positions[lane] * (finishX - startX - 8)
        const isLeader = lane === leader
        const tail = Math.max(startX, x - (isLeader ? 130 : 95))
        const grad = ctx.createLinearGradient(tail, y, x, y)
        grad.addColorStop(0, `rgba(${ORANGE}, 0)`)
        grad.addColorStop(0.55, `rgba(${ORANGE}, ${isLeader ? 0.32 : 0.16})`)
        grad.addColorStop(1, `rgba(${ORANGE}, ${isLeader ? 0.95 : 0.55})`)
        ctx.strokeStyle = grad
        ctx.lineWidth = isLeader ? 3 : 2
        ctx.lineCap = 'round'
        ctx.shadowColor = `rgba(${ORANGE}, 0.7)`
        ctx.shadowBlur = isLeader ? 14 : 7
        ctx.beginPath()
        ctx.moveTo(tail, y)
        ctx.lineTo(x, y)
        ctx.stroke()
        ctx.shadowBlur = 0

        const halo = ctx.createRadialGradient(x, y, 0, x, y, isLeader ? 22 : 14)
        halo.addColorStop(0, `rgba(${ORANGE}, ${isLeader ? 0.3 : 0.16})`)
        halo.addColorStop(1, `rgba(${ORANGE}, 0)`)
        ctx.fillStyle = halo
        ctx.beginPath()
        ctx.arc(x, y, isLeader ? 22 : 14, 0, Math.PI * 2)
        ctx.fill()

        const chip = chipRefs.current[lane]
        if (chip) {
          chip.style.transform = `translate3d(${x}px, ${y + 5}px, 0) translate(-50%, -100%)`
          if ((chip.dataset.leader === 'true') !== isLeader) chip.dataset.leader = String(isLeader)
        }
        const delta = deltaRefs.current[lane]
        if (delta) {
          const value = (positions[lane] - 0.5) * 3.1
          const text = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
          if (delta.textContent !== text) {
            delta.textContent = text
            delta.style.color = value >= 0 ? '#8fe3a8' : '#f49999'
          }
        }
      })
    }

    function loop(now: number) {
      draw(now)
      raf = requestAnimationFrame(loop)
    }

    resize()
    const ro = new ResizeObserver(() => {
      resize()
      draw(performance.now())
    })
    ro.observe(wrap)

    const io = new IntersectionObserver(([entry]) => {
      const nowVisible = entry.isIntersecting
      if (nowVisible === visible) return
      visible = nowVisible
      cancelAnimationFrame(raf)
      if (visible && !reducedMotion) raf = requestAnimationFrame(loop)
    })
    io.observe(wrap)

    if (reducedMotion) draw(performance.now())
    else raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
    }
  }, [racers.map((asset) => asset.symbol).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="race-tele">
      <canvas ref={canvasRef} className="race-tele-canvas" />
      {racers.map((asset, lane) => (
        <div
          key={`${asset.symbol}-${lane}`}
          className="race-tele-chip"
          ref={(node) => {
            chipRefs.current[lane] = node
          }}
        >
          <div className="race-flag">
            <TokenLogo ticker={asset.symbol} logoUrl={asset.logoUrl} className="h-4 w-4 rounded" />
            <span className="race-tele-sym">{asset.symbol}</span>
            <span
              className="race-tele-delta"
              ref={(node) => {
                deltaRefs.current[lane] = node
              }}
            />
          </div>
          <i className="race-flag-pole" />
          <div className="race-chud-wrap">
            <i className="race-chud-leg race-chud-leg--left" />
            <i className="race-chud-leg race-chud-leg--right" />
            <img src={`${import.meta.env.BASE_URL}brand/mascot-small.png`} alt="" className="race-chud" />
          </div>
        </div>
      ))}
    </div>
  )
}
