import { useEffect, useRef } from 'react'

const LINE_SPACING = 64
const WAVE_AMPLITUDE = 10
const PARALLAX_MAX_SHIFT = 26
// Smaller = more visible lag before the grid catches up to the cursor.
const PARALLAX_EASE = 0.045

/** Combined ripple used to displace both grid axes — not a physically
 * accurate height field, just three offset sine waves so the mesh reads as
 * one continuous, slowly rolling surface rather than a rigid grid. */
function waveOffset(a: number, b: number, t: number) {
  return (
    Math.sin(a * 0.012 + t * 0.6) * WAVE_AMPLITUDE +
    Math.sin(b * 0.018 - t * 0.45) * WAVE_AMPLITUDE * 0.6 +
    Math.sin((a + b) * 0.008 + t * 0.3) * WAVE_AMPLITUDE * 0.4
  )
}

/** Fixed full-viewport neon grid behind the whole app. Two motions layer
 * together: an ambient wave ripple (always running) and a slow parallax
 * drift toward the cursor, eased so it visibly trails instead of snapping.
 * Pure decoration — `pointer-events-none` throughout, so nothing under it
 * ever intercepts a click. Renders one static frame under
 * prefers-reduced-motion instead of animating. */
export function NeonGridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    let width = 0
    let height = 0
    function resize() {
      width = window.innerWidth
      height = window.innerHeight
      canvas!.width = width * dpr
      canvas!.height = height * dpr
      canvas!.style.width = `${width}px`
      canvas!.style.height = `${height}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const mouse = { x: width / 2, y: height / 2 }
    const smoothed = { x: 0, y: 0 }
    function onMouseMove(e: MouseEvent) {
      mouse.x = e.clientX
      mouse.y = e.clientY
    }
    window.addEventListener('mousemove', onMouseMove)

    let raf = 0
    let t = 0

    function draw() {
      ctx!.clearRect(0, 0, width, height)

      const targetX = ((mouse.x - width / 2) / width) * PARALLAX_MAX_SHIFT
      const targetY = ((mouse.y - height / 2) / height) * PARALLAX_MAX_SHIFT
      smoothed.x += (targetX - smoothed.x) * PARALLAX_EASE
      smoothed.y += (targetY - smoothed.y) * PARALLAX_EASE

      ctx!.save()
      ctx!.translate(smoothed.x, smoothed.y)

      // Padding covers the max parallax shift so the mesh edge never peeks
      // into view while it drifts.
      const pad = LINE_SPACING * 2
      const cols = Math.ceil((width + pad * 2) / LINE_SPACING) + 1
      const rows = Math.ceil((height + pad * 2) / LINE_SPACING) + 1
      const originX = -pad
      const originY = -pad

      // Horizontal strands — emerald (brand "YES" color).
      ctx!.strokeStyle = 'rgba(52, 211, 153, 0.22)'
      ctx!.shadowColor = 'rgba(52, 211, 153, 0.55)'
      ctx!.shadowBlur = 6
      ctx!.lineWidth = 1
      for (let j = 0; j <= rows; j++) {
        const y0 = originY + j * LINE_SPACING
        ctx!.beginPath()
        for (let i = 0; i <= cols; i++) {
          const x = originX + i * LINE_SPACING
          const y = y0 + waveOffset(x, y0, t)
          if (i === 0) ctx!.moveTo(x, y)
          else ctx!.lineTo(x, y)
        }
        ctx!.stroke()
      }

      // Vertical strands — brand green, a touch cooler than the emerald
      // horizontals so the mesh reads as two-tone rather than flat/mono.
      ctx!.strokeStyle = 'rgba(74, 222, 128, 0.16)'
      ctx!.shadowColor = 'rgba(74, 222, 128, 0.45)'
      for (let i = 0; i <= cols; i++) {
        const x0 = originX + i * LINE_SPACING
        ctx!.beginPath()
        for (let j = 0; j <= rows; j++) {
          const y = originY + j * LINE_SPACING
          const x = x0 + waveOffset(y, x0, t) * 0.5
          if (j === 0) ctx!.moveTo(x, y)
          else ctx!.lineTo(x, y)
        }
        ctx!.stroke()
      }

      ctx!.restore()

      if (!reduceMotion) {
        t += 0.016
        raf = requestAnimationFrame(draw)
      }
    }
    draw()

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0" />
      {/* Darkening + blur over the raw grid so foreground text keeps its
          contrast — the mesh reads as ambient texture, not full-strength neon. */}
      <div className="absolute inset-0 bg-[#05050a]/55 backdrop-blur-[2px]" />
    </div>
  )
}
