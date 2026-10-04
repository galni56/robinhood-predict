import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import type { RacePayout } from '@/chain/assetRaces'
import { assetRaceStatusLabel } from '@/chain/assetRaces'
import { arenaPhaseLabel, arenaPhase } from '@/chain/priceArena'
import { useHistory, type HistoryActivity } from '@/chain/history'
import { useAssetRaceClock } from '@/chain/useAssetRaceClock'
import { useWalletGames, type WalletArenaEntry, type WalletGameOutcome, type WalletRacePosition } from '@/chain/useWalletGames'
import { ClusterBanner } from '@/components/ClusterBanner'
import { TokenLogo } from '@/components/TokenLogo'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { explorerUrl } from '@/solana/config'
import { formatCompactSol, formatSol, timeAgo } from '@/lib/format'
import { SOL_STAKE_TOKEN, formatStakeAmount, useStakeTokenLookup } from '@/solana/stakeTokens'
import { shortHash } from '@/lib/hash'

const ACTIVITY_LABEL: Record<string, string> = {
  bet: 'Bet',
  entry: 'Arena entry',
  claim: 'Paid out',
  refund: 'Refunded',
}

const OUTCOME_LABEL: Record<WalletGameOutcome, string> = {
  playing: 'In play',
  paying: 'Sending',
  refunding: 'Refunding',
  paid: 'Paid',
  refunded: 'Refunded',
  lost: 'Lost',
}

function Stat({ label, value, title, tone }: { label: string; value: string; title?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-none border border-[#1B1340]/12 bg-[#FFF6DF] p-4">
      <div className="text-xs text-[#1B1340]/55">{label}</div>
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
    <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-none border border-[#1B1340]/12 bg-[#FFF6DF] px-4 py-3">
      <div className="flex shrink-0 -space-x-2">
        {symbols.slice(0, 3).map((symbol) => <TokenLogo key={symbol} ticker={symbol} className="h-8 w-8 rounded-none border-2 border-[#221c40]" />)}
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
  const history = useHistory()
  const tokenOf = useStakeTokenLookup()
  const nowMs = useAssetRaceClock()
  const { racePositions, arenaEntries, creatorEarnings, isLoading, error } = useWalletGames(publicKey)
  const me = publicKey?.toBase58()
  const stats = me ? history.data?.wallets[me] : undefined
  const activity = me ? (history.data?.activity ?? []).filter((item) => item.wallet === me).slice(0, 30) : []

  // The game server pays winners and refunds on its own; this only reports it.
  function outcomeBadge(outcome: WalletGameOutcome, amount: bigint, payout?: RacePayout) {
    const text = `${payout?.status === 'stuck' ? 'Delayed' : OUTCOME_LABEL[outcome]}${amount > 0n ? ` ${formatStakeAmount(amount, SOL_STAKE_TOKEN)}` : ''}`
    const tone = outcome === 'paid' || outcome === 'paying' ? 'text-[#1E7A36]' : outcome === 'lost' ? 'text-[#1B1340]/45' : 'text-[#B8860B]'
    return payout?.status === 'done' && payout.signature
      ? <a href={explorerUrl('tx', payout.signature)} target="_blank" rel="noreferrer" className={`text-xs font-bold hover:underline ${tone}`}>{text} ↗</a>
      : <span className={`text-xs font-bold ${tone}`}>{text}</span>
  }

  const onTheWay = [
    ...racePositions.filter((item) => item.outcome === 'paying' || item.outcome === 'refunding').map((item) => ({ kind: 'race' as const, item })),
    ...arenaEntries.filter((item) => item.outcome === 'paying' || item.outcome === 'refunding').map((item) => ({ kind: 'arena' as const, item })),
  ]
  const finished = [
    ...racePositions.filter((item) => item.outcome === 'paid' || item.outcome === 'refunded' || item.outcome === 'lost').map((item) => ({ kind: 'race' as const, item, at: item.race.resolvedAt })),
    ...arenaEntries.filter((item) => item.outcome === 'paid' || item.outcome === 'refunded' || item.outcome === 'lost').map((item) => ({ kind: 'arena' as const, item, at: item.arena.resolvedAt })),
  ].sort((a, b) => (a.at > b.at ? -1 : 1)).slice(0, 20)
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
        accent="#ffd23f"
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
        accent="#6bcbf4"
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
      <p className="mt-2 text-sm text-[#1B1340]/55">Your Asset Race positions and Price Arena entries, payouts on their way to your wallet, and your history.</p>

      {!connected || !publicKey ? (
        <div className="mt-6 max-w-md rounded-none border border-[#1B1340]/12 bg-[#FFF6DF] p-5">
          <p className="mb-4 text-sm text-[#1B1340]/60">Connect a wallet to see your games.</p>
          <WalletOptionsList />
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Staked" value={stats ? formatCompactSol(BigInt(stats.staked)) : '—'} title={stats ? `${formatSol(BigInt(stats.staked))} SOL` : undefined} />
            <Stat label="Received" value={stats ? formatCompactSol(BigInt(stats.claimed) + BigInt(stats.refunded)) : '—'} />
            <Stat label="Net" value={stats ? `${net >= 0n ? '+' : ''}${formatCompactSol(net)}` : '—'} tone={net > 0n ? 'text-emerald-300' : net < 0n ? 'text-[#C2245A]' : ''} />
            <Stat label="Games" value={stats ? String(stats.games) : '—'} />
            <Stat label="Wins" value={stats ? String(stats.wins) : '—'} />
          </div>
          <p className="mt-2 text-[11px] text-[#1B1340]/50">
            {history.isError && !history.data
              ? 'History is unavailable right now.'
              : 'SOL-staked games only. Open stakes count as spent until their game settles.'}
          </p>

          {creatorEarnings && creatorEarnings.totalEarned > 0n && (
            <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-none border border-[#ff4f8b]/25 bg-[#FFF6DF] p-5">
              <div>
                <h2 className="font-display text-lg font-bold">Creator earnings</h2>
                <p className="mt-1 text-sm text-[#1B1340]/55">Your share of fees from games you created, sent to your wallet automatically · {formatCompactSol(creatorEarnings.totalEarned)} received in total{creatorEarnings.pending > 0n ? ` · ${formatCompactSol(creatorEarnings.pending)} on the way` : ''}.</p>
              </div>
            </section>
          )}

          {onTheWay.length > 0 && (
            <section className="mt-8">
              <h2 className="font-display text-xl font-bold">On the way to your wallet</h2>
              <p className="mt-1 text-xs text-[#1B1340]/55">Winnings and refunds are sent automatically, usually within seconds.</p>
              <div className="mt-3 space-y-2">
                {onTheWay.map((row) => (row.kind === 'race'
                  ? raceRow(row.item, outcomeBadge(row.item.outcome, row.item.amount, row.item.payout))
                  : arenaRow(row.item, outcomeBadge(row.item.outcome, row.item.amount, row.item.payout))))}
              </div>
            </section>
          )}

          <section className="mt-8">
            <h2 className="font-display text-xl font-bold">In play</h2>
            <div className="mt-3 space-y-2">
              {error && inPlay.length === 0 ? (
                <p className="py-6 text-sm text-[#C2245A]">Could not read your positions.</p>
              ) : !isLoading && inPlay.length === 0 ? (
                <p className="py-6 text-sm text-[#1B1340]/55">
                  No open games. <Link to="/onchain/races" className="font-bold text-[#B8860B] hover:underline">Find a race</Link> or <Link to="/onchain/arenas" className="font-bold text-[#1F7FD1] hover:underline">join an arena</Link>.
                </p>
              ) : isLoading && inPlay.length === 0 ? (
                <p className="py-6 text-sm text-[#1B1340]/55">Loading your games…</p>
              ) : inPlay.map((row) => (row.kind === 'race'
                ? raceRow(row.item, <span className="text-xs font-bold text-[#1B1340]/55">In play</span>)
                : arenaRow(row.item, <span className="text-xs font-bold text-[#1B1340]/55">In play</span>)))}
            </div>
          </section>

          {finished.length > 0 && (
            <section className="mt-8">
              <h2 className="font-display text-xl font-bold">Finished</h2>
              <div className="mt-3 space-y-2">
                {finished.map((row) => (row.kind === 'race'
                  ? raceRow(row.item, outcomeBadge(row.item.outcome, row.item.amount, row.item.payout))
                  : arenaRow(row.item, outcomeBadge(row.item.outcome, row.item.amount, row.item.payout))))}
              </div>
            </section>
          )}

          <section className="mt-8">
            <h2 className="font-display text-xl font-bold">Activity</h2>
            <div className="mt-3 overflow-hidden rounded-none border border-[#1B1340]/12">
              {history.isError && activity.length === 0 ? <p className="bg-[#FFF6DF] px-4 py-6 text-sm text-[#C2245A]">Could not load your activity.</p>
                : history.isLoading && activity.length === 0 ? <p className="bg-[#FFF6DF] px-4 py-6 text-sm text-[#1B1340]/55">Loading activity…</p>
                : activity.length === 0 ? <p className="bg-[#FFF6DF] px-4 py-6 text-sm text-[#1B1340]/55">No activity yet.</p> : activity.map((item: HistoryActivity) => (
                <div key={`${item.signature}:${item.type}`} className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-[#1B1340]/12 bg-[#FFF6DF] px-4 py-2.5 text-sm first:border-t-0 sm:grid-cols-[8rem_1fr_auto_auto]">
                  <span className="font-bold">{ACTIVITY_LABEL[item.type] ?? item.type}</span>
                  <Link to={`/onchain/${item.game === 'race' ? 'races' : 'arenas'}/${item.gameId ?? ''}`} className="hidden truncate text-[#1B1340]/60 hover:text-[#1B1340] sm:block">
                    {item.game === 'race' ? 'Race' : 'Arena'} #{item.gameId ?? '?'}{item.symbol ? ` · ${item.symbol}` : ''}
                  </Link>
                  <span className="text-right font-mono tabular-nums">{item.amount ? formatStakeAmount(BigInt(item.amount), item.stakeMint ? tokenOf(item.stakeMint) : SOL_STAKE_TOKEN) : ''}</span>
                  <a href={explorerUrl('tx', item.signature)} target="_blank" rel="noreferrer" className="hidden text-right font-mono text-xs text-[#1B1340]/55 hover:text-[#1B1340] sm:block">
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
