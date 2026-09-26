import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatUnits } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_CONFIGURED,
  predictionMarketAbi,
  MarketStatusOnchain,
} from '@/chain/contracts'
import { demoPools, isDemoMode } from '@/chain/demo'
import { predictionAssetForTicker, tickerForPredictionAssetId } from '@/chain/predictionMarketAssets'
import { useAssetRaceLiveDisplay } from '@/chain/useAssetRaceLiveDisplay'
import { useRobinhoodAssets, useTokenLogos } from '@/chain/robinhoodApi'
import { TokenLogo } from '@/components/TokenLogo'
import { formatUsd } from '@/lib/format'

const STEPS = [
  {
    n: '01',
    color: '#8B7CF7',
    title: 'Choose a stock, target and deadline',
    body: 'Anyone can create a YES/NO market for one of ten reviewed tokenized stocks. The target is shown against a live onchain stock price before the market is created.',
  },
  {
    n: '02',
    color: '#F2A65A',
    title: 'Enter your stake in USD or ETH',
    body: 'Use whichever input is easier. Prophet shows both equivalents, freezes the exact amount, and your wallet sends native ETH directly in one transaction—no approval or swap.',
  },
  {
    n: '03',
    color: '#B3A7FA',
    title: 'Betting early carries more weight',
    body: 'A bet placed in the first two-thirds of the betting window counts up to 2x; the closer to the cutoff, the more that decays, down to 0.5x right before betting closes. Conviction early is worth more than sniping the obvious side at the last second.',
  },
  {
    n: '04',
    color: '#ED8F3A',
    title: 'The deadline price fixes the outcome',
    body: 'Settlement uses the reviewed onchain price from the last Robinhood block strictly before the scheduled deadline. Resolving later cannot replace it with a newer price.',
  },
  {
    n: '05',
    color: '#6A5AE0',
    title: 'A real opposing market is required',
    body: 'Settlement needs funded YES and NO pools from at least two distinct wallets. If those conditions are not met, the market cancels and every position can reclaim its full stake with no protocol fee.',
  },
  {
    n: '06',
    color: '#E8C46B',
    title: 'Winners split the losing pool',
    body: 'Payouts are parimutuel: your own stake always comes back first, then your weighted share of what the losing side staked - minus a 2% protocol fee that only ever applies to winnings, never to your principal.',
  },
] as const

const FEATURES = [
  {
    tag: 'POOL TO POOL',
    color: '#8B7CF7',
    title: 'Players compete against players',
    body: 'There are no fixed bookmaker odds. Each game forms an onchain pool, and winners receive principal plus their rule-based share of the losing pool after the 2% protocol fee on that profit portion.',
  },
  {
    tag: 'USD ↔ ETH',
    color: '#F2A65A',
    title: 'Choose how you enter the amount',
    body: 'Type a convenient dollar amount or enter ETH directly. Every stake form shows the matching value from one shared ETH/USD quote before the wallet opens; the contract receives native ETH.',
  },
  {
    tag: 'CLEAR OUTCOMES',
    color: '#B3A7FA',
    title: 'Settle by rule or refund by rule',
    body: 'Each mode defines its price snapshot, eligibility and tie behavior in advance. If a game cannot settle under those rules, it reaches a refundable terminal state instead of substituting an arbitrary result.',
  },
  {
    tag: 'LIVE ON MAINNET',
    color: '#ED8F3A',
    title: 'Three games, one native currency',
    body: 'Prediction Markets, Asset Races and Price Arena run on Robinhood Chain. Stakes, pools, claims and refunds use native ETH; stock quote assets are used only to determine game prices and results.',
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

const ETF_TICKERS = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'GLD', 'SLV', 'USO', 'VTI', 'VOO', 'XLE', 'XLF', 'XLK', 'ARKK', 'TQQQ', 'SQQQ'])

// One-shot reveal for scroll-triggered stagger animations: flips to
// visible the first time the element enters the viewport, then stops
// observing. Cards inside get their own transition-delay.
function useRevealOnScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { threshold: 0.12 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

function formatDeadlineUtc(deadline: bigint) {
  const d = new Date(Number(deadline) * 1000)
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${day} · ${hh}:${mm} UTC`
}

export function OnchainLandingPage() {
  const marketCount = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'marketCount',
    query: { enabled: PREDICTION_MARKET_CONFIGURED || isDemoMode() },
  })
  const count = marketCount.data != null ? Number(marketCount.data) : 0
  const ids = Array.from({ length: count }, (_, i) => BigInt(i))

  const markets = useReadContracts({
    contracts: ids.map((id) => ({ address: PREDICTION_MARKET_ADDRESS, abi: predictionMarketAbi, functionName: 'getMarket', args: [id] }) as const),
    query: { enabled: count > 0 },
  })

  const live = useAssetRaceLiveDisplay({ enabled: true })

  const openMarkets = ids
    .map((id, i) => {
      const r = markets.data?.[i]
      return r?.status === 'success' ? { id, ...r.result } : null
    })
    .filter((m): m is NonNullable<typeof m> => m != null && m.status === MarketStatusOnchain.Open)
    // Newest first -- a higher id was created later, since ids increment
    // sequentially. Otherwise the preview here always shows the same oldest
    // handful forever as more get created.
    .sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0))

  const assets = useRobinhoodAssets()
  const logos = useTokenLogos()
  const [stockQuery, setStockQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [category, setCategory] = useState<'all' | 'stocks' | 'etfs'>('all')
  const stepsReveal = useRevealOnScroll<HTMLDivElement>()
  const featuresReveal = useRevealOnScroll<HTMLDivElement>()
  const ctaReveal = useRevealOnScroll<HTMLDivElement>()
  const navigate = useNavigate()
  const filteredAssets = (assets.data ?? []).filter((a) => {
    const q = stockQuery.trim().toLowerCase()
    if (!q) return true
    return a.tokenSymbol.toLowerCase().includes(q) || a.tokenName.toLowerCase().includes(q)
  })

  const categorized = openMarkets.filter((m) => {
    if (category === 'all') return true
    const ticker = tickerForPredictionAssetId(m.assetId)
    if (!ticker) return category === 'stocks'
    return category === 'etfs' ? ETF_TICKERS.has(ticker) : !ETF_TICKERS.has(ticker)
  })
  const preview = categorized.slice(0, 6)

  return (
    <div>
      {/* Hero -- light lavender card floating on the dark page, per the
          approved Prophet mockup */}
      <div>
        <section className="max-w-[1500px] mx-auto px-4 pt-8 pb-8">
          <div className="relative overflow-hidden rounded-[2.5rem] bg-[#e7e1f8] text-[#241a33] px-6 py-12 sm:px-14 sm:py-16">
            <div className="relative grid min-w-0 grid-cols-1 items-center gap-12 lg:grid-cols-2">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3.5 py-1.5 text-xs font-bold text-[#241a33]/70 mb-6">
                  <span className="text-[#8B7CF7]">✦</span>
                  Three ways to call the market
                </p>
                <h1 className="font-display text-5xl sm:text-[4rem] font-bold tracking-tight leading-[1.04]">
                  Call it. Race it.
                  <br />
                  Name the price.
                </h1>
                <p className="text-[#241a33]/70 text-base sm:text-lg mt-5 max-w-md font-medium">
                  Play YES/NO Prediction Markets, back the fastest mover in Asset Races, or forecast the exact finish
                  in Price Arena. Enter your stake in USD or ETH; your wallet sends native ETH.
                </p>

                <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <Link
                    to="/onchain"
                    className="inline-flex min-w-[190px] items-center justify-between gap-3 rounded-full bg-[#241a33] py-2.5 pl-6 pr-2.5 text-sm font-bold text-[#f7f1e3] transition-all hover:-translate-y-0.5 hover:bg-[#31234a]"
                  >
                    Prediction Markets
                    <span className="w-8 h-8 rounded-full bg-[#8B7CF7] text-[#f7f1e3] grid place-items-center text-sm">↗</span>
                  </Link>
                  <Link
                    to="/onchain/races"
                    className="inline-flex min-w-[190px] items-center justify-between gap-3 rounded-full bg-[#241a33] py-2.5 pl-6 pr-2.5 text-sm font-bold text-[#f7f1e3] transition-all hover:-translate-y-0.5 hover:bg-[#31234a]"
                  >
                    Asset Races
                    <span className="w-8 h-8 rounded-full bg-[#8B7CF7] text-[#f7f1e3] grid place-items-center text-sm">↗</span>
                  </Link>
                  <Link
                    to="/onchain/arenas"
                    className="inline-flex min-w-[190px] items-center justify-between gap-3 rounded-full bg-[#241a33] py-2.5 pl-6 pr-2.5 text-sm font-bold text-[#f7f1e3] transition-all hover:-translate-y-0.5 hover:bg-[#31234a]"
                  >
                    Price Arena
                    <span className="w-8 h-8 rounded-full bg-[#8B7CF7] text-[#f7f1e3] grid place-items-center text-sm">↗</span>
                  </Link>
                </div>

              </div>

              <div className="relative flex flex-col items-center py-6 mt-6 lg:mt-0">
                <span className="pointer-events-none absolute right-[8%] top-[12%] text-[#7C5CF0] text-3xl" style={{ animation: 'sparkle-pop 2.6s ease-in-out infinite' }}>
                  ✦
                </span>
                <span
                  className="pointer-events-none absolute left-[10%] bottom-[22%] text-[#7C5CF0] text-xl"
                  style={{ animation: 'sparkle-pop 2.6s ease-in-out infinite', animationDelay: '1.1s' }}
                >
                  ✦
                </span>
                {/* YES / NO tiles, straight from the brand posters */}
                <div
                  className="absolute left-[2%] sm:left-[6%] top-[30%] -rotate-[10deg] rounded-2xl bg-[#8B7CF7] px-5 py-3 shadow-[0_14px_30px_-12px_rgba(106,90,224,0.7)] font-display font-bold text-xl text-[#f7f1e3] z-10"
                  style={{ animation: 'mascot-float 6s ease-in-out infinite', animationDelay: '0.6s' }}
                >
                  YES
                </div>
                <div
                  className="absolute right-[2%] sm:right-[6%] bottom-[26%] rotate-[9deg] rounded-2xl bg-[#F2A65A] px-5 py-3 shadow-[0_14px_30px_-12px_rgba(237,143,58,0.7)] font-display font-bold text-xl text-[#3b2416] z-10"
                  style={{ animation: 'mascot-float 6.8s ease-in-out infinite', animationDelay: '1.4s' }}
                >
                  NO
                </div>
                <div className="absolute -top-1 right-[4%] sm:right-[10%] rotate-2 rounded-2xl rounded-br-sm bg-[#fdf9ee] px-4 py-2.5 shadow-lg text-sm font-bold z-10">
                  The future called.
                  <br />
                  It wants your take.
                </div>
                <div className="relative">
                  {/* circle anchored to the mascot itself, so stacked mobile
                      layout can never overlap the text column above */}
                  <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[122%] aspect-square rounded-full bg-[#F2A65A]" />
                  <img
                    src={`${import.meta.env.BASE_URL}brand/mascot.png`}
                    alt="Prophet mascot"
                    width={512}
                    height={512}
                    className="relative z-[5] w-56 sm:w-72 lg:w-[21rem] h-auto"
                    style={{ animation: 'mascot-float 5s ease-in-out infinite' }}
                  />
                </div>
                <p className="relative z-[5] mt-14 lg:mt-20 text-sm font-bold text-[#241a33]/50">Meet your inner prophet</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 px-2 pt-6 text-sm font-bold text-white/60 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <span>Anyone can create: ask a YES / NO question, assemble an Asset Race, or launch a Price Arena.</span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link to="/onchain/create" className="text-[#B3A7FA] transition-colors hover:text-white">Create Market ↗</Link>
              <Link to="/onchain/races/create" className="text-[#B3A7FA] transition-colors hover:text-white">Create Race ↗</Link>
              <Link to="/onchain/arenas/create" className="text-[#B3A7FA] transition-colors hover:text-white">Create Arena ↗</Link>
            </span>
          </div>
        </section>
      </div>

      {/* What's your call -- live markets in the mockup card style */}
      <section className="max-w-[1500px] mx-auto px-4 pt-14 pb-10">
        <p className="text-sm font-bold text-[#B3A7FA] mb-2">The next big question</p>
        <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">What's your call?</h2>
          <div className="flex items-center gap-2">
            {(
              [
                ['all', 'All'],
                ['stocks', 'Stocks'],
                ['etfs', 'ETFs'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setCategory(key)}
                className={
                  category === key
                    ? 'px-4 py-1.5 rounded-full bg-[#f7f1e3] text-[#241a33] text-sm font-bold'
                    : 'px-4 py-1.5 rounded-full text-sm font-bold text-white/50 hover:text-white hover:bg-white/5 transition-colors'
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {preview.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {preview.map((m) => {
              const ticker = tickerForPredictionAssetId(m.assetId)
              const price = ticker ? live.assets[ticker] : undefined
              const targetUsd = Number(formatUnits(m.targetPrice, m.priceDecimals))
              const currentUsd = price && !price.stale ? Number(formatUnits(BigInt(price.priceRaw), price.decimals)) : null
              const pools = isDemoMode() ? demoPools(m.id) : { poolYes: m.poolYes, poolNo: m.poolNo }
              const totalPool = pools.poolYes + pools.poolNo
              const yesPct = totalPool > 0n ? Number((pools.poolYes * 10000n) / totalPool) / 100 : 50
              const hasBothSides = pools.poolYes > 0n && pools.poolNo > 0n

              return (
                <div
                  key={m.id.toString()}
                  className="flex flex-col rounded-3xl bg-[#241b2f] border border-white/5 p-6 hover:border-[#8B7CF7]/30 hover:-translate-y-0.5 hover:shadow-[0_24px_50px_-30px_rgba(106,90,224,0.7)] transition-all"
                >
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <TokenLogo ticker={ticker} logoUrl={ticker ? logos.get(ticker) : undefined} className="w-10 h-10 rounded-2xl text-lg" />
                      <div>
                        <div className="font-bold text-sm tracking-wide leading-tight">{ticker ?? '…'}</div>
                        <div className="text-white/35 text-xs font-medium mt-0.5">{formatDeadlineUtc(m.deadline)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#8B7CF7]/60" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#8B7CF7]" />
                      </span>
                      <span className="font-mono text-sm text-white/75">{currentUsd != null ? formatUsd(currentUsd) : '…'}</span>
                    </div>
                  </div>

                  <Link to={`/onchain/${m.id}`} className="block group">
                    <h3 className="font-display text-[1.35rem] font-bold leading-snug group-hover:text-[#B3A7FA] transition-colors">
                      Will {ticker ?? 'it'} be at or above {targetUsd != null ? formatUsd(targetUsd) : '…'} at the deadline?
                    </h3>
                  </Link>

                  <div className="mt-auto pt-5">
                    {hasBothSides ? (
                      <>
                        <div className="flex items-center justify-between text-xs font-bold mb-2">
                          <span className="text-[#B3A7FA]">YES {yesPct.toFixed(0)}%</span>
                          <span className="text-[#F2A65A]">NO {(100 - yesPct).toFixed(0)}%</span>
                        </div>
                        <div className="flex h-1.5 gap-0.5 mb-5">
                          <div className="rounded-full bg-[#8B7CF7]" style={{ width: `${yesPct}%` }} />
                          <div className="rounded-full bg-[#F2A65A] flex-1" />
                        </div>
                      </>
                    ) : (
                      <p className="flex items-center gap-2 text-xs font-medium text-white/45 mb-5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#F2A65A] shrink-0" />
                        {totalPool === 0n
                          ? 'New market - be the first to call it.'
                          : 'One side is in - take the other, or it refunds in full.'}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-2.5">
                      <Link
                        to={`/onchain/${m.id}`}
                        className="group/btn flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#372a4f] text-[#B3A7FA] text-sm font-extrabold hover:bg-[#8B7CF7] hover:text-[#f7f1e3] transition-colors"
                      >
                        YES
                        <span className="opacity-60 transition-transform group-hover/btn:-translate-y-0.5 group-hover/btn:translate-x-0.5">↗</span>
                      </Link>
                      <Link
                        to={`/onchain/${m.id}`}
                        className="group/btn flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#3b2a20] text-[#F2A65A] text-sm font-extrabold hover:bg-[#F2A65A] hover:text-[#3b2416] transition-colors"
                      >
                        NO
                        <span className="opacity-60 transition-transform group-hover/btn:translate-y-0.5 group-hover/btn:translate-x-0.5">↘</span>
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-white/40 text-sm py-8">
            {openMarkets.length === 0 ? 'Loading live markets…' : 'No open markets in this category right now.'}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-8 text-xs font-bold text-white/40">
          <span>
            Prediction Markets use native ETH · one wallet transaction · 2% fee on each winner’s profit share ·{' '}
            <Link to="/onchain" className="text-[#B3A7FA] hover:underline">
              View all {openMarkets.length} markets →
            </Link>
          </span>
          <span>Native ETH wagers · Onchain settlement</span>
        </div>
      </section>

      {/* How it works -- light island in the hero's visual language,
          scroll-staggered card reveal */}
      <section className="max-w-[1500px] mx-auto px-4 py-14">
        <div ref={stepsReveal.ref} className="relative overflow-hidden rounded-[2.5rem] bg-[#e7e1f8] text-[#241a33] px-6 py-12 sm:px-12 sm:py-14">
          <span className="pointer-events-none absolute right-[6%] top-[8%] text-[#7C5CF0] text-2xl" style={{ animation: 'sparkle-pop 2.6s ease-in-out infinite' }}>
            ✦
          </span>
          <span
            className="pointer-events-none absolute left-[4%] bottom-[10%] text-[#7C5CF0] text-lg"
            style={{ animation: 'sparkle-pop 2.6s ease-in-out infinite', animationDelay: '1.3s' }}
          >
            ✦
          </span>

          <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3.5 py-1.5 text-xs font-bold text-[#241a33]/70 mb-4">
                <span className="text-[#8B7CF7]">✦</span>
                Prediction Markets · start to settlement
              </p>
              <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-tight">How YES / NO works</h2>
            </div>
            <div className="hidden sm:flex items-center gap-3 pb-1">
              <img
                src={`${import.meta.env.BASE_URL}brand/mascot-small.png`}
                alt=""
                className="w-14"
                style={{ animation: 'mascot-float 5s ease-in-out infinite' }}
              />
              <div className="-rotate-2 rounded-2xl rounded-bl-sm bg-[#fdf9ee] px-3.5 py-2 shadow-md text-xs font-bold">
                No bookmaker.
                <br />
                Just the pool.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {STEPS.map((s, i) => {
              const badge = i % 2 === 0 ? '#6A5AE0' : '#ED8F3A'
              return (
                <div
                  key={s.n}
                  className="group rounded-3xl bg-white/60 p-6 transition-all duration-500 hover:-translate-y-1.5 hover:bg-white/80 hover:shadow-[0_16px_40px_-20px_rgba(36,26,51,0.35)]"
                  style={{
                    opacity: stepsReveal.visible ? 1 : 0,
                    transform: stepsReveal.visible ? 'translateY(0)' : 'translateY(28px)',
                    transitionDelay: `${i * 90}ms`,
                  }}
                >
                  <span
                    className="inline-grid place-items-center w-12 h-12 rounded-2xl font-display font-bold text-lg text-[#f7f1e3] mb-4 transition-transform duration-300 group-hover:-rotate-6"
                    style={{ background: badge }}
                  >
                    {s.n}
                  </span>
                  <h3 className="font-display font-bold text-lg leading-snug mb-2">{s.title}</h3>
                  <p className="text-[#241a33]/65 text-sm leading-relaxed">{s.body}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Why Prophet */}
      <section className="max-w-[1500px] mx-auto px-4 py-16">
        <p className="flex items-center justify-center gap-2 text-sm font-bold text-[#B3A7FA] mb-4">
          <span className="text-[#8B7CF7]">✦</span>
          The Prophet difference
        </p>
        <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-center mb-3">
          Why <span className="text-[#B3A7FA]">Prophet</span>
        </h2>
        <p className="text-white/40 text-sm sm:text-base text-center mb-12 max-w-xl mx-auto">
          Pick the format that matches your conviction. The rules, pools and settlement state stay visible onchain.
        </p>
        <div ref={featuresReveal.ref} className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {FEATURES.map((f, i) => {
            const tile =
              i % 2 === 0
                ? { background: '#6A5AE0', color: '#f7f1e3', shadow: '0 14px 30px -14px rgba(106,90,224,0.8)' }
                : { background: '#F2A65A', color: '#3b2416', shadow: '0 14px 30px -14px rgba(237,143,58,0.8)' }
            return (
              <div
                key={f.title}
                className="group relative overflow-hidden rounded-3xl bg-[#241b2f] border border-white/5 p-8 transition-all duration-500 hover:-translate-y-1.5 hover:border-[#8B7CF7]/40 hover:shadow-[0_24px_60px_-30px_rgba(106,90,224,0.6)]"
                style={{
                  opacity: featuresReveal.visible ? 1 : 0,
                  transform: featuresReveal.visible ? 'translateY(0)' : 'translateY(28px)',
                  transitionDelay: `${i * 110}ms`,
                }}
              >
                <div
                  className="pointer-events-none absolute -top-16 -right-16 w-52 h-52 rounded-full blur-3xl transition-opacity duration-300 opacity-15 group-hover:opacity-30"
                  style={{ background: f.color }}
                />
                <span
                  className="relative inline-block rounded-2xl px-4 py-2 mb-6 font-display font-bold text-lg -rotate-2 transition-transform duration-300 group-hover:rotate-0"
                  style={{ background: tile.background, color: tile.color, boxShadow: tile.shadow }}
                >
                  {f.tag}
                </span>
                <h3 className="relative font-display text-2xl font-bold tracking-tight mb-3">{f.title}</h3>
                <p className="relative text-white/55 text-sm leading-relaxed">{f.body}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Asset Races and Price Arena -- the two alternative product surfaces.
          Deliberately no live race data here (a brand-new feature can have
          zero races at any given moment, which would make a marketing
          section look broken) -- just the pitch and a way in. */}
      <section className="max-w-[1500px] mx-auto px-4 py-14">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-[#241b2f] via-[#241b2f] to-[#2c1f42] border border-white/5 px-6 py-12 sm:px-14 sm:py-16">
          <div className="pointer-events-none absolute -top-20 -right-16 w-80 h-80 rounded-full bg-[#C6FF3D]/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 w-72 h-72 rounded-full bg-[#8B7CF7]/20 blur-3xl" />
          <span className="pointer-events-none absolute right-[10%] top-[14%] text-[#B3A7FA] text-2xl" style={{ animation: 'sparkle-pop 2.6s ease-in-out infinite' }}>
            ✦
          </span>

          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white/70 mb-6">
                <span className="text-[#C6FF3D]">⚡</span>
                Beyond YES / NO · Races + Arena
              </p>
              <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-tight leading-[1.08]">
                Back the fastest.
                <br />
                Or name the finish.
              </h2>
              <p className="text-white/55 text-base mt-5 max-w-md">
                Asset Races compare 2 to 6 stocks—or 2 to 6 memes—by percentage return. Price Arena hides every forecast
                during the lobby, then rewards the closest half at the deadline. Both accept USD or ETH input and
                settle entirely in native ETH.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  to="/onchain/races"
                  className="inline-flex items-center gap-3 rounded-full bg-[#C6FF3D] text-black pl-6 pr-2.5 py-2.5 text-sm font-bold hover:brightness-110 transition-all"
                >
                  Explore Asset Races
                  <span className="w-8 h-8 rounded-full bg-black/15 grid place-items-center text-sm">↗</span>
                </Link>
                <Link
                  to="/onchain/arenas"
                  className="text-sm font-bold text-white/70 hover:text-white underline underline-offset-4 decoration-2 transition-colors"
                >
                  Enter Price Arena
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { emoji: '⚡', title: 'Asset Races', body: 'Back one of 2–6 contenders. Highest percentage return between the shared snapshots wins.' },
                { emoji: '🎯', title: 'Price Arena', body: 'Predict one exact final price. The closest half shares the losing half’s pool.' },
                { emoji: '📈🚀', title: 'Stocks or memes', body: 'Choose the stock lane or the meme lane; quote rules stay specific to each category.' },
                { emoji: '🍿', title: 'Follow it live', body: 'Watch rankings move in real time while onchain settlement stays tied to the fixed deadline.' },
              ].map((f) => (
                <div key={f.title} className="rounded-2xl bg-white/5 border border-white/10 p-5">
                  <span className="text-2xl">{f.emoji}</span>
                  <h3 className="font-display font-bold mt-2.5">{f.title}</h3>
                  <p className="text-white/45 text-xs mt-1 leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Every tokenized stock on the chain -- names only, no price/status.
          Deliberately not the same component as TokenBrowser (used on the
          markets list) -- that one shows live price + allowlist status per
          ticker; this is just "here's what exists on Robinhood Chain". */}
      <section className="max-w-[1500px] mx-auto px-4 py-14">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-[#e7e1f8] text-[#241a33] px-6 py-12 sm:px-12 sm:py-14">
          <span className="pointer-events-none absolute left-[5%] top-[10%] text-[#7C5CF0] text-2xl" style={{ animation: 'sparkle-pop 2.6s ease-in-out infinite' }}>
            ✦
          </span>
          <span
            className="pointer-events-none absolute right-[4%] bottom-[12%] text-[#7C5CF0] text-lg"
            style={{ animation: 'sparkle-pop 2.6s ease-in-out infinite', animationDelay: '1.2s' }}
          >
            ✦
          </span>

          <div className="text-center max-w-2xl mx-auto">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3.5 py-1.5 text-xs font-bold text-[#241a33]/70 mb-4">
              <span className="text-[#8B7CF7]">✦</span>
              {assets.data?.length ?? 194} and counting
            </p>
            <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-tight mb-3">Browse tokenized stocks</h2>
            <p className="text-[#241a33]/60 text-sm sm:text-base font-medium mb-8">
              Tokenized stocks discovered on Robinhood Chain. A colored dot means Prophet has enabled a reviewed
              onchain price source, so you can create a YES/NO market for it now.
            </p>

            <div className="relative max-w-sm mx-auto mb-10">
              <div className="flex items-center gap-2.5 rounded-full bg-white/70 px-5 py-3 shadow-sm focus-within:ring-2 focus-within:ring-[#8B7CF7]/50 transition-shadow">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-[#241a33]/40 shrink-0">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
                <input
                  value={stockQuery}
                  onChange={(e) => setStockQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setStockQuery('')
                    if (e.key === 'Enter') {
                      const first = filteredAssets.find((a) => !!predictionAssetForTicker(a.tokenSymbol))
                      if (first && stockQuery.trim()) navigate(`/onchain/create?feed=${first.tokenSymbol}`)
                    }
                  }}
                  placeholder="Search by ticker or name…"
                  className="flex-1 bg-transparent outline-none text-sm font-bold placeholder:font-medium placeholder:text-[#241a33]/40"
                />
                {stockQuery && (
                  <button onClick={() => setStockQuery('')} className="text-[#241a33]/40 hover:text-[#241a33] text-xs font-bold shrink-0">
                    Clear
                  </button>
                )}
              </div>
              <p className="text-center text-[11px] font-bold text-[#241a33]/40 mt-2">{filteredAssets.length} shown</p>

              {/* Autocomplete: top matches while typing. onMouseDown fires
                  before the input's blur, so a click actually lands. */}
              {searchFocused && stockQuery.trim() && filteredAssets.length > 0 && (
                <div className="absolute left-0 right-0 top-[calc(100%-1.25rem)] z-20 rounded-2xl bg-white shadow-[0_20px_50px_-20px_rgba(36,26,51,0.45)] overflow-hidden text-left">
                  {filteredAssets.slice(0, 6).map((a) => {
                    const hasFeed = !!predictionAssetForTicker(a.tokenSymbol)
                    const label = a.tokenName.replace(/\s*•\s*Robinhood Token$/i, '')
                    return (
                      <button
                        key={a.tokenSymbol}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          if (hasFeed) navigate(`/onchain/create?feed=${a.tokenSymbol}`)
                          else setStockQuery(a.tokenSymbol)
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#e7e1f8]/60 transition-colors"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: hasFeed ? `hsl(${hueForTicker(a.tokenSymbol)} 70% 45%)` : 'transparent', border: hasFeed ? undefined : '1px solid rgba(36,26,51,0.3)' }}
                        />
                        <span className="font-bold text-sm text-[#241a33] shrink-0">{a.tokenSymbol}</span>
                        <span className="text-xs text-[#241a33]/50 truncate flex-1">{label}</span>
                        <span className={hasFeed ? 'text-xs font-bold text-[#6A5AE0] shrink-0' : 'text-[11px] font-bold text-[#241a33]/35 shrink-0'}>
                          {hasFeed ? 'Create market →' : 'Not enabled'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {filteredAssets.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-2">
              {filteredAssets.map((a) => {
                const hasFeed = !!predictionAssetForTicker(a.tokenSymbol)
                const dot = (
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: hasFeed ? `hsl(${hueForTicker(a.tokenSymbol)} 70% 45%)` : 'transparent', border: hasFeed ? undefined : '1px solid rgba(36,26,51,0.3)' }}
                  />
                )
                const label = a.tokenName.replace(/\s*•\s*Robinhood Token$/i, '')

                // Every ticker with a reviewed production pool can actually
                // become a market -- send it straight to market creation,
                // prefilled, instead of an inert link. One without a pool yet
                // simply can't be created against, so it stays a plain (but
                // clearly-labelled, not just dead) pill instead of pretending
                // to be clickable.
                if (hasFeed) {
                  return (
                    <Link
                      key={a.tokenSymbol}
                      to={`/onchain/create?feed=${a.tokenSymbol}`}
                      title={`Create a market for ${label}`}
                      className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/70 text-sm text-[#241a33]/80 font-bold hover:-translate-y-0.5 hover:bg-white hover:text-[#241a33] hover:shadow-md transition-all"
                    >
                      {dot}
                      {a.tokenSymbol}
                    </Link>
                  )
                }
                return (
                  <span
                    key={a.tokenSymbol}
                    title={`${label} - no reviewed price source is enabled for Prediction Markets yet.`}
                    className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-dashed border-[#241a33]/20 text-sm text-[#241a33]/40 font-bold cursor-default"
                  >
                    {dot}
                    {a.tokenSymbol}
                  </span>
                )
              })}
            </div>
          ) : (
            <p className="text-center text-[#241a33]/40 text-sm font-bold py-8">
              {assets.data == null ? 'Loading the ticker list…' : `No stocks match "${stockQuery}".`}
            </p>
          )}
        </div>
      </section>

      {/* Final CTA -- dark poster island: "One question. Two sides." */}
      <section className="max-w-[1500px] mx-auto px-4 pt-6 pb-20">
        <div
          ref={ctaReveal.ref}
          className="relative overflow-hidden rounded-[2.5rem] bg-[#241b2f] border border-white/5 px-6 py-16 sm:py-20 text-center transition-all duration-700"
          style={{
            opacity: ctaReveal.visible ? 1 : 0,
            transform: ctaReveal.visible ? 'translateY(0)' : 'translateY(28px)',
          }}
        >
          <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[#6A5AE0]/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -right-24 w-96 h-96 rounded-full bg-[#ED8F3A]/20 blur-3xl" />
          <span className="pointer-events-none absolute left-[12%] top-[18%] text-[#B3A7FA] text-2xl" style={{ animation: 'sparkle-pop 2.6s ease-in-out infinite' }}>
            ✦
          </span>
          <span
            className="pointer-events-none absolute right-[14%] bottom-[20%] text-[#B3A7FA] text-lg"
            style={{ animation: 'sparkle-pop 2.6s ease-in-out infinite', animationDelay: '1.2s' }}
          >
            ✦
          </span>

          {/* poster tiles, desktop only */}
          <div
            className="hidden lg:block absolute left-[16%] top-[38%] -rotate-[12deg] rounded-2xl bg-[#8B7CF7] px-6 py-3.5 shadow-[0_16px_36px_-14px_rgba(106,90,224,0.8)] font-display font-bold text-2xl text-[#f7f1e3]"
            style={{ animation: 'mascot-float 6s ease-in-out infinite', animationDelay: '0.5s' }}
          >
            YES
          </div>
          <div
            className="hidden lg:block absolute right-[16%] top-[42%] rotate-[10deg] rounded-2xl bg-[#F2A65A] px-6 py-3.5 shadow-[0_16px_36px_-14px_rgba(237,143,58,0.8)] font-display font-bold text-2xl text-[#3b2416]"
            style={{ animation: 'mascot-float 6.8s ease-in-out infinite', animationDelay: '1.3s' }}
          >
            NO
          </div>

          <div className="relative max-w-xl mx-auto">
            <img
              src={`${import.meta.env.BASE_URL}brand/mascot-small.png`}
              alt=""
              className="w-20 sm:w-24 mx-auto mb-6"
              style={{ animation: 'mascot-float 5s ease-in-out infinite' }}
            />
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white/70 mb-5">
              <span className="text-[#B3A7FA]">✦</span>
              Three games. Your call.
            </p>
            <h2 className="font-display text-3xl sm:text-5xl font-bold tracking-tight mb-4">Ready to play your first game?</h2>
            <p className="text-white/50 text-sm sm:text-base mb-9 max-w-lg mx-auto">
              Browse Markets, Races and Arena without connecting. When you are ready, connect a supported wallet,
              enter the stake in USD or ETH, and review the exact native ETH amount before signing.
            </p>
            <div className="flex flex-wrap gap-4 justify-center items-center">
              <Link
                to="/onchain"
                className="inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] hover:brightness-110 text-white pl-7 pr-3 py-3 text-sm font-bold transition-all shadow-[0_14px_36px_-12px_rgba(106,90,224,0.8)]"
              >
                Prediction Markets
                <span className="w-8 h-8 rounded-full bg-white/20 grid place-items-center text-sm">↗</span>
              </Link>
              <Link
                to="/onchain/races"
                className="text-sm px-7 py-3.5 rounded-full border border-white/15 text-white/80 hover:text-white hover:border-white/40 font-bold transition-colors"
              >
                Asset Races
              </Link>
              <Link
                to="/onchain/arenas"
                className="text-sm px-7 py-3.5 rounded-full border border-white/15 text-white/80 hover:text-white hover:border-white/40 font-bold transition-colors"
              >
                Price Arena
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
