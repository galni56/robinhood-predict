import { useId, useState } from 'react'
import clsx from 'clsx'

export interface LifecycleStage {
  title: string
  timing: string
  body: string
}

interface GameLifecycleGuideProps {
  className?: string
  tone: 'market' | 'race' | 'arena'
  eyebrow: string
  title: string
  intro: string
  stages: readonly LifecycleStage[]
  note: string
}

const toneClasses = {
  market: {
    accent: 'text-[#ff4f8b]',
    badge: 'border-[#ff4f8b]/30 bg-[#ff4f8b]/15 text-[#ff4f8b]',
    number: 'bg-[#ff4f8b] text-white',
    line: 'bg-[#ff4f8b]/25',
    note: 'border-[#ff4f8b]/20 bg-[#ff4f8b]/10 text-[#d8d0ff]',
    disclosure: 'border-[#ff4f8b]/30 bg-[#ff4f8b]/10 text-[#d8d0ff] hover:bg-[#ff4f8b]/20',
  },
  race: {
    accent: 'text-[#B8860B]',
    badge: 'border-[#ffd23f]/30 bg-[#ffd23f]/15 text-[#B8860B]',
    number: 'bg-[#ffd23f] text-[#191330]',
    line: 'bg-[#ffd23f]/25',
    note: 'border-[#ffd23f]/20 bg-[#ffd23f]/10 text-[#B8860B]',
    disclosure: 'border-[#ffd23f]/30 bg-[#ffd23f]/10 text-[#B8860B] hover:bg-[#ffd23f]/20',
  },
  arena: {
    accent: 'text-[#1F7FD1]',
    badge: 'border-[#6bcbf4]/30 bg-[#6bcbf4]/15 text-[#1F7FD1]',
    number: 'bg-[#6bcbf4] text-[#191330]',
    line: 'bg-[#6bcbf4]/25',
    note: 'border-[#6bcbf4]/20 bg-[#6bcbf4]/10 text-[#d7e4ff]',
    disclosure: 'border-[#6bcbf4]/30 bg-[#6bcbf4]/10 text-[#d7e4ff] hover:bg-[#6bcbf4]/20',
  },
} as const

export function GameLifecycleGuide({ className, tone, eyebrow, title, intro, stages, note }: GameLifecycleGuideProps) {
  const colors = toneClasses[tone]
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()

  return (
    <section className={clsx('flex flex-col rounded-none border border-white/[0.07] bg-[#FFF6DF]', expanded ? 'p-5 sm:p-6' : 'p-4 sm:p-5', className)}>
      <div className={clsx('mb-3 inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]', colors.badge)}>
        {eyebrow}
      </div>
      <h2 className="font-display text-2xl font-bold leading-tight text-white">{title}</h2>

      <div id={contentId} className={expanded ? undefined : 'flex min-h-0 flex-1 flex-col'}>
        {expanded ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-[#1B1340]/60">{intro}</p>
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
                    <p className="mt-1 text-xs leading-relaxed text-[#1B1340]/55">{stage.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <p className={clsx('mt-4 rounded-none border px-4 py-3 text-xs font-medium leading-relaxed', colors.note)}>{note}</p>
          </>
        ) : (
          <ol className="mt-4 grid flex-1 auto-rows-fr overflow-hidden rounded-none border border-white/[0.07] bg-[#1B1340]/5">
            {stages.map((stage, index) => (
              <li
                key={`${stage.title}-${stage.timing}`}
                className={clsx('grid min-h-9 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5', index > 0 && 'border-t border-white/[0.06]')}
              >
                <span className={clsx('grid h-5 w-5 place-items-center rounded-full text-[10px] font-black', colors.number)}>{index + 1}</span>
                <span className="min-w-0 text-xs font-bold leading-tight text-[#1B1340]/80">{stage.title}</span>
                <span className={clsx('text-right text-[10px] font-bold leading-tight', colors.accent)}>{stage.timing}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
        className={clsx('mt-4 flex w-full items-center justify-center gap-2 rounded-none border px-4 py-2.5 text-xs font-bold transition-colors', colors.disclosure)}
      >
        {expanded ? 'Collapse lifecycle' : 'Read full lifecycle'}
        <span aria-hidden="true">{expanded ? '↑' : '↓'}</span>
      </button>
    </section>
  )
}
