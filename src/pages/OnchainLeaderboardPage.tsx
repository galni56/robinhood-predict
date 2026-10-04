import { useSearchParams } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { useHistory } from '@/chain/history'
import { AddressAvatar } from '@/components/AddressAvatar'
import { AddressLabel } from '@/components/AddressLabel'
import { ClusterBanner } from '@/components/ClusterBanner'
import { FilterChips } from '@/components/FilterChips'
import { TrophyIcon } from '@/components/icons'
import { TokenLogo } from '@/components/TokenLogo'
import { formatCompactSol, formatSol } from '@/lib/format'

type Board = 'all' | 'races' | 'arenas'

const BOARD_OPTIONS = [
  { key: 'all', label: 'All games' },
  { key: 'races', label: 'Asset Races', accent: 'race' },
  { key: 'arenas', label: 'Price Arena', accent: 'arena' },
] as const

interface Row {
  wallet: string
  staked: string
  claimed: string
  refunded: string
  net: string
  games?: number
  wins?: number
  symbols?: string[]
}

/** Wallets ranked by net SOL result (received - staked), from the history
 * indexer. Open stakes count as spent until their game settles. */
export function OnchainLeaderboardPage() {
  const [params, setParams] = useSearchParams()
  const board: Board = params.get('board') === 'races' || params.get('board') === 'arenas' ? (params.get('board') as Board) : 'all'
  const history = useHistory()
  const { publicKey } = useWallet()
  const me = publicKey?.toBase58()
  const rows: Row[] = board === 'all'
    ? history.data?.leaderboard ?? []
    : history.data?.leaderboards?.[board === 'races' ? 'race' : 'arena'] ?? []

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8">
      <ClusterBanner />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-[#ff4f8b]"><TrophyIcon className="h-4 w-4" /> Leaderboard</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">Who reads the market best.</h1>
          <p className="mt-2 text-sm text-white/45">Ranked by net result in SOL: everything received back minus everything staked.</p>
        </div>
        <FilterChips options={BOARD_OPTIONS} value={board} onChange={(next) => setParams(next === 'all' ? {} : { board: next })} />
      </div>

      <div className="mt-6 overflow-hidden rounded-none border border-white/5 bg-[#221c40]">
        <div className="hidden grid-cols-[3rem_minmax(0,1fr)_8rem_8rem_8rem] gap-3 border-b border-white/5 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white/30 sm:grid">
          <span>#</span><span>Player</span><span className="text-right">Staked</span><span className="text-right">Received</span><span className="text-right">Net</span>
        </div>
        {history.isLoading ? <p className="px-4 py-10 text-center text-sm text-white/35">Loading leaderboard…</p>
          : history.isError && !history.data ? <p className="px-4 py-10 text-center text-sm text-white/35">The leaderboard is unavailable right now.</p>
            : rows.length === 0 ? <p className="px-4 py-10 text-center text-sm text-white/35">No settled SOL games yet.</p>
              : rows.map((row, index) => {
                const net = BigInt(row.net)
                const received = BigInt(row.claimed) + BigInt(row.refunded)
                return (
                  <div key={row.wallet} className={`grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-white/5 px-4 py-3 first:border-t-0 sm:grid-cols-[3rem_minmax(0,1fr)_8rem_8rem_8rem] ${row.wallet === me ? 'bg-[#ff4f8b]/10' : ''}`}>
                    <span className={`font-mono text-sm ${index < 3 ? 'font-bold text-[#fbf3e2]' : 'text-white/35'}`}>{index + 1}</span>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <AddressAvatar address={row.wallet} size={26} />
                      <div className="min-w-0">
                        <AddressLabel address={row.wallet} className="block truncate font-bold text-white/85 hover:text-white" />
                        <div className="flex items-center gap-1.5 text-[11px] text-white/35">
                          {row.games != null && <span>{row.games} game{row.games === 1 ? '' : 's'} · {row.wins ?? 0} win{row.wins === 1 ? '' : 's'}</span>}
                          {row.symbols?.map((symbol) => <TokenLogo key={symbol} ticker={symbol} className="h-4 w-4 rounded" />)}
                          {row.wallet === me && <span className="font-bold text-[#ff4f8b]">you</span>}
                        </div>
                      </div>
                    </div>
                    <span title={`${formatSol(BigInt(row.staked))} SOL`} className="hidden text-right font-mono text-sm tabular-nums text-white/60 sm:block">{formatCompactSol(BigInt(row.staked))}</span>
                    <span title={`${formatSol(received)} SOL`} className="hidden text-right font-mono text-sm tabular-nums text-white/60 sm:block">{formatCompactSol(received)}</span>
                    <span title={`${formatSol(net)} SOL`} className={`text-right font-mono text-sm font-bold tabular-nums ${net > 0n ? 'text-emerald-300' : net < 0n ? 'text-rose-400' : 'text-white/50'}`}>{net > 0n ? '+' : ''}{formatCompactSol(net)}</span>
                  </div>
                )
              })}
      </div>
      <p className="mt-3 text-[11px] text-white/30">SOL-staked games only. Updated {history.data ? new Date(history.data.updatedAt * 1000).toLocaleTimeString() : '…'}.</p>
    </div>
  )
}
