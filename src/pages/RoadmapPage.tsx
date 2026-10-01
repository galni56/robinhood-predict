import { Link } from 'react-router-dom'

type PhaseTone = 'purple' | 'orange' | 'token' | 'creator' | 'blue'

interface RoadmapPhase {
  number: string
  status: 'NEXT' | 'RESEARCH' | 'PLANNED' | 'VISION'
  eyebrow: string
  title: string
  tagline: string
  description: string
  tone: PhaseTone
  symbol: string
  items: readonly string[]
  callout?: string
}

const roadmapPhases: readonly RoadmapPhase[] = [
  {
    number: '01',
    status: 'NEXT',
    eyebrow: 'Expand & insight',
    title: 'More assets. Better data.',
    tagline: 'More opportunities - without lowering the quality bar.',
    description: 'Prophet expands its reviewed universe while bringing the exact price context behind every game directly into the product.',
    tone: 'purple',
    symbol: '+',
    items: [
      'More supported Stock Tokens',
      'More high-liquidity meme assets',
      'Direct exact-pool price charts',
      'Targets, history and settlement markers',
      'Public source and liquidity information',
    ],
    callout: 'Every new asset must pass liquidity, pricing and settlement-source review.',
  },
  {
    number: '02',
    status: 'RESEARCH',
    eyebrow: 'Liquidity engine',
    title: 'Beyond pure P2P predictions.',
    tagline: 'A new liquidity-backed format alongside the games already live.',
    description: 'A transparent Prophet Liquidity Vault can support selected future markets, making it easier to enter without waiting entirely on an opposing player.',
    tone: 'orange',
    symbol: '≈',
    items: [
      'Protocol-funded Liquidity Vault',
      'P2P and Prophet-supported formats',
      'Deeper two-sided participation',
      'Dynamic market pricing',
      'Public risk limits and liquidity dashboard',
    ],
    callout: 'The rules of today’s Prediction Markets, Asset Races and Price Arena stay unchanged.',
  },
  {
    number: '03',
    status: 'PLANNED',
    eyebrow: 'Prophet flywheel',
    title: 'Activity powers token utility.',
    tagline: 'Real usage becomes the engine of the $PROPHET ecosystem.',
    description: 'After the fee and liquidity infrastructure is validated, protocol revenue can fund transparent token utility and continued ecosystem growth.',
    tone: 'token',
    symbol: 'P',
    items: [
      'Revenue-funded $PROPHET buybacks',
      'Public onchain treasury reporting',
      'Fee benefits for locked $PROPHET',
      'Seasonal ecosystem incentives',
      'Governance over incentives and reviewed expansion',
    ],
    callout: 'Token governance never determines prices, outcomes or individual settlements.',
  },
  {
    number: '04',
    status: 'PLANNED',
    eyebrow: 'Create, grow & earn',
    title: 'Turn creators into distributors.',
    tagline: 'Creation is live. Attribution and creator economics come next.',
    description: 'Trackable distribution tools will let creators build audiences around their games and earn from genuine activity they bring to Prophet.',
    tone: 'creator',
    symbol: '↗',
    items: [
      'Trackable creator and affiliate links',
      'Creator share of eligible referred fees',
      'Referral rewards with anti-sybil rules',
      'Creator analytics and reputation',
      'Recurring campaigns and tournament tools',
    ],
    callout: 'Create → distribute → attract players → earn.',
  },
  {
    number: '05',
    status: 'VISION',
    eyebrow: 'Prophet everywhere',
    title: 'Predictions beyond the website.',
    tagline: 'Bring every game into the communities already discussing it.',
    description: 'Prophet becomes a portable prediction layer that communities, creators and partners can discover and integrate anywhere.',
    tone: 'blue',
    symbol: '⌁',
    items: [
      'Telegram Mini App and Prophet Bot',
      'Game, result, claim and refund alerts',
      'Live previews and wallet-aware links',
      'Embeddable market widgets',
      'Public API and partner integrations',
    ],
    callout: 'One ecosystem - across communities, bots, widgets and partner products.',
  },
]

const phaseStyles: Record<PhaseTone, {
  badge: string
  border: string
  glow: string
  icon: string
  marker: string
  bullet: string
  callout: string
  ghost: string
}> = {
  purple: {
    badge: 'border-[#8B7CF7]/35 bg-[#8B7CF7]/12 text-[#B3A7FA]',
    border: 'border-[#8B7CF7]/25 hover:border-[#8B7CF7]/45',
    glow: 'bg-[#8B7CF7]',
    icon: 'border-[#8B7CF7]/35 bg-[#8B7CF7]/15 text-[#d8d0ff]',
    marker: 'border-[#8B7CF7] bg-[#8B7CF7] shadow-[0_0_28px_rgba(139,124,247,0.6)]',
    bullet: 'bg-[#B3A7FA]',
    callout: 'border-[#8B7CF7]/20 bg-[#8B7CF7]/8 text-[#d8d0ff]',
    ghost: 'text-[#8B7CF7]',
  },
  orange: {
    badge: 'border-[#F2A65A]/35 bg-[#F2A65A]/12 text-[#F2A65A]',
    border: 'border-[#F2A65A]/25 hover:border-[#F2A65A]/45',
    glow: 'bg-[#F2A65A]',
    icon: 'border-[#F2A65A]/35 bg-[#F2A65A]/15 text-[#ffd3a8]',
    marker: 'border-[#F2A65A] bg-[#F2A65A] shadow-[0_0_28px_rgba(242,166,90,0.55)]',
    bullet: 'bg-[#F2A65A]',
    callout: 'border-[#F2A65A]/20 bg-[#F2A65A]/8 text-[#ffd3a8]',
    ghost: 'text-[#F2A65A]',
  },
  token: {
    badge: 'border-white/20 bg-white/8 text-white/85',
    border: 'border-white/20 hover:border-white/35',
    glow: 'bg-white',
    icon: 'border-white/20 bg-gradient-to-br from-[#8B7CF7]/30 via-[#F2A65A]/20 to-[#7A9FF0]/30 text-white',
    marker: 'border-white bg-white shadow-[0_0_32px_rgba(255,255,255,0.4)]',
    bullet: 'bg-white/80',
    callout: 'border-white/15 bg-white/[0.05] text-white/75',
    ghost: 'text-white',
  },
  creator: {
    badge: 'border-[#E88BC7]/35 bg-[#E88BC7]/12 text-[#F0B3DB]',
    border: 'border-[#E88BC7]/25 hover:border-[#E88BC7]/45',
    glow: 'bg-[#E88BC7]',
    icon: 'border-[#E88BC7]/35 bg-[#E88BC7]/15 text-[#F0B3DB]',
    marker: 'border-[#E88BC7] bg-[#E88BC7] shadow-[0_0_28px_rgba(232,139,199,0.5)]',
    bullet: 'bg-[#F0B3DB]',
    callout: 'border-[#E88BC7]/20 bg-[#E88BC7]/8 text-[#F0B3DB]',
    ghost: 'text-[#E88BC7]',
  },
  blue: {
    badge: 'border-[#7A9FF0]/35 bg-[#7A9FF0]/12 text-[#B7CEFF]',
    border: 'border-[#7A9FF0]/25 hover:border-[#7A9FF0]/45',
    glow: 'bg-[#7A9FF0]',
    icon: 'border-[#7A9FF0]/35 bg-[#7A9FF0]/15 text-[#d7e4ff]',
    marker: 'border-[#7A9FF0] bg-[#7A9FF0] shadow-[0_0_28px_rgba(122,159,240,0.55)]',
    bullet: 'bg-[#B7CEFF]',
    callout: 'border-[#7A9FF0]/20 bg-[#7A9FF0]/8 text-[#d7e4ff]',
    ghost: 'text-[#7A9FF0]',
  },
}

const liveFoundation = [
  ['03', 'Onchain game modes'],
  ['ETH', 'Native wagers & payouts'],
  ['OPEN', 'Permissionless creation'],
  ['RULES', 'Deterministic settlement'],
] as const

const feeDestinations = [
  { label: 'Liquidity', detail: 'Deeper selected markets', color: 'bg-[#F2A65A]', width: 'w-[88%]' },
  { label: '$PROPHET', detail: 'Utility and buybacks', color: 'bg-[#8B7CF7]', width: 'w-[72%]' },
  { label: 'Creators', detail: 'Referrals and seasons', color: 'bg-[#E88BC7]', width: 'w-[60%]' },
  { label: 'Protocol', detail: 'Security, data and keepers', color: 'bg-[#7A9FF0]', width: 'w-[48%]' },
] as const

export function RoadmapPage() {
  return (
    <main className="mx-auto w-full max-w-[1440px] overflow-hidden px-4 py-8 sm:px-6 sm:py-12">
      <section className="roadmap-hero relative isolate min-h-[600px] overflow-hidden rounded-[36px] border border-white/10 bg-[#21182b] px-6 py-10 sm:px-10 sm:py-14 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-16">
        <div className="roadmap-hero-grid pointer-events-none absolute inset-0 opacity-70" />
        <div className="pointer-events-none absolute -left-24 -top-28 h-96 w-96 rounded-full bg-[#8B7CF7]/20 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-[#F2A65A]/15 blur-[110px]" />

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-white/65">
            <span className="h-1.5 w-1.5 rounded-full bg-[#8B7CF7] shadow-[0_0_12px_#8B7CF7]" />
            Prophet roadmap
          </div>
          <h1 className="mt-6 max-w-4xl font-display text-5xl font-black leading-[0.95] tracking-[-0.045em] text-[#f7f1e3] sm:text-7xl lg:text-[84px]">
            From three games<br />to one <span className="roadmap-gradient-text">ecosystem.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-relaxed text-white/55 sm:text-lg">
            Prophet begins with working onchain games. The next chapter adds deeper market insight, protocol liquidity,
            creator economics and a real utility layer for <strong className="text-white/85">$PROPHET</strong>.
          </p>
        </div>

        <div className="relative z-10 mx-auto mt-12 h-[340px] w-full max-w-[520px] lg:mt-0 lg:h-[460px]" aria-hidden="true">
          <div className="roadmap-orbit roadmap-orbit--outer" />
          <div className="roadmap-orbit roadmap-orbit--middle" />
          <div className="roadmap-orbit roadmap-orbit--inner" />
          <div className="roadmap-orbit-glow" />
          <div className="roadmap-orbit-core">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Utility layer</span>
            <strong className="font-display text-3xl text-white">$PROPHET</strong>
            <span className="text-[10px] font-bold text-[#B3A7FA]">powered by activity</span>
          </div>
          <div className="roadmap-orbit-node roadmap-orbit-node--market"><span>YES / NO</span><b>Markets</b></div>
          <div className="roadmap-orbit-node roadmap-orbit-node--race"><span>FASTEST</span><b>Races</b></div>
          <div className="roadmap-orbit-node roadmap-orbit-node--arena"><span>CLOSEST</span><b>Arena</b></div>
          <div className="roadmap-orbit-particle roadmap-orbit-particle--one" />
          <div className="roadmap-orbit-particle roadmap-orbit-particle--two" />
          <div className="roadmap-orbit-particle roadmap-orbit-particle--three" />
        </div>
      </section>

      <section className="relative z-20 mx-3 -mt-7 grid overflow-hidden rounded-3xl border border-white/10 bg-[#17111f]/95 shadow-2xl backdrop-blur-xl sm:mx-8 sm:grid-cols-2 lg:mx-14 lg:grid-cols-4">
        {liveFoundation.map(([value, label], index) => (
          <div key={label} className={`px-5 py-5 ${index > 0 ? 'border-t border-white/[0.07] sm:border-l sm:border-t-0' : ''}`}>
            <div className="font-mono text-sm font-black text-[#B3A7FA]">{value}</div>
            <div className="mt-1 text-xs font-bold text-white/55">{label}</div>
          </div>
        ))}
      </section>

      <section id="journey" className="scroll-mt-24 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#B3A7FA]">Five phases · one direction</p>
          <h2 className="mt-4 font-display text-4xl font-black sm:text-6xl">The path ahead.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-white/45 sm:text-base">
            Each phase has an activation gate. Planned mechanics become live only after their contracts, economics,
            settlement path and player experience have been validated.
          </p>
        </div>

        <div className="relative mx-auto mt-14 max-w-6xl">
          <div className="roadmap-spine pointer-events-none absolute bottom-10 left-[27px] top-10 w-px sm:left-1/2" />
          <div className="space-y-8 sm:space-y-14">
            {roadmapPhases.map((phase, index) => {
              const colors = phaseStyles[phase.tone]
              const cardOnRight = index % 2 === 1
              return (
                <article key={phase.number} className="relative grid sm:grid-cols-[1fr_76px_1fr] sm:items-center">
                  <div className={`ml-14 sm:ml-0 ${cardOnRight ? 'sm:col-start-3' : 'sm:col-start-1'}`}>
                    <div className={`group relative overflow-hidden rounded-[28px] border bg-[#21182b] p-5 transition duration-300 hover:-translate-y-1 sm:p-7 ${colors.border}`}>
                      <div className={`pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full opacity-[0.12] blur-3xl ${colors.glow}`} />
                      <div className="relative">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${colors.badge}`}>{phase.status}</span>
                          <div className={`grid h-11 w-11 place-items-center rounded-2xl border font-display text-xl font-black ${colors.icon}`}>{phase.symbol}</div>
                        </div>
                        <p className="mt-6 text-[11px] font-black uppercase tracking-[0.18em] text-white/35">Phase {phase.number} · {phase.eyebrow}</p>
                        <h3 className="mt-2 font-display text-2xl font-black leading-tight text-white sm:text-3xl">{phase.title}</h3>
                        <p className="mt-2 text-sm font-bold leading-relaxed text-white/70">{phase.tagline}</p>
                        <p className="mt-4 text-sm leading-relaxed text-white/45">{phase.description}</p>
                        <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                          {phase.items.map((item) => (
                            <li key={item} className="flex gap-2.5 text-xs leading-relaxed text-white/65">
                              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${colors.bullet}`} />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                        {phase.callout && <p className={`mt-6 rounded-2xl border px-4 py-3 text-xs font-bold leading-relaxed ${colors.callout}`}>{phase.callout}</p>}
                      </div>
                    </div>
                  </div>

                  <div className="absolute left-0 top-8 grid h-14 w-14 place-items-center sm:static sm:col-start-2 sm:row-start-1 sm:mx-auto">
                    <div className={`roadmap-marker relative grid h-11 w-11 place-items-center rounded-full border-4 border-[#17111f] font-mono text-[11px] font-black text-[#17111f] ${colors.marker}`}>
                      {phase.number}
                    </div>
                  </div>

                  <div className={`hidden px-7 sm:block ${cardOnRight ? 'sm:col-start-1 sm:row-start-1 sm:text-right' : 'sm:col-start-3 sm:row-start-1'}`}>
                    <div className={`font-display text-4xl font-black uppercase tracking-[-0.04em] lg:text-6xl ${colors.ghost}`}>{phase.eyebrow}</div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="roadmap-flywheel relative overflow-hidden rounded-[36px] border border-white/10 bg-[#21182b] px-6 py-10 sm:px-10 sm:py-14 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:px-14">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#8B7CF7]/10 via-transparent to-[#F2A65A]/10" />
        <div className="relative">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#F2A65A]">The proposed fee flywheel</p>
          <h2 className="mt-4 max-w-xl font-display text-4xl font-black leading-tight sm:text-5xl">Usage compounds into a stronger product.</h2>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/50 sm:text-base">
            Prophet fees remain in ETH and move through transparent, purpose-built vaults. Allocation rules and token
            mechanics activate only after technical, governance and legal review.
          </p>

          <div className="mt-9 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
            <FlywheelNode label="Players & creators" value="ACTIVITY" tone="purple" />
            <FlowArrow />
            <FlywheelNode label="Games & volume" value="FEES" tone="orange" />
            <div className="hidden sm:block"><FlowArrow /></div>
            <div className="col-span-3 mt-2 sm:col-span-1 sm:mt-0"><FlywheelNode label="Protocol routing" value="GROWTH" tone="blue" /></div>
          </div>

          <div className="mt-5 flex items-center justify-center gap-3 rounded-2xl border border-white/[0.07] bg-black/10 px-4 py-3 text-center text-xs font-bold text-white/45">
            <span className="roadmap-loop-symbol text-lg text-[#B3A7FA]">↻</span>
            Better markets attract the next cycle of activity
          </div>
        </div>

        <div className="relative mt-10 rounded-[28px] border border-white/10 bg-[#17111f]/70 p-5 lg:mt-0 lg:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Fee destinations</p>
              <h3 className="mt-1 font-display text-2xl font-bold">Transparent by design.</h3>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold text-white/45">PROPOSED</span>
          </div>
          <div className="mt-7 space-y-5">
            {feeDestinations.map((item) => (
              <div key={item.label}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="text-sm font-black text-white/85">{item.label}</span>
                  <span className="text-[11px] text-white/35">{item.detail}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={`roadmap-fee-bar h-full rounded-full ${item.color} ${item.width}`} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-7 border-t border-white/[0.07] pt-5 text-[11px] leading-relaxed text-white/30">
            Bar lengths illustrate routing categories - not final allocation percentages. Exact parameters will be published before activation.
          </p>
        </div>
      </section>

      <section className="relative my-16 overflow-hidden rounded-[36px] border border-white/10 bg-[#f0ebff] px-6 py-12 text-[#241a33] sm:px-12 sm:py-16 lg:px-16">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[#F2A65A]/50 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/4 h-72 w-72 rounded-full bg-[#7A9FF0]/35 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <span className="inline-flex rounded-full bg-[#241a33]/8 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]">The long-term vision</span>
            <h2 className="mt-5 max-w-4xl font-display text-4xl font-black leading-[1.05] tracking-[-0.035em] sm:text-6xl">
              Game layer → Liquidity network → Creator economy → Open prediction ecosystem.
            </h2>
            <p className="mt-6 max-w-3xl text-sm font-medium leading-relaxed text-[#554b62] sm:text-base">
              Users create. Communities distribute. Liquidity improves participation. Transparent protocol activity
              strengthens the entire Prophet ecosystem.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:max-w-[220px] lg:flex-col">
            <Link to="/whitepaper" className="rounded-full border border-[#241a33]/20 px-6 py-3 text-center text-sm font-black transition hover:border-[#241a33]/40">
              Read the whitepaper
            </Link>
          </div>
        </div>
      </section>

    </main>
  )
}

function FlowArrow() {
  return <div className="roadmap-flow-arrow font-mono text-lg text-white/25" aria-hidden="true">→</div>
}

function FlywheelNode({ label, value, tone }: { label: string; value: string; tone: 'purple' | 'orange' | 'blue' }) {
  const toneClass = tone === 'purple'
    ? 'border-[#8B7CF7]/25 bg-[#8B7CF7]/10 text-[#B3A7FA]'
    : tone === 'orange'
      ? 'border-[#F2A65A]/25 bg-[#F2A65A]/10 text-[#F2A65A]'
      : 'border-[#7A9FF0]/25 bg-[#7A9FF0]/10 text-[#B7CEFF]'
  return (
    <div className={`rounded-2xl border px-3 py-4 text-center ${toneClass}`}>
      <div className="font-mono text-[10px] font-black tracking-[0.14em]">{value}</div>
      <div className="mt-1 text-[10px] font-bold text-white/45">{label}</div>
    </div>
  )
}
