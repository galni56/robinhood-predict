import { Link } from 'react-router-dom'
import { formatUnits } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { AwaitingCounterBetsBadge, CancelledBadge } from '@/components/Pills'
import { PREDICTION_MARKET_ADDRESS, aggregatorV3Abi, predictionMarketAbi, MarketStatusOnchain } from '@/chain/contracts'
import { formatCountdown, formatUsd } from '@/lib/format'

export function OnchainMarketsListPage() {
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
        ⛓️ Это <b>реальный режим</b> — рынки читаются напрямую с задеплоенного контракта на Robinhood Chain testnet.
      </div>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Ончейн-рынки</h1>
        <Link
          to="/onchain/create"
          className="text-sm px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-medium transition-colors"
        >
          + Рынок
        </Link>
      </div>

      {marketCount.isLoading ? (
        <p className="text-white/50 text-sm">Загрузка…</p>
      ) : count === 0 ? (
        <p className="text-white/40 text-sm">
          Рынков пока нет.{' '}
          <Link to="/onchain/create" className="text-emerald-400 hover:underline">
            Создать первый
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
          {ids.map((id, i) => {
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
                className="block rounded-xl border border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05] p-4 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Рынок #{id.toString()}</span>
                    {m.status === MarketStatusOnchain.Cancelled && <CancelledBadge />}
                    {awaitingCounterBets && <AwaitingCounterBetsBadge />}
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-mono">{targetUsd != null ? formatUsd(targetUsd) : '…'}</div>
                    <div className="text-white/40 text-xs">{currentUsd != null ? `сейчас ${formatUsd(currentUsd)}` : ''}</div>
                  </div>
                </div>

                <div className="h-1.5 rounded-full bg-rose-500/30 overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${yesPct}%` }} />
                </div>
                <div className="flex justify-between text-[11px] text-white/40 mt-1">
                  <span>ЗА {yesPct.toFixed(1)}%</span>
                  <span>
                    {m.status === MarketStatusOnchain.Open
                      ? formatCountdown(deadlineMs - Date.now())
                      : m.status === MarketStatusOnchain.Resolved
                        ? 'резолвнут'
                        : 'отменён'}
                  </span>
                  <span>ПРОТИВ {(100 - yesPct).toFixed(1)}%</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
