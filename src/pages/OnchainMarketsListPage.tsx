import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatUnits, type Hex } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { ClockIcon } from '@/components/icons'
import { LiveBetsTicker } from '@/components/LiveBetsTicker'
import { OnchainMarketsSidebar } from '@/components/OnchainMarketsSidebar'
import { CancelledBadge } from '@/components/Pills'
import { TokenBrowser } from '@/components/TokenBrowser'
import { TokenLogo } from '@/components/TokenLogo'
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_CONFIGURED,
  predictionMarketAbi,
  MarketStatusOnchain,
  bettingWindowEndSeconds,
} from '@/chain/contracts'
import { demoPools, isDemoMode } from '@/chain/demo'
import { tickerForPredictionAssetId } from '@/chain/predictionMarketAssets'
import { useAssetRaceLiveDisplay } from '@/chain/useAssetRaceLiveDisplay'
import { useTokenLogos } from '@/chain/robinhoodApi'
import { formatCountdown, formatUsd } from '@/lib/format'

type StatusFilter = 'ALL' | 'OPEN' | 'RESOLVED' | 'CANCELLED'

interface MarketCardData {
  assetId: Hex
  priceDecimals: number
  targetPrice: bigint
  createdAt: bigint
  deadline: bigint
  poolYes: bigint
  poolNo: bigint
  status: number
}

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'RESOLVED', label: 'Resolved' },
  { key: 'CANCELLED', label: 'Cancelled' },
]

export function OnchainMarketsListPage() {
  const navigate = useNavigate()
  const logos = useTokenLogos()
  const [filter, setFilter] = useState<StatusFilter>('ALL')
  // Tracks each ticker's previously-seen price so a card can color itself by
  // "did it just tick up or down", not by distance from the target - a ref
  // (not state) so updating it never itself triggers a re-render.
  const prevPriceByFeed = useRef<Map<string, number>>(new Map())

  const marketCount = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'marketCount',
    query: { enabled: PREDICTION_MARKET_CONFIGURED || isDemoMode() },
  })

  const count = marketCount.data != null ? Number(marketCount.data) : 0
  const ids = Array.from({ length: count }, (_, i) => BigInt(i))

  const markets = useReadContracts({
    // Market data and its immutable deadline settlement share one multicall,
    // so resolved cards can show the final price without another RPC request.
    contracts: ids.flatMap((id) => [
      ({
          address: PREDICTION_MARKET_ADDRESS,
          abi: predictionMarketAbi,
          functionName: 'getMarket',
          args: [id],
      }) as const,
      ({
        address: PREDICTION_MARKET_ADDRESS,
        abi: predictionMarketAbi,
        functionName: 'settlements',
        args: [id],
      }) as const,
    ]),
    query: { enabled: count > 0 },
  })

  const marketAt = (index: number) => {
    const result = markets.data?.[index * 2]
    return result?.status === 'success' ? result.result as MarketCardData : undefined
  }
  const settlementPriceAt = (index: number) => {
    const result = markets.data?.[index * 2 + 1]
    return result?.status === 'success' ? (result.result as readonly [bigint, bigint, Hex])[0] : 0n
  }

  const live = useAssetRaceLiveDisplay({ enabled: true })

  // Ticker per market id, resolved locally from the reviewed asset registry.
  // It also drives the cosmetic asset-type filter and labels the live-bets
  // ticker without another RPC read.
  const tickerByMarketId = new Map<string, string>()
  ids.forEach((id, i) => {
    const market = marketAt(i)
    if (!market) return
    const t = tickerForPredictionAssetId(market.assetId)
    if (t) tickerByMarketId.set(id.toString(), t)
  })

  // Runs after render, so the render just above still compared against last
  // poll's prices before this commits the new ones for the next comparison.
  useEffect(() => {
    Object.entries(live.assets).forEach(([ticker, price]) => {
      if (!price.stale) {
        const usd = Number(formatUnits(BigInt(price.priceRaw), price.decimals))
        prevPriceByFeed.current.set(ticker, usd)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.snapshot])

  const filteredIds = ids
    .filter((_id, i) => {
      if (filter === 'ALL') return true
      const market = marketAt(i)
      if (!market) return false
      const status = market.status
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
      <div className="mb-8 flex items-start justify-between gap-6 flex-wrap">
        <div className="max-w-2xl">
          <p className="text-sm font-bold text-[#B3A7FA] mb-1">The board</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">What's your call?</h1>
          <p className="text-white/50 text-sm mt-2">
            {count} market{count === 1 ? '' : 's'} live on Robinhood Chain mainnet. Bet YES or NO before the deadline -
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

      {!PREDICTION_MARKET_CONFIGURED && !isDemoMode() && (
        <div className="mb-6 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
          The native ETH PredictionMarket is not configured in this build, so real market transactions are unavailable.
        </div>
      )}

      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
      <div className="mb-6 flex flex-wrap items-center justify-end gap-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors ${
                filter === f.key ? 'bg-[#8B7CF7] text-[#f7f1e3]' : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!PREDICTION_MARKET_CONFIGURED && !isDemoMode() ? (
        <p className="py-16 text-center text-sm text-white/35">Native ETH markets will appear after the new deployment address is configured.</p>
      ) : marketCount.isLoading ? (
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
            const m = marketAt(i)
            if (!m) return null
            const ticker = tickerByMarketId.get(id.toString())
            const price = ticker ? live.assets[ticker] : undefined
            const targetUsd = Number(formatUnits(m.targetPrice, m.priceDecimals))
            const liveUsd = price && !price.stale ? Number(formatUnits(BigInt(price.priceRaw), price.decimals)) : null
            const finalPriceRaw = settlementPriceAt(i)
            const isResolved = m.status === MarketStatusOnchain.Resolved
            const displayedUsd = isResolved && finalPriceRaw > 0n
              ? Number(formatUnits(finalPriceRaw, m.priceDecimals))
              : liveUsd
            const deadlineMs = Number(m.deadline) * 1000
            const pools = isDemoMode() ? demoPools(id) : { poolYes: m.poolYes, poolNo: m.poolNo }
            const totalPool = pools.poolYes + pools.poolNo
            const yesPct = totalPool > 0n ? Number((pools.poolYes * 10000n) / totalPool) / 100 : 50
            const prevUsd = ticker ? prevPriceByFeed.current.get(ticker) : undefined
            // No prior tick yet (first render) - default to green rather than
            // flashing red for a market that hasn't actually moved down.
            const tickedUp = liveUsd == null || prevUsd == null ? true : liveUsd >= prevUsd

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
                    <TokenLogo ticker={ticker} logoUrl={ticker ? logos.get(ticker) : undefined} className="w-9 h-9 rounded-xl text-lg" />
                    <div>
                      <div className="font-bold text-sm tracking-wide flex items-center gap-2">
                        {ticker ?? '…'}
                        {m.status === MarketStatusOnchain.Cancelled && <CancelledBadge />}
                      </div>
                      <div className="text-white/35 text-xs font-medium">Market #{id.toString()}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-mono font-semibold ${isResolved ? 'text-white/70' : tickedUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {displayedUsd != null ? formatUsd(displayedUsd) : '…'}
                    </div>
                    <div className="text-xs text-white/40">
                      {isResolved ? 'final · ' : ''}{targetUsd != null ? `target ${formatUsd(targetUsd)}` : ''}
                    </div>
                  </div>
                </div>

                <h3 className="font-display text-xl font-bold leading-snug mb-3 group-hover:text-[#B3A7FA] transition-colors">
                  Will {ticker ?? 'it'} be at or above {targetUsd != null ? formatUsd(targetUsd) : '…'} at the deadline?
                </h3>

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
                      ? 'Market cancelled; funded positions are refundable.'
                      : totalPool === 0n
                        ? 'New market - be the first to call it.'
                        : 'One side is in - take the other, or it refunds in full.'}
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
