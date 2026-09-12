import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatUnits } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { AwaitingCounterBetsBadge, CancelledBadge } from '@/components/Pills'
import {
  PREDICTION_MARKET_ADDRESS,
  aggregatorV3Abi,
  predictionMarketAbi,
  MarketStatusOnchain,
  feedAddressForTicker,
  tickerFromFeedDescription,
} from '@/chain/contracts'
import { useFeedSnapshot } from '@/chain/feedCache'
import { useRobinhoodAssets } from '@/chain/robinhoodApi'
import { formatUsd } from '@/lib/format'

const STEPS = [
  {
    n: '01',
    color: '#C6FF3D',
    title: 'Markets target a real ticker and price',
    body: "Anyone can create a market: pick an allowlisted Chainlink feed (TSLA, NVDA, whatever's live), a target price, and a deadline. The target has to sit within an allowed deviation from the live price — 2% to 20%, depending on how long the market runs — so nobody can set up a guaranteed win or an impossible long shot.",
  },
  {
    n: '02',
    color: '#38BDF8',
    title: 'Stake USDG on YES or NO',
    body: "Every bet goes into one shared pool per side — there's no bookmaker setting a line and no fixed odds. The live YES/NO split of the pool is the price, and it moves in real time as people bet.",
  },
  {
    n: '03',
    color: '#FBBF24',
    title: 'Betting early carries more weight',
    body: 'A bet placed in the first two-thirds of the betting window counts up to 2x; the closer to the cutoff, the more that decays, down to 0.5x right before betting closes. Conviction early is worth more than sniping the obvious side at the last second.',
  },
  {
    n: '04',
    color: '#A78BFA',
    title: 'The Chainlink feed decides the outcome',
    body: "At the deadline, the contract reads the feed's latestRoundData() directly and checks it against the target. No human calls it, no committee, no admin override — it's the same feed the whole time, on-chain.",
  },
  {
    n: '05',
    color: '#FB7185',
    title: 'One-sided markets cancel automatically',
    body: 'If a market reaches its deadline with bets on only one side, it cancels instead of settling — every stake comes back in full, no protocol fee taken. Conviction on one side alone never just gets swallowed.',
  },
  {
    n: '06',
    color: '#34D399',
    title: 'Winners split the losing pool',
    body: 'Payouts are parimutuel: your own stake always comes back first, then your weighted share of what the losing side staked — minus a 2% protocol fee that only ever applies to winnings, never to your principal.',
  },
] as const

const FEATURES = [
  {
    tag: '0% VIG',
    color: '#38BDF8',
    title: 'No spread. No vig. No middleman.',
    body: "Every sportsbook, every prediction platform, most of DeFi — they all bake a spread into the price before you even click a button. Prophet doesn't. There's no market maker quietly skimming the top and no house edge disguised as odds. Winners split exactly what losers staked, pool against pool, in proportion to weighted stake. The pool is the price. Nothing else touches it.",
  },
  {
    tag: '2X → 0.5X',
    color: '#FBBF24',
    title: 'Early conviction is priced in — literally',
    body: "Most platforms treat every dollar the same whether you bet the second a market opens or the second before it locks. Prophet doesn't. Bet inside the first two-thirds of the window and your stake carries up to 2x weight toward the payout; wait until the crowd has already piled in and that decays down to 0.5x. Being right isn't enough here — being right early is what actually gets paid.",
  },
  {
    tag: '100% REFUND',
    color: '#34D399',
    title: 'Your capital never gets trapped in a dead market',
    body: "If a market hits its deadline and only one side ever placed a bet, there's no outcome to force. It cancels on-chain automatically and every wallet gets its full stake back — no protocol fee, no dispute process, no support ticket to file. Dead markets don't hold your money hostage here.",
  },
  {
    tag: 'LIVE ON MAINNET',
    color: '#C6FF3D',
    title: 'Not a testnet. Not a simulation. Not a promise.',
    body: 'This is a live Solidity contract deployed on Robinhood Chain mainnet, settling real USDG against real Chainlink price feeds in real time. Permissionless market creation, an owner-maintained feed allowlist, deviation-bounded targets — every rule on this page is running on-chain right now, not sitting in a deck waiting to ship.',
  },
] as const

// A stable-per-ticker hue so each pill in the "Browse tokenized stocks"
// section gets a distinct-but-consistent color dot -- purely decorative,
// no meaning attached to the color itself.
function hueForTicker(sym: string) {
  let h = 0
  for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) % 360
  return h
}

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
  // See src/chain/feedCache.ts -- a backend poller keeps this snapshot
  // fresh, so this page only reads the chain directly for a feed the
  // snapshot doesn't have.
  const feedSnapshot = useFeedSnapshot()

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
  const tickerFor = tickerFromFeedDescription

  const openMarkets = ids
    .map((id, i) => {
      const r = markets.data?.[i]
      return r?.status === 'success' ? { id, ...r.result } : null
    })
    .filter((m): m is NonNullable<typeof m> => m != null && m.status === MarketStatusOnchain.Open)
    // Newest first -- a higher id was created later, since ids increment
    // sequentially. Otherwise the preview here (and the hero market below)
    // always shows the same oldest handful forever as more get created.
    .sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0))

  const assets = useRobinhoodAssets()
  const [stockQuery, setStockQuery] = useState('')
  const filteredAssets = (assets.data ?? []).filter((a) => {
    const q = stockQuery.trim().toLowerCase()
    if (!q) return true
    return a.tokenSymbol.toLowerCase().includes(q) || a.tokenName.toLowerCase().includes(q)
  })
  const preview = openMarkets.slice(0, 9)
  const heroMarket = openMarkets[0]
  const heroTicker = heroMarket ? tickerFor(descByFeed.get(heroMarket.priceFeed)) : undefined
  const heroDecimals = heroMarket ? decimalsByFeed.get(heroMarket.priceFeed) : undefined
  const heroTargetUsd = heroMarket && heroDecimals != null ? Number(formatUnits(heroMarket.targetPrice, heroDecimals)) : null

  return (
    <div>
      {/* Hero */}
      <section className="max-w-[1500px] mx-auto px-4 pt-10 pb-6">
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
                alt="Prophet"
                className="w-full max-w-sm drop-shadow-[0_0_60px_rgba(198,255,61,0.25)]"
                style={{
                  WebkitMaskImage: 'radial-gradient(ellipse 62% 62% at center, black 60%, transparent 100%)',
                  maskImage: 'radial-gradient(ellipse 62% 62% at center, black 60%, transparent 100%)',
                }}
              />
              <div className="flex items-center gap-2 text-xs text-white/40 mt-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C6FF3D]/60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C6FF3D]" />
                </span>
                <span className="uppercase tracking-[0.15em] font-bold text-white/50">live on Robinhood Chain mainnet</span>
                <span>· {openMarkets.length} market{openMarkets.length === 1 ? '' : 's'} open</span>
                <span>· ~{assets.data?.length ?? 194} tokenized stocks</span>
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
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-center mb-2">How it works</h2>
          <p className="text-white/40 text-sm text-center mb-12">Six steps, start to settlement.</p>
          <div>
            {STEPS.map((s, i) => (
              <div key={s.n} className="relative flex gap-5 pb-10 last:pb-0">
                {i < STEPS.length - 1 && (
                  <div
                    className="absolute left-6 top-12 bottom-0 w-px"
                    style={{ background: `linear-gradient(180deg, ${s.color}66, transparent)` }}
                  />
                )}
                <div
                  className="relative z-10 shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center font-mono font-bold text-sm"
                  style={{
                    background: `${s.color}1a`,
                    border: `1px solid ${s.color}55`,
                    color: s.color,
                    boxShadow: `0 0 24px -8px ${s.color}99`,
                  }}
                >
                  {s.n}
                </div>
                <div className="pt-1.5">
                  <h3 className="font-bold text-base mb-1.5" style={{ color: s.color }}>
                    {s.title}
                  </h3>
                  <p className="text-white/50 text-sm leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Prophet */}
      <section className="max-w-[1500px] mx-auto px-4 py-16">
        <p className="flex items-center justify-center gap-2 text-xs font-bold tracking-[0.2em] text-[#C6FF3D]/80 uppercase mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#C6FF3D]" />
          The Prophet difference
        </p>
        <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-center mb-3">
          Why <span className="bg-gradient-to-r from-[#C6FF3D] to-[#8FBF1F] bg-clip-text text-transparent">Prophet</span>
        </h2>
        <p className="text-white/40 text-sm sm:text-base text-center mb-12 max-w-xl mx-auto">
          No spread. No stale markets. No trust required — just math that settles itself, on-chain, in the open.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-3xl p-7 transition-transform duration-200 hover:-translate-y-1"
              style={{
                background: `linear-gradient(160deg, ${f.color}17, #0d0d16 60%)`,
                border: `1px solid ${f.color}40`,
                boxShadow: `0 0 50px -24px ${f.color}99`,
              }}
            >
              <div
                className="pointer-events-none absolute -top-12 -right-12 w-44 h-44 rounded-full blur-3xl transition-opacity duration-200 opacity-20 group-hover:opacity-30"
                style={{ background: f.color }}
              />
              <span
                className="relative inline-block font-mono text-[11px] font-bold tracking-widest px-2.5 py-1 rounded-full mb-5"
                style={{ color: f.color, border: `1px solid ${f.color}55`, background: `${f.color}1a` }}
              >
                {f.tag}
              </span>
              <h3 className="relative text-xl font-extrabold tracking-tight mb-3">{f.title}</h3>
              <p className="relative text-white/55 text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Live markets preview */}
      {preview.length > 0 && (
        <section className="border-t border-white/10 bg-[#0c0c16]/60">
          <div className="max-w-[1500px] mx-auto px-4 py-16">
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

      {/* Every tokenized stock on the chain -- names only, no price/status.
          Deliberately not the same component as TokenBrowser (used on the
          markets list) -- that one shows live price + allowlist status per
          ticker; this is just "here's what exists on Robinhood Chain". */}
      <section className="max-w-[1500px] mx-auto px-4 py-16">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-center mb-2">Browse tokenized stocks</h2>
        <p className="text-white/40 text-sm text-center mb-6">
          Every tokenized stock on Robinhood Chain — {assets.data?.length ?? 194} and counting.
        </p>

        <div className="max-w-sm mx-auto mb-8">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 focus-within:border-[#C6FF3D]/50 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-white/30 shrink-0">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={stockQuery}
              onChange={(e) => setStockQuery(e.target.value)}
              placeholder="Search by ticker or name…"
              className="flex-1 bg-transparent outline-none text-sm font-mono placeholder:font-sans placeholder:text-white/30"
            />
            {stockQuery && (
              <button onClick={() => setStockQuery('')} className="text-white/30 hover:text-white text-xs font-semibold shrink-0">
                Clear
              </button>
            )}
          </div>
          <p className="text-center text-[11px] text-white/30 mt-2 font-mono">{filteredAssets.length} shown</p>
        </div>

        {filteredAssets.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-2">
            {filteredAssets.map((a) => {
              const hasFeed = !!feedAddressForTicker(a.tokenSymbol)
              const dot = (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: hasFeed ? `hsl(${hueForTicker(a.tokenSymbol)} 70% 60%)` : 'transparent', border: hasFeed ? undefined : '1px solid rgba(255,255,255,0.25)' }}
                />
              )
              const label = a.tokenName.replace(/\s*•\s*Robinhood Token$/i, '')

              // Every ticker with an allowlisted Chainlink feed can actually
              // become a market -- send it straight to market creation,
              // prefilled, instead of an inert link. One without a feed yet
              // simply can't be created against, so it stays a plain (but
              // clearly-labelled, not just dead) pill instead of pretending
              // to be clickable.
              if (hasFeed) {
                return (
                  <Link
                    key={a.tokenSymbol}
                    to={`/onchain/create?feed=${a.tokenSymbol}`}
                    title={`Create a market for ${label}`}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-[#12121c]/95 text-sm text-white/60 font-mono hover:-translate-y-0.5 hover:text-white hover:border-[#C6FF3D]/30 hover:bg-[#181829] transition-all"
                  >
                    {dot}
                    {a.tokenSymbol}
                  </Link>
                )
              }
              return (
                <span
                  key={a.tokenSymbol}
                  title={`${label} — no price feed yet. Robinhood hasn't shipped one for this stock, so a market can't be created until they do.`}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/5 border-dashed bg-white/[0.02] text-sm text-white/30 font-mono cursor-default"
                >
                  {dot}
                  {a.tokenSymbol}
                </span>
              )
            })}
          </div>
        ) : (
          <p className="text-center text-white/30 text-sm py-10">No stocks match "{stockQuery}".</p>
        )}
      </section>

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
