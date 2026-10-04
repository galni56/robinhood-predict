import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { TokenLogo } from '@/components/TokenLogo'
import { PROPHET_X_URL } from '@/lib/social'

// Retro arcade landing, structured after the approved 8-bit mock: sky hero,
// night track, the two game modes on green, a three-step how-to, the token
// band and an 18+ strip. Live game lists belong to /onchain/races and
// /onchain/arenas - the landing sells the game, not the order book.

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

function CoinRunner({ symbol, size = 'md', stride = '0.55s' }: { symbol: string; size?: 'sm' | 'md'; stride?: string }) {
  const coin = size === 'sm' ? 'h-7 w-7' : 'h-10 w-10'
  return (
    <div className="flex flex-col items-center">
      <span className="px-font border-2 border-[#191330] bg-[#fbf3e2] px-1.5 py-1 text-[7px] text-[#191330]">{symbol}</span>
      <div className={`mt-1 overflow-hidden rounded-full border-[3px] border-[#191330] bg-white ${coin}`} style={{ transform: 'rotate(5deg)' }}>
        <TokenLogo ticker={symbol} className="h-full w-full" />
      </div>
      <div className="flex gap-1.5">
        <span className="h-2 w-[3px] bg-[#191330]" style={{ animation: `hero-leg ${stride} linear infinite` }} />
        <span className="h-2 w-[3px] bg-[#191330]" style={{ animation: `hero-leg ${stride} linear infinite`, animationDelay: `calc(${stride} / -2)` }} />
      </div>
    </div>
  )
}

// Each runner crosses the whole strip on its own lap time, so the order
// keeps changing; depth grows toward the near lanes.
const TRACK_RUNNERS = [
  { symbol: 'TRUMP', top: '1%', lap: '13s', delay: '-4s', scale: 0.82, stride: '0.5s' },
  { symbol: 'WIF', top: '24%', lap: '16.5s', delay: '-10s', scale: 0.92, stride: '0.56s' },
  { symbol: 'SOL', top: '46%', lap: '11.5s', delay: '-2s', scale: 1.02, stride: '0.47s' },
  { symbol: 'PENGU', top: '67%', lap: '14.5s', delay: '-8s', scale: 1.12, stride: '0.53s' },
]

function TrackRunner({ symbol, top, lap, delay, scale, stride }: (typeof TRACK_RUNNERS)[number]) {
  return (
    <div className="track-runner" style={{ top, '--lap': lap, '--lap-delay': delay } as CSSProperties}>
      <div className="relative" style={{ transform: `scale(${scale})` }}>
        <span className="track-trail" />
        <div style={{ animation: `hero-run ${stride} ease-in-out infinite` }}>
          <CoinRunner symbol={symbol} stride={stride} />
        </div>
        <div className="track-shadow" />
      </div>
    </div>
  )
}

const STEPS = [
  ['Connect a wallet', 'A Solana wallet and a little SOL for the stake. One transaction per bet, no sign-ups.'],
  ['Pick your coin', 'Back the favorite in a race, or call the exact finish price in the arena.'],
  ['Collect the win', 'Your pick came through? Claim your share of the bank straight to the wallet.'],
] as const

export function OnchainLandingPage() {
  return (
    <div className="retro">
      {/* -------------------------------------------------------- hero */}
      <section className="relative overflow-hidden border-b-[3px] border-[#191330] bg-[#6bcbf4]">
        <PixelCloud className="absolute left-[6%] top-[14%] w-28 opacity-95" drift="26s" />
        <PixelCloud className="absolute right-[10%] top-[24%] w-20 opacity-90" drift="34s" />
        <PixelCloud className="absolute left-[30%] top-[62%] w-16 opacity-80" drift="22s" />

        <div className="relative mx-auto max-w-[1100px] px-4 pt-16 text-center sm:pt-24">
          <span className="px-chip bg-[#fbf3e2]">On Solana</span>
          <h1 className="px-font mx-auto mt-9 max-w-4xl text-[22px] leading-[1.7] sm:text-4xl sm:leading-[1.6]">
            <span className="text-[#ffd23f]" style={{ textShadow: '4px 4px 0 #191330' }}>Coin races</span>
            <br />
            <span className="text-[#ff4f8b]" style={{ textShadow: '4px 4px 0 #191330' }}>& arena fights</span>
          </h1>
          <p className="mx-auto mt-7 max-w-xl text-base font-extrabold leading-relaxed text-[#191330]/80 sm:text-lg">
            Pick a coin, back it with SOL and watch it sprint to the finish. The strongest price move takes the bank.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
            <Link to="/onchain/races" className="px-btn">Play</Link>
            <a href="#how-to-play" className="px-font border-b-[3px] border-[#191330] pb-1 text-[10px] text-[#191330] transition-colors hover:text-[#ff4f8b]">
              How it works
            </a>
          </div>

          <div className="h-16 sm:h-20" />
        </div>

        <div className="px-bushes h-14" />
      </section>

      {/* ------------------------------------------------- night track */}
      <section className="relative overflow-hidden border-b-[3px] border-[#191330] bg-[#221c40]">
        <div className="relative h-56 sm:h-64">
          {/* Lane markings slide left: the road moves even between overtakes. */}
          {['24%', '47%', '70%', '92%'].map((top, index) => (
            <div key={top} className="track-lane-line" style={{ top, animationDelay: `${index * -0.2}s` }} />
          ))}
          <div className="track-finish px-checker absolute bottom-0 right-8 top-0 z-10 w-10 border-x-[3px] border-[#191330] sm:right-16" />
          {TRACK_RUNNERS.map((runner) => (
            <TrackRunner key={runner.symbol} {...runner} />
          ))}
        </div>
      </section>

      {/* --------------------------------------------------- two modes */}
      <section className="border-b-[3px] border-[#191330] bg-[#58c26e]">
        <div className="mx-auto max-w-[1100px] px-4 py-14 sm:py-16">
          <h2 className="px-font text-center text-lg sm:text-2xl" style={{ textShadow: '3px 3px 0 rgba(25,19,48,0.25)' }}>
            Two modes
          </h2>

          <div className="mt-10 grid gap-8 md:grid-cols-2">
            {/* Races */}
            <article className="flex flex-col border-[3px] border-[#191330] bg-[#fbf3e2] shadow-[8px_8px_0_#191330]">
              <div className="relative h-40 overflow-hidden border-b-[3px] border-[#191330]">
                <div className="absolute inset-x-0 top-0 h-[38%] bg-[#8ddaf8]">
                  <PixelCloud className="absolute left-[12%] top-[18%] w-12" drift="20s" />
                  <PixelCloud className="absolute right-[18%] top-[40%] w-9" drift="30s" />
                </div>
                <div className="absolute inset-x-0 bottom-0 h-[62%] bg-[#221c40]">
                  <div className="track-lane-line" style={{ top: '38%' }} />
                  <div className="track-lane-line" style={{ top: '78%', animationDelay: '-0.3s' }} />
                  <div className="px-checker absolute bottom-0 right-4 top-0 w-6 border-x-2 border-[#191330]" />
                  <div className="track-runner" style={{ top: '4%', '--lap': '7.5s', '--lap-delay': '-2.5s' } as CSSProperties}>
                    <CoinRunner symbol="WIF" size="sm" stride="0.5s" />
                  </div>
                  <div className="track-runner" style={{ top: '42%', '--lap': '9.5s', '--lap-delay': '-6s' } as CSSProperties}>
                    <CoinRunner symbol="SOL" size="sm" stride="0.56s" />
                  </div>
                </div>
              </div>
              <div className="flex flex-1 flex-col p-6">
                <h3 className="px-font text-sm">Races</h3>
                <p className="mt-3 flex-1 text-sm font-bold leading-relaxed text-[#191330]/70">
                  Several coins start at once. The one whose price climbs hardest over the window takes the lap - and
                  its backers split the bank.
                </p>
                <Link to="/onchain/races" className="px-btn px-btn--sm mt-6 self-start">To the start</Link>
              </div>
            </article>

            {/* Arena */}
            <article className="flex flex-col border-[3px] border-[#191330] bg-[#fbf3e2] shadow-[8px_8px_0_#191330]">
              <div className="relative h-40 overflow-hidden border-b-[3px] border-[#191330] bg-[#2b2452]">
                {[['14%', '22%'], ['80%', '16%'], ['68%', '58%'], ['26%', '64%'], ['50%', '12%']].map(([left, top], index) => (
                  <span key={index} className="absolute h-1 w-1 bg-white/60" style={{ left, top }} />
                ))}
                <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center gap-6">
                  <div className="h-14 w-14 overflow-hidden rounded-full border-[3px] border-[#191330] bg-white">
                    <TokenLogo ticker="NVDAx" className="h-full w-full" />
                  </div>
                  <span className="px-font text-base text-[#ffd23f]" style={{ textShadow: '3px 3px 0 #191330' }}>VS</span>
                  <div className="px-font grid h-14 w-16 place-items-center border-[3px] border-[#191330] bg-[#fbf3e2] text-[11px] text-[#191330]">
                    $&thinsp;?
                  </div>
                </div>
                <div
                  className="absolute inset-x-0 bottom-0 h-6 border-t-[3px] border-[#191330] bg-[#c22957]"
                  style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 22px, rgba(25,19,48,0.45) 22px 25px)' }}
                />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <h3 className="px-font text-sm">Arena</h3>
                <p className="mt-3 flex-1 text-sm font-bold leading-relaxed text-[#191330]/70">
                  One coin, one round, up to ten players. Call the exact finish price - the closest forecasts take the
                  losing half's bank.
                </p>
                <Link to="/onchain/arenas" className="px-btn px-btn--pink px-btn--sm mt-6 self-start">Into the fight</Link>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- how to play */}
      <section id="how-to-play" className="border-b-[3px] border-[#191330] bg-[#fbf3e2]">
        <div className="mx-auto max-w-[1100px] px-4 py-14 sm:py-16">
          <h2 className="px-font text-center text-lg sm:text-2xl">How to play</h2>
          <div className="mt-12 grid gap-10 sm:grid-cols-3">
            {STEPS.map(([title, body], index) => (
              <div key={title}>
                <span className="px-font grid h-11 w-11 place-items-center border-[3px] border-[#191330] bg-[#ff4f8b] text-sm text-[#fbf3e2] shadow-[3px_3px_0_#191330]">
                  {index + 1}
                </span>
                <h3 className="px-font mt-5 text-[11px]">{title}</h3>
                <p className="mt-3 text-sm font-bold leading-relaxed text-[#191330]/65">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- token */}
      <section className="border-b-[3px] border-[#191330] bg-[#ffd23f]">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-8 px-4 py-12">
          <div className="flex min-w-0 max-w-xl items-start gap-5">
            <img src={`${import.meta.env.BASE_URL}brand/mascot-pixel.png`} alt="" className="px-art mt-1 h-14 w-14 shrink-0" />
            <div className="min-w-0">
              <h2 className="px-font text-sm sm:text-base">Token $PROPHET</h2>
              <p className="mt-3 text-sm font-bold leading-relaxed text-[#191330]/70">
                Launching on pump.fun. Buyback and burn run through pump.fun and PumpSwap.
              </p>
            </div>
          </div>
          <div className="flex w-full max-w-sm flex-col gap-3">
            <div className="px-font border-[3px] border-[#191330] bg-[#fbf3e2] px-4 py-3.5 text-[9px] text-[#191330]/50">
              Contract address · soon
            </div>
            <span className="px-btn px-btn--pink px-btn--sm pointer-events-none opacity-60">Buy on pump.fun · soon</span>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- 18+ strip */}
      <section className="bg-[#221c40]">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-4 px-4 py-5">
          <div className="flex items-center gap-3">
            <span className="px-font border-2 border-[#ff4f8b] bg-[#ff4f8b] px-1.5 py-1 text-[8px] text-[#fbf3e2]">18+</span>
            <p className="text-xs font-bold text-[#fbf3e2]/70">Games with real money involve risk. Play responsibly.</p>
          </div>
          <div className="px-font flex items-center gap-5 text-[8px]">
            <Link to="/terms" className="border-b-2 border-[#fbf3e2]/30 pb-0.5 text-[#fbf3e2]/70 hover:text-[#ffd23f]">Rules</Link>
            <a href={PROPHET_X_URL} target="_blank" rel="noreferrer" className="border-b-2 border-[#fbf3e2]/30 pb-0.5 text-[#fbf3e2]/70 hover:text-[#ffd23f]">
              X / Twitter
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
