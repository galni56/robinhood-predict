import { useState } from 'react'
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
    query: { enabled: feedAddresses.length > 0, refetchInterval: 15_000 },
  })

  const decimalsByFeed = new Map(feedAddresses.map((addr, i) => [addr, feedDecimals.data?.[i]?.status === 'success' ? feedDecimals.data[i].result : undefined]))
  const priceByFeed = new Map(feedAddresses.map((addr, i) => [addr, feedPrices.data?.[i]?.status === 'success' ? feedPrices.data[i].result : undefined]))

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
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
        ⛓️ This is <b>real mode</b> — markets are read directly from the deployed contract on Robinhood Chain testnet.
      </div>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">On-chain markets</h1>
        <Link
          to="/onchain/create"
          className="text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#C6FF3D] to-[#8FBF1F] hover:brightness-110 text-black font-semibold transition-all"
        >
          + Market
        </Link>
      </div>

      <div className="flex gap-1 mb-4">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
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
        <p className="text-white/40 text-sm">
          No markets yet.{' '}
          <Link to="/onchain/create" className="text-[#C6FF3D] hover:underline">
            Create the first one
          </Link>
        </p>
      ) : filteredIds.length === 0 ? (
        <p className="text-white/40 text-sm text-center py-10">No markets match this filter.</p>
      ) : (
        <div className="space-y-3">
          {filteredIds.map((id) => {
            const i = ids.indexOf(id)
            const result = markets.data?.[i]
            if (!result || result.status !== 'success') return null
            const m = result.result
            const decimals = decimalsByFeed.get(m.priceFeed)
            const price = priceByFeed.get(m.priceFeed)
            const targetUsd = decimals != null ? Number(formatUnits(m.targetPrice, decimals)) : null
            const currentUsd = decimals != null && price ? Number(formatUnits(price[1], decimals)) : null
            const deadlineMs = Number(m.deadline) * 1000
            const totalPool = m.poolYes + m.poolNo
            const yesPct = totalPool > 0n ? Number((m.poolYes * 10000n) / totalPool) / 100 : 50
            const awaitingCounterBets = m.status === MarketStatusOnchain.Open && (m.poolYes === 0n || m.poolNo === 0n)

            return (
              <Link
                key={id.toString()}
                to={`/onchain/${id}`}
                className="block rounded-xl border border-white/10 bg-[#12121c]/95 hover:border-[#C6FF3D]/30 hover:bg-[#181829]/95 p-4 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Market #{id.toString()}</span>
                    {m.status === MarketStatusOnchain.Cancelled && <CancelledBadge />}
                    {awaitingCounterBets && <AwaitingCounterBetsBadge />}
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-mono">{targetUsd != null ? formatUsd(targetUsd) : '…'}</div>
                    <div className="text-white/40 text-xs">{currentUsd != null ? `now ${formatUsd(currentUsd)}` : ''}</div>
                  </div>
                </div>

                <div className="h-1.5 rounded-full bg-rose-500/30 overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${yesPct}%` }} />
                </div>
                <div className="flex justify-between text-[11px] text-white/40 mt-1">
                  <span>YES {yesPct.toFixed(1)}%</span>
                  <span>
                    {m.status === MarketStatusOnchain.Resolved
                      ? 'resolved'
                      : m.status === MarketStatusOnchain.Cancelled
                        ? 'cancelled'
                        : Date.now() < Number(bettingWindowEndSeconds(m.createdAt, m.deadline)) * 1000
                          ? `betting: ${formatCountdown(Number(bettingWindowEndSeconds(m.createdAt, m.deadline)) * 1000 - Date.now())}`
                          : `awaiting resolve: ${formatCountdown(deadlineMs - Date.now())}`}
                  </span>
                  <span>NO {(100 - yesPct).toFixed(1)}%</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
