import { Link } from 'react-router-dom'
import { CountdownTimer } from '@/components/CountdownTimer'
import { Sparkline } from '@/components/PriceChart'
import { formatPct, formatUsd } from '@/lib/format'
import { RHCHAIN_META, TOKEN_BY_SYMBOL, TOKENS } from '@/market/tokens'
import { MAX_TARGET_PRICE, PROTOCOL_FEE_BP, useMarketStore } from '@/store/marketStore'

const STEPS = [
  {
    n: '01',
    title: 'Pick a market',
    body: "Every market asks one thing: will this tokenized stock hit a target price before its deadline? Browse what's open or create your own.",
  },
  {
    n: '02',
    title: 'Call YES or NO',
    body: 'Stake mUSD on either side. Bet inside the first two-thirds of the window and your share of the payout is weighted up to 2x — the earlier, the bigger.',
  },
  {
    n: '03',
    title: 'Market settles',
    body: "When the deadline hits, the price feed decides it. If only one side ever placed a bet, the market cancels instead and everyone's stake comes back in full.",
  },
  {
    n: '04',
    title: 'Winners split the pool',
    body: 'Parimutuel payout: your principal always comes back, plus your weighted share of the losing side\'s pool, minus a small protocol fee on winnings only.',
  },
] as const

const FEATURES = [
  {
    title: 'Parimutuel, not house odds',
    body: 'There\'s no bookmaker setting a line. Winners split what losers staked, in proportion to their weighted stake — the pool sets the price, not a spread.',
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
    title: 'Real contract, real testnet',
    body: `Alongside this demo, the same mechanics run in a Solidity contract on ${RHCHAIN_META.name} — permissionless market creation, an owner-maintained price-feed allowlist, and a $${MAX_TARGET_PRICE} target-price cap.`,
  },
] as const

export function LandingPage() {
  const markets = useMarketStore((s) => s.markets)
  const prices = useMarketStore((s) => s.prices)
  const history = useMarketStore((s) => s.history)
  const oddsFor = useMarketStore((s) => s.oddsFor)

  const openMarkets = Object.values(markets)
    .filter((m) => !m.resolved && !m.cancelled)
    .sort((a, b) => a.deadline - b.deadline)

  const preview = openMarkets.slice(0, 3)
  const heroMarket = openMarkets[0]
  const heroToken = heroMarket ? TOKEN_BY_SYMBOL.get(heroMarket.symbol) : undefined
  const heroPrice = heroToken ? (prices[heroToken.symbol] ?? heroToken.startPrice) : 0
  const heroSeries = heroToken ? (history[heroToken.symbol] ?? []) : []
  const heroOdds = heroMarket ? oddsFor(heroMarket.id) : { yesPct: 0.5, noPct: 0.5, totalPool: 0 }
  const heroChange = heroSeries.length > 1 ? (heroPrice - heroSeries[0].price) / heroSeries[0].price : 0

  return (
    <div>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-10 pb-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0e0e18] px-6 py-12 sm:px-12 sm:py-16">
          <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-violet-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 w-72 h-72 rounded-full bg-fuchsia-500/15 blur-3xl" />

          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-violet-300/80 uppercase mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                Prediction markets for tokenized stocks
              </p>
              <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05]">
                Call the price.
                <br />
                <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                  Get paid when you're right.
                </span>
              </h1>
              <p className="text-white/50 text-base mt-5 max-w-md">
                Bet YES or NO on whether a tokenized stock hits a target price before the deadline, on{' '}
                {RHCHAIN_META.name}. Parimutuel payouts — no bookmaker, no house edge.
              </p>

              <div className="mt-8 flex items-center gap-2 rounded-2xl border border-white/15 bg-black/30 p-2 max-w-md">
                <span className="flex-1 truncate px-3 py-2.5 text-sm text-white/40">
                  {heroMarket ? heroMarket.question : 'e.g. Will xTSLA hit $400 by Friday?'}
                </span>
                <Link
                  to="/markets"
                  aria-label="Browse markets"
                  className="shrink-0 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:brightness-110 text-white px-4 py-2.5 text-sm font-semibold transition-all"
                >
                  Browse →
                </Link>
              </div>

              <p className="text-xs text-white/40 mt-3 flex items-center gap-1.5">
                <span className="text-emerald-400">◆</span> No wallet needed to browse — sign up only when you're ready to bet
              </p>

              <Link to="/whitepaper" className="inline-block text-sm text-violet-300 hover:underline mt-4">
                Read how the payout math works ↗
              </Link>
            </div>

            <div className="relative">
              {heroMarket && heroToken ? (
                <Link
                  to={`/markets/${heroMarket.id}`}
                  className="block bg-[#12121c]/95 border border-white/10 rounded-2xl p-5 shadow-[0_0_50px_-12px_rgba(139,92,246,0.5)] hover:border-violet-400/30 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-bold text-lg">{heroToken.symbol}</div>
                      <div className="text-white/40 text-xs">{heroToken.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-semibold text-lg">{formatUsd(heroPrice)}</div>
                      <div className={heroChange >= 0 ? 'text-xs text-emerald-400' : 'text-xs text-rose-400'}>
                        {heroChange >= 0 ? '+' : ''}
                        {formatPct(heroChange)}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-white/60 mb-3">{heroMarket.question}</p>
                  <Sparkline data={heroSeries} color={heroChange >= 0 ? '#2dd888' : '#ff5577'} height={56} />
                  <div className="mt-4 h-2 rounded-full bg-rose-500/25 overflow-hidden">
                    <div className="h-full bg-emerald-400" style={{ width: `${heroOdds.yesPct * 100}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-white/50 mt-1.5">
                    <span>YES {formatPct(heroOdds.yesPct)}</span>
                    <span>NO {formatPct(heroOdds.noPct)}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-white/40">
                    <span>⏱ closes in <CountdownTimer deadline={heroMarket.deadline} /></span>
                    <span className="text-violet-300">View market →</span>
                  </div>
                </Link>
              ) : (
                <div className="bg-[#12121c]/95 border border-white/10 rounded-2xl p-8 text-center text-white/40 text-sm">
                  New markets spin up automatically — check back in a moment.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5 overflow-x-auto scrollbar-thin pb-1">
          <span className="text-xs text-white/30 shrink-0">Tokens on {RHCHAIN_META.name}</span>
          {TOKENS.slice(0, 12).map((t) => (
            <span
              key={t.symbol}
              className="shrink-0 text-xs font-mono px-2.5 py-1 rounded-full border border-white/10 text-white/50"
            >
              {t.symbol}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-x-10 gap-y-3 mt-10 text-xs text-white/40">
          <span>
            <span className="text-white font-mono font-semibold">{openMarkets.length}</span> live markets
          </span>
          <span>
            <span className="text-white font-mono font-semibold">{formatPct(PROTOCOL_FEE_BP / 10_000, 0)}</span> protocol
            fee — winnings only, never your stake
          </span>
          <span>
            <span className="text-white font-mono font-semibold">2x → 0.5x</span> early-bet payout weight
          </span>
          <span>
            <span className="text-white font-mono font-semibold">${MAX_TARGET_PRICE}</span> max target price
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
                <div className="text-violet-300/60 font-mono text-sm mb-3">{s.n}</div>
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
            <div key={f.title} className="bg-[#12121c]/95 border border-white/10 rounded-2xl p-6 hover:border-violet-400/30 transition-colors">
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
              <Link to="/markets" className="text-sm text-violet-300 hover:underline">
                View all {openMarkets.length} markets →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {preview.map((market) => {
                const token = TOKEN_BY_SYMBOL.get(market.symbol)
                if (!token) return null
                const price = prices[token.symbol] ?? token.startPrice
                const series = history[token.symbol] ?? []
                const odds = oddsFor(market.id)
                const change = series.length > 1 ? (price - series[0].price) / series[0].price : 0

                return (
                  <Link
                    key={market.id}
                    to={`/markets/${market.id}`}
                    className="block bg-[#12121c]/95 border border-white/10 rounded-2xl p-4 hover:border-violet-400/30 hover:bg-[#181829]/95 transition-all"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-bold">{token.symbol}</div>
                        <div className="text-white/40 text-xs">{token.name}</div>
                      </div>
                      <div className="font-mono font-semibold">{formatUsd(price)}</div>
                    </div>
                    <p className="text-xs text-white/50 mb-2">Target: ${market.target}</p>
                    <Sparkline data={series} color={change >= 0 ? '#2dd888' : '#ff5577'} height={36} />
                    <div className="mt-3 flex justify-between text-[11px] text-white/40">
                      <span>YES {formatPct(odds.yesPct)}</span>
                      <span>NO {formatPct(odds.noPct)}</span>
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
          No wallet required to look around — browsing, the leaderboard, and the explorer are open to everyone.
          Sign up when you're ready to actually place a bet.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            to="/register"
            className="text-sm px-6 py-3 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:brightness-110 text-white font-semibold transition-all"
          >
            Sign up — it's free
          </Link>
          <Link
            to="/markets"
            className="text-sm px-6 py-3 rounded-full border border-white/15 text-white/80 hover:text-white hover:border-white/30 font-medium transition-colors"
          >
            Browse markets
          </Link>
        </div>
      </section>
    </div>
  )
}
