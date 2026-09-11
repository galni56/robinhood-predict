import { Link } from 'react-router-dom'
import { formatUnits } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { CancelledBadge, SideBadge } from '@/components/Pills'
import {
  MarketSideOnchain,
  MarketStatusOnchain,
  PREDICTION_MARKET_ADDRESS,
  aggregatorV3Abi,
  predictionMarketAbi,
  tickerFromFeedDescription,
} from '@/chain/contracts'
import { formatUsd, timeAgo } from '@/lib/format'

const BET_TOKEN_DECIMALS = 6 // USDG's real decimals

export function OnchainArchivePage() {
  const marketCount = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'marketCount',
  })
  const count = marketCount.data != null ? Number(marketCount.data) : 0
  const ids = Array.from({ length: count }, (_, i) => BigInt(i))

  const markets = useReadContracts({
    contracts: ids.map((id) => ({ address: PREDICTION_MARKET_ADDRESS, abi: predictionMarketAbi, functionName: 'getMarket', args: [id] }) as const),
    query: { enabled: count > 0 },
  })

  const settled = ids
    .map((id, i) => {
      const r = markets.data?.[i]
      if (!r || r.status !== 'success') return null
      if (r.result.status === MarketStatusOnchain.Open) return null
      return { id, m: r.result }
    })
    .filter((x): x is { id: bigint; m: NonNullable<typeof x>['m'] } => x != null)
    .sort((a, b) => Number(b.m.deadline - a.m.deadline))

  // Two reads per settled market (decimals + description) so the price
  // shows in real dollars with the right ticker, same as every other real
  // page — feed decimals aren't assumed to be 8 across every ticker.
  const feedMeta = useReadContracts({
    contracts: settled.flatMap(({ m }) => [
      { address: m.priceFeed, abi: aggregatorV3Abi, functionName: 'decimals' } as const,
      { address: m.priceFeed, abi: aggregatorV3Abi, functionName: 'description' } as const,
    ]),
    query: { enabled: settled.length > 0 },
  })

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">Archive of settled markets</h1>
        <p className="text-white/50 text-sm">
          Every on-chain market that's already resolved or cancelled — real outcomes, real pools, read straight from
          the contract. Nothing here is mock data.
        </p>
      </div>

      <div className="space-y-2">
        {settled.map(({ id, m }, i) => {
          const decimals = feedMeta.data?.[i * 2]?.status === 'success' ? (feedMeta.data[i * 2].result as number) : 8
          const description = feedMeta.data?.[i * 2 + 1]?.status === 'success' ? (feedMeta.data[i * 2 + 1].result as string) : undefined
          const ticker = tickerFromFeedDescription(description) ?? '…'
          const targetUsd = Number(formatUnits(m.targetPrice, decimals))
          const totalPool = m.poolYes + m.poolNo
          const yesPct = totalPool > 0n ? Number((m.poolYes * 10000n) / totalPool) / 100 : 50
          const cancelled = m.status === MarketStatusOnchain.Cancelled

          return (
            <Link
              key={id.toString()}
              to={`/onchain/${id.toString()}`}
              className="flex flex-wrap items-center gap-3 text-sm bg-[#12121c]/95 hover:bg-[#181829]/95 border border-white/10 rounded-lg px-4 py-3 transition-colors"
            >
              <span className="font-semibold min-w-16">{ticker}</span>
              <span className="text-white/50 flex-1 min-w-40">reach {formatUsd(targetUsd)}?</span>
              {cancelled ? <CancelledBadge /> : <SideBadge side={m.outcome === MarketSideOnchain.YES ? 'YES' : 'NO'} />}
              <span className="text-white/40 text-xs w-28 text-right">
                {yesPct.toFixed(1)}% / {(100 - yesPct).toFixed(1)}%
              </span>
              <span className="text-white/40 text-xs w-24 text-right">
                pool {formatUsd(Number(formatUnits(totalPool, BET_TOKEN_DECIMALS)), 0)}
              </span>
              <span className="text-white/30 text-xs w-20 text-right">{timeAgo(Number(m.deadline) * 1000)}</span>
            </Link>
          )
        })}
        {settled.length === 0 && (
          <p className="text-white/30 text-sm text-center py-12">
            No settled markets yet — this fills in as open markets resolve or cancel.
          </p>
        )}
      </div>
    </div>
  )
}
