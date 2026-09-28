import { formatEther } from 'viem'
import { robinhoodMainnet } from '@/chain/config'
import { type GameActivityKind, useGameActivity } from '@/chain/gameActivity'
import { AddressLabel } from '@/components/AddressLabel'
import { BoltIcon, TrophyIcon } from '@/components/icons'
import { TokenLogo } from '@/components/TokenLogo'
import { formatCompactEth } from '@/lib/format'
import { shortHash } from '@/lib/hash'

export function GameActivitySidebar({
  kind,
  symbolFor,
}: {
  kind: GameActivityKind
  symbolFor: (gameId: bigint, assetIndex?: number) => string | undefined
}) {
  const activity = useGameActivity(kind)
  const leaderboard = activity.data?.leaderboard
  const recent = activity.data?.recent
  const accentText = kind === 'race' ? 'text-[#F2A65A]' : kind === 'arena' ? 'text-[#B7CEFF]' : 'text-[#B3A7FA]'

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/5 bg-[#241b2f] p-4">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold">
          <TrophyIcon className={`h-4 w-4 ${accentText}`} /> Leaderboard
        </h2>
        <div className="space-y-1">
          {activity.isLoading ? <p className="py-4 text-center text-xs text-white/30">Scanning chain…</p>
            : !leaderboard?.length ? <p className="py-4 text-center text-xs text-white/30">No bets placed yet</p>
              : leaderboard.map((stats, index) => {
                const net = stats.claimed - stats.staked
                return <a key={stats.address} href={`${robinhoodMainnet.blockExplorers.default.url}/address/${stats.address}`} target="_blank" rel="noreferrer" className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-white/5">
                  <span className="w-4 text-center font-mono text-xs text-white/30">{index + 1}</span>
                  <AddressLabel address={stats.address} link={false} className="min-w-0 truncate font-mono text-xs" />
                  <span title={`${formatEther(net)} ETH`} className={`whitespace-nowrap text-right font-mono text-[0.7rem] tabular-nums ${net >= 0n ? accentText : 'text-rose-400'}`}>{net >= 0n ? '+' : ''}{formatCompactEth(net)}</span>
                </a>
              })}
        </div>
      </div>

      <div className="rounded-3xl border border-white/5 bg-[#241b2f] p-4">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold">
          <BoltIcon className={`h-4 w-4 ${accentText}`} /> Recent bets
        </h2>
        <div className="space-y-1.5">
          {activity.isLoading ? <p className="py-4 text-center text-xs text-white/30">Scanning chain…</p>
            : !recent?.length ? <p className="py-4 text-center text-xs text-white/30">No bets yet</p>
              : recent.map((bet) => {
                const symbol = symbolFor(bet.gameId, bet.assetIndex)
                return <div key={`${bet.txHash}:${bet.gameId}`} className="rounded-xl bg-white/5 px-2.5 py-2 text-xs">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <TokenLogo ticker={symbol} className="h-6 w-6 rounded-md" />
                      <div className="min-w-0 truncate font-bold text-white/75">{symbol ?? `${kind} #${bet.gameId}`}</div>
                    </div>
                    <div title={`${formatEther(bet.amount)} ETH`} className="shrink-0 whitespace-nowrap text-right font-mono text-white/70 tabular-nums">{formatCompactEth(bet.amount)}</div>
                  </div>
                  <div className="mt-1.5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-white/5 pt-1.5">
                    <AddressLabel address={bet.user} className="min-w-0 truncate font-mono text-white/40 hover:text-white" />
                    <a href={`${robinhoodMainnet.blockExplorers.default.url}/tx/${bet.txHash}`} target="_blank" rel="noreferrer" className="whitespace-nowrap font-mono text-white/35 hover:text-white">{shortHash(bet.txHash)}</a>
                  </div>
                </div>
              })}
        </div>
      </div>
    </div>
  )
}
