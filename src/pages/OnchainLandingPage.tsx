import { Link } from 'react-router-dom'
import { formatUnits } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { AwaitingCounterBetsBadge, CancelledBadge } from '@/components/Pills'
import {
  PREDICTION_MARKET_ADDRESS,
  aggregatorV3Abi,
  predictionMarketAbi,
  MarketStatusOnchain,
  tickerFromFeedDescription,
} from '@/chain/contracts'
import { formatUsd } from '@/lib/format'

const STEPS = [
  {
    n: '01',
    title: 'Pick a market',
    body: "Every market asks one thing: will this tokenized stock hit a target price before its deadline? Browse what's open or create your own.",
  },
  {
    n: '02',
    title: 'Call YES or NO',
    body: 'Stake USDG on either side. Bet inside the first two-thirds of the window and your share of the payout is weighted up to 2x — the earlier, the bigger.',
  },
  {
    n: '03',
    title: 'Market settles',
    body: "When the deadline hits, the Chainlink price feed decides it. If only one side ever placed a bet, the market cancels instead and everyone's stake comes back in full.",
  },
  {
    n: '04',
    title: 'Winners split the pool',
    body: "Parimutuel payout: your principal always comes back, plus your weighted share of the losing side's pool, minus a small protocol fee on winnings only.",
  },
] as const

const FEATURES = [
  {
    title: 'Parimutuel, not house odds',
    body: "There's no bookmaker setting a line. Winners split what losers staked, in proportion to their weighted stake — the pool sets the price, not a spread.",
  },
  {
    title: 'Early conviction pays more',
    body: 'A bet placed the instant a market opens carries 2x weight; wait until betting is about to close and it decays to 0.5x. Sniping the obvious outcome earns less than committing early.',
  },
  {
    title: 'No one-sided traps',
    body: 'If a market reaches its deadline with bets on only one side, it cancels automatically and every stake is refunded in full — no fee, no loss.',
  },
  {
    title: 'Not a demo',
    body: 'This is a real Solidity contract live on Robinhood Chain mainnet — permissionless market creation, an owner-maintained price-feed allowlist, and a $500 target-price cap. Real USDG, real wallet, real transactions.',
  },
] as const

export function OnchainLandingPage() {
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

  const feedAddresses = Array.from(
    new Set((markets.data ?? []).map((r) => (r.status === 'success' ? r.result.priceFeed : undefined)).filter((a): a is `0x${string}` => !!a)),
  )
  const feedDecimals = useReadContracts({
    contracts: feedAddresses.map((addr) => ({ address: addr, abi: aggregatorV3Abi, functionName: 'decimals' }) as const),
    query: { enabled: feedAddresses.length > 0 },
  })
  const feedPrices = useReadContracts({
    contracts: feedAddresses.map((addr) => ({ address: addr, abi: aggregatorV3Abi, functionName: 'latestRoundData' }) as const),
    query: { enabled: feedAddresses.length > 0 },
  })
  const feedDescriptions = useReadContracts({
    contracts: feedAddresses.map((addr) => ({ address: addr, abi: aggregatorV3Abi, functionName: 'description' }) as const),
    query: { enabled: feedAddresses.length > 0 },
  })
  const decimalsByFeed = new Map(feedAddresses.map((addr, i) => [addr, feedDecimals.data?.[i]?.status === 'success' ? feedDecimals.data[i].result : undefined]))
  const priceByFeed = new Map(feedAddresses.map((addr, i) => [addr, feedPrices.data?.[i]?.status === 'success' ? feedPrices.data[i].result : undefined]))
  const descByFeed = new Map(feedAddresses.map((addr, i) => [addr, feedDescriptions.data?.[i]?.status === 'success' ? feedDescriptions.data[i].result : undefined]))
  const tickerFor = tickerFromFeedDescription

  const openMarkets = ids
    .map((id, i) => {
      const r = markets.data?.[i]
      return r?.status === 'success' ? { id, ...r.result } : null
    })
    .filter((m): m is NonNullable<typeof m> => m != null && m.status === MarketStatusOnchain.Open)

  const preview = openMarkets.slice(0, 3)
  const heroMarket = openMarkets[0]
  const heroTicker = heroMarket ? tickerFor(descByFeed.get(heroMarket.priceFeed)) : undefined
  const heroDecimals = heroMarket ? decimalsByFeed.get(heroMarket.priceFeed) : undefined
  const heroTargetUsd = heroMarket && heroDecimals != null ? Number(formatUnits(heroMarket.targetPrice, heroDecimals)) : null

  return (
    <div>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-10 pb-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0e0e18] px-6 py-12 sm:px-12 sm:py-16">
          <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-[#C6FF3D]/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 w-72 h-72 rounded-full bg-[#8FBF1F]/15 blur-3xl" />

          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-[#C6FF3D]/80 uppercase mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C6FF3D]" />
                Prediction markets for tokenized stocks
              </p>
              <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05]">
                Call the price.
                <br />
                <span className="bg-gradient-to-r from-[#C6FF3D] to-[#8FBF1F] bg-clip-text text-transparent">
                  Get paid when you're right.
                </span>
              </h1>
              <p className="text-white/50 text-base mt-5 max-w-md">
                Bet YES or NO on whether a tokenized stock hits a target price before the deadline, on Robinhood Chain
                mainnet. Parimutuel payouts — no bookmaker, no house edge. Real USDG, real transactions.
              </p>

              <div className="mt-8 flex items-center gap-2 rounded-2xl border border-white/15 bg-black/30 p-2 max-w-md">
                <span className="flex-1 truncate px-3 py-2.5 text-sm text-white/40">
                  {heroTicker && heroTargetUsd != null ? `${heroTicker} reach ${formatUsd(heroTargetUsd)}?` : 'e.g. Will TSLA hit $400?'}
                </span>
                <Link
                  to="/onchain"
                  aria-label="Browse markets"
                  className="shrink-0 rounded-xl bg-gradient-to-r from-[#C6FF3D] to-[#8FBF1F] hover:brightness-110 text-black px-4 py-2.5 text-sm font-semibold transition-all"
                >
                  Browse →
                </Link>
              </div>

              <p className="text-xs text-white/40 mt-3 flex items-center gap-1.5">
                <span className="text-emerald-400">◆</span> No wallet needed to browse — connect only when you're ready to bet
              </p>

              <Link to="/whitepaper" className="inline-block text-sm text-[#C6FF3D] hover:underline mt-4">
                Read how the payout math works ↗
              </Link>
            </div>

            <div className="relative flex flex-col items-center">
              <img
                src={`${import.meta.env.BASE_URL}ProphetMarkets_fun.png`}
                alt="PredictX"
                className="w-full max-w-sm drop-shadow-[0_0_60px_rgba(198,255,61,0.25)]"
              />
              <div className="flex items-center gap-2 text-xs text-white/40 mt-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C6FF3D]/60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C6FF3D]" />
                </span>
                <span className="uppercase tracking-[0.15em] font-bold text-white/50">live on Robinhood Chain mainnet</span>
                <span>· {openMarkets.length} market{openMarkets.length === 1 ? '' : 's'} open</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-x-10 gap-y-3 mt-10 text-xs text-white/40">
          <span>
            <span className="text-white font-mono font-semibold">{openMarkets.length}</span> live markets
          </span>
          <span>
            <span className="text-white font-mono font-semibold">2%</span> protocol fee — winnings only, never your stake
          </span>
          <span>
            <span className="text-white font-mono font-semibold">2x → 0.5x</span> early-bet payout weight
          </span>
          <span>
            <span className="text-white font-mono font-semibold">2%–20%</span> target price band by duration
          </span>
          <span>
            <span className="text-white font-mono font-semibold">USDG</span> only for now — ETH coming in a future update
          </span>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-white/10 bg-[#0c0c16]/60">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-center mb-2">How it works</h2>
          <p className="text-white/40 text-sm text-center mb-10">Four steps, start to settlement.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map((s) => (
              <div key={s.n} className="bg-[#12121c]/95 border border-white/10 rounded-2xl p-5">
                <div className="text-[#C6FF3D]/60 font-mono text-sm mb-3">{s.n}</div>
                <h3 className="font-bold mb-2">{s.title}</h3>
                <p className="text-white/50 text-sm">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why PredictX */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-center mb-2">Why PredictX</h2>
        <p className="text-white/40 text-sm text-center mb-10">Mechanics designed around one idea: reward conviction, not luck of timing.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-[#12121c]/95 border border-white/10 rounded-2xl p-6 hover:border-[#C6FF3D]/30 transition-colors">
              <h3 className="font-bold mb-2">{f.title}</h3>
              <p className="text-white/50 text-sm">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Live markets preview */}
      {preview.length > 0 && (
        <section className="border-t border-white/10 bg-[#0c0c16]/60">
          <div className="max-w-6xl mx-auto px-4 py-16">
            <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">On the board right now</h2>
              <Link to="/onchain" className="text-sm text-[#C6FF3D] hover:underline">
                View all {openMarkets.length} markets →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {preview.map((m) => {
                const decimals = decimalsByFeed.get(m.priceFeed)
                const price = priceByFeed.get(m.priceFeed)
                const ticker = tickerFor(descByFeed.get(m.priceFeed))
                const targetUsd = decimals != null ? Number(formatUnits(m.targetPrice, decimals)) : null
                const currentUsd = decimals != null && price ? Number(formatUnits(price[1], decimals)) : null
                const totalPool = m.poolYes + m.poolNo
                const yesPct = totalPool > 0n ? Number((m.poolYes * 10000n) / totalPool) / 100 : 50
                const awaitingCounterBets = m.poolYes === 0n || m.poolNo === 0n

                return (
                  <Link
                    key={m.id.toString()}
                    to={`/onchain/${m.id}`}
                    className="block bg-[#12121c]/95 border border-white/10 rounded-2xl p-4 hover:border-[#C6FF3D]/30 hover:bg-[#181829]/95 transition-all"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="font-bold">{ticker ?? '…'}</div>
                        {awaitingCounterBets && <AwaitingCounterBetsBadge />}
                        {m.status === MarketStatusOnchain.Cancelled && <CancelledBadge />}
                      </div>
                      <div className="font-mono font-semibold">{currentUsd != null ? formatUsd(currentUsd) : '…'}</div>
                    </div>
                    <p className="text-xs text-white/50 mb-2">Target: {targetUsd != null ? formatUsd(targetUsd) : '…'}</p>
                    <div className="h-1.5 rounded-full bg-rose-500/25 overflow-hidden">
                      <div className="h-full bg-emerald-400" style={{ width: `${yesPct}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] text-white/40">
                      <span>YES {yesPct.toFixed(1)}%</span>
                      <span>NO {(100 - yesPct).toFixed(1)}%</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Final CTA */}
      <section className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-3">Ready to make your first call?</h2>
        <p className="text-white/50 text-sm sm:text-base mb-8 max-w-lg mx-auto">
          No wallet required to look around — browsing every market is open to everyone. Connect a wallet (MetaMask or
          Phantom) when you're ready to actually place a bet.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            to="/onchain"
            className="text-sm px-6 py-3 rounded-full bg-gradient-to-r from-[#C6FF3D] to-[#8FBF1F] hover:brightness-110 text-black font-semibold transition-all"
          >
            Browse markets
          </Link>
          <Link
            to="/onchain/create"
            className="text-sm px-6 py-3 rounded-full border border-white/15 text-white/80 hover:text-white hover:border-white/30 font-medium transition-colors"
          >
            Create a market
          </Link>
        </div>
      </section>
    </div>
  )
}
