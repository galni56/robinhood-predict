import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatEther, formatUnits } from 'viem'
import {
  BETTING_WINDOW_BP,
  BP_DENOMINATOR,
  MarketStatusOnchain,
} from '@/chain/contracts'
import { ASSET_RACE_CATEGORY, ASSET_RACE_STATUS, type AssetRaceViewModel } from '@/chain/assetRaces'
import { assetRaceCatalog, priceSourceUrlForAssetId, priceSourceUrlForCatalogAsset, priceSourceUrlForSymbol } from '@/chain/assetRaceRegistry'
import { demoPools, isDemoMode } from '@/chain/demo'
import { CRYPTO_ASSETS_ENABLED } from '@/chain/features'
import { predictionModeForAssetId, predictionQuoteForAssetId, tickerForPredictionAssetId } from '@/chain/predictionMarketAssets'
import { PRICE_ARENA_CATEGORY, PRICE_ARENA_MAX_PARTICIPANTS, PRICE_ARENA_PHASE, arenaDurationLabel, type PriceArenaViewModel } from '@/chain/priceArena'
import { useAssetRaceClock } from '@/chain/useAssetRaceClock'
import { useAssetRaceLiveDisplay } from '@/chain/useAssetRaceLiveDisplay'
import { useAssetRaces } from '@/chain/useAssetRaces'
import { usePriceArenas } from '@/chain/usePriceArenas'
import { usePredictionMarkets } from '@/chain/usePredictionMarkets'
import { useTokenLogos } from '@/chain/robinhoodApi'
import { isActiveOnchainStatus } from '@/chain/gameSnapshots'
import { TokenLogo } from '@/components/TokenLogo'
import { PriceSourceLink } from '@/components/PriceSourceLink'
import { formatAssetPrice, formatCountdown } from '@/lib/format'

const GAME_GUIDES = [
  {
    eyebrow: 'YES / NO',
    title: 'Prediction Markets',
    summary: CRYPTO_ASSETS_ENABLED
      ? 'Call whether a stock, meme or crypto asset finishes above or below a target.'
      : 'Call whether a tokenized stock finishes above or below a target.',
    accent: '#6A5AE0',
    soft: '#eeeafd',
    image: 'brand/game-guides/prediction-markets.webp',
    href: '/onchain',
    cta: 'Explore markets',
    steps: [
      ['Choose the question', CRYPTO_ASSETS_ENABLED
        ? 'Open a market - or create one with a reviewed stock, meme or crypto asset, target price and deadline.'
        : 'Open a market - or create one with a reviewed stock, target price and deadline.'],
      ['Take YES or NO', 'Enter a stake in USD or ETH. Your wallet sends the exact amount as native ETH in one transaction.'],
      ['Bet before the cutoff', 'Earlier bets carry more pool-share weight. Betting closes before the final price deadline.'],
      ['Settle the pool', 'The last valid price before the deadline decides it. Both sides and two wallets are required; otherwise every stake is refundable. Winners recover principal and split the losing pool. The 2% profit fee is split equally between the market creator and Prophet.'],
    ],
  },
  {
    eyebrow: 'FASTEST MOVER',
    title: 'Asset Races',
    summary: 'Back the asset with the strongest percentage return.',
    accent: '#ED8F3A',
    soft: '#fff0df',
    image: 'brand/game-guides/asset-races.webp',
    href: '/onchain/races',
    cta: 'Explore races',
    steps: [
      ['Pick a race', CRYPTO_ASSETS_ENABLED
        ? 'Choose a stock, meme or crypto race. Community lobbies can assemble 2-6 approved assets before betting.'
        : 'Choose a stock or meme race. Community lobbies can assemble 2-6 approved assets before betting.'],
      ['Back one contender', 'During the betting window, choose one asset and stake in USD or ETH; top-ups stay on that asset.'],
      ['Watch T0 → T1', 'Every contender uses the same fixed start and finish snapshots. The highest percentage return wins - even if all returns are negative.'],
      ['Claim or refund', 'Backers of the winner recover principal and share the losing pools after the 2% profit fee. An exact top tie voids the race and makes stakes refundable.'],
    ],
  },
  {
    eyebrow: 'CLOSEST PRICE',
    title: 'Price Arena',
    summary: 'Forecast the exact price at the end of the round.',
    accent: '#7A9FF0',
    soft: '#E8F0FF',
    image: 'brand/game-guides/price-arena.webp',
    href: '/onchain/arenas',
    cta: 'Explore arenas',
    steps: [
      ['Enter the lobby', 'Submit one exact price and a USD or ETH stake. Forecasts stay hidden while entry is open.'],
      ['Refine your call', 'Change the prediction or add stake before the lobby closes. Each arena accepts up to 20 players.'],
      ['Follow the round', 'Predictions become visible when play starts. The fixed deadline price ranks everyone by absolute error.'],
      ['Closest half wins', 'The closest half recover principal and share the losing half’s pool after the 2% profit fee. If the arena cannot settle by rule, stakes are refundable.'],
    ],
  },
] as const

const FEATURES = [
  {
    tag: 'POOL TO POOL',
    color: '#8B7CF7',
    title: 'Players compete against players',
    body: 'There are no fixed bookmaker odds. Each game forms an onchain pool, and winners receive principal plus their rule-based share of the losing pool after the 2% protocol fee on that profit portion.',
    links: [],
  },
  {
    tag: 'USD ↔ ETH',
    color: '#F2A65A',
    title: 'Choose how you enter the amount',
    body: 'Type a convenient dollar amount or enter ETH directly. Every stake form shows the matching value from one shared ETH/USD quote before the wallet opens; the contract receives native ETH.',
    links: [],
  },
  {
    tag: 'CLEAR OUTCOMES',
    color: '#B3A7FA',
    title: 'Settle by rule or refund by rule',
    body: 'Each mode defines its price snapshot, eligibility and tie behavior in advance. If a game cannot settle under those rules, it reaches a refundable terminal state instead of substituting an arbitrary result.',
    links: [],
  },
  {
    tag: 'YOUR IDEA, ONCHAIN',
    color: '#7A9FF0',
    title: 'If the game does not exist, create it',
    body: 'Any wallet can create a YES/NO market, assemble an Asset Race or open a Price Arena from reviewed assets. Set the rules up front, then invite the community into the pool.',
    links: [
      { label: '+ Market', to: '/onchain/create', className: 'bg-[#6A5AE0] text-white hover:bg-[#5B49C7]' },
      { label: '+ Race', to: '/onchain/races/create', className: 'bg-[#ED8F3A] text-[#3b2416] hover:bg-[#F2A65A]' },
      { label: '+ Arena', to: '/onchain/arenas/create', className: 'bg-[#7A9FF0] text-[#152447] hover:bg-[#8EB1F8]' },
    ],
  },
] as const

const SUPPORTED_STOCKS = assetRaceCatalog.filter((asset) => (
  asset.category === 'STOCK' && asset.networks['robinhood-mainnet'].enabled
))

const SUPPORTED_MEMES = assetRaceCatalog.filter((asset) => (
  asset.category === 'MEME' && asset.networks['robinhood-mainnet'].enabled
))

const SUPPORTED_CRYPTO = assetRaceCatalog.filter((asset) => (
  asset.category === 'CRYPTO' && asset.networks['robinhood-mainnet'].enabled
))

const PROPHET_TOKEN_ADDRESS = '0x410f2bd350f3d88795cfc29b61ca664c30987efd'

function copyWithTextarea(value: string) {
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Copy failed')
}

function ProphetTokenContract() {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const resetTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (resetTimer.current != null) window.clearTimeout(resetTimer.current)
  }, [])

  async function copyAddress() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(PROPHET_TOKEN_ADDRESS)
      else copyWithTextarea(PROPHET_TOKEN_ADDRESS)
      setCopyState('copied')
    } catch {
      try {
        copyWithTextarea(PROPHET_TOKEN_ADDRESS)
        setCopyState('copied')
      } catch {
        setCopyState('error')
      }
    }

    if (resetTimer.current != null) window.clearTimeout(resetTimer.current)
    resetTimer.current = window.setTimeout(() => setCopyState('idle'), 2_000)
  }

  const buttonLabel = copyState === 'copied' ? 'Copied!' : copyState === 'error' ? 'Try again' : 'Copy'

  return (
    <div className="mt-6 max-w-[610px] rounded-2xl border border-[#6A5AE0]/20 bg-white/50 p-3 shadow-[0_14px_36px_-28px_rgba(36,26,51,0.8)] backdrop-blur-sm sm:flex sm:items-center sm:gap-3 sm:p-3.5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#6A5AE0] text-lg text-white shadow-[0_8px_20px_-10px_rgba(106,90,224,0.9)]" aria-hidden="true">
          ✦
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-[#6A5AE0]">$PROPHET contract</p>
            <span className="text-[10px] font-bold text-[#241a33]/45">Robinhood Chain</span>
          </div>
          <p className="mt-1 break-all font-mono text-[10px] font-semibold leading-relaxed text-[#241a33]/75 sm:truncate sm:text-xs">
            {PROPHET_TOKEN_ADDRESS}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={copyAddress}
        className="mt-3 inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#6A5AE0] px-4 py-2.5 text-xs font-extrabold text-white transition-all hover:-translate-y-0.5 hover:bg-[#5B49C7] active:translate-y-0 sm:mt-0 sm:w-auto"
        aria-label="Copy Prophet token contract address"
      >
        {copyState === 'copied' ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12 4 4L19 6" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
          </svg>
        )}
        <span aria-live="polite">{buttonLabel}</span>
      </button>
    </div>
  )
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
  accent: 'purple' | 'orange' | 'blue'
  loading: boolean
  empty: string
  children: ReactNode
}) {
  const accentClass = accent === 'orange'
    ? 'text-[#F2A65A] bg-[#F2A65A]/10'
    : accent === 'blue'
      ? 'text-[#B7CEFF] bg-[#7A9FF0]/10'
      : 'text-[#B3A7FA] bg-[#8B7CF7]/10'

  const skeletonAccent = accent === 'orange'
    ? 'bg-[#F2A65A]/15'
    : accent === 'blue'
      ? 'bg-[#7A9FF0]/15'
      : 'bg-[#8B7CF7]/15'

  return (
    <div className="flex min-h-[18rem] flex-col rounded-[2rem] border border-white/5 bg-[#21182c] p-5 sm:p-6 lg:min-h-[46rem]">
      <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-5">
        <div>
          <p className={`inline-flex rounded-full px-2.5 py-1 text-[0.65rem] font-extrabold tracking-[0.16em] ${accentClass}`}>{eyebrow}</p>
          <h3 className="mt-2 font-display text-2xl font-bold">{title}</h3>
        </div>
        <span className="grid h-9 min-w-9 place-items-center rounded-full bg-white/5 px-2 text-sm font-bold text-white/60">
          {loading ? '…' : count}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 py-4">
        {loading ? (
          <div aria-label={`Loading ${title}`} aria-busy="true" className="flex flex-1 flex-col gap-3">
            <div className="flex items-center gap-2 pb-1 text-xs font-medium text-white/40">
              <span className={`h-2 w-2 animate-pulse rounded-full ${skeletonAccent}`} />
              Searching for active games…
            </div>
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="min-h-36 animate-pulse rounded-2xl border border-white/5 bg-black/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className={`h-5 w-24 rounded-full ${skeletonAccent}`} />
                  <div className="h-6 w-16 rounded-full bg-white/5" />
                </div>
                <div className="mt-4 h-5 w-3/5 rounded bg-white/10" />
                <div className="mt-3 h-4 w-2/5 rounded bg-white/5" />
                <div className="mt-5 flex justify-between gap-4">
                  <div className="h-4 w-24 rounded bg-white/5" />
                  <div className={`h-5 w-20 rounded-full ${skeletonAccent}`} />
                </div>
              </div>
            ))}
          </div>
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
  const navigate = useNavigate()
  const inLobby = race.status === ASSET_RACE_STATUS.LOBBY
  const running = race.status === ASSET_RACE_STATUS.RUNNING
  const target = inLobby ? race.lobbyEndTime : running ? race.raceEndTime : race.bettingEndTime
  const phaseLabel = inLobby ? 'LOBBY OPEN' : running ? 'RACE LIVE' : 'BETTING OPEN'
  const actionLabel = inLobby ? 'Add an asset' : running ? 'Watch race' : 'Bet now'

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open ${race.title || `race #${race.id.toString()}`}`}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a, button')) return
        navigate(`/onchain/races/${race.id}`)
      }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          navigate(`/onchain/races/${race.id}`)
        }
      }}
      className="group block cursor-pointer rounded-2xl border border-white/5 bg-black/10 p-4 transition-all hover:-translate-y-0.5 hover:border-[#F2A65A]/40 hover:bg-[#F2A65A]/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold text-[#F2A65A]">{phaseLabel}</div>
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
      <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Asset price charts">
        {race.assets.map((asset) => (
          <PriceSourceLink
            key={asset.assetIndex}
            href={priceSourceUrlForAssetId(asset.assetId)}
            symbol={asset.symbol}
            tone="race"
            label={`${asset.symbol} chart`}
            className="bg-[#F2A65A]/10 px-2 py-1 text-[10px]"
          />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs">
        <span className="text-white/35">
          {inLobby ? `${race.candidateCount} / 6 assets` : `${compactEth(race.totalPool)} pool`}
        </span>
        <span className="shrink-0 font-bold text-[#F2A65A]">{actionLabel} →</span>
      </div>
    </div>
  )
}

function ArenaPreviewCard({ arena, nowMs }: { arena: PriceArenaViewModel; nowMs: number }) {
  const navigate = useNavigate()
  const inLobby = arena.phase === PRICE_ARENA_PHASE.LOBBY
  const settling = arena.phase === PRICE_ARENA_PHASE.RUNNING && Number(arena.deadline) * 1_000 <= nowMs
  const target = inLobby ? arena.startsAt : arena.deadline
  const phaseLabel = inLobby
    ? `LOBBY · ${timeLeft(target, nowMs)}`
    : settling
      ? 'SETTLING'
      : `LIVE · ${timeLeft(target, nowMs)}`
  const actionLabel = inLobby ? 'Enter arena' : settling ? 'View arena' : 'Watch arena'
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open ${arena.title}`}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a, button')) return
        navigate(`/onchain/arenas/${arena.id}`)
      }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          navigate(`/onchain/arenas/${arena.id}`)
        }
      }}
      className="group block cursor-pointer rounded-2xl border border-white/5 bg-black/10 p-4 transition-all hover:-translate-y-0.5 hover:border-[#B7CEFF]/40 hover:bg-[#7A9FF0]/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <TokenLogo ticker={arena.asset?.symbol} className="h-9 w-9 rounded-xl" />
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#B7CEFF]">{arena.asset?.symbol ?? 'ARENA'} · {arenaDurationLabel(arena.duration)}</div>
            <h4 className="mt-1 truncate font-display text-lg font-bold">{arena.title}</h4>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-[#7A9FF0]/10 px-2.5 py-1 text-xs font-bold text-[#B7CEFF]">
          {phaseLabel}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs">
        <span className="text-white/35">{arena.participantCount} / {PRICE_ARENA_MAX_PARTICIPANTS} players · {compactEth(arena.totalPool)} pool</span>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <PriceSourceLink href={arena.asset?.priceUrl} symbol={arena.asset?.symbol} tone="arena" className="bg-[#7A9FF0]/10 px-2 py-1" />
          <span className="font-bold text-[#B7CEFF]">{actionLabel} →</span>
        </div>
      </div>
    </div>
  )
}

export function OnchainLandingPage() {
  const navigate = useNavigate()
  const { markets, isLoading: marketsLoading, error: marketsError } = usePredictionMarkets()

  const live = useAssetRaceLiveDisplay({ enabled: true })
  const { races, isPreview: racesPreview, isLoading: racesLoading, error: racesError } = useAssetRaces()
  const { arenas, isLoading: arenasLoading, error: arenasError } = usePriceArenas()
  const clockMs = useAssetRaceClock()
  const [initialNowMs] = useState(() => Date.now())
  const nowMs = clockMs || initialNowMs
  const nowSeconds = BigInt(Math.floor(nowMs / 1_000))

  const activeMarkets = markets
    .filter((market) => market.status === MarketStatusOnchain.Open
      && (CRYPTO_ASSETS_ENABLED || predictionModeForAssetId(market.assetId) === 'stocks'))
    // Newest first -- a higher id was created later, since ids increment
    // sequentially. Otherwise the preview here always shows the same oldest
    // handful forever as more get created.
    .sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0))

  // The contract status is authoritative. Local countdowns are display-only:
  // removing cards from them made valid games vanish before keeper transitions.
  const activeRaces = (racesPreview ? [] : races).filter((race) => (
    isActiveOnchainStatus(race.status, [ASSET_RACE_STATUS.RESOLVED, ASSET_RACE_STATUS.CANCELLED, ASSET_RACE_STATUS.VOID])
    && (CRYPTO_ASSETS_ENABLED || race.category !== ASSET_RACE_CATEGORY.CRYPTO)
  ))
  const activeArenas = arenas.filter((arena) => (
    isActiveOnchainStatus(arena.phase, [PRICE_ARENA_PHASE.RESOLVED, PRICE_ARENA_PHASE.CANCELLED])
    && (CRYPTO_ASSETS_ENABLED || arena.category !== PRICE_ARENA_CATEGORY.CRYPTO)
  ))

  const logos = useTokenLogos()
  const stepsReveal = useRevealOnScroll<HTMLDivElement>()
  const featuresReveal = useRevealOnScroll<HTMLDivElement>()

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
                    className="inline-flex min-w-[190px] items-center justify-between gap-3 rounded-full bg-[#6A5AE0] py-2.5 pl-6 pr-2.5 text-sm font-bold text-white shadow-[0_12px_28px_-16px_rgba(106,90,224,0.9)] transition-all hover:-translate-y-0.5 hover:bg-[#5B49C7]"
                  >
                    Prediction Markets
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20 text-sm text-white">↗</span>
                  </Link>
                  <Link
                    to="/onchain/races"
                    className="inline-flex min-w-[190px] items-center justify-between gap-3 rounded-full bg-[#ED8F3A] py-2.5 pl-6 pr-2.5 text-sm font-bold text-[#3b2416] shadow-[0_12px_28px_-16px_rgba(237,143,58,0.9)] transition-all hover:-translate-y-0.5 hover:bg-[#F2A65A]"
                  >
                    Asset Races
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-[#3b2416]/15 text-sm">↗</span>
                  </Link>
                  <Link
                    to="/onchain/arenas"
                    className="inline-flex min-w-[190px] items-center justify-between gap-3 rounded-full bg-[#7A9FF0] py-2.5 pl-6 pr-2.5 text-sm font-bold text-[#152447] shadow-[0_12px_28px_-16px_rgba(122,159,240,0.9)] transition-all hover:-translate-y-0.5 hover:bg-[#8EB1F8]"
                  >
                    Price Arena
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-[#152447]/15 text-sm">↗</span>
                  </Link>
                </div>

                <ProphetTokenContract />

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
                  Race <span className="grid h-8 w-8 place-items-center rounded-full bg-[#ED8F3A] text-[#3b2416]">↗</span>
                </Link>
                <Link to="/onchain/arenas/create" className="inline-flex min-w-40 items-center justify-between gap-3 rounded-full bg-[#f7f1e3] py-2.5 pl-5 pr-2.5 text-sm font-extrabold text-[#241a33] transition-all hover:-translate-y-0.5 hover:bg-white">
                  Arena <span className="grid h-8 w-8 place-items-center rounded-full bg-[#7A9FF0] text-[#152447]">↗</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* A stable cross-product board driven by authoritative onchain phases. */}
      <section className="mx-auto max-w-[1500px] px-4 pb-10 pt-14">
        <p className="mb-2 text-sm font-bold text-[#B3A7FA]">Active now</p>
        <h2 className="mb-8 font-display text-3xl font-bold tracking-tight sm:text-4xl">Choose your game.</h2>

        <div className="grid gap-5 lg:grid-cols-3">
          <GameColumn
            eyebrow="YES / NO"
            title="Prediction Markets"
            count={activeMarkets.length}
            href="/onchain"
            accent="purple"
            loading={(marketsLoading || !!marketsError) && activeMarkets.length === 0}
            empty="No Prediction Markets are active right now."
          >
            {activeMarkets.slice(0, 3).map((market) => {
              const ticker = tickerForPredictionAssetId(market.assetId)
              const quoteSymbol = predictionQuoteForAssetId(market.assetId)
              const price = ticker ? live.assets[ticker] : undefined
              const targetUsd = Number(formatUnits(market.targetPrice, market.priceDecimals))
              const currentUsd = price && !price.stale ? Number(formatUnits(BigInt(price.priceRaw), price.decimals)) : null
              const pools = isDemoMode() ? demoPools(market.id) : { poolYes: market.poolYes, poolNo: market.poolNo }
              const totalPool = pools.poolYes + pools.poolNo
              const bettingEnd = market.createdAt + ((market.deadline - market.createdAt) * BETTING_WINDOW_BP) / BP_DENOMINATOR
              const acceptingBets = nowSeconds < bettingEnd

              return (
                <div
                  key={market.id.toString()}
                  role="link"
                  tabIndex={0}
                  aria-label={`Open ${ticker ?? 'prediction'} market #${market.id.toString()}`}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest('a, button')) return
                    navigate(`/onchain/${market.id}`)
                  }}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault()
                      navigate(`/onchain/${market.id}`)
                    }
                  }}
                  className="group block cursor-pointer rounded-2xl border border-white/5 bg-black/10 p-4 transition-all hover:-translate-y-0.5 hover:border-[#8B7CF7]/40 hover:bg-[#8B7CF7]/10"
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
                      {acceptingBets ? timeLeft(bettingEnd, nowMs) : `SETTLES · ${timeLeft(market.deadline, nowMs)}`}
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-lg font-bold leading-snug transition-colors group-hover:text-[#B3A7FA]">
                    Will {ticker ?? 'it'} finish at or above {formatAssetPrice(targetUsd, quoteSymbol)}?
                  </h3>
                  <div className="mt-4 flex items-center justify-between gap-3 text-xs">
                    <span className="text-white/35">{compactEth(totalPool)} pool{currentUsd != null ? ` · now ${formatAssetPrice(currentUsd, quoteSymbol)}` : ''}</span>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <PriceSourceLink href={priceSourceUrlForSymbol(ticker)} symbol={ticker} tone="market" className="bg-[#8B7CF7]/10 px-2 py-1" />
                      <span className="font-bold text-[#B3A7FA]">{acceptingBets ? 'Place a bet' : 'View market'} →</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </GameColumn>

          <GameColumn
            eyebrow="FASTEST MOVER"
            title="Asset Races"
            count={activeRaces.length}
            href="/onchain/races"
            accent="orange"
            loading={(racesLoading || !!racesError) && activeRaces.length === 0}
            empty="No Asset Races are active right now."
          >
            {activeRaces.slice(0, 3).map((race) => (
              <RacePreviewCard key={race.id.toString()} race={race} nowMs={nowMs} />
            ))}
          </GameColumn>

          <GameColumn
            eyebrow="CLOSEST PRICE"
            title="Price Arena"
            count={activeArenas.length}
            href="/onchain/arenas"
            accent="blue"
            loading={(arenasLoading || !!arenasError) && activeArenas.length === 0}
            empty="No Price Arenas are active right now."
          >
            {activeArenas.slice(0, 3).map((arena) => (
              <ArenaPreviewCard key={arena.id.toString()} arena={arena} nowMs={nowMs} />
            ))}
          </GameColumn>
        </div>

        <p className="pt-6 text-xs font-medium text-white/30">Native ETH wagers · One wallet transaction · Onchain settlement</p>
      </section>

      {/* Three product flows in one glance. */}
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

          <div className="mb-10 max-w-2xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/60 px-3.5 py-1.5 text-xs font-bold text-[#241a33]/70">
              <span className="text-[#8B7CF7]">✦</span>
              Three games · one wallet flow
            </p>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">How each game works</h2>
            <p className="mt-3 text-sm font-medium leading-relaxed text-[#241a33]/55 sm:text-base">
              Choose the format, make your call, send native ETH and let the published rules settle the result.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {GAME_GUIDES.map((guide, guideIndex) => (
              <article
                key={guide.title}
                className="group flex flex-col overflow-hidden rounded-[2rem] border border-[#241a33]/5 bg-white/65 transition-all duration-500 hover:-translate-y-1 hover:bg-white/85 hover:shadow-[0_22px_50px_-28px_rgba(36,26,51,0.35)]"
                style={{
                  opacity: stepsReveal.visible ? 1 : 0,
                  transform: stepsReveal.visible ? 'translateY(0)' : 'translateY(28px)',
                  transitionDelay: `${guideIndex * 110}ms`,
                }}
              >
                <div className="h-2" style={{ background: guide.accent }} />
                <div className="relative min-h-48 overflow-hidden border-b border-[#241a33]/5 p-6 sm:p-7" style={{ background: guide.soft }}>
                  <div className="relative z-10 max-w-[58%]">
                    <p className="text-[0.68rem] font-extrabold tracking-[0.18em]" style={{ color: guide.accent }}>{guide.eyebrow}</p>
                    <h3 className="mt-2 font-display text-2xl font-bold leading-tight">{guide.title}</h3>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-[#241a33]/55">{guide.summary}</p>
                  </div>
                  <div className="pointer-events-none absolute -bottom-14 -right-12 h-52 w-52 rounded-full bg-white/55" />
                  <img
                    src={`${import.meta.env.BASE_URL}${guide.image}`}
                    alt=""
                    width={500}
                    height={500}
                    className="pointer-events-none absolute -bottom-5 -right-5 h-44 w-44 object-contain transition-transform duration-500 group-hover:-translate-y-1 group-hover:rotate-2 sm:h-48 sm:w-48"
                  />
                </div>

                <div className="flex flex-1 flex-col p-6 sm:p-7">

                  <ol className="flex flex-1 flex-col gap-5">
                    {guide.steps.map(([title, body], stepIndex) => (
                      <li key={title} className="grid grid-cols-[2rem_1fr] gap-3">
                        <span
                          className="grid h-8 w-8 place-items-center rounded-xl font-display text-sm font-bold"
                          style={{ background: guide.soft, color: guide.accent }}
                        >
                          {stepIndex + 1}
                        </span>
                        <div>
                          <h4 className="font-display text-sm font-bold leading-snug">{title}</h4>
                          <p className="mt-1 text-xs leading-relaxed text-[#241a33]/55">{body}</p>
                        </div>
                      </li>
                    ))}
                  </ol>

                  <Link
                    to={guide.href}
                    className="mt-7 inline-flex items-center justify-between rounded-full py-2.5 pl-5 pr-2.5 text-sm font-bold text-white transition-all hover:brightness-110"
                    style={{ background: guide.accent }}
                  >
                    {guide.cta}
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20">→</span>
                  </Link>
                </div>
              </article>
            ))}
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
            const tile = i === 3
              ? { background: 'linear-gradient(105deg, #6A5AE0, #ED8F3A 52%, #7A9FF0)', color: '#fff', shadow: '0 14px 30px -14px rgba(122,159,240,0.8)' }
              : i % 2 === 0
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
                {f.links.length > 0 && (
                  <div className="relative mt-6 flex flex-wrap gap-2.5">
                    {f.links.map((link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        className={`rounded-full px-4 py-2 text-xs font-extrabold transition-all hover:-translate-y-0.5 ${link.className}`}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* The exact production asset universe, sourced from the same reviewed
          registry used by Races and Arena. This is intentionally a curated
          lineup rather than the chain's full token catalog. */}
      <section className="max-w-[1500px] mx-auto px-4 py-14">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-[#e7e1f8] px-6 py-12 text-[#241a33] sm:px-12 sm:py-14">
          <span className="pointer-events-none absolute left-[5%] top-[10%] text-[#7C5CF0] text-2xl" style={{ animation: 'sparkle-pop 2.6s ease-in-out infinite' }}>
            ✦
          </span>
          <span
            className="pointer-events-none absolute right-[4%] bottom-[12%] text-[#7C5CF0] text-lg"
            style={{ animation: 'sparkle-pop 2.6s ease-in-out infinite', animationDelay: '1.2s' }}
          >
            ✦
          </span>

          <div className="relative mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3.5 py-1.5 text-xs font-bold text-[#241a33]/70 mb-4">
              <span className="text-[#8B7CF7]">✦</span>
              Curated asset universe
            </p>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">Not every asset makes the grid.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm font-medium leading-relaxed text-[#241a33]/65 sm:text-base">
              Prophet keeps the lineup focused. Every supported asset needs a clear identity, an approved onchain
              price source and reviewed trading depth so games can start and settle against dependable snapshots.
            </p>
          </div>

          <div className="relative mt-10 grid gap-5 lg:grid-cols-3">
            {[
              {
                eyebrow: 'TOKENIZED STOCKS',
                title: 'Market leaders',
                description: 'Widely followed companies selected for recognizable markets, active trading and reviewed onchain pricing.',
                assets: SUPPORTED_STOCKS,
                accent: '#6A5AE0',
                soft: '#EEEAFD',
                ctaText: '#FFFFFF',
                href: '/onchain/create',
                cta: 'Create a stock market',
              },
              {
                eyebrow: 'MEME ASSETS',
                title: 'Culture with a price feed',
                description: 'Community assets admitted only after identity, source and executable trading-depth checks.',
                assets: SUPPORTED_MEMES,
                accent: '#ED8F3A',
                soft: '#FFF0DF',
                ctaText: '#3B2416',
                href: '/onchain?mode=memes',
                cta: 'Explore meme markets',
              },
              ...(CRYPTO_ASSETS_ENABLED ? [{
                eyebrow: 'CRYPTO ASSETS',
                title: 'Liquid crypto majors',
                description: 'Bitcoin and Ethereum priced from reviewed liquid USDG pools directly on Robinhood Chain.',
                assets: SUPPORTED_CRYPTO,
                accent: '#3B82F6',
                soft: '#E8F0FF',
                ctaText: '#FFFFFF',
                href: '/onchain?mode=crypto',
                cta: 'Explore crypto markets',
              }] : []),
            ].map((group) => (
              <div key={group.eyebrow} className="flex flex-col rounded-[2rem] border border-[#241a33]/10 bg-white/60 p-5 shadow-[0_20px_45px_-35px_rgba(36,26,51,0.45)] sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[0.68rem] font-extrabold tracking-[0.18em]" style={{ color: group.accent }}>{group.eyebrow}</p>
                    <h3 className="mt-2 font-display text-2xl font-bold sm:text-3xl">{group.title}</h3>
                  </div>
                  <span className="grid h-10 min-w-10 place-items-center rounded-full px-2 text-sm font-extrabold" style={{ color: group.accent, backgroundColor: group.soft }}>
                    {group.assets.length}
                  </span>
                </div>
                <p className="mt-3 min-h-12 text-sm leading-relaxed text-[#241a33]/60">{group.description}</p>

                <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                  {group.assets.map((asset) => {
                    const priceUrl = priceSourceUrlForCatalogAsset(asset)
                    if (!priceUrl) return null
                    return (
                      <a
                        key={asset.assetId}
                        href={priceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`View ${asset.symbol} price from the exact settlement pool on DEX Screener (opens in a new tab)`}
                        className="group/asset flex min-w-0 items-center gap-2.5 rounded-2xl border border-[#241a33]/[0.07] bg-white/75 p-2.5 transition-all hover:-translate-y-0.5 hover:border-[#241a33]/20 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{ outlineColor: group.accent }}
                        title={`View ${asset.symbol} exact pool chart`}
                      >
                        <TokenLogo ticker={asset.symbol} className="h-9 w-9 shrink-0 rounded-xl text-sm" />
                        <div className="min-w-0 flex-1">
                          <div className={`truncate font-extrabold tracking-tight ${asset.symbol.length > 8 ? 'text-[0.62rem]' : 'text-xs'}`}>{asset.symbol}</div>
                          <div className="truncate text-[0.65rem] font-medium text-[#241a33]/45">{asset.displayName}</div>
                          <div className="mt-0.5 text-[0.6rem] font-extrabold" style={{ color: group.accent }}>View price ↗</div>
                        </div>
                      </a>
                    )
                  })}
                </div>

                <Link
                  to={group.href}
                  className="mt-6 inline-flex w-fit items-center gap-2 rounded-full px-4 py-2.5 text-xs font-extrabold transition-all hover:-translate-y-0.5 hover:brightness-105"
                  style={{ backgroundColor: group.accent, color: group.ctaText }}
                >
                  {group.cta}
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            ))}
          </div>

          <div className="relative mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs font-bold text-[#241a33]/50">
            {['Verified identity', 'Approved price source', 'Reviewed trading depth'].map((label) => (
              <span key={label} className="inline-flex items-center gap-2">
                <span className="grid h-4 w-4 place-items-center rounded-full bg-[#6A5AE0] text-[0.6rem] text-white">✓</span>
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

    </div>
  )
}
