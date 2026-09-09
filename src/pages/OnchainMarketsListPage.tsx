import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatUnits } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { AwaitingCounterBetsBadge, CancelledBadge } from '@/components/Pills'
import { PREDICTION_MARKET_ADDRESS, aggregatorV3Abi, predictionMarketAbi, MarketStatusOnchain, bettingWindowEndSeconds } from '@/chain/contracts'
import { formatCountdown, formatUsd } from '@/lib/format'

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

  const feedDecimals = useReadContracts({
    contracts: feedAddresses.map((addr) => ({ address: addr, abi: aggregatorV3Abi, functionName: 'decimals' }) as const),
    query: { enabled: feedAddresses.length > 0 },
  })
  const feedPrices = useReadContracts({
    contracts: feedAddresses.map((addr) => ({ address: addr, abi: aggregatorV3Abi, functionName: 'latestRoundData' }) as const),
    query: { enabled: feedAddresses.length > 0, refetchInterval: 2_000 },
  })
  const feedDescriptions = useReadContracts({
    contracts: feedAddresses.map((addr) => ({ address: addr, abi: aggregatorV3Abi, functionName: 'description' }) as const),
    query: { enabled: feedAddresses.length > 0 },
  })

  const decimalsByFeed = new Map(feedAddresses.map((addr, i) => [addr, feedDecimals.data?.[i]?.status === 'success' ? feedDecimals.data[i].result : undefined]))
  const priceByFeed = new Map(feedAddresses.map((addr, i) => [addr, feedPrices.data?.[i]?.status === 'success' ? feedPrices.data[i].result : undefined]))
  const descByFeed = new Map(feedAddresses.map((addr, i) => [addr, feedDescriptions.data?.[i]?.status === 'success' ? feedDescriptions.data[i].result : undefined]))

  // Runs after render, so the render just above still compared against last
  // poll's prices before this commits the new ones for the next comparison.
  useEffect(() => {
    feedAddresses.forEach((addr) => {
      const decimals = decimalsByFeed.get(addr)
      const price = priceByFeed.get(addr)
      if (decimals != null && price) {
        prevPriceByFeed.current.set(addr, Number(formatUnits(price[1], decimals)))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedPrices.data])

  const filteredIds = ids.filter((_id, i) => {
    if (filter === 'ALL') return true
    const result = markets.data?.[i]
    if (!result || result.status !== 'success') return false
    const status = result.result.status
    if (filter === 'OPEN') return status === MarketStatusOnchain.Open
    if (filter === 'RESOLVED') return status === MarketStatusOnchain.Resolved
    return status === MarketStatusOnchain.Cancelled
  })

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
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
            // Chainlink feed descriptions look like "RHTSLA / USD" — strip the
            // "RH" issuer prefix and " / USD" quote suffix to get a bare ticker.
            const ticker = rawDesc?.replace(/^RH/, '').replace(/\s*\/\s*USD$/i, '')
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

                <p className="text-xs text-white/50 mb-3">
                  {ticker ?? 'This market'} reach {targetUsd != null ? formatUsd(targetUsd) : '…'}?
                </p>

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
    </div>
  )
}
