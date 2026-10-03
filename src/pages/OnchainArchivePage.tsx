import { Link } from 'react-router-dom'

/** Placeholder while archive is rebuilt on Solana accounts and
 * game events (Asset Race positions and Price Arena entries). */
export function OnchainArchivePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight">Archive</h1>
        <p className="mt-3 text-sm text-white/55">Finished races and arenas will be listed here once the Solana history indexer is live.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/onchain/races" className="rounded-full bg-[#ED8F3A] px-5 py-2 text-sm font-bold text-[#3b2416] hover:bg-[#F2A65A]">
            Asset Races
          </Link>
          <Link to="/onchain/arenas" className="rounded-full bg-[#7A9FF0] px-5 py-2 text-sm font-bold text-[#152447] hover:bg-[#8EB1F8]">
            Price Arena
          </Link>
        </div>
      </div>
    </div>
  )
}
