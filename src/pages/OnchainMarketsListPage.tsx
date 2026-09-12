import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatUnits } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { OnchainMarketsSidebar } from '@/components/OnchainMarketsSidebar'
import { AwaitingCounterBetsBadge, CancelledBadge } from '@/components/Pills'
import { Sparkline } from '@/components/PriceChart'
import { TokenBrowser } from '@/components/TokenBrowser'
import {
  PREDICTION_MARKET_ADDRESS,
  aggregatorV3Abi,
  predictionMarketAbi,
  MarketStatusOnchain,
  bettingWindowEndSeconds,
  tickerFromFeedDescription,
} from '@/chain/contracts'
import { useFeedSnapshot } from '@/chain/feedCache'
import { formatCountdown, formatUsd } from '@/lib/format'
import type { PricePoint } from '@/types'

// How many 2s polls of real price history to keep per feed for the card
// sparkline -- 90 points is 3 minutes, enough to show a real trend without
// growing unbounded on a page left open a long time. This is genuinely
// polled data, not simulated -- it just only covers however long this page
// has been open, not the market's full lifetime (Chainlink's
// latestRoundData() has no history endpoint to backfill from).
const PRICE_HISTORY_LENGTH = 90

type StatusFilter = 'ALL' | 'OPEN' | 'RESOLVED' | 'CANCELLED'

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'RESOLVED', label: 'Resolved' },
  { key: 'CANCELLED', label: 'Cancelled' },
]

export function OnchainMarketsListPage() {
  const [filter, setFilter] = useState<StatusFilter>('ALL')
  // Tracks each feed's previously-seen price so a card can color itself by
  // "did it just tick up or down", not by distance from the target — a ref
  // (not state) so updating it never itself triggers a re-render.
  const prevPriceByFeed = useRef<Map<string, number>>(new Map())
  // Real prices accumulated client-side since this page was opened, for the
  // card sparkline — also a ref, piggybacking on the same effect below; the
  // next 2s poll's re-render is what actually shows the appended point.
  const priceHistoryByFeed = useRef<Map<string, PricePoint[]>>(new Map())

  const marketCount = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'marketCount',
  })

  const count = marketCount.data != null ? Number(marketCount.data) : 0
  const ids = Array.from({ length: count }, (_, i) => BigInt(i))

  const markets = useReadContracts({
    contracts: ids.map(
      (id) =>
        ({
          address: PREDICTION_MARKET_ADDRESS,
          abi: predictionMarketAbi,
          functionName: 'getMarket',
          args: [id],
        }) as const,
    ),
    query: { enabled: count > 0 },
  })

  const feedAddresses = Array.from(
    new Set(
      (markets.data ?? [])
        .map((r) => (r.status === 'success' ? r.result.priceFeed : undefined))
        .filter((a): a is `0x${string}` => !!a),
    ),
  )

  // A backend service polls every allowlisted feed's price on its own
  // schedule and serves the snapshot from our own origin (see
  // src/chain/feedCache.ts) -- when it's available, that's what drives
  // live prices here instead of this page polling the chain itself. The
  // on-chain reads below stay as a fallback (a feed missing from the
  // snapshot, or the endpoint being unavailable, e.g. GitHub Pages), which
  // is why their own polling only turns on when the snapshot isn't.
  const feedSnapshot = useFeedSnapshot()

  const feedDecimals = useReadContracts({
    contracts: feedAddresses.map((addr) => ({ address: addr, abi: aggregatorV3Abi, functionName: 'decimals' }) as const),
    query: { enabled: feedAddresses.length > 0 },
  })
  const feedPrices = useReadContracts({
    contracts: feedAddresses.map((addr) => ({ address: addr, abi: aggregatorV3Abi, functionName: 'latestRoundData' }) as const),
    query: { enabled: feedAddresses.length > 0, refetchInterval: feedSnapshot.data ? false : 2_000 },
  })
  const feedDescriptions = useReadContracts({
    contracts: feedAddresses.map((addr) => ({ address: addr, abi: aggregatorV3Abi, functionName: 'description' }) as const),
    query: { enabled: feedAddresses.length > 0 },
  })

  const decimalsByFeed = new Map(
    feedAddresses.map((addr, i) => {
      const snap = feedSnapshot.data?.[addr]
      if (snap) return [addr, snap.decimals] as const
      return [addr, feedDecimals.data?.[i]?.status === 'success' ? feedDecimals.data[i].result : undefined] as const
    }),
  )
  const priceByFeed = new Map(
    feedAddresses.map((addr, i) => {
      const snap = feedSnapshot.data?.[addr]
      if (snap) return [addr, [0n, BigInt(snap.answer), 0n, BigInt(snap.updatedAt), 0n] as const] as const
      return [addr, feedPrices.data?.[i]?.status === 'success' ? feedPrices.data[i].result : undefined] as const
    }),
  )
  const descByFeed = new Map(feedAddresses.map((addr, i) => [addr, feedDescriptions.data?.[i]?.status === 'success' ? feedDescriptions.data[i].result : undefined]))

  // Runs after render, so the render just above still compared against last
  // poll's prices before this commits the new ones for the next comparison.
  useEffect(() => {
    feedAddresses.forEach((addr) => {
      const decimals = decimalsByFeed.get(addr)
      const price = priceByFeed.get(addr)
      if (decimals != null && price) {
        const usd = Number(formatUnits(price[1], decimals))
        prevPriceByFeed.current.set(addr, usd)
        const series = priceHistoryByFeed.current.get(addr) ?? []
        series.push({ t: Date.now(), price: usd })
        if (series.length > PRICE_HISTORY_LENGTH) series.shift()
        priceHistoryByFeed.current.set(addr, series)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedPrices.data, feedSnapshot.data])

  const filteredIds = ids
    .filter((_id, i) => {
      if (filter === 'ALL') return true
      const result = markets.data?.[i]
      if (!result || result.status !== 'success') return false
      const status = result.result.status
      if (filter === 'OPEN') return status === MarketStatusOnchain.Open
      if (filter === 'RESOLVED') return status === MarketStatusOnchain.Resolved
      return status === MarketStatusOnchain.Cancelled
    })
    // Newest first -- a higher id was created later. Otherwise a market
    // created today can land at the very end of a long list, indistinguishable
    // from one that's been sitting there for weeks (this confused a real
    // tester once: their new market was easy to miss below an older one).
    .sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))

  return (
    <div className="max-w-[1500px] mx-auto px-4 py-8">
      <div className="mb-6 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
        ⛓️ This is <b>real mode</b> — markets are read directly from the deployed contract on Robinhood Chain mainnet.
      </div>

      <div className="mb-8 flex items-start justify-between gap-6 flex-wrap">
        <div className="max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">On-chain markets</h1>
          <p className="text-white/50 text-sm mt-1.5">
            {count} market{count === 1 ? '' : 's'} live on Robinhood Chain mainnet. Bet YES or NO before the deadline —
            early bets carry more weight, and a market with only one side ever betting cancels and refunds in full.
          </p>
        </div>
        <Link
          to="/onchain/create"
          className="shrink-0 text-sm px-4 py-2.5 rounded-full bg-gradient-to-r from-[#C6FF3D] to-[#8FBF1F] hover:brightness-110 text-black font-semibold transition-all shadow-[0_0_20px_-6px_rgba(198,255,61,0.7)]"
        >
          + Create market
        </Link>
      </div>

      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
      <div className="flex gap-1 mb-6">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filter === f.key
                ? 'bg-white/10 border-white/20 text-white'
                : 'border-white/10 text-white/50 hover:text-white hover:border-white/30'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {marketCount.isLoading ? (
        <p className="text-white/50 text-sm">Loading…</p>
      ) : count === 0 ? (
        <div className="text-center py-16 text-white/40 text-sm">
          No markets yet.{' '}
          <Link to="/onchain/create" className="text-[#C6FF3D] hover:underline">
            Create the first one
          </Link>
        </div>
      ) : filteredIds.length === 0 ? (
        <p className="text-white/40 text-sm text-center py-16">No markets match this filter.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredIds.map((id) => {
            const i = ids.indexOf(id)
            const result = markets.data?.[i]
            if (!result || result.status !== 'success') return null
            const m = result.result
            const decimals = decimalsByFeed.get(m.priceFeed)
            const price = priceByFeed.get(m.priceFeed)
            const rawDesc = descByFeed.get(m.priceFeed)
            const ticker = tickerFromFeedDescription(rawDesc)
            const targetUsd = decimals != null ? Number(formatUnits(m.targetPrice, decimals)) : null
            const currentUsd = decimals != null && price ? Number(formatUnits(price[1], decimals)) : null
            const deadlineMs = Number(m.deadline) * 1000
            const totalPool = m.poolYes + m.poolNo
            const yesPct = totalPool > 0n ? Number((m.poolYes * 10000n) / totalPool) / 100 : 50
            const awaitingCounterBets = m.status === MarketStatusOnchain.Open && (m.poolYes === 0n || m.poolNo === 0n)
            const prevUsd = prevPriceByFeed.current.get(m.priceFeed)
            // No prior tick yet (first render) — default to green rather than
            // flashing red for a market that hasn't actually moved down.
            const tickedUp = currentUsd == null || prevUsd == null ? true : currentUsd >= prevUsd

            return (
              <Link
                key={id.toString()}
                to={`/onchain/${id}`}
                className="group relative bg-[#12121c]/95 border border-white/10 rounded-2xl p-4 hover:border-[#C6FF3D]/30 hover:bg-[#181829]/95 hover:shadow-[0_0_28px_-14px_rgba(198,255,61,0.9)] transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-bold flex items-center gap-2">
                      {ticker ?? '…'}
                      {awaitingCounterBets && <AwaitingCounterBetsBadge />}
                      {m.status === MarketStatusOnchain.Cancelled && <CancelledBadge />}
                    </div>
                    <div className="text-white/40 text-xs">Market #{id.toString()}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-mono font-semibold ${tickedUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {currentUsd != null ? formatUsd(currentUsd) : '…'}
                    </div>
                    <div className="text-xs text-white/40">{targetUsd != null ? `target ${formatUsd(targetUsd)}` : ''}</div>
                  </div>
                </div>

                <p className="text-xs text-white/50 mb-2">
                  {ticker ?? 'This market'} reach {targetUsd != null ? formatUsd(targetUsd) : '…'}?
                </p>

                {(() => {
                  const series = priceHistoryByFeed.current.get(m.priceFeed) ?? []
                  return series.length > 1 ? (
                    <div className="mb-2">
                      <Sparkline data={series} color={tickedUp ? '#2dd888' : '#ff5577'} />
                    </div>
                  ) : null
                })()}

                <div className="h-1.5 rounded-full bg-rose-500/25 overflow-hidden">
                  <div className="h-full bg-emerald-400" style={{ width: `${yesPct}%` }} />
                </div>
                <div className="flex justify-between text-[11px] text-white/40 mt-1">
                  <span>YES {yesPct.toFixed(1)}%</span>
                  <span>NO {(100 - yesPct).toFixed(1)}%</span>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-white/40">
                    {m.status === MarketStatusOnchain.Resolved
                      ? 'resolved'
                      : m.status === MarketStatusOnchain.Cancelled
                        ? 'cancelled'
                        : Date.now() < Number(bettingWindowEndSeconds(m.createdAt, m.deadline)) * 1000
                          ? `⏱ betting: ${formatCountdown(Number(bettingWindowEndSeconds(m.createdAt, m.deadline)) * 1000 - Date.now())}`
                          : `⏱ resolves: ${formatCountdown(deadlineMs - Date.now())}`}
                  </span>
                </div>

                {awaitingCounterBets && (
                  <p className="mt-2 text-[11px] text-amber-400/80">Refunded in full if nobody takes the other side.</p>
                )}
              </Link>
            )
          })}
        </div>
      )}

      <TokenBrowser />
        </div>

        <aside className="hidden lg:block w-72 shrink-0 sticky top-20">
          <OnchainMarketsSidebar />
        </aside>
      </div>
    </div>
  )
}
