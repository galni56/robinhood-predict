import { Link } from 'react-router-dom'
import { TrophyIcon } from '@/components/icons'

/** Placeholder while the leaderboard is rebuilt from Solana game events
 * (Asset Race and Price Arena claims), replacing the retired Prediction
 * Market log scan. */
export function OnchainLeaderboardPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <TrophyIcon className="mx-auto h-10 w-10 text-[#F2A65A]" />
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">Leaderboard</h1>
        <p className="mt-3 text-sm text-white/55">
          The leaderboard is moving to Solana. It will rank wallets by net winnings across Asset Races and Price
          Arenas once the new indexer is live.
        </p>
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
