import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ASSET_RACE_CATEGORY, ASSET_RACE_STATUS, type AssetRaceViewModel } from '@/chain/assetRaces'
import { assetRaceCatalog, priceSourceUrlForAssetId, priceSourceUrlForCatalogAsset } from '@/chain/assetRaceRegistry'
import { CRYPTO_ASSETS_ENABLED } from '@/chain/features'
import { PRICE_ARENA_CATEGORY, PRICE_ARENA_MAX_PARTICIPANTS, PRICE_ARENA_PHASE, arenaDurationLabel, arenaPhase, type PriceArenaWithPhase } from '@/chain/priceArena'
import { useAssetRaceClock } from '@/chain/useAssetRaceClock'
import { useAssetRaces } from '@/chain/useAssetRaces'
import { usePriceArenas } from '@/chain/usePriceArenas'
import { TokenLogo } from '@/components/TokenLogo'
import { PriceSourceLink } from '@/components/PriceSourceLink'
import { formatCountdown } from '@/lib/format'
import { formatStakeAmount, useStakeToken } from '@/solana/stakeTokens'

const GAME_GUIDES = [
  {
    eyebrow: 'FASTEST MOVER',
    title: 'Asset Races',
    summary: 'Back the asset with the strongest percentage return.',
    accent: '#f7b928',
    soft: '#fff0df',
    image: 'brand/game-guides/asset-races.webp',
    href: '/onchain/races',
    cta: 'Explore races',
    steps: [
      ['Pick a race', CRYPTO_ASSETS_ENABLED
        ? 'Choose a stock, meme or crypto race. Community lobbies can assemble 2-6 approved assets before betting.'
        : 'Choose a stock or meme race. Community lobbies can assemble 2-6 approved assets before betting.'],
      ['Back one contender', 'During the betting window, choose one asset and stake in USD or SOL; top-ups stay on that asset.'],
      ['Watch T0 → T1', 'Every contender uses the same fixed start and finish snapshots. The highest percentage return wins - even if all returns are negative.'],
      ['Claim or refund', 'Backers of the winner recover principal and share the losing pools after the 2% profit fee. An exact top tie voids the race and makes stakes refundable.'],
    ],
  },
  {
    eyebrow: 'CLOSEST PRICE',
    title: 'Price Arena',
    summary: 'Forecast the exact price at the end of the round.',
    accent: '#6bcbf4',
    soft: '#E8F0FF',
    image: 'brand/game-guides/price-arena.webp',
    href: '/onchain/arenas',
    cta: 'Explore arenas',
    steps: [
      ['Enter the lobby', 'Submit one exact price and a USD or SOL stake. Forecasts stay hidden while entry is open.'],
      ['Refine your call', 'Change the prediction or add stake before the lobby closes. Each arena accepts up to 10 players.'],
      ['Follow the round', 'Predictions become visible when play starts. The fixed deadline price ranks everyone by absolute error.'],
      ['Closest half wins', 'The closest half recover principal and share the losing half’s pool after the 2% profit fee. If the arena cannot settle by rule, stakes are refundable.'],
    ],
  },
] as const

const FEATURES = [
  {
    tag: 'POOL TO POOL',
    color: '#ff4f8b',
    title: 'Players compete against players',
    body: 'There are no fixed bookmaker odds. Each game forms an onchain pool, and winners receive principal plus their rule-based share of the losing pool after the 2% protocol fee on that profit portion.',
    links: [],
  },
  {
    tag: 'USD ↔ SOL',
    color: '#ffd23f',
    title: 'Choose how you enter the amount',
    body: 'Type a convenient dollar amount or enter SOL directly. Every stake form shows the matching value from one shared SOL/USD quote before the wallet opens; the program receives SOL.',
    links: [],
  },
  {
    tag: 'CLEAR OUTCOMES',
    color: '#ff4f8b',
    title: 'Settle by rule or refund by rule',
    body: 'Each mode defines its price snapshot, eligibility and tie behavior in advance. If a game cannot settle under those rules, it reaches a refundable terminal state instead of substituting an arbitrary result.',
    links: [],
  },
  {
    tag: 'YOUR IDEA, ONCHAIN',
    color: '#6bcbf4',
    title: 'If the game does not exist, create it',
    body: 'Any wallet can assemble an Asset Race or open a Price Arena from reviewed assets. Set the rules up front, then invite the community into the pool.',
    links: [
      { label: '+ Race', to: '/onchain/races/create', className: 'border-2 border-[#191330] bg-[#ffd23f] text-[#191330] hover:bg-[#f7b928]' },
      { label: '+ Arena', to: '/onchain/arenas/create', className: 'border-2 border-[#191330] bg-[#6bcbf4] text-[#191330] hover:bg-[#8ddaf8]' },
    ],
  },
] as const

const SUPPORTED_STOCKS = assetRaceCatalog.filter((asset) => asset.category === 'STOCK' && asset.enabled)
const SUPPORTED_MEMES = assetRaceCatalog.filter((asset) => asset.category === 'MEME' && asset.enabled)
const SUPPORTED_CRYPTO = assetRaceCatalog.filter((asset) => asset.category === 'CRYPTO' && asset.enabled)

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
  error,
  empty,
  children,
}: {
  eyebrow: string
  title: string
  count: number
  href: string
  accent: 'purple' | 'orange' | 'blue'
  loading: boolean
  error: boolean
  empty: string
  children: ReactNode
}) {
  const accentClass = accent === 'orange'
    ? 'bg-[#ffd23f] text-[#191330]'
    : accent === 'blue'
      ? 'bg-[#6bcbf4] text-[#191330]'
      : 'bg-[#ff4f8b] text-[#fbf3e2]'

  const skeletonAccent = accent === 'orange'
    ? 'bg-[#ffd23f]/20'
    : accent === 'blue'
      ? 'bg-[#6bcbf4]/20'
      : 'bg-[#ff4f8b]/20'

  return (
    <div className="flex min-h-[18rem] flex-col border-[3px] border-[#191330] bg-[#221c40] p-5 text-[#fbf3e2] shadow-[8px_8px_0_#191330] sm:p-6 lg:min-h-[46rem]">
      <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-5">
        <div>
          <p className={`px-font inline-flex border-2 border-[#191330] px-2 py-1.5 text-[8px] ${accentClass}`}>{eyebrow}</p>
          <h3 className="px-font mt-3 text-sm sm:text-base">{title}</h3>
        </div>
        <span className="px-font grid h-9 min-w-9 place-items-center border-2 border-[#fbf3e2]/25 px-2 text-[11px] text-[#fbf3e2]/70">
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
              <div key={index} className="min-h-36 animate-pulse rounded-none border border-white/5 bg-black/10 p-4">
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
        ) : error && count === 0 ? (
          <div className="grid flex-1 place-items-center rounded-none border border-rose-500/20 bg-rose-500/5 px-6 text-center text-sm leading-relaxed text-rose-300/80">
            Could not load the game list. Check your connection and refresh.
          </div>
        ) : count === 0 ? (
          <div className="grid flex-1 place-items-center rounded-none border border-dashed border-white/10 px-6 text-center text-sm leading-relaxed text-white/35">{empty}</div>
        ) : children}
      </div>

      <Link to={href} className="px-font group flex items-center justify-between border-t-2 border-[#fbf3e2]/15 pt-4 text-[10px] text-[#fbf3e2]/60 transition-colors hover:text-[#ffd23f]">
        View all
        <span className="transition-transform group-hover:translate-x-1">→</span>
      </Link>
    </div>
  )
}

function RacePreviewCard({ race, nowMs }: { race: AssetRaceViewModel; nowMs: number }) {
  const token = useStakeToken(race.stakeMint)
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
      className="group block cursor-pointer border-2 border-[#fbf3e2]/15 bg-[#191330]/40 p-4 transition-all hover:-translate-y-0.5 hover:border-[#ffd23f] hover:bg-[#ffd23f]/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="px-font text-[8px] text-[#ffd23f]">{phaseLabel}</div>
          <h4 className="mt-1 truncate font-display text-lg font-bold">{race.title || `Asset Race #${race.id}`}</h4>
        </div>
        <span className="px-font shrink-0 border-2 border-[#ffd23f]/40 px-2 py-1.5 text-[9px] text-[#ffd23f]">{timeLeft(target, nowMs)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {race.assets.slice(0, 5).map((asset) => (
          <span key={asset.assetIndex} className="inline-flex items-center gap-1 rounded-full bg-white/5 py-1 pl-1 pr-2 text-xs font-bold text-white/65">
            <TokenLogo ticker={asset.symbol} className="h-5 w-5 rounded-none" />
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
            className="bg-[#ffd23f]/10 px-2 py-1 text-[10px]"
          />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs">
        <span className="text-white/35">
          {inLobby ? `${race.candidateCount} / 6 assets` : `${formatStakeAmount(race.totalPool, token)} pool`}
        </span>
        <span className="px-font shrink-0 text-[9px] text-[#ffd23f]">{actionLabel} →</span>
      </div>
    </div>
  )
}

function ArenaPreviewCard({ arena, nowMs }: { arena: PriceArenaWithPhase; nowMs: number }) {
  const token = useStakeToken(arena.stakeMint)
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
      className="group block cursor-pointer border-2 border-[#fbf3e2]/15 bg-[#191330]/40 p-4 transition-all hover:-translate-y-0.5 hover:border-[#6bcbf4] hover:bg-[#6bcbf4]/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <TokenLogo ticker={arena.asset?.symbol} className="h-9 w-9 rounded-none" />
          <div className="min-w-0">
            <div className="px-font text-[8px] text-[#6bcbf4]">{arena.asset?.symbol ?? 'ARENA'} · {arenaDurationLabel(arena.duration)}</div>
            <h4 className="mt-1 truncate font-display text-lg font-bold">{arena.title}</h4>
          </div>
        </div>
        <span className="px-font shrink-0 border-2 border-[#6bcbf4]/40 px-2 py-1.5 text-[9px] text-[#6bcbf4]">
          {phaseLabel}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs">
        <span className="text-white/35">{arena.participantCount} / {PRICE_ARENA_MAX_PARTICIPANTS} players · {formatStakeAmount(arena.totalPool, token)} pool</span>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <PriceSourceLink href={arena.asset?.priceUrl} symbol={arena.asset?.symbol} tone="arena" className="bg-[#6bcbf4]/10 px-2 py-1" />
          <span className="px-font text-[9px] text-[#6bcbf4]">{actionLabel} →</span>
        </div>
      </div>
    </div>
  )
}


// ----------------------------------------------------------------- retro bits

function PixelCloud({ className, drift }: { className?: string; drift?: string }) {
  return (
    <svg
      viewBox="0 0 44 18"
      aria-hidden="true"
      className={`px-art pointer-events-none ${className ?? ''}`}
      style={{ animation: `px-cloud-drift ${drift ?? '28s'} ease-in-out infinite alternate` }}
    >
      <g fill="#ffffff">
        <rect x="10" y="0" width="18" height="6" />
        <rect x="2" y="6" width="34" height="6" />
        <rect x="28" y="4" width="16" height="8" />
      </g>
      <rect x="2" y="12" width="42" height="4" fill="#d9eefb" />
    </svg>
  )
}

const HERO_RUNNERS = [
  { symbol: 'BONK', left: '62%', duration: '0.52s' },
  { symbol: 'WIF', left: '38%', duration: '0.64s' },
  { symbol: 'SOL', left: '22%', duration: '0.58s' },
]

function HeroRunner({ symbol, left, duration, lane }: { symbol: string; left: string; duration: string; lane: number }) {
  return (
    <div className="absolute -translate-x-1/2" style={{ left, top: `${4 + lane * 27}%` }}>
      <div className="flex flex-col items-center" style={{ animation: `hero-run ${duration} ease-in-out infinite` }}>
        <span className="px-font border-2 border-[#191330] bg-[#fbf3e2] px-1.5 py-1 text-[8px] text-[#191330]">{symbol}</span>
        <div className="mt-1 h-9 w-9 overflow-hidden rounded-full border-[3px] border-[#191330] bg-white">
          <TokenLogo ticker={symbol} className="h-full w-full" />
        </div>
        <div className="flex gap-2">
          <span className="h-2 w-[3px] bg-[#191330]" style={{ animation: `hero-leg ${duration} linear infinite` }} />
          <span className="h-2 w-[3px] bg-[#191330]" style={{ animation: `hero-leg ${duration} linear infinite`, animationDelay: `calc(${duration} / -2)` }} />
        </div>
      </div>
    </div>
  )
}

export function OnchainLandingPage() {
  const { races, isLoading: racesLoading, error: racesError } = useAssetRaces()
  const { arenas, isLoading: arenasLoading, error: arenasError } = usePriceArenas()
  const clockMs = useAssetRaceClock()
  const [initialNowMs] = useState(() => Date.now())
  const nowMs = clockMs || initialNowMs

  // The contract status is authoritative. Local countdowns are display-only:
  // removing cards from them made valid games vanish before keeper transitions.
  const activeRaces = races.filter((race) => (
    ![ASSET_RACE_STATUS.RESOLVED, ASSET_RACE_STATUS.CANCELLED, ASSET_RACE_STATUS.VOID].includes(race.status as 2 | 3 | 4)
    && (CRYPTO_ASSETS_ENABLED || race.category !== ASSET_RACE_CATEGORY.CRYPTO)
  ))
  const activeArenas = arenas.map((arena) => ({ ...arena, phase: arenaPhase(arena.status, arena.startsAt, nowMs / 1000) })).filter((arena) => (
    arena.phase !== PRICE_ARENA_PHASE.RESOLVED && arena.phase !== PRICE_ARENA_PHASE.CANCELLED
    && (CRYPTO_ASSETS_ENABLED || arena.category !== PRICE_ARENA_CATEGORY.CRYPTO)
  ))

  const stepsReveal = useRevealOnScroll<HTMLDivElement>()
  const featuresReveal = useRevealOnScroll<HTMLDivElement>()

  return (
    <div className="retro">
      {/* Retro hero: pixel sky, drifting clouds, chunky CTAs, pixel mascot
          sprinting a night track below. Reference: the approved 8-bit mock. */}
      <div>
        <section className="relative overflow-hidden border-b-[3px] border-[#191330] bg-[#6bcbf4]">
          <PixelCloud className="absolute left-[6%] top-[14%] w-28 opacity-95" drift="26s" />
          <PixelCloud className="absolute right-[10%] top-[24%] w-20 opacity-90" drift="34s" />
          <PixelCloud className="absolute left-[30%] top-[58%] w-16 opacity-80" drift="22s" />

          <div className="relative mx-auto max-w-[1100px] px-4 pt-16 text-center sm:pt-24">
            <span className="px-chip bg-[#fbf3e2]">On Solana</span>
            <h1 className="px-font mx-auto mt-9 max-w-4xl text-[22px] leading-[1.7] sm:text-4xl sm:leading-[1.6]">
              <span className="text-[#ffd23f]" style={{ textShadow: '4px 4px 0 #191330' }}>Coin races</span>
              <br />
              <span className="text-[#ff4f8b]" style={{ textShadow: '4px 4px 0 #191330' }}>& arena fights</span>
            </h1>
            <p className="mx-auto mt-7 max-w-xl text-base font-extrabold leading-relaxed text-[#191330]/80 sm:text-lg">
              Pick a coin, stake SOL, watch it sprint for the finish. The strongest move takes the pot.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link to="/onchain/races" className="px-btn">Start racing</Link>
              <Link to="/onchain/arenas" className="px-btn px-btn--pink">Enter arena</Link>
            </div>

            <div className="h-16 sm:h-20" />
          </div>

          <div className="px-bushes h-14" />
        </section>

        {/* Night track: the hero rolls straight onto the road. */}
        <section className="relative overflow-hidden border-b-[3px] border-[#191330] bg-[#221c40]">
          <div className="relative mx-auto h-36 max-w-[1500px] sm:h-40">
            {[0, 1, 2].map((lane) => (
              <div
                key={lane}
                className="absolute left-0 right-0 border-b-2 border-dashed border-white/15"
                style={{ top: `${26 + lane * 26}%` }}
              />
            ))}
            <div className="px-checker absolute bottom-0 right-6 top-0 w-9 border-x-[3px] border-[#191330] sm:right-14" />
            {HERO_RUNNERS.map((runner, index) => (
              <HeroRunner key={runner.symbol} {...runner} lane={index} />
            ))}
          </div>
        </section>

        {/* Create strip: sunny billboard, chunky actions. */}
        <section className="border-b-[3px] border-[#191330] bg-[#ffd23f]">
          <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-6 px-4 py-9">
            <div className="flex min-w-0 items-center gap-4">
              <img src={`${import.meta.env.BASE_URL}brand/mascot-pixel.png`} alt="" className="px-art h-12 w-12" />
              <div className="min-w-0">
                <h2 className="px-font text-sm sm:text-base">Create the game</h2>
                <p className="mt-2 text-sm font-extrabold text-[#191330]/70">
                  Any wallet can assemble a race or launch an arena for the community.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/onchain/races/create" className="px-btn px-btn--paper px-btn--sm">+ Race</Link>
              <Link to="/onchain/arenas/create" className="px-btn px-btn--paper px-btn--sm">+ Arena</Link>
            </div>
          </div>
        </section>
      </div>

      {/* A stable cross-product board driven by authoritative onchain phases. */}
      <section className="mx-auto max-w-[1500px] px-4 pb-10 pt-14">
        <p className="px-font mb-4 text-[10px] text-[#ff4f8b]">Active now</p>
        <h2 className="px-font mb-10 text-lg sm:text-2xl">Choose your game</h2>

        <div className="grid gap-5 lg:grid-cols-2">
          <GameColumn
            eyebrow="FASTEST MOVER"
            title="Asset Races"
            count={activeRaces.length}
            href="/onchain/races"
            accent="orange"
            loading={racesLoading && !racesError && activeRaces.length === 0}
            error={!!racesError}
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
            loading={arenasLoading && !arenasError && activeArenas.length === 0}
            error={!!arenasError}
            empty="No Price Arenas are active right now."
          >
            {activeArenas.slice(0, 3).map((arena) => (
              <ArenaPreviewCard key={arena.id.toString()} arena={arena} nowMs={nowMs} />
            ))}
          </GameColumn>
        </div>

        <p className="pt-6 text-xs font-extrabold text-[#191330]/50">SOL wagers · One wallet transaction · Onchain settlement</p>
      </section>

      {/* Three product flows in one glance. */}
      <section className="max-w-[1500px] mx-auto px-4 py-14">
        <div ref={stepsReveal.ref} className="relative overflow-hidden border-[3px] border-[#191330] bg-[#f3e8cf] px-6 py-12 text-[#191330] shadow-[8px_8px_0_#191330] sm:px-12 sm:py-14">
          <span className="pointer-events-none absolute right-[6%] top-[8%] text-[#ff4f8b] text-2xl" style={{ animation: 'sparkle-pop 2.6s ease-in-out infinite' }}>
            ✦
          </span>
          <span
            className="pointer-events-none absolute left-[4%] bottom-[10%] text-[#ff4f8b] text-lg"
            style={{ animation: 'sparkle-pop 2.6s ease-in-out infinite', animationDelay: '1.3s' }}
          >
            ✦
          </span>

          <div className="mb-10 max-w-2xl">
            <span className="px-chip mb-5">Two games · one wallet</span>
            <h2 className="px-font text-lg sm:text-2xl">How to play</h2>
            <p className="mt-3 text-sm font-medium leading-relaxed text-[#191330]/55 sm:text-base">
              Choose the format, make your call, send SOL and let the published rules settle the result.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {GAME_GUIDES.map((guide, guideIndex) => (
              <article
                key={guide.title}
                className="group flex flex-col overflow-hidden border-[3px] border-[#191330] bg-[#fbf3e2] shadow-[6px_6px_0_#191330] transition-transform duration-300 hover:-translate-y-1"
                style={{
                  opacity: stepsReveal.visible ? 1 : 0,
                  transform: stepsReveal.visible ? 'translateY(0)' : 'translateY(28px)',
                  transitionDelay: `${guideIndex * 110}ms`,
                }}
              >
                <div className="h-2.5 border-b-[3px] border-[#191330]" style={{ background: guide.accent }} />
                <div className="relative min-h-48 overflow-hidden border-b-[3px] border-[#191330] p-6 sm:p-7" style={{ background: guide.soft }}>
                  <div className="relative z-10 max-w-[58%]">
                    <p className="text-[0.68rem] font-extrabold tracking-[0.18em]" style={{ color: guide.accent }}>{guide.eyebrow}</p>
                    <h3 className="mt-2 font-display text-2xl font-bold leading-tight">{guide.title}</h3>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-[#191330]/55">{guide.summary}</p>
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
                          className="px-font grid h-8 w-8 place-items-center border-2 border-[#191330] text-[11px]"
                          style={{ background: guide.accent, color: '#fbf3e2' }}
                        >
                          {stepIndex + 1}
                        </span>
                        <div>
                          <h4 className="font-display text-sm font-bold leading-snug">{title}</h4>
                          <p className="mt-1 text-xs leading-relaxed text-[#191330]/55">{body}</p>
                        </div>
                      </li>
                    ))}
                  </ol>

                  <Link
                    to={guide.href}
                    className="px-font mt-7 inline-flex items-center justify-between border-[3px] border-[#191330] py-3.5 pl-5 pr-4 text-[10px] text-[#fbf3e2] shadow-[4px_4px_0_#191330] transition-transform hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5"
                    style={{ background: guide.accent }}
                  >
                    {guide.cta}
                    <span>→</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Why Prophet */}
      <section className="max-w-[1500px] mx-auto px-4 py-16">
        <p className="px-font mb-4 text-center text-[10px] text-[#ff4f8b]">The Prophet difference</p>
        <h2 className="px-font mb-3 text-center text-lg sm:text-2xl">
          Why Prophet
        </h2>
        <p className="mx-auto mb-12 max-w-xl text-center text-sm font-bold text-[#191330]/60 sm:text-base">
          Pick the format that matches your conviction. The rules, pools and settlement state stay visible onchain.
        </p>
        <div ref={featuresReveal.ref} className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {FEATURES.map((f, i) => {
            const tile = i === 3
              ? { background: '#ff4f8b', color: '#fbf3e2' }
              : i % 2 === 0
                ? { background: '#ffd23f', color: '#191330' }
                : { background: '#6bcbf4', color: '#191330' }
            return (
              <div
                key={f.title}
                className="group relative overflow-hidden border-[3px] border-[#191330] bg-[#221c40] p-8 text-[#fbf3e2] shadow-[6px_6px_0_#191330] transition-transform duration-300 hover:-translate-y-1.5"
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
                  className="px-font relative mb-6 inline-block border-2 border-[#191330] px-3.5 py-2.5 text-[11px] -rotate-2 transition-transform duration-300 group-hover:rotate-0"
                  style={{ background: tile.background, color: tile.color }}
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
        <div className="relative overflow-hidden border-[3px] border-[#191330] bg-[#f3e8cf] px-6 py-12 text-[#191330] shadow-[8px_8px_0_#191330] sm:px-12 sm:py-14">
          <span className="pointer-events-none absolute left-[5%] top-[10%] text-[#ff4f8b] text-2xl" style={{ animation: 'sparkle-pop 2.6s ease-in-out infinite' }}>
            ✦
          </span>
          <span
            className="pointer-events-none absolute right-[4%] bottom-[12%] text-[#ff4f8b] text-lg"
            style={{ animation: 'sparkle-pop 2.6s ease-in-out infinite', animationDelay: '1.2s' }}
          >
            ✦
          </span>

          <div className="relative mx-auto max-w-3xl text-center">
            <span className="px-chip mb-5">Curated asset universe</span>
            <h2 className="px-font text-lg sm:text-2xl">Not every asset makes the grid</h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm font-medium leading-relaxed text-[#191330]/65 sm:text-base">
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
                accent: '#ff4f8b',
                soft: '#EEEAFD',
                ctaText: '#FFFFFF',
                href: '/onchain/races',
                cta: 'Explore stock races',
              },
              {
                eyebrow: 'MEME ASSETS',
                title: 'Culture with a price feed',
                description: 'Community assets admitted only after identity, source and executable trading-depth checks.',
                assets: SUPPORTED_MEMES,
                accent: '#f7b928',
                soft: '#FFF0DF',
                ctaText: '#3B2416',
                href: '/onchain/races?mode=memes',
                cta: 'Explore meme races',
              },
              ...(CRYPTO_ASSETS_ENABLED ? [{
                eyebrow: 'CRYPTO ASSETS',
                title: 'Liquid crypto majors',
                description: 'Bitcoin, Solana and Ethereum priced in USD from reviewed, liquid Solana DEX pools.',
                assets: SUPPORTED_CRYPTO,
                accent: '#3B82F6',
                soft: '#E8F0FF',
                ctaText: '#FFFFFF',
                href: '/onchain/races?mode=crypto',
                cta: 'Explore crypto races',
              }] : []),
            ].map((group) => (
              <div key={group.eyebrow} className="flex flex-col rounded-none border border-[#191330]/10 bg-white/60 p-5 shadow-[0_20px_45px_-35px_rgba(36,26,51,0.45)] sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[0.68rem] font-extrabold tracking-[0.18em]" style={{ color: group.accent }}>{group.eyebrow}</p>
                    <h3 className="mt-2 font-display text-2xl font-bold sm:text-3xl">{group.title}</h3>
                  </div>
                  <span className="grid h-10 min-w-10 place-items-center rounded-full px-2 text-sm font-extrabold" style={{ color: group.accent, backgroundColor: group.soft }}>
                    {group.assets.length}
                  </span>
                </div>
                <p className="mt-3 min-h-12 text-sm leading-relaxed text-[#191330]/60">{group.description}</p>

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
                        aria-label={`View ${asset.symbol} price from the exact settlement pool (opens in a new tab)`}
                        className="group/asset flex min-w-0 items-center gap-2.5 border-2 border-[#191330]/15 bg-white/80 p-2.5 transition-all hover:-translate-y-0.5 hover:border-[#191330] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{ outlineColor: group.accent }}
                        title={`View ${asset.symbol} exact pool chart`}
                      >
                        <TokenLogo ticker={asset.symbol} className="h-9 w-9 shrink-0 rounded-none text-sm" />
                        <div className="min-w-0 flex-1">
                          <div className={`truncate font-extrabold tracking-tight ${asset.symbol.length > 8 ? 'text-[0.62rem]' : 'text-xs'}`}>{asset.symbol}</div>
                          <div className="truncate text-[0.65rem] font-medium text-[#191330]/45">{asset.displayName}</div>
                          <div className="mt-0.5 text-[0.6rem] font-extrabold" style={{ color: group.accent }}>View price ↗</div>
                        </div>
                      </a>
                    )
                  })}
                </div>

                <Link
                  to={group.href}
                  className="px-font mt-6 inline-flex w-fit items-center gap-2 border-[3px] border-[#191330] px-4 py-3 text-[9px] shadow-[3px_3px_0_#191330] transition-transform hover:-translate-y-0.5"
                  style={{ backgroundColor: group.accent, color: group.ctaText }}
                >
                  {group.cta}
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            ))}
          </div>

          <div className="relative mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs font-bold text-[#191330]/50">
            {['Verified identity', 'Approved price source', 'Reviewed trading depth'].map((label) => (
              <span key={label} className="inline-flex items-center gap-2">
                <span className="grid h-4 w-4 place-items-center bg-[#ff4f8b] text-[0.6rem] text-[#fbf3e2]">✓</span>
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

    </div>
  )
}
