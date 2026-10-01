import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { formatUnits } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import {
  LEGACY_PREDICTION_MARKET_ADDRESS,
  MarketStatusOnchain,
  predictionMarketV1Abi,
} from '@/chain/contracts'
import { tickerForPredictionAssetId } from '@/chain/predictionMarketAssets'
import { TokenLogo } from '@/components/TokenLogo'
import { formatCompactEth, formatUsd } from '@/lib/format'

const statusLabel: Record<number, string> = {
  [MarketStatusOnchain.Open]: 'Open',
  [MarketStatusOnchain.Resolved]: 'Resolved',
  [MarketStatusOnchain.Cancelled]: 'Cancelled',
}

export function OnchainLegacyMarketsPage() {
  const marketCount = useReadContract({
    address: LEGACY_PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketV1Abi,
    functionName: 'marketCount',
  })
  const count = Math.min(Number(marketCount.data ?? 0n), 500)
  const ids = useMemo(() => Array.from({ length: count }, (_, index) => BigInt(index)), [count])
  const markets = useReadContracts({
    contracts: ids.map((id) => ({
      address: LEGACY_PREDICTION_MARKET_ADDRESS,
      abi: predictionMarketV1Abi,
      functionName: 'getMarket',
      args: [id],
    }) as const),
    query: { enabled: ids.length > 0 },
  })

  const funded = ids.flatMap((id, index) => {
    const result = markets.data?.[index]
    if (!result || result.status !== 'success') return []
    const market = result.result
    if (market.poolYes + market.poolNo === 0n) return []
    return [{ id, market }]
  }).reverse()
  const loading = marketCount.isPending || (count > 0 && markets.isPending)

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8">
      <p className="mb-1 text-sm font-bold text-[#B3A7FA]">V1 settlement access</p>
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Legacy Prediction Markets</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
        V1 no longer accepts new bets. Funded markets remain available here so existing positions can always be claimed or refunded.
      </p>
      <Link to="/onchain" className="mt-4 inline-flex text-sm font-bold text-[#B3A7FA] hover:text-white">
        Open current V2 markets →
      </Link>

      {loading ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-48 animate-pulse rounded-2xl bg-white/5" />)}
        </div>
      ) : funded.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-white/5 bg-[#241b2f] p-8 text-center text-white/40">
          No funded legacy markets remain.
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {funded.map(({ id, market }) => {
            const ticker = tickerForPredictionAssetId(market.assetId) ?? '…'
            const target = Number(formatUnits(market.targetPrice, market.priceDecimals))
            return (
              <article key={id.toString()} className="rounded-2xl border border-white/5 bg-[#241b2f] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <TokenLogo ticker={ticker} className="h-10 w-10 rounded-xl" />
                    <div className="min-w-0">
                      <div className="font-display text-lg font-bold">{ticker}</div>
                      <div className="text-xs text-white/35">Legacy market #{id.toString()}</div>
                    </div>
                  </div>
                  <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-bold text-white/55">
                    {statusLabel[market.status] ?? 'Unknown'}
                  </span>
                </div>
                <p className="mt-4 text-sm font-semibold text-white/75">Target {formatUsd(target)}</p>
                <p className="mt-2 text-xs text-white/40">
                  YES {formatCompactEth(market.poolYes)} · NO {formatCompactEth(market.poolNo)}
                </p>
                <Link to={`/onchain/legacy/${id}`} className="mt-5 inline-flex text-sm font-bold text-[#B3A7FA] hover:text-white">
                  Open claim / refund →
                </Link>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
