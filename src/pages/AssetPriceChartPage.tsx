import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatUnits } from 'viem'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ASSET_PRICE_WINDOWS,
  assetPriceHistoryUrl,
  filterAssetPriceWindow,
  mergeAssetPriceHistory,
  parseAssetPriceHistory,
  sampleAssetPriceSeries,
  type AssetPriceHistoryPoint,
  type AssetPriceWindow,
} from '@/chain/assetPriceHistory'
import { assetRaceCatalog } from '@/chain/assetRaceRegistry'
import { useAssetRaceLiveDisplay } from '@/chain/useAssetRaceLiveDisplay'
import { TokenLogo } from '@/components/TokenLogo'

interface ChartPoint {
  t: number
  price: number
  blockNumber?: string
}

function priceDigits(value: number, quote: string, precise: boolean) {
  if (quote === 'USDG') {
    if (value >= 1_000) return precise ? 6 : 4
    if (value >= 1) return precise ? 8 : 6
    return precise ? 10 : 8
  }
  if (value >= 1) return precise ? 10 : 8
  if (value >= 0.001) return precise ? 12 : 10
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
  if (quote === 'USDG') return `$${value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 2 : 4 })}`
  return value.toLocaleString(undefined, { maximumSignificantDigits: 5 })
}

function formatChartTime(timestamp: number, windowName: AssetPriceWindow) {
  const includeSeconds = windowName === '1M' || windowName === '5M'
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
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

function PriceTooltip({
  active,
  payload,
  quote,
}: {
  active?: boolean
  payload?: Array<{ payload?: ChartPoint }>
  quote: string
}) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div className="min-w-48 rounded-2xl border border-white/15 bg-[#17111F]/95 p-3 shadow-2xl backdrop-blur-xl">
      <p className="font-mono text-base font-bold text-white">{formatPrice(point.price, quote, true)}</p>
      <p className="mt-1 text-xs text-white/55">
        {new Date(point.t).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </p>
      {point.blockNumber && <p className="mt-2 font-mono text-[10px] text-white/35">Block #{point.blockNumber}</p>}
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
  const [windowName, setWindowName] = useState<AssetPriceWindow>('5M')
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
    const timer = window.setInterval(load, 30_000)
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

  const allPoints = useMemo(() => history
    .map((point) => ({
      t: point.receivedAt,
      price: Number(formatUnits(BigInt(point.priceRaw), point.decimals)),
      blockNumber: point.blockNumber,
    }))
    .filter((point) => Number.isFinite(point.price) && point.price > 0), [history])

  const combined = useMemo(() => {
    const anchor = Math.max(live.snapshot?.heartbeatAt ?? 0, allPoints.at(-1)?.t ?? 0)
    return filterAssetPriceWindow(
      allPoints.map((point) => ({ ...point, receivedAt: point.t })),
      windowName,
      anchor,
    ).map(({ receivedAt: _receivedAt, ...point }) => point)
  }, [allPoints, live.snapshot?.heartbeatAt, windowName])

  const renderedPoints = useMemo(() => sampleAssetPriceSeries(combined), [combined])
  const stats = useMemo(() => {
    if (combined.length === 0) return undefined
    const open = combined[0].price
    const current = combined.at(-1)?.price ?? open
    const prices = combined.map((point) => point.price)
    const high = Math.max(...prices)
    const low = Math.min(...prices)
    return {
      open,
      current,
      high,
      low,
      change: open > 0 ? ((current - open) / open) * 100 : 0,
    }
  }, [combined])

  const domain = useMemo<[number | 'auto', number | 'auto']>(() => {
    if (!stats) return ['auto', 'auto']
    const padding = (stats.high - stats.low) * 0.12 || Math.max(stats.current * 0.0005, 0.000000000001)
    return [stats.low - padding, stats.high + padding]
  }, [stats])

  if (!asset) {
    return <div className="mx-auto max-w-5xl px-5 py-24 text-center"><h1 className="font-display text-4xl font-bold">Asset not found</h1><Link to="/" className="mt-6 inline-block text-[#B3A7FA]">Back to Prophet Markets</Link></div>
  }

  const quote = livePrice?.quoteSymbol ?? (asset.category === 'MEME' ? 'ETH' : 'USDG')
  const accent = asset.category === 'MEME' ? '#F2A65A' : '#8B7CF7'
  const pool = livePrice?.poolIdentifier ?? asset.marketSource?.poolIdentifier
  const latestPoint = allPoints.at(-1)
  const latestAt = livePrice?.receivedAt ?? latestPoint?.t
  const directLivePrice = livePrice ? Number(formatUnits(BigInt(livePrice.priceRaw), livePrice.decimals)) : undefined
  const currentPrice = directLivePrice && Number.isFinite(directLivePrice) ? directLivePrice : latestPoint?.price
  const feedHealthy = Boolean(livePrice && !live.disconnected && !livePrice.stale)
  const gradientId = `asset-price-fill-${asset.symbol.replace(/[^A-Za-z0-9_-]/g, '')}`

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <Link to="/" className="text-sm font-bold text-white/45 transition-colors hover:text-white">← Back to games</Link>
      <section className="mt-5 overflow-hidden rounded-[2rem] border border-white/10 bg-[#241B2F]/95 shadow-2xl shadow-black/20">
        <header className="flex flex-col gap-6 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex min-w-0 items-center gap-4">
            <TokenLogo ticker={asset.symbol} className="h-14 w-14 rounded-2xl sm:h-16 sm:w-16" />
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em]" style={{ color: accent }}>{asset.category === 'MEME' ? 'Meme asset' : 'Tokenized stock'}</p>
              <h1 className="truncate font-display text-3xl font-bold sm:text-4xl">{asset.symbol} live price</h1>
              <p className="truncate text-sm text-white/45">{asset.displayName} · reviewed onchain pool</p>
            </div>
          </div>
          <div className="sm:text-right">
            <div className="font-mono text-3xl font-bold tracking-tight sm:text-4xl">{currentPrice ? formatPrice(currentPrice, quote, true) : 'Loading…'}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 sm:justify-end">
              {stats && combined.length > 1 && (
                <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${stats.change >= 0 ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'}`}>
                  {stats.change >= 0 ? '+' : ''}{stats.change.toFixed(4)}% · {windowName.toLowerCase()}
                </span>
              )}
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${feedHealthy ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-300'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${feedHealthy ? 'animate-pulse bg-emerald-300' : 'bg-amber-300'}`} />
                {feedHealthy ? 'LIVE' : 'RECONNECTING'}
              </span>
            </div>
            {latestAt && <p className="mt-2 text-xs text-white/35">Updated {formatAge(clock - latestAt)}</p>}
          </div>
        </header>

        <div className="p-5 sm:p-8">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-white/35">Timeframe</p>
              <div className="mt-2 inline-flex rounded-xl border border-white/10 bg-black/15 p-1">
                {ASSET_PRICE_WINDOWS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setWindowName(item)}
                    className={`min-w-12 rounded-lg px-3 py-2 text-xs font-extrabold transition-colors sm:min-w-14 ${windowName === item ? 'bg-[#8B7CF7] text-white shadow-lg shadow-[#8B7CF7]/20' : 'text-white/45 hover:bg-white/5 hover:text-white'}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:min-w-[28rem]">
              {[
                ['Open', stats?.open],
                ['High', stats?.high],
                ['Low', stats?.low],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">{label}</p>
                  <p className="mt-1 truncate font-mono text-xs font-bold text-white/80 sm:text-sm">{typeof value === 'number' ? formatPrice(value, quote) : '-'}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative h-[360px] rounded-3xl border border-white/8 bg-[#17111F]/65 p-2 sm:h-[500px] sm:p-4">
            {renderedPoints.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={renderedPoints} margin={{ top: 18, right: 12, bottom: 2, left: 6 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accent} stopOpacity="0.38" />
                      <stop offset="100%" stopColor={accent} stopOpacity="0.015" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.07)" strokeDasharray="3 5" vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={(value) => formatChartTime(Number(value), windowName)}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={44}
                    tick={{ fill: 'rgba(255,255,255,0.38)', fontFamily: 'monospace', fontSize: 10 }}
                  />
                  <YAxis
                    orientation="right"
                    domain={domain}
                    tickFormatter={(value) => formatAxisPrice(Number(value), quote)}
                    axisLine={false}
                    tickLine={false}
                    width={quote === 'USDG' ? 76 : 92}
                    tick={{ fill: 'rgba(255,255,255,0.42)', fontFamily: 'monospace', fontSize: 10 }}
                  />
                  <Tooltip
                    content={<PriceTooltip quote={quote} />}
                    cursor={{ stroke: 'rgba(255,255,255,0.35)', strokeWidth: 1, strokeDasharray: '4 4' }}
                    isAnimationActive={false}
                  />
                  {currentPrice && <ReferenceLine y={currentPrice} stroke={accent} strokeOpacity={0.45} strokeDasharray="4 4" />}
                  <Area
                    type="linear"
                    dataKey="price"
                    stroke={accent}
                    strokeWidth={2.5}
                    fill={`url(#${gradientId})`}
                    dot={false}
                    activeDot={{ r: 5, fill: accent, stroke: '#F8F5EE', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center px-6 text-center">
                <div>
                  <div className="mx-auto mb-4 h-8 w-8 animate-pulse rounded-full" style={{ background: accent }} />
                  <p className="font-bold">Loading verified pool prices…</p>
                  <p className="mt-2 text-sm text-white/40">The live chart will appear as soon as the reviewed pool responds.</p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-1 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
            <p>Move across the chart to inspect the exact price, time and source block.</p>
            <p>{combined.length.toLocaleString()} verified observations · {quote === 'USDG' ? 'USD display' : `${quote} quote`}</p>
          </div>

          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-2xl bg-white/5 p-4"><p className="text-white/35">Price source</p><p className="mt-1 font-bold">{livePrice?.protocol?.replace('_', ' ') ?? asset.marketSource?.type.replace('_', ' ')}</p></div>
            <div className="rounded-2xl bg-white/5 p-4"><p className="text-white/35">Settlement pool</p><p className="mt-1 truncate font-mono font-bold" title={pool}>{shortPool(pool)}</p></div>
            <div className="rounded-2xl bg-white/5 p-4"><p className="text-white/35">Quote unit</p><p className="mt-1 font-bold">{quote === 'USDG' ? 'USDG · displayed as USD' : quote}</p></div>
          </div>
          {historyUnavailable && <p className="mt-4 text-center text-xs text-amber-300/80">Stored history is reconnecting; verified live prices will continue to appear here.</p>}
        </div>
      </section>
    </div>
  )
}
