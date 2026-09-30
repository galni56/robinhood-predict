import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatUnits } from 'viem'
import { assetPriceHistoryUrl, parseAssetPriceHistory, type AssetPriceHistoryPoint } from '@/chain/assetPriceHistory'
import { assetRaceCatalog } from '@/chain/assetRaceRegistry'
import { useAssetRaceLiveDisplay } from '@/chain/useAssetRaceLiveDisplay'
import { TokenLogo } from '@/components/TokenLogo'

type WindowName = '15M' | '1H' | 'ALL'

function formatPrice(value: number, quote: string) {
  if (!Number.isFinite(value)) return '—'
  if (quote === 'USDG') return `$${value.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
  const digits = value >= 1 ? 6 : value >= 0.001 ? 8 : 12
  return `${value.toLocaleString(undefined, { maximumSignificantDigits: digits })} ETH`
}

function shortPool(value?: string) {
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : 'reviewed pool'
}

export function AssetPriceChartPage() {
  const { symbol = '' } = useParams()
  const asset = useMemo(() => assetRaceCatalog.find((item) =>
    item.symbol.toLowerCase() === decodeURIComponent(symbol).toLowerCase()
      && item.networks['robinhood-mainnet'].enabled), [symbol])
  const live = useAssetRaceLiveDisplay({ enabled: true })
  const [history, setHistory] = useState<AssetPriceHistoryPoint[]>([])
  const [windowName, setWindowName] = useState<WindowName>('1H')
  const [historyUnavailable, setHistoryUnavailable] = useState(false)

  useEffect(() => {
    if (!asset) return
    const controller = new AbortController()
    const load = () => {
      fetch(assetPriceHistoryUrl(asset.assetId), { signal: controller.signal, headers: { accept: 'application/json' } })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error('HistoryUnavailable')))
        .then((payload) => {
          const parsed = parseAssetPriceHistory(payload, asset.assetId)
          if (!parsed) throw new Error('InvalidHistory')
          setHistory((current) => {
            const byTimestamp = new Map([...parsed.points, ...current].map((point) => [point.receivedAt, point]))
            return [...byTimestamp.values()].sort((a, b) => a.receivedAt - b.receivedAt).slice(-1_440)
          })
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
  const combined = useMemo(() => {
    const points = [...history]
    if (livePrice && !livePrice.stale && !points.some((point) => point.receivedAt === livePrice.receivedAt)) {
      points.push({
        priceRaw: livePrice.priceRaw,
        decimals: livePrice.decimals,
        receivedAt: livePrice.receivedAt,
        blockTimestamp: livePrice.blockTimestamp,
        blockNumber: livePrice.blockNumber,
      })
    }
    const anchor = live.snapshot?.heartbeatAt ?? points.at(-1)?.receivedAt ?? 0
    const cutoff = windowName === '15M' ? anchor - 15 * 60_000 : windowName === '1H' ? anchor - 60 * 60_000 : 0
    return points
      .filter((point) => point.receivedAt >= cutoff)
      .sort((a, b) => a.receivedAt - b.receivedAt)
      .map((point) => ({ t: point.receivedAt, price: Number(formatUnits(BigInt(point.priceRaw), point.decimals)) }))
      .filter((point) => Number.isFinite(point.price) && point.price > 0)
  }, [history, live.snapshot?.heartbeatAt, livePrice, windowName])

  const chart = useMemo(() => {
    if (combined.length === 0) return undefined
    const values = combined.map((point) => point.price)
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)
    const padding = (rawMax - rawMin) * 0.08 || Math.max(rawMax * 0.002, 0.000000000001)
    const min = rawMin - padding
    const max = rawMax + padding
    const coordinates = combined.length === 1
      ? [[0, 180], [1_000, 180]]
      : combined.map((point, index) => [
          index * 1_000 / (combined.length - 1),
          20 + (max - point.price) * 310 / (max - min),
        ])
    const line = coordinates.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
    return {
      line,
      area: `0,340 ${line} 1000,340`,
      min: rawMin,
      max: rawMax,
      from: combined[0].t,
      to: combined.at(-1)?.t ?? combined[0].t,
    }
  }, [combined])

  if (!asset) {
    return <div className="mx-auto max-w-5xl px-5 py-24 text-center"><h1 className="font-display text-4xl font-bold">Asset not found</h1><Link to="/" className="mt-6 inline-block text-[#B3A7FA]">Back to Prophet Markets</Link></div>
  }

  const quote = livePrice?.quoteSymbol ?? (asset.category === 'MEME' ? 'ETH' : 'USDG')
  const current = combined.at(-1)?.price
  const first = combined[0]?.price
  const change = current != null && first != null && first > 0 ? ((current - first) / first) * 100 : undefined
  const accent = asset.category === 'MEME' ? '#F2A65A' : '#8B7CF7'
  const pool = livePrice?.poolIdentifier ?? asset.marketSource?.poolIdentifier

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <Link to="/" className="text-sm font-bold text-white/45 transition-colors hover:text-white">← Back to games</Link>
      <section className="mt-5 overflow-hidden rounded-[2rem] border border-white/10 bg-[#241B2F]/95 shadow-2xl shadow-black/20">
        <header className="flex flex-col gap-5 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex min-w-0 items-center gap-4">
            <TokenLogo ticker={asset.symbol} className="h-14 w-14 rounded-2xl sm:h-16 sm:w-16" />
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em]" style={{ color: accent }}>{asset.category === 'MEME' ? 'Meme asset' : 'Tokenized stock'}</p>
              <h1 className="truncate font-display text-3xl font-bold sm:text-4xl">{asset.symbol} price chart</h1>
              <p className="truncate text-sm text-white/45">{asset.displayName}</p>
            </div>
          </div>
          <div className="sm:text-right">
            <div className="font-mono text-2xl font-bold sm:text-3xl">{current == null ? 'Loading…' : formatPrice(current, quote)}</div>
            {change != null && combined.length > 1 && <div className={`mt-1 text-sm font-bold ${change >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>{change >= 0 ? '+' : ''}{change.toFixed(3)}% · {windowName.toLowerCase()}</div>}
          </div>
        </header>

        <div className="p-5 sm:p-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-full border border-white/10 bg-black/15 p-1">
              {(['15M', '1H', 'ALL'] as const).map((item) => <button key={item} type="button" onClick={() => setWindowName(item)} className={`rounded-full px-4 py-2 text-xs font-extrabold transition-colors ${windowName === item ? 'bg-[#8B7CF7] text-white' : 'text-white/45 hover:text-white'}`}>{item}</button>)}
            </div>
            <div className="flex w-full shrink-0 items-center gap-2 text-xs text-white/45 sm:w-auto"><span className={`h-2 w-2 rounded-full ${live.disconnected || livePrice?.stale ? 'bg-amber-400' : 'bg-emerald-400'}`} />{live.disconnected || livePrice?.stale ? 'Live feed reconnecting' : 'Live from reviewed pool'}</div>
          </div>

          <div className="relative h-[320px] rounded-3xl border border-white/8 bg-[#17111F]/65 p-4 sm:h-[440px] sm:p-6">
            {chart ? <>
              <div className="pointer-events-none absolute left-5 top-4 z-10 rounded-lg bg-[#17111F]/75 px-2 py-1 font-mono text-[10px] text-white/45">{formatPrice(chart.max, quote)}</div>
              <div className="pointer-events-none absolute bottom-10 left-5 z-10 rounded-lg bg-[#17111F]/75 px-2 py-1 font-mono text-[10px] text-white/45">{formatPrice(chart.min, quote)}</div>
              <svg viewBox="0 0 1000 360" preserveAspectRatio="none" role="img" aria-label={`${asset.symbol} price movement`} className="h-[calc(100%-1.6rem)] w-full overflow-visible">
                <defs><linearGradient id="asset-price-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={accent} stopOpacity="0.38" /><stop offset="100%" stopColor={accent} stopOpacity="0.02" /></linearGradient></defs>
                {[70, 135, 200, 265, 330].map((y) => <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="rgba(255,255,255,0.06)" vectorEffect="non-scaling-stroke" />)}
                <polygon points={chart.area} fill="url(#asset-price-fill)" />
                <polyline points={chart.line} fill="none" stroke={accent} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="absolute inset-x-5 bottom-4 flex justify-between font-mono text-[10px] text-white/35"><span>{new Date(chart.from).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span>{new Date(chart.to).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
            </> : <div className="grid h-full place-items-center px-6 text-center"><div><div className="mx-auto mb-4 h-8 w-8 animate-pulse rounded-full" style={{ background: accent }} /><p className="font-bold">Waiting for the first verified pool price…</p><p className="mt-2 text-sm text-white/40">The chart will start automatically when the live feed responds.</p></div></div>}
          </div>

          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-2xl bg-white/5 p-4"><p className="text-white/35">Price source</p><p className="mt-1 font-bold">{livePrice?.protocol?.replace('_', ' ') ?? asset.marketSource?.type.replace('_', ' ')}</p></div>
            <div className="rounded-2xl bg-white/5 p-4"><p className="text-white/35">Settlement pool</p><p className="mt-1 truncate font-mono font-bold" title={pool}>{shortPool(pool)}</p></div>
            <div className="rounded-2xl bg-white/5 p-4"><p className="text-white/35">Quote unit</p><p className="mt-1 font-bold">{quote === 'USDG' ? 'USDG · displayed as USD' : quote}</p></div>
          </div>
          {historyUnavailable && <p className="mt-4 text-center text-xs text-amber-300/80">Stored history is reconnecting; the current verified price remains live.</p>}
        </div>
      </section>
    </div>
  )
}
