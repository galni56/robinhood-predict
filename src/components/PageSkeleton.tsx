/** Suspense fallback for lazy-loaded routes: a neutral page frame in the
 * brand's dark surface colors, so switching to a not-yet-downloaded page
 * shows structure immediately instead of a blank main area. Purely
 * presentational. */
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8" aria-busy="true" aria-label="Loading page">
      <div className="skeleton-block h-4 w-28 rounded-full" />
      <div className="skeleton-block mt-3 h-9 w-72 max-w-full rounded-none" />
      <div className="skeleton-block mt-3 h-4 w-96 max-w-full rounded-full" />
      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="rounded-none border border-white/5 bg-[#221c40] p-5">
            <div className="flex items-center gap-3">
              <div className="skeleton-block h-10 w-10 rounded-none" />
              <div className="flex-1 space-y-2">
                <div className="skeleton-block h-3.5 w-20 rounded-full" />
                <div className="skeleton-block h-3 w-28 rounded-full" />
              </div>
            </div>
            <div className="skeleton-block mt-5 h-6 w-4/5 rounded-none" />
            <div className="skeleton-block mt-4 h-1.5 w-full rounded-full" />
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <div className="skeleton-block h-10 rounded-none" />
              <div className="skeleton-block h-10 rounded-none" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
