import { useHistory } from '@/chain/history'
import { AddressLabel } from '@/components/AddressLabel'
import { BoltIcon, TrophyIcon } from '@/components/icons'
import { TokenLogo } from '@/components/TokenLogo'
import { explorerUrl } from '@/solana/config'
import { formatCompactSol, formatSol } from '@/lib/format'
import { SOL_STAKE_TOKEN, formatStakeAmount, formatStakeExact, useStakeTokenLookup } from '@/solana/stakeTokens'
import { shortHash } from '@/lib/hash'

export type GameActivityKind = 'race' | 'arena'

export function GameActivitySidebar({
  kind,
}: {
  kind: GameActivityKind
}) {
  const history = useHistory()
  const tokenOf = useStakeTokenLookup()
  const leaderboard = history.data?.leaderboards?.[kind].slice(0, 10)
  const recent = history.data?.activity
    .filter((item) => item.game === kind && (item.type === 'bet' || item.type === 'entry') && item.wallet && item.amount)
    .slice(0, 12)
  const accentText = kind === 'race' ? 'text-[#ffd23f]' : 'text-[#6bcbf4]'
  const loading = history.isLoading
  const unavailable = history.isError && !history.data

  return (
    <div className="space-y-5">
      <div className="border-[3px] border-[#191330] bg-[#221c40] p-4 text-[#fbf3e2] shadow-[5px_5px_0_#191330]">
        <h2 className="px-font mb-4 flex items-center gap-2 text-[10px]">
          <TrophyIcon className={`h-4 w-4 ${accentText}`} /> Leaderboard
        </h2>
        <div className="space-y-1">
          {loading ? <p className="py-4 text-center text-xs text-white/30">Loading history…</p>
            : unavailable ? <p className="py-4 text-center text-xs text-white/30">History is unavailable right now</p>
              : !leaderboard?.length ? <p className="py-4 text-center text-xs text-white/30">No bets placed yet</p>
                : leaderboard.map((stats, index) => {
                  const net = BigInt(stats.net)
                  return <a key={stats.wallet} href={explorerUrl('address', stats.wallet)} target="_blank" rel="noreferrer" className="grid min-w-0 grid-cols-[1rem_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-none px-2 py-1.5 text-sm transition-colors hover:bg-white/5">
                    <span className="w-4 text-center font-mono text-xs text-white/30">{index + 1}</span>
                    <span className="flex -space-x-1" title={stats.symbols.join(', ') || 'Asset pending'}>
                      {(stats.symbols.length > 0 ? stats.symbols : [undefined]).map((symbol, symbolIndex) => (
                        <TokenLogo key={`${symbol ?? 'unknown'}:${symbolIndex}`} ticker={symbol} className="h-5 w-5 rounded-none ring-1 ring-[#221c40]" />
                      ))}
                    </span>
                    <AddressLabel address={stats.wallet} link={false} className="min-w-0 truncate font-mono text-xs" />
                    <span title={`${formatSol(net)} SOL`} className={`whitespace-nowrap text-right font-mono text-[0.7rem] tabular-nums ${net >= 0n ? accentText : 'text-rose-400'}`}>{net >= 0n ? '+' : ''}{formatCompactSol(net)}</span>
                  </a>
                })}
        </div>
      </div>

      <div className="border-[3px] border-[#191330] bg-[#221c40] p-4 text-[#fbf3e2] shadow-[5px_5px_0_#191330]">
        <h2 className="px-font mb-4 flex items-center gap-2 text-[10px]">
          <BoltIcon className={`h-4 w-4 ${accentText}`} /> Recent bets
        </h2>
        <div className="space-y-1.5">
          {loading ? <p className="py-4 text-center text-xs text-white/30">Loading history…</p>
            : unavailable ? <p className="py-4 text-center text-xs text-white/30">History is unavailable right now</p>
              : !recent?.length ? <p className="py-4 text-center text-xs text-white/30">No bets yet</p>
                : recent.map((bet) => {
                  const amount = BigInt(bet.amount!)
                  // Older snapshots carry no stake mint; those games were all SOL.
                  const token = bet.stakeMint ? tokenOf(bet.stakeMint) : SOL_STAKE_TOKEN
                  return <div key={`${bet.signature}:${bet.wallet}`} className="rounded-none bg-white/5 px-2.5 py-2 text-xs">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <TokenLogo ticker={bet.symbol ?? undefined} className="h-6 w-6 rounded-none" />
                        <div className="min-w-0 truncate font-bold text-white/75">{bet.symbol ?? `${kind} #${bet.gameId ?? '?'}`}</div>
                      </div>
                      <div title={formatStakeExact(amount, token)} className="shrink-0 whitespace-nowrap text-right font-mono text-white/70 tabular-nums">{formatStakeAmount(amount, token)}</div>
                    </div>
                    <div className="mt-1.5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-white/5 pt-1.5">
                      <AddressLabel address={bet.wallet!} className="min-w-0 truncate font-mono text-white/40 hover:text-white" />
                      <a href={explorerUrl('tx', bet.signature)} target="_blank" rel="noreferrer" className="whitespace-nowrap font-mono text-white/35 hover:text-white">{shortHash(bet.signature)}</a>
                    </div>
                  </div>
                })}
        </div>
      </div>
    </div>
  )
}
