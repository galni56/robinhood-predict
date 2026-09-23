import { Link } from 'react-router-dom'
import { formatUnits } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { CancelledBadge, SideBadge } from '@/components/Pills'
import {
  MarketSideOnchain,
  MarketStatusOnchain,
  PREDICTION_MARKET_ADDRESS,
  predictionMarketAbi,
} from '@/chain/contracts'
import { tickerForPredictionAssetId } from '@/chain/predictionMarketAssets'
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <p className="text-sm font-bold text-[#B3A7FA] mb-1">The record</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-2">Settled markets</h1>
        <p className="text-white/50 text-sm">
          Every on-chain market that's already resolved or cancelled - real outcomes, real pools, read straight from
          the contract. Nothing here is mock data.
        </p>
      </div>

      <div className="space-y-2">
        {settled.map(({ id, m }) => {
          const ticker = tickerForPredictionAssetId(m.assetId) ?? '…'
          const targetUsd = Number(formatUnits(m.targetPrice, m.priceDecimals))
          const totalPool = m.poolYes + m.poolNo
          const yesPct = totalPool > 0n ? Number((m.poolYes * 10000n) / totalPool) / 100 : 50
          const cancelled = m.status === MarketStatusOnchain.Cancelled

          return (
            <Link
              key={id.toString()}
              to={`/onchain/${id.toString()}`}
              className="flex flex-wrap items-center gap-3 text-sm bg-[#241b2f] border border-white/5 rounded-xl px-4 py-3 hover:border-[#8B7CF7]/40 transition-colors"
            >
              <span className="w-7 h-7 rounded-lg bg-[#f7f1e3] text-[#241a33] grid place-items-center font-display font-bold text-sm shrink-0">
                {ticker[0]}
              </span>
              <span className="font-bold min-w-14">{ticker}</span>
              <span className="text-white/50 flex-1 min-w-40">At or above {formatUsd(targetUsd)} at deadline?</span>
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
            No settled markets yet - this fills in as open markets resolve or cancel.
          </p>
        )}
      </div>
    </div>
  )
}
