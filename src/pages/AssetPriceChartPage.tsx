import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatUnits } from 'viem'
import {
  ASSET_PRICE_CANDLE_INTERVALS,
  assetPriceCandleIntervalMs,
  assetPriceHistoryUrl,
  buildAssetPriceCandles,
  mergeAssetPriceHistory,
  parseAssetPriceHistory,
  type AssetPriceCandle,
  type AssetPriceCandleInterval,
  type AssetPriceHistoryPoint,
} from '@/chain/assetPriceHistory'
import { assetRaceCatalog } from '@/chain/assetRaceRegistry'
import { useAssetRaceLiveDisplay } from '@/chain/useAssetRaceLiveDisplay'
import { TokenLogo } from '@/components/TokenLogo'

interface ChartObservation {
  receivedAt: number
  price: number
  blockNumber?: string
}

const UP_COLOR = '#35D6A0'
const DOWN_COLOR = '#FF6B85'

function priceDigits(value: number, quote: string, precise: boolean) {
  if (quote === 'USDG') {
    if (value >= 1_000) return precise ? 6 : 3
    if (value >= 1) return precise ? 8 : 4
    return precise ? 10 : 7
  }
  if (value >= 1) return precise ? 10 : 6
  if (value >= 0.001) return precise ? 12 : 8
  return 14
}

function formatPrice(value: number, quote: string, precise = false) {
  if (!Number.isFinite(value)) return '-'
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: quote === 'USDG' ? 2 : 0,
    maximumFractionDigits: priceDigits(value, quote, precise),
  })
  return quote === 'USDG' ? `$${formatted}` : `${formatted} ETH`
}

function formatAxisPrice(value: number, quote: string) {
  if (!Number.isFinite(value)) return '-'
  if (quote === 'USDG') {
    return value >= 100
      ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `$${value.toLocaleString(undefined, { maximumSignificantDigits: 6 })}`
  }
  return value.toLocaleString(undefined, { maximumSignificantDigits: 6 })
}

function formatChartTime(timestamp: number, interval: AssetPriceCandleInterval) {
  if (interval === '1h') {
    return new Date(timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit' })
  }
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatExactTime(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatAge(ageMs: number) {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'just now'
  const seconds = Math.floor(ageMs / 1_000)
  if (seconds < 2) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.floor(seconds / 60)}m ago`
}

function shortPool(value?: string) {
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : 'reviewed pool'
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function useElementSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, ...size }
}

function CandleLegend({ candle, quote }: { candle?: AssetPriceCandle; quote: string }) {
  if (!candle) return <span className="text-white/35">Waiting for the first candle…</span>
  const change = candle.open > 0 ? ((candle.close - candle.open) / candle.open) * 100 : 0
  const tone = change >= 0 ? 'text-emerald-300' : 'text-rose-300'
  return (
    <>
      <span className="text-white/40">O</span><span>{formatPrice(candle.open, quote, true)}</span>
      <span className="text-white/40">H</span><span>{formatPrice(candle.high, quote, true)}</span>
      <span className="text-white/40">L</span><span>{formatPrice(candle.low, quote, true)}</span>
      <span className="text-white/40">C</span><span>{formatPrice(candle.close, quote, true)}</span>
      <span className={tone}>{change >= 0 ? '+' : ''}{change.toFixed(4)}%</span>
    </>
  )
}

function CandlestickChart({
  candles,
  currentPrice,
  interval,
  quote,
}: {
  candles: AssetPriceCandle[]
  currentPrice?: number
  interval: AssetPriceCandleInterval
  quote: string
}) {
  const { ref, width, height } = useElementSize()
  const [visibleSlots, setVisibleSlots] = useState(64)
  const [offsetSlots, setOffsetSlots] = useState(0)
  const [hoveredStart, setHoveredStart] = useState<number>()
  const drag = useRef<{ x: number; offset: number; moved: boolean } | undefined>(undefined)
  const intervalMs = assetPriceCandleIntervalMs(interval)
  const firstStart = candles[0]?.startTime
  const lastStart = candles.at(-1)?.startTime
  const totalSlots = firstStart != null && lastStart != null ? Math.round((lastStart - firstStart) / intervalMs) + 1 : 0
  const maxOffset = Math.max(0, totalSlots - visibleSlots)
  const offset = clamp(offsetSlots, 0, maxOffset)
  const anchorStart = lastStart == null ? 0 : lastStart - offset * intervalMs
  const rangeStart = anchorStart - (visibleSlots - 1) * intervalMs
  const visible = useMemo(
    () => candles.filter((candle) => candle.startTime >= rangeStart && candle.startTime <= anchorStart),
    [anchorStart, candles, rangeStart],
  )
  const candleByStart = useMemo(() => new Map(visible.map((candle) => [candle.startTime, candle])), [visible])
  const hovered = hoveredStart == null ? undefined : candleByStart.get(hoveredStart)
  const inspected = hovered ?? visible.at(-1)

  const margin = { top: 56, right: width < 520 ? 68 : 92, bottom: 28, left: 10 }
  const plotWidth = Math.max(1, width - margin.left - margin.right)
  const mainBottom = Math.max(margin.top + 100, height - 102)
  const mainHeight = Math.max(1, mainBottom - margin.top)
  const activityTop = mainBottom + 18
  const activityBottom = Math.max(activityTop + 1, height - margin.bottom)
  const activityHeight = activityBottom - activityTop
  const slotWidth = plotWidth / visibleSlots
  const prices = visible.flatMap((candle) => [candle.low, candle.high])
  if (currentPrice && Number.isFinite(currentPrice)) prices.push(currentPrice)
  const rawMin = prices.length ? Math.min(...prices) : 0
  const rawMax = prices.length ? Math.max(...prices) : 1
  const pricePadding = (rawMax - rawMin) * 0.1 || Math.max(rawMax * 0.0008, 0.000000000001)
  const domainMin = rawMin - pricePadding
  const domainMax = rawMax + pricePadding
  const priceSpan = Math.max(domainMax - domainMin, Number.EPSILON)
  const yForPrice = (price: number) => margin.top + ((domainMax - price) / priceSpan) * mainHeight
  const xForStart = (startTime: number) => margin.left + (((startTime - rangeStart) / intervalMs) + 0.5) * slotWidth
  const maxUpdates = Math.max(1, ...visible.map((candle) => candle.updates))
  const currentY = currentPrice && prices.length ? yForPrice(currentPrice) : undefined

  const inspectPointer = (clientX: number, target: HTMLDivElement) => {
    const localX = clientX - target.getBoundingClientRect().left
    const slot = Math.floor((localX - margin.left) / slotWidth)
    if (slot < 0 || slot >= visibleSlots) {
      setHoveredStart(undefined)
      return
    }
    setHoveredStart(rangeStart + slot * intervalMs)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, offset, moved: false }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current) {
      const distance = event.clientX - drag.current.x
      if (Math.abs(distance) > 3) drag.current.moved = true
      if (drag.current.moved) {
        setHoveredStart(undefined)
        setOffsetSlots(clamp(Math.round(drag.current.offset + distance / slotWidth), 0, maxOffset))
        return
      }
    }
    inspectPointer(event.clientX, event.currentTarget)
  }

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    drag.current = undefined
    inspectPointer(event.clientX, event.currentTarget)
  }

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const next = clamp(visibleSlots + (event.deltaY > 0 ? 8 : -8), 20, 160)
    setVisibleSlots(next)
  }

  const changeZoom = (amount: number) => setVisibleSlots((current) => clamp(current + amount, 20, 160))

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#100C16]">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] font-bold sm:text-xs">
          <CandleLegend candle={inspected} quote={quote} />
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => changeZoom(-8)} className="grid h-8 w-8 place-items-center rounded-lg text-base text-white/55 hover:bg-white/10 hover:text-white" aria-label="Zoom in">+</button>
          <button type="button" onClick={() => changeZoom(8)} className="grid h-8 w-8 place-items-center rounded-lg text-base text-white/55 hover:bg-white/10 hover:text-white" aria-label="Zoom out">−</button>
          <button type="button" onClick={() => setOffsetSlots(0)} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] ${offset === 0 ? 'bg-[#8B7CF7]/20 text-[#BDB4FF]' : 'text-white/45 hover:bg-white/10 hover:text-white'}`}>Live</button>
        </div>
      </div>
      <div
        ref={ref}
        className="relative h-[420px] cursor-crosshair select-none sm:h-[540px]"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={() => { drag.current = undefined }}
        onPointerLeave={() => { if (!drag.current) setHoveredStart(undefined) }}
        onWheel={onWheel}
      >
        {width > 0 && height > 0 && visible.length > 0 ? (
          <>
            <svg width={width} height={height} className="absolute inset-0" role="img" aria-label={`${interval} candlestick price chart`}>
              <rect x={0} y={0} width={width} height={height} fill="#100C16" />
              {Array.from({ length: 6 }, (_, index) => {
                const ratio = index / 5
                const y = margin.top + ratio * mainHeight
                const price = domainMax - ratio * priceSpan
                return (
                  <g key={`price-${index}`}>
                    <line x1={margin.left} x2={width - margin.right} y1={y} y2={y} stroke="rgba(255,255,255,0.065)" strokeWidth={1} />
                    <text x={width - margin.right + 8} y={y + 4} fill="rgba(255,255,255,0.42)" fontFamily="ui-monospace, monospace" fontSize={width < 520 ? 9 : 11}>{formatAxisPrice(price, quote)}</text>
                  </g>
                )
              })}
              {Array.from({ length: 6 }, (_, index) => {
                const slot = Math.round(index * (visibleSlots - 1) / 5)
                const timestamp = rangeStart + slot * intervalMs
                const x = margin.left + (slot + 0.5) * slotWidth
                return (
                  <g key={`time-${index}`}>
                    <line x1={x} x2={x} y1={margin.top} y2={activityBottom} stroke="rgba(255,255,255,0.045)" strokeWidth={1} />
                    <text x={x} y={height - 8} textAnchor="middle" fill="rgba(255,255,255,0.36)" fontFamily="ui-monospace, monospace" fontSize={width < 520 ? 8 : 10}>{formatChartTime(timestamp, interval)}</text>
                  </g>
                )
              })}
              <text x={margin.left} y={activityTop - 5} fill="rgba(255,255,255,0.28)" fontFamily="ui-monospace, monospace" fontSize={9}>POOL TICKS</text>
              {visible.map((candle) => {
                const x = xForStart(candle.startTime)
                const openY = yForPrice(candle.open)
                const closeY = yForPrice(candle.close)
                const highY = yForPrice(candle.high)
                const lowY = yForPrice(candle.low)
                const color = candle.close >= candle.open ? UP_COLOR : DOWN_COLOR
                const bodyWidth = clamp(slotWidth * 0.62, 2, 12)
                const bodyY = Math.min(openY, closeY)
                const bodyHeight = Math.max(2, Math.abs(closeY - openY))
                const activityBarHeight = Math.max(1, (candle.updates / maxUpdates) * activityHeight)
                return (
                  <g key={candle.startTime}>
                    <rect x={x - bodyWidth / 2} y={activityBottom - activityBarHeight} width={bodyWidth} height={activityBarHeight} fill={color} opacity={0.2} />
                    <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth={1.3} />
                    <rect x={x - bodyWidth / 2} y={bodyY} width={bodyWidth} height={bodyHeight} rx={Math.min(1.5, bodyWidth / 4)} fill={color} />
                  </g>
                )
              })}
              {currentY != null && currentPrice != null && (
                <g>
                  <line x1={margin.left} x2={width - margin.right} y1={currentY} y2={currentY} stroke="#8B7CF7" strokeDasharray="4 4" strokeOpacity={0.75} />
                  <rect x={width - margin.right} y={currentY - 11} width={margin.right} height={22} rx={4} fill="#7C6CEB" />
                  <text x={width - margin.right + 6} y={currentY + 4} fill="white" fontFamily="ui-monospace, monospace" fontWeight={700} fontSize={width < 520 ? 9 : 11}>{formatAxisPrice(currentPrice, quote)}</text>
                </g>
              )}
              {hovered && (() => {
                const x = xForStart(hovered.startTime)
                const y = yForPrice(hovered.close)
                return (
                  <g>
                    <line x1={x} x2={x} y1={margin.top} y2={activityBottom} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />
                    <line x1={margin.left} x2={width - margin.right} y1={y} y2={y} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />
                    <circle cx={x} cy={y} r={3.5} fill="#F8F5EE" stroke="#8B7CF7" strokeWidth={2} />
                  </g>
                )
              })()}
            </svg>
            {hovered && (
              <div
                className="pointer-events-none absolute z-10 w-[210px] rounded-xl border border-white/15 bg-[#21182C]/95 p-3 shadow-2xl backdrop-blur-xl"
                style={{
                  left: xForStart(hovered.startTime) > width * 0.66 ? Math.max(8, xForStart(hovered.startTime) - 220) : Math.min(width - 218, xForStart(hovered.startTime) + 12),
                  top: 14,
                }}
              >
                <p className="font-mono text-xs font-bold text-white">{formatExactTime(hovered.startTime)}</p>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px]">
                  <span className="text-white/40">Open</span><span className="text-right">{formatPrice(hovered.open, quote, true)}</span>
                  <span className="text-white/40">High</span><span className="text-right text-emerald-300">{formatPrice(hovered.high, quote, true)}</span>
                  <span className="text-white/40">Low</span><span className="text-right text-rose-300">{formatPrice(hovered.low, quote, true)}</span>
                  <span className="text-white/40">Close</span><span className="text-right">{formatPrice(hovered.close, quote, true)}</span>
                  <span className="text-white/40">Updates</span><span className="text-right">{hovered.updates}</span>
                </div>
                {hovered.blockNumber && <p className="mt-2 border-t border-white/10 pt-2 font-mono text-[9px] text-white/35">Block #{hovered.blockNumber}</p>}
              </div>
            )}
          </>
        ) : (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <div className="mx-auto mb-4 h-8 w-8 animate-pulse rounded-full bg-[#8B7CF7]" />
              <p className="font-bold">Building the live chart…</p>
              <p className="mt-2 text-sm text-white/40">Verified pool updates will form the first candle automatically.</p>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 border-t border-white/10 px-4 py-2 text-[10px] text-white/30 sm:flex-row sm:items-center sm:justify-between">
        <span>Drag horizontally to move · scroll or use +/− to zoom</span>
        <span>{visible.length} candles · {offset === 0 ? 'following live price' : `${offset} intervals behind live`}</span>
      </div>
    </div>
  )
}

export function AssetPriceChartPage() {
  const { symbol = '' } = useParams()
  const asset = useMemo(() => assetRaceCatalog.find((item) =>
    item.symbol.toLowerCase() === decodeURIComponent(symbol).toLowerCase()
      && item.networks['robinhood-mainnet'].enabled), [symbol])
  const live = useAssetRaceLiveDisplay({ enabled: true })
  const [history, setHistory] = useState<AssetPriceHistoryPoint[]>([])
  const [interval, setIntervalName] = useState<AssetPriceCandleInterval>('1m')
  const [historyUnavailable, setHistoryUnavailable] = useState(false)
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!asset) return
    const controller = new AbortController()
    const load = () => {
      fetch(assetPriceHistoryUrl(asset.assetId), { signal: controller.signal, headers: { accept: 'application/json' } })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error('HistoryUnavailable')))
        .then((payload) => {
          const parsed = parseAssetPriceHistory(payload, asset.assetId)
          if (!parsed) throw new Error('InvalidHistory')
          setHistory((current) => mergeAssetPriceHistory(current, parsed.points))
          setHistoryUnavailable(false)
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          setHistoryUnavailable(true)
        })
    }
    load()
    const timer = window.setInterval(load, 15_000)
    return () => {
      window.clearInterval(timer)
      controller.abort()
    }
  }, [asset])

  const livePrice = asset ? live.assets[asset.assetId] : undefined

  useEffect(() => {
    if (!livePrice || livePrice.stale) return
    const timer = window.setTimeout(() => {
      setHistory((current) => mergeAssetPriceHistory(current, [{
        priceRaw: livePrice.priceRaw,
        decimals: livePrice.decimals,
        receivedAt: livePrice.receivedAt,
        blockTimestamp: livePrice.blockTimestamp,
        blockNumber: livePrice.blockNumber,
      }]))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [livePrice])

  const observations = useMemo<ChartObservation[]>(() => history
    .map((point) => ({
      receivedAt: point.receivedAt,
      price: Number(formatUnits(BigInt(point.priceRaw), point.decimals)),
      blockNumber: point.blockNumber,
    }))
    .filter((point) => Number.isFinite(point.price) && point.price > 0), [history])

  const candles = useMemo(() => buildAssetPriceCandles(observations, interval), [interval, observations])

  if (!asset) {
    return <div className="mx-auto max-w-5xl px-5 py-24 text-center"><h1 className="font-display text-4xl font-bold">Asset not found</h1><Link to="/" className="mt-6 inline-block text-[#B3A7FA]">Back to Prophet Markets</Link></div>
  }

  const quote = livePrice?.quoteSymbol ?? (asset.category === 'MEME' ? 'ETH' : 'USDG')
  const accent = asset.category === 'MEME' ? '#F2A65A' : '#8B7CF7'
  const pool = livePrice?.poolIdentifier ?? asset.marketSource?.poolIdentifier
  const latestPoint = observations.at(-1)
  const latestAt = livePrice?.receivedAt ?? latestPoint?.receivedAt
  const directLivePrice = livePrice ? Number(formatUnits(BigInt(livePrice.priceRaw), livePrice.decimals)) : undefined
  const currentPrice = directLivePrice && Number.isFinite(directLivePrice) ? directLivePrice : latestPoint?.price
  const feedHealthy = Boolean(livePrice && !live.disconnected && !livePrice.stale)
  const latestCandle = candles.at(-1)
  const candleChange = latestCandle && latestCandle.open > 0 ? ((latestCandle.close - latestCandle.open) / latestCandle.open) * 100 : 0

  return (
    <div className="mx-auto w-full max-w-[1480px] px-3 py-6 sm:px-6 sm:py-10">
      <Link to="/" className="text-sm font-bold text-white/45 transition-colors hover:text-white">← Back to games</Link>
      <section className="mt-4 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#21182C]/95 shadow-2xl shadow-black/20">
        <header className="flex flex-col gap-5 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-center gap-3">
            <TokenLogo ticker={asset.symbol} className="h-12 w-12 rounded-xl sm:h-14 sm:w-14" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold sm:text-3xl">{asset.symbol} / {quote === 'USDG' ? 'USD' : quote}</h1>
                <span className="rounded-md bg-white/5 px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.16em]" style={{ color: accent }}>Onchain pool</span>
              </div>
              <p className="truncate text-xs text-white/40 sm:text-sm">{asset.displayName} · exact reviewed settlement source</p>
            </div>
          </div>
          <div className="sm:text-right">
            <div className="font-mono text-3xl font-bold tracking-tight sm:text-4xl">{currentPrice ? formatPrice(currentPrice, quote, true) : 'Loading…'}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:justify-end">
              {latestCandle && (
                <span className={`text-xs font-bold ${candleChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {candleChange >= 0 ? '+' : ''}{candleChange.toFixed(4)}% this {interval} candle
                </span>
              )}
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${feedHealthy ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${feedHealthy ? 'animate-pulse bg-emerald-300' : 'bg-amber-300'}`} />
                {feedHealthy ? 'LIVE' : 'RECONNECTING'}
              </span>
            </div>
            {latestAt && <p className="mt-1 text-[10px] text-white/30">Updated {formatAge(clock - latestAt)}</p>}
          </div>
        </header>

        <div className="p-3 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/10 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/35">Candles</span>
              <div className="inline-flex rounded-lg bg-black/20 p-1">
                {ASSET_PRICE_CANDLE_INTERVALS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setIntervalName(item)}
                    className={`min-w-11 rounded-md px-2.5 py-1.5 text-[11px] font-extrabold transition-colors ${interval === item ? 'bg-[#8B7CF7] text-white shadow-lg shadow-[#8B7CF7]/20' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-white/30">OHLC from verified pool snapshots · not an indicative equity feed</p>
          </div>

          <CandlestickChart key={interval} candles={candles} currentPrice={currentPrice} interval={interval} quote={quote} />

          <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-xl bg-white/[0.035] p-3"><p className="text-white/30">Price source</p><p className="mt-1 font-bold">{livePrice?.protocol?.replace('_', ' ') ?? asset.marketSource?.type.replace('_', ' ')}</p></div>
            <div className="rounded-xl bg-white/[0.035] p-3"><p className="text-white/30">Settlement pool</p><p className="mt-1 truncate font-mono font-bold" title={pool}>{shortPool(pool)}</p></div>
            <div className="rounded-xl bg-white/[0.035] p-3"><p className="text-white/30">Quote and interval</p><p className="mt-1 font-bold">{quote === 'USDG' ? 'USDG displayed as USD' : quote} · {interval} candles</p></div>
          </div>
          {historyUnavailable && <p className="mt-3 text-center text-xs text-amber-300/80">Stored history is reconnecting; verified live candles will continue to update.</p>}
        </div>
      </section>
    </div>
  )
}
