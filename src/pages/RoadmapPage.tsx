import { Link } from 'react-router-dom'
import { PROPHET_X_URL } from '@/lib/social'

const roadmapPhases = [
  {
    status: 'LIVE',
    title: 'Three ways to play',
    description: 'The complete foundation is live: permissionless creation, native ETH stakes and rule-based onchain settlement.',
    tone: 'market',
    items: [
      'YES / NO Prediction Markets with deadline-bound stock prices',
      'Asset Races for the strongest percentage return',
      'Price Arena forecasts ranked by distance from the final price',
      'USD or ETH amount entry with one native ETH wallet transaction',
      '10 reviewed tokenized stocks and 13 reviewed meme assets',
    ],
  },
  {
    status: 'NEXT',
    title: 'A smoother player journey',
    description: 'The next product layer makes active positions, results and opportunities easier to reach from any device.',
    tone: 'race',
    items: [
      'Mobile wallet access beyond browser extensions',
      'One activity and claim center across all three game modes',
      'Stronger discovery, sorting and notifications for joinable games',
      'Clearer transaction progress and recovery guidance',
    ],
  },
  {
    status: 'GROW',
    title: 'More depth for players and creators',
    description: 'Expansion stays curated: new assets and tools arrive only when their pricing and settlement path meet the same standard.',
    tone: 'arena',
    items: [
      'More reviewed assets with verified price sources and trading depth',
      'Reusable creator templates and richer game sharing',
      'Longer-form performance history and settlement analytics',
      'Player profiles, achievements and social competition',
    ],
  },
  {
    status: 'EXPLORE',
    title: 'New market mechanics',
    description: 'Larger changes remain research tracks until their economics, security and user experience are proven.',
    tone: 'mixed',
    items: [
      'Continuous market pricing and liquidity designs',
      'Additional prediction formats built around transparent outcomes',
      'More resilient and observable settlement automation',
      'Progressive decentralization where it improves player trust',
    ],
  },
] as const

const phaseStyles = {
  market: {
    badge: 'bg-[#8B7CF7] text-white',
    border: 'border-[#8B7CF7]/30',
    glow: 'from-[#8B7CF7]/20',
    dot: 'bg-[#B3A7FA]',
  },
  race: {
    badge: 'bg-[#F2A65A] text-[#3b2416]',
    border: 'border-[#F2A65A]/30',
    glow: 'from-[#F2A65A]/20',
    dot: 'bg-[#F2A65A]',
  },
  arena: {
    badge: 'bg-[#7A9FF0] text-[#152447]',
    border: 'border-[#7A9FF0]/30',
    glow: 'from-[#7A9FF0]/20',
    dot: 'bg-[#B7CEFF]',
  },
  mixed: {
    badge: 'bg-gradient-to-r from-[#8B7CF7] via-[#F2A65A] to-[#7A9FF0] text-[#17111f]',
    border: 'border-white/15',
    glow: 'from-white/10',
    dot: 'bg-white/70',
  },
} as const

export function RoadmapPage() {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-10 sm:py-14">
      <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#241b2f] px-6 py-10 sm:px-10 sm:py-14">
        <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[#8B7CF7]/20 blur-3xl" />
        <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-[#F2A65A]/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <span className="inline-flex rounded-full border border-[#8B7CF7]/30 bg-[#8B7CF7]/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[#B3A7FA]">
            Prophet roadmap
          </span>
          <h1 className="mt-5 font-display text-4xl font-black leading-[1.05] sm:text-6xl">
            Built in public.<br />Grown with purpose.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/55 sm:text-lg">
            Prophet already runs three onchain prediction games. This roadmap shows what is live, what comes next and
            which larger ideas still need research—without pretending every useful idea needs an arbitrary date.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/onchain" className="rounded-full bg-[#8B7CF7] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#9b8dff]">
              Play what is live ↗
            </Link>
            <a href={PROPHET_X_URL} target="_blank" rel="noreferrer" className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white/75 transition hover:border-white/30 hover:text-white">
              Follow progress on X ↗
            </a>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-5 md:grid-cols-2">
        {roadmapPhases.map((phase, index) => {
          const colors = phaseStyles[phase.tone]
          return (
            <article key={phase.status} className={`relative overflow-hidden rounded-3xl border bg-[#21182b] p-6 sm:p-8 ${colors.border}`}>
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${colors.glow} via-transparent to-transparent opacity-70`} />
              <div className="relative">
                <div className="flex items-center justify-between gap-4">
                  <span className={`rounded-full px-3 py-1 text-[11px] font-black tracking-[0.16em] ${colors.badge}`}>{phase.status}</span>
                  <span className="font-mono text-xs text-white/25">0{index + 1}</span>
                </div>
                <h2 className="mt-5 font-display text-2xl font-bold sm:text-3xl">{phase.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-white/50">{phase.description}</p>
                <ul className="mt-6 space-y-3">
                  {phase.items.map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-relaxed text-white/70">
                      <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${colors.dot}`} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          )
        })}
      </section>

      <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-relaxed text-white/35">
        Priorities can move as usage, infrastructure and research change. New mechanics are announced as live only
        after their contracts, settlement path and player flow have been validated.
      </p>
    </div>
  )
}
