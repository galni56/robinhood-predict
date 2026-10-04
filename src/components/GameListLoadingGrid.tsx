interface GameListLoadingGridProps {
  accent?: 'purple' | 'orange' | 'blue'
  cards?: number
}

const accentClass = {
  purple: 'bg-[#ff4f8b]/15',
  orange: 'bg-[#ffd23f]/15',
  blue: 'bg-[#6bcbf4]/15',
} as const

/**
 * Reserves the same footprint as a populated game grid while the first
 * authoritative snapshot is loading. Keeping real card geometry here stops
 * the footer and adjacent columns from jumping as RPC batches resolve.
 */
export function GameListLoadingGrid({ accent = 'purple', cards = 6 }: GameListLoadingGridProps) {
  return (
    <div
      aria-label="Searching for active games"
      aria-busy="true"
      className="grid min-h-[32rem] grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3"
    >
      <div className="col-span-full flex h-8 items-center gap-2 text-sm font-medium text-[#191330]/50">
        <span className={`h-2 w-2 animate-pulse rounded-full ${accentClass[accent]}`} />
        Searching for active games…
      </div>
      {Array.from({ length: cards }, (_, index) => (
        <div
          key={index}
          className="min-h-64 animate-pulse border-[4px] border-[#1B1340] bg-[#FFF6DF] p-5 shadow-[6px_10px_0_#1B1340]"
        >
          <div className="flex items-center justify-between gap-4">
            <div className={`h-7 w-24 rounded-full ${accentClass[accent]}`} />
            <div className="h-7 w-20 rounded-full bg-[#1B1340]/5" />
          </div>
          <div className="mt-5 h-6 w-3/5 rounded-none bg-white/10" />
          <div className="mt-3 h-4 w-2/5 rounded bg-[#1B1340]/5" />
          <div className="mt-7 h-14 rounded-none bg-[#1B1340]/5" />
          <div className="mt-7 flex items-center justify-between gap-4">
            <div className="h-4 w-28 rounded bg-[#1B1340]/5" />
            <div className={`h-7 w-24 rounded-full ${accentClass[accent]}`} />
          </div>
        </div>
      ))}
    </div>
  )
}
