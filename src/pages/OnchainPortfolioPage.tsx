import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { TransactionInstruction } from '@solana/web3.js'
import { useWallet } from '@solana/wallet-adapter-react'
import { assetRaceStatusLabel } from '@/chain/assetRaces'
import { arenaPhaseLabel, arenaPhase } from '@/chain/priceArena'
import { settleArenaInstructions, settleRaceInstructions, withdrawCreatorFeesInstructions } from '@/chain/gameTx'
import { useHistory, type HistoryActivity } from '@/chain/history'
import { useAssetRaceClock } from '@/chain/useAssetRaceClock'
import { useWalletGames, type WalletArenaEntry, type WalletGameAction, type WalletRacePosition } from '@/chain/useWalletGames'
import { ClusterBanner } from '@/components/ClusterBanner'
import { TokenLogo } from '@/components/TokenLogo'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { NATIVE_SOL, explorerUrl } from '@/solana/config'
import { usePrograms } from '@/solana/programs'
import { useSendInstructions } from '@/solana/tx'
import { formatCompactSol, formatSol, shortTxError, timeAgo } from '@/lib/format'
import { SOL_STAKE_TOKEN, formatStakeAmount, useStakeTokenLookup } from '@/solana/stakeTokens'
import { shortHash } from '@/lib/hash'

const ACTION_LABEL: Record<Exclude<WalletGameAction, 'none'>, string> = {
  claim: 'Claim',
  refund: 'Refund',
  closeLosing: 'Close',
}

const ACTIVITY_LABEL: Record<string, string> = {
  bet: 'Bet',
  entry: 'Arena entry',
  claim: 'Claimed',
  refund: 'Refunded',
}

function Stat({ label, value, title, tone }: { label: string; value: string; title?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/5 bg-[#241b2f] p-4">
      <div className="text-xs text-white/35">{label}</div>
      <div title={title} className={`mt-1 truncate font-mono text-xl font-bold tabular-nums ${tone ?? ''}`}>{value}</div>
    </div>
  )
}

function GameRow({ href, accent, symbols, title, meta, right }: {
  href: string
  accent: string
  symbols: string[]
  title: string
  meta: string
  right: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-[#241b2f] px-4 py-3">
      <div className="flex shrink-0 -space-x-2">
        {symbols.slice(0, 3).map((symbol) => <TokenLogo key={symbol} ticker={symbol} className="h-8 w-8 rounded-lg border-2 border-[#241b2f]" />)}
      </div>
      <Link to={href} className="min-w-0 flex-1">
        <div className="truncate font-bold hover:underline">{title}</div>
        <div className="truncate text-xs" style={{ color: accent }}>{meta}</div>
      </Link>
      <div className="flex shrink-0 items-center gap-3">{right}</div>
    </div>
  )
}

export function OnchainPortfolioPage() {
  const { publicKey, connected } = useWallet()
  const { games } = usePrograms()
  const send = useSendInstructions()
  const queryClient = useQueryClient()
  const history = useHistory()
  const tokenOf = useStakeTokenLookup()
  const nowMs = useAssetRaceClock()
  const { racePositions, arenaEntries, creatorEarnings, isLoading, error, refetch } = useWalletGames(publicKey)
  const [pending, setPending] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const me = publicKey?.toBase58()
  const stats = me ? history.data?.wallets[me] : undefined
  const activity = me ? (history.data?.activity ?? []).filter((item) => item.wallet === me).slice(0, 30) : []

  async function run(key: string, build: () => Promise<TransactionInstruction[]>) {
    setActionError(null)
    setPending(key)
    try {
      await send(await build())
      await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ['history'] }), queryClient.invalidateQueries({ queryKey: ['stake-balance'] })])
    } catch (cause) {
      setActionError(shortTxError(cause, 'portfolio'))
    } finally {
      setPending(null)
    }
  }

  function raceButton(item: WalletRacePosition) {
    if (item.action === 'none' || !publicKey) return null
    const key = `race:${item.race.address}`
    return (
      <button
        onClick={() => run(key, () => settleRaceInstructions(games, { race: item.race.address, stakeMint: item.race.stakeMint, owner: publicKey, action: item.action as Exclude<WalletGameAction, 'none'> }))}
        disabled={!!pending}
        className={`rounded-full px-4 py-2 text-xs font-bold disabled:opacity-40 ${item.action === 'closeLosing' ? 'border border-white/15 text-white/60 hover:border-white/30' : 'bg-[#ED8F3A] text-[#3b2416] hover:bg-[#F2A65A]'}`}
      >
        {pending === key ? 'Confirming…' : `${ACTION_LABEL[item.action]}${item.amount > 0n ? ` ${formatStakeAmount(item.amount, tokenOf(item.race.stakeMint))}` : ''}`}
      </button>
    )
  }

  function arenaButton(item: WalletArenaEntry) {
    if (item.action === 'none' || !publicKey) return null
    const key = `arena:${item.arena.address}`
    return (
      <button
        onClick={() => run(key, () => settleArenaInstructions(games, { arena: item.arena.address, stakeMint: item.arena.stakeMint, player: publicKey, action: item.action as 'claim' | 'refund' }))}
        disabled={!!pending}
        className="rounded-full bg-[#7A9FF0] px-4 py-2 text-xs font-bold text-[#152447] hover:bg-[#8EB1F8] disabled:opacity-40"
      >
        {pending === key ? 'Confirming…' : `${ACTION_LABEL[item.action]} ${formatStakeAmount(item.amount, tokenOf(item.arena.stakeMint))}`}
      </button>
    )
  }

  const toCollect = [
    ...racePositions.filter((item) => item.action !== 'none').map((item) => ({ kind: 'race' as const, item })),
    ...arenaEntries.filter((item) => item.action !== 'none').map((item) => ({ kind: 'arena' as const, item })),
  ]
  const inPlay = [
    ...racePositions.filter((item) => item.inPlay).map((item) => ({ kind: 'race' as const, item })),
    ...arenaEntries.filter((item) => item.inPlay).map((item) => ({ kind: 'arena' as const, item })),
  ]
  const net = stats ? BigInt(stats.net) : 0n

  function raceRow(item: WalletRacePosition, right: ReactNode) {
    const asset = item.race.assets[item.position.assetIndex]
    return (
      <GameRow
        key={item.race.address}
        href={`/onchain/races/${item.race.id}`}
        accent="#F2A65A"
        symbols={asset ? [asset.symbol] : []}
        title={item.race.title || item.race.assets.map((a) => a.symbol).join(' vs ')}
        meta={`Race #${item.race.id} · ${assetRaceStatusLabel(item.race.status)} · backed ${asset?.symbol ?? '?'} with ${formatStakeAmount(item.position.stake, tokenOf(item.race.stakeMint))}`}
        right={right}
      />
    )
  }

  function arenaRow(item: WalletArenaEntry, right: ReactNode) {
    const phase = arenaPhase(item.arena.status, item.arena.startsAt, nowMs / 1000)
    return (
      <GameRow
        key={item.arena.address}
        href={`/onchain/arenas/${item.arena.id}`}
        accent="#B7CEFF"
        symbols={[item.arena.symbol]}
        title={item.arena.title}
        meta={`Arena #${item.arena.id} · ${arenaPhaseLabel(phase)} · ${formatStakeAmount(item.entry.stake, tokenOf(item.arena.stakeMint))} staked${item.entry.rank > 0 ? ` · rank ${item.entry.rank}` : ''}`}
        right={right}
      />
    )
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8">
      <ClusterBanner />
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Portfolio</h1>
      <p className="mt-2 text-sm text-white/45">Your Asset Race positions and Price Arena entries, what is ready to collect, and your history.</p>

      {!connected || !publicKey ? (
        <div className="mt-6 max-w-md rounded-3xl border border-white/5 bg-[#241b2f] p-5">
          <p className="mb-4 text-sm text-white/55">Connect a wallet to see your games.</p>
          <WalletOptionsList />
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Staked" value={stats ? formatCompactSol(BigInt(stats.staked)) : '—'} title={stats ? `${formatSol(BigInt(stats.staked))} SOL` : undefined} />
            <Stat label="Received" value={stats ? formatCompactSol(BigInt(stats.claimed) + BigInt(stats.refunded)) : '—'} />
            <Stat label="Net" value={stats ? `${net >= 0n ? '+' : ''}${formatCompactSol(net)}` : '—'} tone={net > 0n ? 'text-emerald-300' : net < 0n ? 'text-rose-400' : ''} />
            <Stat label="Games" value={stats ? String(stats.games) : '—'} />
            <Stat label="Wins" value={stats ? String(stats.wins) : '—'} />
          </div>
          <p className="mt-2 text-[11px] text-white/30">
            {history.isError && !history.data
              ? 'History is unavailable right now; open positions below are read from the chain.'
              : 'SOL-staked games only. Open stakes count as spent until their game settles.'}
          </p>

          {creatorEarnings && creatorEarnings.totalEarned > 0n && (
            <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#8B7CF7]/25 bg-[#241b2f] p-5">
              <div>
                <h2 className="font-display text-lg font-bold">Creator earnings</h2>
                <p className="mt-1 text-sm text-white/45">Your share of fees from games you created · {formatCompactSol(creatorEarnings.totalEarned)} earned in total.</p>
              </div>
              <button
                onClick={() => run('creator', () => withdrawCreatorFeesInstructions(games, { creator: publicKey, stakeMint: NATIVE_SOL }))}
                disabled={!!pending || creatorEarnings.amount === 0n}
                className="rounded-full bg-[#8B7CF7] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#6A5AE0] disabled:opacity-40"
              >
                {pending === 'creator' ? 'Confirming…' : creatorEarnings.amount > 0n ? `Withdraw ${formatCompactSol(creatorEarnings.amount)}` : 'Nothing to withdraw'}
              </button>
            </section>
          )}

          {actionError && <p className="mt-4 text-sm text-rose-400">{actionError}</p>}

          <section className="mt-8">
            <h2 className="font-display text-xl font-bold">Ready to collect</h2>
            <p className="mt-1 text-xs text-white/35">Winnings, refunds, and losing race positions you can close to recover their account deposit.</p>
            <div className="mt-3 space-y-2">
              {isLoading ? <p className="py-6 text-sm text-white/35">Loading your games…</p>
                : error ? <p className="py-6 text-sm text-rose-300">Could not read your positions.</p>
                  : toCollect.length === 0 ? <p className="py-6 text-sm text-white/35">Nothing to collect right now.</p>
                    : toCollect.map((row) => (row.kind === 'race' ? raceRow(row.item, raceButton(row.item)) : arenaRow(row.item, arenaButton(row.item))))}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="font-display text-xl font-bold">In play</h2>
            <div className="mt-3 space-y-2">
              {!isLoading && inPlay.length === 0 ? (
                <p className="py-6 text-sm text-white/35">
                  No open games. <Link to="/onchain/races" className="font-bold text-[#F2A65A] hover:underline">Find a race</Link> or <Link to="/onchain/arenas" className="font-bold text-[#B7CEFF] hover:underline">join an arena</Link>.
                </p>
              ) : inPlay.map((row) => (row.kind === 'race'
                ? raceRow(row.item, <span className="text-xs font-bold text-white/40">In play</span>)
                : arenaRow(row.item, <span className="text-xs font-bold text-white/40">In play</span>)))}
            </div>
          </section>

          <section className="mt-8">
            <h2 className="font-display text-xl font-bold">Activity</h2>
            <div className="mt-3 overflow-hidden rounded-2xl border border-white/5">
              {activity.length === 0 ? <p className="bg-[#241b2f] px-4 py-6 text-sm text-white/35">No activity yet.</p> : activity.map((item: HistoryActivity) => (
                <div key={`${item.signature}:${item.type}`} className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-white/5 bg-[#241b2f] px-4 py-2.5 text-sm first:border-t-0 sm:grid-cols-[8rem_1fr_auto_auto]">
                  <span className="font-bold">{ACTIVITY_LABEL[item.type] ?? item.type}</span>
                  <Link to={`/onchain/${item.game === 'race' ? 'races' : 'arenas'}/${item.gameId ?? ''}`} className="hidden truncate text-white/50 hover:text-white sm:block">
                    {item.game === 'race' ? 'Race' : 'Arena'} #{item.gameId ?? '?'}{item.symbol ? ` · ${item.symbol}` : ''}
                  </Link>
                  <span className="text-right font-mono tabular-nums">{item.amount ? formatStakeAmount(BigInt(item.amount), item.stakeMint ? tokenOf(item.stakeMint) : SOL_STAKE_TOKEN) : ''}</span>
                  <a href={explorerUrl('tx', item.signature)} target="_blank" rel="noreferrer" className="hidden text-right font-mono text-xs text-white/35 hover:text-white sm:block">
                    {item.time ? timeAgo(item.time * 1000) : shortHash(item.signature)}
                  </a>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
