interface GameListLoadingGridProps {
  accent?: 'purple' | 'orange' | 'blue'
  cards?: number
}

const accentClass = {
  purple: 'bg-[#8B7CF7]/15',
  orange: 'bg-[#F2A65A]/15',
  blue: 'bg-[#7A9FF0]/15',
} as const

/**
 * Reserves the same footprint as a populated game grid while the first
 * authoritative snapshot is loading. Keeping real card geometry here stops
 * the footer and adjacent columns from jumping as RPC batches resolve.
 */
export function GameListLoadingGrid({ accent = 'purple', cards = 6 }: GameListLoadingGridProps) {
  return (
    <div
      aria-label="Loading games"
      aria-busy="true"
      className="grid min-h-[32rem] grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3"
    >
      {Array.from({ length: cards }, (_, index) => (
        <div
          key={index}
          className="min-h-64 animate-pulse rounded-3xl border border-white/5 bg-[#241b2f] p-5"
        >
          <div className="flex items-center justify-between gap-4">
            <div className={`h-7 w-24 rounded-full ${accentClass[accent]}`} />
            <div className="h-7 w-20 rounded-full bg-white/5" />
          </div>
          <div className="mt-5 h-6 w-3/5 rounded-md bg-white/10" />
          <div className="mt-3 h-4 w-2/5 rounded bg-white/5" />
          <div className="mt-7 h-14 rounded-2xl bg-black/10" />
          <div className="mt-7 flex items-center justify-between gap-4">
            <div className="h-4 w-28 rounded bg-white/5" />
            <div className={`h-7 w-24 rounded-full ${accentClass[accent]}`} />
          </div>
        </div>
      ))}
    </div>
  )
}
