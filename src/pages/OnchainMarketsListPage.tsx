import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatUnits } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { ChainIcon, ClockIcon } from '@/components/icons'
import { LiveBetsTicker } from '@/components/LiveBetsTicker'
import { OnchainMarketsSidebar } from '@/components/OnchainMarketsSidebar'
import { CancelledBadge } from '@/components/Pills'
import { Sparkline } from '@/components/PriceChart'
import { TokenBrowser } from '@/components/TokenBrowser'
import {
  PREDICTION_MARKET_ADDRESS,
  aggregatorV3Abi,
  predictionMarketAbi,
  MarketStatusOnchain,
  bettingWindowEndSeconds,
  tickerForFeedAddress,
  tickerFromFeedDescription,
} from '@/chain/contracts'
import { demoPools, isDemoMode } from '@/chain/demo'
import { useFeedSnapshot } from '@/chain/feedCache'
import { formatCountdown, formatUsd } from '@/lib/format'
import type { PricePoint } from '@/types'

// A coarse, purely-cosmetic split for the asset-type filter below -- most
// allowlisted feeds are single stocks, these few are index/commodity ETFs.
// Update alongside ALLOWLISTED_FEEDS in src/chain/contracts.ts if that list
// grows to include another ETF.
const ETF_TICKERS = new Set(['QQQ', 'SPY', 'EWY', 'SLV', 'USO'])

// How many 2s polls of real price history to keep per feed for the card
// sparkline -- 90 points is 3 minutes, enough to show a real trend without
// growing unbounded on a page left open a long time. This is genuinely
// polled data, not simulated -- it just only covers however long this page
// has been open, not the market's full lifetime (Chainlink's
// latestRoundData() has no history endpoint to backfill from).
const PRICE_HISTORY_LENGTH = 90

type StatusFilter = 'ALL' | 'OPEN' | 'RESOLVED' | 'CANCELLED'
type AssetFilter = 'ALL' | 'STOCKS' | 'ETFS'

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'RESOLVED', label: 'Resolved' },
  { key: 'CANCELLED', label: 'Cancelled' },
]

const ASSET_FILTERS: { key: AssetFilter; label: string }[] = [
  { key: 'ALL', label: 'All assets' },
  { key: 'STOCKS', label: 'Single stocks' },
  { key: 'ETFS', label: 'ETFs' },
]

export function OnchainMarketsListPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<StatusFilter>('ALL')
  const [assetFilter, setAssetFilter] = useState<AssetFilter>('ALL')
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

  // Ticker per market id, resolved instantly for an allowlisted feed
  // (tickerForFeedAddress) rather than waiting on the live description()
  // read -- also used below to drive the asset-type filter and to label
  // entries in the live bets ticker.
  const tickerByMarketId = new Map<string, string>()
  ids.forEach((id, i) => {
    const result = markets.data?.[i]
    if (result?.status !== 'success') return
    const t = tickerForFeedAddress(result.result.priceFeed) ?? tickerFromFeedDescription(descByFeed.get(result.result.priceFeed))
    if (t) tickerByMarketId.set(id.toString(), t)
  })

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
    .filter((id) => {
      if (assetFilter === 'ALL') return true
      const ticker = tickerByMarketId.get(id.toString())
      const isEtf = !!ticker && ETF_TICKERS.has(ticker)
      return assetFilter === 'ETFS' ? isEtf : !isEtf
    })
    // Newest first -- a higher id was created later. Otherwise a market
    // created today can land at the very end of a long list, indistinguishable
    // from one that's been sitting there for weeks (this confused a real
    // tester once: their new market was easy to miss below an older one).
    .sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))

  return (
    <div className="max-w-[1500px] mx-auto px-4 py-8">
      <div className="mb-6 flex items-center gap-2.5 rounded-2xl border border-[#8B7CF7]/25 bg-[#8B7CF7]/10 px-4 py-3 text-sm text-[#B3A7FA] font-medium">
        <ChainIcon className="w-4 h-4 shrink-0" />
        <span>
          This is <b>real mode</b> — markets are read directly from the deployed contract on Robinhood Chain mainnet.
        </span>
      </div>

      <div className="mb-8 flex items-start justify-between gap-6 flex-wrap">
        <div className="max-w-2xl">
          <p className="text-sm font-bold text-[#B3A7FA] mb-1">The board</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">What's your call?</h1>
          <p className="text-white/50 text-sm mt-2">
            {count} market{count === 1 ? '' : 's'} live on Robinhood Chain mainnet. Bet YES or NO before the deadline —
            early bets carry more weight, and a market with only one side ever betting cancels and refunds in full.
          </p>
        </div>
        <Link
          to="/onchain/create"
          className="shrink-0 inline-flex items-center gap-2.5 text-sm pl-5 pr-2 py-2 rounded-full bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] hover:brightness-110 text-white font-bold transition-all shadow-[0_10px_28px_-10px_rgba(106,90,224,0.8)]"
        >
          Create market
          <span className="w-7 h-7 rounded-full bg-white/20 grid place-items-center text-xs">↗</span>
        </Link>
      </div>

      <LiveBetsTicker tickerByMarketId={tickerByMarketId} />

      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-6">
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
                filter === f.key ? 'bg-[#f7f1e3] text-[#241a33]' : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {ASSET_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setAssetFilter(f.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
                assetFilter === f.key ? 'bg-[#8B7CF7] text-[#f7f1e3]' : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {marketCount.isLoading ? (
        <p className="text-white/50 text-sm">Loading…</p>
      ) : count === 0 ? (
        <div className="text-center py-16 text-white/40 text-sm">
          No markets yet.{' '}
          <Link to="/onchain/create" className="text-[#8B7CF7] hover:underline">
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
            const ticker = tickerByMarketId.get(id.toString())
            const targetUsd = decimals != null ? Number(formatUnits(m.targetPrice, decimals)) : null
            const currentUsd = decimals != null && price ? Number(formatUnits(price[1], decimals)) : null
            const deadlineMs = Number(m.deadline) * 1000
            const pools = isDemoMode() ? demoPools(id) : { poolYes: m.poolYes, poolNo: m.poolNo }
            const totalPool = pools.poolYes + pools.poolNo
            const yesPct = totalPool > 0n ? Number((pools.poolYes * 10000n) / totalPool) / 100 : 50
            const prevUsd = prevPriceByFeed.current.get(m.priceFeed)
            // No prior tick yet (first render) — default to green rather than
            // flashing red for a market that hasn't actually moved down.
            const tickedUp = currentUsd == null || prevUsd == null ? true : currentUsd >= prevUsd

            const canBet = m.status === MarketStatusOnchain.Open
            function goToMarket(side?: 'YES' | 'NO') {
              navigate(`/onchain/${id}${side ? `?side=${side}` : ''}`)
            }

            return (
              <div
                key={id.toString()}
                role="link"
                tabIndex={0}
                onClick={() => goToMarket()}
                onKeyDown={(e) => e.key === 'Enter' && goToMarket()}
                className="group relative rounded-3xl bg-[#241b2f] border border-white/5 p-5 hover:border-[#8B7CF7]/40 hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-28px_rgba(106,90,224,0.8)] transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-xl bg-[#f7f1e3] text-[#241a33] grid place-items-center font-display font-bold text-lg shrink-0">
                      {(ticker ?? '?')[0]}
                    </span>
                    <div>
                      <div className="font-bold text-sm tracking-wide flex items-center gap-2">
                        {ticker ?? '…'}
                        {m.status === MarketStatusOnchain.Cancelled && <CancelledBadge />}
                      </div>
                      <div className="text-white/35 text-xs font-medium">Market #{id.toString()}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-mono font-semibold ${tickedUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {currentUsd != null ? formatUsd(currentUsd) : '…'}
                    </div>
                    <div className="text-xs text-white/40">{targetUsd != null ? `target ${formatUsd(targetUsd)}` : ''}</div>
                  </div>
                </div>

                <h3 className="font-display text-xl font-bold leading-snug mb-3 group-hover:text-[#B3A7FA] transition-colors">
                  Will {ticker ?? 'it'} reach {targetUsd != null ? formatUsd(targetUsd) : '…'}?
                </h3>

                {(() => {
                  const series = priceHistoryByFeed.current.get(m.priceFeed) ?? []
                  return series.length > 1 ? (
                    <div className="mb-3">
                      <Sparkline data={series} color={tickedUp ? '#2dd888' : '#ff5577'} />
                    </div>
                  ) : null
                })()}

                {/* Honest pool state: a split bar only once both sides have
                    real money in; otherwise one quiet status line. The
                    buttons below are the click target -- picking one jumps
                    straight to the market page with that side preselected. */}
                {pools.poolYes > 0n && pools.poolNo > 0n ? (
                  <>
                    <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                      <span className="text-[#B3A7FA]">YES {yesPct.toFixed(0)}%</span>
                      <span className="text-[#F2A65A]">NO {(100 - yesPct).toFixed(0)}%</span>
                    </div>
                    <div className="flex h-1.5 gap-0.5 mb-4">
                      <div className="rounded-full bg-[#8B7CF7]" style={{ width: `${yesPct}%` }} />
                      <div className="rounded-full bg-[#F2A65A] flex-1" />
                    </div>
                  </>
                ) : (
                  <p className="flex items-center gap-2 text-xs font-medium text-white/45 mb-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#F2A65A] shrink-0" />
                    {m.status !== MarketStatusOnchain.Open
                      ? 'Pool never got both sides in.'
                      : totalPool === 0n
                        ? 'New market — be the first to call it.'
                        : 'One side is in — take the other, or it refunds in full.'}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    disabled={!canBet}
                    onClick={(e) => {
                      e.stopPropagation()
                      goToMarket('YES')
                    }}
                    className="group/btn flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-[#372a4f] text-[#B3A7FA] text-sm font-extrabold hover:bg-[#8B7CF7] hover:text-[#f7f1e3] disabled:opacity-40 disabled:hover:bg-[#372a4f] disabled:hover:text-[#B3A7FA] disabled:cursor-not-allowed transition-colors"
                  >
                    YES
                    <span className="opacity-60 transition-transform group-hover/btn:-translate-y-0.5 group-hover/btn:translate-x-0.5">↗</span>
                  </button>
                  <button
                    disabled={!canBet}
                    onClick={(e) => {
                      e.stopPropagation()
                      goToMarket('NO')
                    }}
                    className="group/btn flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-[#3b2a20] text-[#F2A65A] text-sm font-extrabold hover:bg-[#F2A65A] hover:text-[#3b2416] disabled:opacity-40 disabled:hover:bg-[#3b2a20] disabled:hover:text-[#F2A65A] disabled:cursor-not-allowed transition-colors"
                  >
                    NO
                    <span className="opacity-60 transition-transform group-hover/btn:translate-y-0.5 group-hover/btn:translate-x-0.5">↘</span>
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 text-white/40 font-bold">
                    {m.status === MarketStatusOnchain.Open && <ClockIcon className="w-3.5 h-3.5" />}
                    {m.status === MarketStatusOnchain.Resolved
                      ? 'Resolved'
                      : m.status === MarketStatusOnchain.Cancelled
                        ? 'Cancelled'
                        : Date.now() < Number(bettingWindowEndSeconds(m.createdAt, m.deadline)) * 1000
                          ? `betting: ${formatCountdown(Number(bettingWindowEndSeconds(m.createdAt, m.deadline)) * 1000 - Date.now())}`
                          : `resolves: ${formatCountdown(deadlineMs - Date.now())}`}
                  </span>
                </div>

              </div>
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
