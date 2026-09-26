import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatEther, formatUnits } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import {
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_CONFIGURED,
  predictionMarketAbi,
  BETTING_WINDOW_BP,
  BP_DENOMINATOR,
  MarketStatusOnchain,
} from '@/chain/contracts'
import { ASSET_RACE_ORIGIN, ASSET_RACE_STATUS, type AssetRaceViewModel } from '@/chain/assetRaces'
import { demoPools, isDemoMode } from '@/chain/demo'
import { predictionAssetForTicker, tickerForPredictionAssetId } from '@/chain/predictionMarketAssets'
import { PRICE_ARENA_MAX_PARTICIPANTS, PRICE_ARENA_PHASE, arenaDurationLabel, type PriceArenaViewModel } from '@/chain/priceArena'
import { useAssetRaceClock } from '@/chain/useAssetRaceClock'
import { useAssetRaceLiveDisplay } from '@/chain/useAssetRaceLiveDisplay'
import { useAssetRaces } from '@/chain/useAssetRaces'
import { usePriceArenas } from '@/chain/usePriceArenas'
import { useRobinhoodAssets, useTokenLogos } from '@/chain/robinhoodApi'
import { TokenLogo } from '@/components/TokenLogo'
import { formatCountdown, formatUsd } from '@/lib/format'

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

function compactEth(value: bigint) {
  const amount = Number(formatEther(value))
  if (amount === 0) return '0 ETH'
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} ETH`
}

function timeLeft(target: bigint, nowMs: number) {
  const remaining = Number(target) * 1_000 - nowMs
  return remaining > 0 ? formatCountdown(remaining) : 'closed'
}

function GameColumn({
  eyebrow,
  title,
  count,
  href,
  accent,
  loading,
  empty,
  children,
}: {
  eyebrow: string
  title: string
  count: number
  href: string
  accent: 'purple' | 'orange' | 'cream'
  loading: boolean
  empty: string
  children: ReactNode
}) {
  const accentClass = accent === 'orange'
    ? 'text-[#F2A65A] bg-[#F2A65A]/10'
    : accent === 'cream'
      ? 'text-[#f7f1e3] bg-[#f7f1e3]/10'
      : 'text-[#B3A7FA] bg-[#8B7CF7]/10'

  return (
    <div className="flex min-h-[18rem] flex-col rounded-[2rem] border border-white/5 bg-[#21182c] p-5 sm:p-6 lg:min-h-[28rem]">
      <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-5">
        <div>
          <p className={`inline-flex rounded-full px-2.5 py-1 text-[0.65rem] font-extrabold tracking-[0.16em] ${accentClass}`}>{eyebrow}</p>
          <h3 className="mt-2 font-display text-2xl font-bold">{title}</h3>
        </div>
        <span className="grid h-9 min-w-9 place-items-center rounded-full bg-white/5 px-2 text-sm font-bold text-white/60">{count}</span>
      </div>

      <div className="flex flex-1 flex-col gap-3 py-4">
        {loading && count === 0 ? (
          <div className="grid flex-1 place-items-center rounded-2xl border border-dashed border-white/10 text-sm text-white/35">Loading open games…</div>
        ) : count === 0 ? (
          <div className="grid flex-1 place-items-center rounded-2xl border border-dashed border-white/10 px-6 text-center text-sm leading-relaxed text-white/35">{empty}</div>
        ) : children}
      </div>

      <Link to={href} className="group flex items-center justify-between border-t border-white/5 pt-4 text-sm font-bold text-white/55 transition-colors hover:text-white">
        View all
        <span className="transition-transform group-hover:translate-x-1">→</span>
      </Link>
    </div>
  )
}

function RacePreviewCard({ race, nowMs }: { race: AssetRaceViewModel; nowMs: number }) {
  const inLobby = race.status === ASSET_RACE_STATUS.LOBBY
  const target = inLobby ? race.lobbyEndTime : race.bettingEndTime

  return (
    <Link
      to={`/onchain/races/${race.id}`}
      className="group block rounded-2xl border border-white/5 bg-black/10 p-4 transition-all hover:-translate-y-0.5 hover:border-[#F2A65A]/40 hover:bg-[#F2A65A]/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold text-[#F2A65A]">{inLobby ? 'LOBBY OPEN' : 'BETTING OPEN'}</div>
          <h4 className="mt-1 truncate font-display text-lg font-bold">{race.title || `Asset Race #${race.id}`}</h4>
        </div>
        <span className="shrink-0 rounded-full bg-[#F2A65A]/10 px-2.5 py-1 text-xs font-bold text-[#F2A65A]">{timeLeft(target, nowMs)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {race.assets.slice(0, 5).map((asset) => (
          <span key={asset.assetIndex} className="inline-flex items-center gap-1 rounded-full bg-white/5 py-1 pl-1 pr-2 text-xs font-bold text-white/65">
            <TokenLogo ticker={asset.symbol} className="h-5 w-5 rounded-md" />
            {asset.symbol}
          </span>
        ))}
        {race.assets.length > 5 && <span className="px-1 py-1 text-xs text-white/35">+{race.assets.length - 5}</span>}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs">
        <span className="text-white/35">
          {inLobby ? `${race.candidateCount} / 6 assets` : `${compactEth(race.totalPool)} pool`}
        </span>
        <span className="shrink-0 font-bold text-[#F2A65A]">{inLobby ? 'Add an asset' : 'Bet now'} →</span>
      </div>
    </Link>
  )
}

function ArenaPreviewCard({ arena, nowMs }: { arena: PriceArenaViewModel; nowMs: number }) {
  return (
    <Link
      to={`/onchain/arenas/${arena.id}`}
      className="group block rounded-2xl border border-white/5 bg-black/10 p-4 transition-all hover:-translate-y-0.5 hover:border-[#f7f1e3]/30 hover:bg-white/5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <TokenLogo ticker={arena.asset?.symbol} className="h-9 w-9 rounded-xl" />
          <div className="min-w-0">
            <div className="text-xs font-bold text-white/40">{arena.asset?.symbol ?? 'ARENA'} · {arenaDurationLabel(arena.duration)}</div>
            <h4 className="mt-1 truncate font-display text-lg font-bold">{arena.title}</h4>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-xs font-bold text-white/65">{timeLeft(arena.startsAt, nowMs)}</span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs">
        <span className="text-white/35">{arena.participantCount} / {PRICE_ARENA_MAX_PARTICIPANTS} players · {compactEth(arena.totalPool)} pool</span>
        <span className="shrink-0 font-bold text-[#f7f1e3]">Enter arena →</span>
      </div>
    </Link>
  )
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
  const { races, isPreview: racesPreview, isLoading: racesLoading } = useAssetRaces()
  const { arenas, isLoading: arenasLoading } = usePriceArenas()
  const clockMs = useAssetRaceClock()
  const [initialNowMs] = useState(() => Date.now())
  const nowMs = clockMs || initialNowMs
  const nowSeconds = BigInt(Math.floor(nowMs / 1_000))

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

  const joinableMarkets = openMarkets.filter((market) => {
    const bettingEnd = market.createdAt + ((market.deadline - market.createdAt) * BETTING_WINDOW_BP) / BP_DENOMINATOR
    return nowSeconds < bettingEnd
  })
  const joinableRaces = (racesPreview ? [] : races).filter((race) => (
    (race.status === ASSET_RACE_STATUS.LOBBY
      && race.origin === ASSET_RACE_ORIGIN.COMMUNITY
      && race.candidateCount < 6
      && nowSeconds < race.lobbyEndTime)
    || (race.status === ASSET_RACE_STATUS.BETTING
      && nowSeconds >= race.bettingStartTime
      && nowSeconds < race.bettingEndTime)
  ))
  const joinableArenas = arenas.filter((arena) => (
    arena.phase === PRICE_ARENA_PHASE.LOBBY
    && nowSeconds < arena.startsAt
    && arena.participantCount < PRICE_ARENA_MAX_PARTICIPANTS
  ))

  const assets = useRobinhoodAssets()
  const logos = useTokenLogos()
  const [stockQuery, setStockQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const stepsReveal = useRevealOnScroll<HTMLDivElement>()
  const featuresReveal = useRevealOnScroll<HTMLDivElement>()
  const ctaReveal = useRevealOnScroll<HTMLDivElement>()
  const navigate = useNavigate()
  const filteredAssets = (assets.data ?? []).filter((a) => {
    const q = stockQuery.trim().toLowerCase()
    if (!q) return true
    return a.tokenSymbol.toLowerCase().includes(q) || a.tokenName.toLowerCase().includes(q)
  })

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

          <div className="relative mt-5 overflow-hidden rounded-[2rem] border border-[#B3A7FA]/30 bg-gradient-to-br from-[#6A5AE0] via-[#5B49C7] to-[#322451] px-6 py-7 shadow-[0_24px_60px_-35px_rgba(139,124,247,0.95)] sm:px-9 sm:py-9">
            <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[#F2A65A]/20 blur-3xl" />
            <div className="relative grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="max-w-2xl">
                <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-white/65">✦ Create onchain</p>
                <h2 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">Don’t just play. Create the game.</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/70 sm:text-base">
                  Any wallet can ask a YES / NO question, assemble an Asset Race, or launch a Price Arena for the community.
                </p>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <Link to="/onchain/create" className="inline-flex min-w-40 items-center justify-between gap-3 rounded-full bg-[#f7f1e3] py-2.5 pl-5 pr-2.5 text-sm font-extrabold text-[#241a33] transition-all hover:-translate-y-0.5 hover:bg-white">
                  Market <span className="grid h-8 w-8 place-items-center rounded-full bg-[#8B7CF7] text-white">↗</span>
                </Link>
                <Link to="/onchain/races/create" className="inline-flex min-w-40 items-center justify-between gap-3 rounded-full bg-[#f7f1e3] py-2.5 pl-5 pr-2.5 text-sm font-extrabold text-[#241a33] transition-all hover:-translate-y-0.5 hover:bg-white">
                  Race <span className="grid h-8 w-8 place-items-center rounded-full bg-[#8B7CF7] text-white">↗</span>
                </Link>
                <Link to="/onchain/arenas/create" className="inline-flex min-w-40 items-center justify-between gap-3 rounded-full bg-[#f7f1e3] py-2.5 pl-5 pr-2.5 text-sm font-extrabold text-[#241a33] transition-all hover:-translate-y-0.5 hover:bg-white">
                  Arena <span className="grid h-8 w-8 place-items-center rounded-full bg-[#8B7CF7] text-white">↗</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* A cross-product board containing only games that still accept entry. */}
      <section className="mx-auto max-w-[1500px] px-4 pb-10 pt-14">
        <p className="mb-2 text-sm font-bold text-[#B3A7FA]">Open now</p>
        <div className="mb-8 max-w-2xl">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Choose your game.</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/45 sm:text-base">
            Only games you can still join appear here. Running and finished rounds move to their dedicated pages.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <GameColumn
            eyebrow="YES / NO"
            title="Prediction Markets"
            count={joinableMarkets.length}
            href="/onchain"
            accent="purple"
            loading={marketCount.isLoading || (count > 0 && markets.isLoading)}
            empty="No prediction markets are accepting bets right now."
          >
            {joinableMarkets.slice(0, 3).map((market) => {
              const ticker = tickerForPredictionAssetId(market.assetId)
              const price = ticker ? live.assets[ticker] : undefined
              const targetUsd = Number(formatUnits(market.targetPrice, market.priceDecimals))
              const currentUsd = price && !price.stale ? Number(formatUnits(BigInt(price.priceRaw), price.decimals)) : null
              const pools = isDemoMode() ? demoPools(market.id) : { poolYes: market.poolYes, poolNo: market.poolNo }
              const totalPool = pools.poolYes + pools.poolNo
              const bettingEnd = market.createdAt + ((market.deadline - market.createdAt) * BETTING_WINDOW_BP) / BP_DENOMINATOR

              return (
                <Link
                  key={market.id.toString()}
                  to={`/onchain/${market.id}`}
                  className="group block rounded-2xl border border-white/5 bg-black/10 p-4 transition-all hover:-translate-y-0.5 hover:border-[#8B7CF7]/40 hover:bg-[#8B7CF7]/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <TokenLogo ticker={ticker} logoUrl={ticker ? logos.get(ticker) : undefined} className="h-9 w-9 rounded-xl text-base" />
                      <div className="min-w-0">
                        <div className="font-bold">{ticker ?? 'Market'}</div>
                        <div className="truncate text-xs text-white/35">{formatDeadlineUtc(market.deadline)}</div>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#8B7CF7]/15 px-2.5 py-1 text-xs font-bold text-[#B3A7FA]">
                      {timeLeft(bettingEnd, nowMs)}
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-lg font-bold leading-snug transition-colors group-hover:text-[#B3A7FA]">
                    Will {ticker ?? 'it'} finish at or above {formatUsd(targetUsd)}?
                  </h3>
                  <div className="mt-4 flex items-center justify-between gap-3 text-xs">
                    <span className="text-white/35">{compactEth(totalPool)} pool{currentUsd != null ? ` · now ${formatUsd(currentUsd)}` : ''}</span>
                    <span className="shrink-0 font-bold text-[#B3A7FA]">Place a bet →</span>
                  </div>
                </Link>
              )
            })}
          </GameColumn>

          <GameColumn
            eyebrow="FASTEST MOVER"
            title="Asset Races"
            count={joinableRaces.length}
            href="/onchain/races"
            accent="orange"
            loading={racesLoading}
            empty="No Asset Races can be joined right now."
          >
            {joinableRaces.slice(0, 3).map((race) => (
              <RacePreviewCard key={race.id.toString()} race={race} nowMs={nowMs} />
            ))}
          </GameColumn>

          <GameColumn
            eyebrow="CLOSEST PRICE"
            title="Price Arena"
            count={joinableArenas.length}
            href="/onchain/arenas"
            accent="cream"
            loading={arenasLoading}
            empty="No Price Arenas are accepting players right now."
          >
            {joinableArenas.slice(0, 3).map((arena) => (
              <ArenaPreviewCard key={arena.id.toString()} arena={arena} nowMs={nowMs} />
            ))}
          </GameColumn>
        </div>

        <p className="pt-6 text-xs font-medium text-white/30">Native ETH wagers · One wallet transaction · Onchain settlement</p>
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
