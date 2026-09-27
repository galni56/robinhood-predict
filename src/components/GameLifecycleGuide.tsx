import clsx from 'clsx'

export interface LifecycleStage {
  title: string
  timing: string
  body: string
}

interface GameLifecycleGuideProps {
  tone: 'market' | 'race' | 'arena'
  eyebrow: string
  title: string
  intro: string
  stages: readonly LifecycleStage[]
  note: string
}

const toneClasses = {
  market: {
    accent: 'text-[#B3A7FA]',
    badge: 'border-[#8B7CF7]/30 bg-[#8B7CF7]/15 text-[#B3A7FA]',
    number: 'bg-[#8B7CF7] text-white',
    line: 'bg-[#8B7CF7]/25',
    note: 'border-[#8B7CF7]/20 bg-[#8B7CF7]/10 text-[#d8d0ff]',
  },
  race: {
    accent: 'text-[#F2A65A]',
    badge: 'border-[#F2A65A]/30 bg-[#F2A65A]/15 text-[#F2A65A]',
    number: 'bg-[#F2A65A] text-[#3b2416]',
    line: 'bg-[#F2A65A]/25',
    note: 'border-[#F2A65A]/20 bg-[#F2A65A]/10 text-[#ffd3a8]',
  },
  arena: {
    accent: 'text-[#B7CEFF]',
    badge: 'border-[#7A9FF0]/30 bg-[#7A9FF0]/15 text-[#B7CEFF]',
    number: 'bg-[#7A9FF0] text-[#152447]',
    line: 'bg-[#7A9FF0]/25',
    note: 'border-[#7A9FF0]/20 bg-[#7A9FF0]/10 text-[#d7e4ff]',
  },
} as const

export function GameLifecycleGuide({ tone, eyebrow, title, intro, stages, note }: GameLifecycleGuideProps) {
  const colors = toneClasses[tone]

  return (
    <section className="rounded-3xl border border-white/[0.07] bg-[#241b2f] p-5 sm:p-6">
      <div className={clsx('mb-3 inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]', colors.badge)}>
        {eyebrow}
      </div>
      <h2 className="font-display text-2xl font-bold leading-tight text-white">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-white/50">{intro}</p>

      <ol className="mt-5 space-y-1">
        {stages.map((stage, index) => (
          <li key={`${stage.title}-${stage.timing}`} className="grid grid-cols-[32px_1fr] gap-3">
            <div className="flex flex-col items-center">
              <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black', colors.number)}>
                {index + 1}
              </span>
              {index < stages.length - 1 && <span className={clsx('my-1 min-h-5 w-px flex-1', colors.line)} />}
            </div>
            <div className={clsx('pb-4', index === stages.length - 1 && 'pb-1')}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                <h3 className="text-sm font-bold text-white/90">{stage.title}</h3>
                <span className={clsx('text-[11px] font-bold', colors.accent)}>{stage.timing}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-white/45">{stage.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className={clsx('mt-4 rounded-2xl border px-4 py-3 text-xs font-medium leading-relaxed', colors.note)}>{note}</p>
    </section>
  )
}
