import { formatUnits } from 'viem'
import { robinhoodMainnet } from '@/chain/config'
import { type GameActivityKind, useGameActivity } from '@/chain/gameActivity'
import { AddressLabel } from '@/components/AddressLabel'
import { BoltIcon, TrophyIcon } from '@/components/icons'
import { TokenLogo } from '@/components/TokenLogo'
import { formatUsd } from '@/lib/format'
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

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/5 bg-[#241b2f] p-4">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold">
          <TrophyIcon className="h-4 w-4 text-[#F2A65A]" /> Leaderboard
        </h2>
        <div className="space-y-1">
          {activity.isLoading ? <p className="py-4 text-center text-xs text-white/30">Scanning chain…</p>
            : !leaderboard?.length ? <p className="py-4 text-center text-xs text-white/30">No bets placed yet</p>
              : leaderboard.map((stats, index) => {
                const net = stats.claimed - stats.staked
                return <a key={stats.address} href={`${robinhoodMainnet.blockExplorers.default.url}/address/${stats.address}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-white/5">
                  <span className="w-4 text-center font-mono text-xs text-white/30">{index + 1}</span>
                  <AddressLabel address={stats.address} link={false} className="flex-1 truncate font-mono text-xs" />
                  <span className={`font-mono text-xs ${net >= 0n ? 'text-[#B3A7FA]' : 'text-rose-400'}`}>{net >= 0n ? '+' : ''}{formatUsd(Number(formatUnits(net, 6)), 0)}</span>
                </a>
              })}
        </div>
      </div>

      <div className="rounded-3xl border border-white/5 bg-[#241b2f] p-4">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold">
          <BoltIcon className="h-4 w-4 text-[#B3A7FA]" /> Recent bets
        </h2>
        <div className="space-y-1.5">
          {activity.isLoading ? <p className="py-4 text-center text-xs text-white/30">Scanning chain…</p>
            : !recent?.length ? <p className="py-4 text-center text-xs text-white/30">No bets yet</p>
              : recent.map((bet) => {
                const symbol = symbolFor(bet.gameId, bet.assetIndex)
                return <div key={`${bet.txHash}:${bet.gameId}`} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-xs">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <TokenLogo ticker={symbol} className="h-6 w-6 rounded-md" />
                    <div className="min-w-0"><div className="truncate font-bold text-white/75">{symbol ?? `${kind} #${bet.gameId}`}</div><AddressLabel address={bet.user} className="block truncate font-mono text-white/40 hover:text-white" /></div>
                  </div>
                  <div className="shrink-0 text-right"><div className="font-mono text-white/70">{formatUnits(bet.amount, 6)} USDG</div><a href={`${robinhoodMainnet.blockExplorers.default.url}/tx/${bet.txHash}`} target="_blank" rel="noreferrer" className="font-mono text-white/35 hover:text-white">{shortHash(bet.txHash)}</a></div>
                </div>
              })}
        </div>
      </div>
    </div>
  )
}
