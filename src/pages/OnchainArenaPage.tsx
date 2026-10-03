import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import {
  formatUsdCents,
  freezeStakeQuote,
  parseTokenAmount,
  stakeGuardrailMessage,
  stakeGuardrailViolation,
  stakeQuoteErrorMessage,
  type FrozenStakeQuote,
  type StakeInputUnit,
} from '@/chain/stakeQuote'
import { arenaEntryInstructions, settleArenaInstructions } from '@/chain/gameTx'
import { useAssetRaceClock } from '@/chain/useAssetRaceClock'
import { useLivePrices } from '@/chain/livePrices'
import { usePriceArena } from '@/chain/usePriceArena'
import {
  PRICE_ARENA_CANCEL_REASON,
  PRICE_ARENA_MAX_PARTICIPANTS,
  PRICE_ARENA_PHASE,
  arenaDurationLabel,
  arenaPhase,
  arenaPhaseLabel,
  modeForArenaCategory,
  type PriceArenaEntry,
} from '@/chain/priceArena'
import { AddressLabel } from '@/components/AddressLabel'
import { ShareInviteButton } from '@/components/ShareInviteButton'
import { PriceSourceLink } from '@/components/PriceSourceLink'
import { StakeAmountInput } from '@/components/StakeAmountInput'
import { TokenLogo } from '@/components/TokenLogo'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { formatStakeAmount, formatStakeExact, useStakeBalance, useStakeToken, type StakeToken } from '@/solana/stakeTokens'
import { usePrograms } from '@/solana/programs'
import { useSendInstructions } from '@/solana/tx'
import { formatCountdown, formatUnits, formatUsdPrice, parseUnits, shortTxError } from '@/lib/format'

function parseId(value?: string) {
  if (!value || !/^\d+$/.test(value)) return null
  try { return BigInt(value) } catch { return null }
}

function displayPrice(raw: bigint, decimals: number) {
  if (raw <= 0n) return '-'
  return formatUsdPrice(Number(formatUnits(raw, decimals)))
}

function absError(a: bigint, b: bigint) { return a >= b ? a - b : b - a }

/** A form problem caught before any transaction; shown as-is. */
class EntryInputError extends Error {}

function parsePrediction(value: string, decimals: number) {
  if (!value.trim()) return 0n
  try {
    return parseUnits(value, decimals)
  } catch {
    throw new EntryInputError(`Enter the price as a number with at most ${decimals} decimal places`)
  }
}

function cancelReasonText(reason: number) {
  if (reason === PRICE_ARENA_CANCEL_REASON.INSUFFICIENT_PARTICIPANTS) return 'Fewer than two players joined before the lobby closed.'
  if (reason === PRICE_ARENA_CANCEL_REASON.STALE_DEADLINE_PRICE) return 'No valid deadline price could be proven for this round.'
  if (reason === PRICE_ARENA_CANCEL_REASON.RESOLUTION_WINDOW_EXPIRED) return 'The round was not settled within its resolution window.'
  return 'The round was cancelled.'
}

function ArenaBoard({ rows, referencePrice, decimals, resolved, winnerCount, token }: {
  rows: PriceArenaEntry[]
  token: StakeToken
  referencePrice: bigint
  decimals: number
  resolved: boolean
  winnerCount: number
}) {
  // Same order as the program: rank when resolved, otherwise absolute error,
  // then earlier prediction first.
  const ranked = useMemo(() => [...rows].sort((left, right) => {
    if (resolved && left.rank !== right.rank) return left.rank - right.rank
    const leftError = absError(left.prediction, referencePrice)
    const rightError = absError(right.prediction, referencePrice)
    if (leftError !== rightError) return leftError < rightError ? -1 : 1
    return left.predictionSeq - right.predictionSeq
  }), [referencePrice, resolved, rows])
  const provisionalWinners = resolved ? winnerCount : Math.floor(rows.length / 2)
  const fmt = (raw: bigint) => formatStakeAmount(raw, token)
  const fmtExact = (raw: bigint) => formatStakeExact(raw, token)
  return (
    <div className="space-y-2">
      {ranked.map((entry, index) => {
        const winning = index < provisionalWinners
        const error = referencePrice > 0n ? Number(absError(entry.prediction, referencePrice) * 1_000_000n / referencePrice) / 10_000 : 0
        return <div key={entry.player} className={`grid gap-3 rounded-2xl border p-4 sm:grid-cols-[2.5rem_1fr_1fr_1fr] sm:items-center ${winning ? 'border-emerald-400/25 bg-emerald-400/[0.06]' : 'border-white/5 bg-white/[0.02]'}`}>
          <div className="font-mono text-lg text-white/40">#{resolved ? entry.rank : index + 1}</div>
          <div className="min-w-0"><AddressLabel address={entry.player} className="font-bold text-white/80" /><div title={fmtExact(entry.stake)} className="truncate text-xs text-white/30">{fmt(entry.stake)}</div></div>
          <div><div className="text-xs text-white/30">Prediction</div><div className="font-mono font-bold">{displayPrice(entry.prediction, decimals)}</div></div>
          <div className="min-w-0 sm:text-right"><div className="text-xs text-white/30">{resolved ? (winning ? 'Payout' : 'Result') : 'Live deviation'}</div><div title={resolved && entry.payout > 0n ? fmtExact(entry.payout) : undefined} className={`truncate font-mono font-bold ${winning ? 'text-emerald-300' : 'text-white/50'}`}>{resolved ? (entry.payout > 0n ? fmt(entry.payout) : 'Lost') : `${error.toFixed(4)}%`}</div></div>
        </div>
      })}
    </div>
  )
}

export function OnchainArenaPage() {
  const arenaId = parseId(useParams().arenaId)
  const { publicKey, connected } = useWallet()
  const { games } = usePrograms()
  const send = useSendInstructions()
  const { arena, entries, walletEntry, minStake, maxStake, isLoading, error: readError, refetch } = usePriceArena(arenaId, publicKey)
  const queryClient = useQueryClient()
  const [prediction, setPrediction] = useState('')
  const [amount, setAmount] = useState('')
  const [stakeInputUnit, setStakeInputUnit] = useState<StakeInputUnit>('USD')
  const [frozenEntryQuote, setFrozenEntryQuote] = useState<FrozenStakeQuote | null>(null)
  const [txLabel, setTxLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const nowMs = useAssetRaceClock()
  const live = useLivePrices()
  // SOL stakes are entered in USD or SOL at the live rate; SPL stakes in their own units.
  const token = useStakeToken(arena?.stakeMint)
  const usdQuoted = token?.native ?? true
  const balance = useStakeBalance(token)
  const fmt = (raw: bigint) => formatStakeAmount(raw, token)
  const fmtExact = (raw: bigint) => formatStakeExact(raw, token)
  const phase = arena ? arenaPhase(arena.status, arena.startsAt, nowMs / 1000) : PRICE_ARENA_PHASE.LOBBY
  const liveAsset = arena ? live.assets[arena.symbol] : undefined
  const livePrice = liveAsset && liveAsset.decimals === arena?.priceDecimals ? liveAsset.raw : 0n
  const referencePrice = phase === PRICE_ARENA_PHASE.RESOLVED ? arena!.finalPrice : livePrice
  let quotedEntry: FrozenStakeQuote | undefined
  try {
    quotedEntry = usdQuoted && amount.trim() && live.solUsd ? freezeStakeQuote(amount, stakeInputUnit, live.solUsd) : undefined
  } catch {
    quotedEntry = undefined
  }
  const displayedEntryQuote = frozenEntryQuote ?? quotedEntry
  let tokenEntryAmount = 0n
  try {
    tokenEntryAmount = !usdQuoted && token && amount.trim() ? parseTokenAmount(amount, token.decimals) : 0n
  } catch {
    tokenEntryAmount = 0n
  }
  const displayedEntryAmount = usdQuoted ? displayedEntryQuote?.lamports ?? 0n : tokenEntryAmount
  const violation = stakeGuardrailViolation(displayedEntryAmount, {
    minInitial: minStake,
    maxCumulative: maxStake,
    existingStake: walletEntry?.stake ?? 0n,
    initialStake: !walletEntry,
  })

  const target = phase === PRICE_ARENA_PHASE.LOBBY ? arena?.startsAt : phase === PRICE_ARENA_PHASE.RUNNING ? arena?.deadline : undefined
  const underfilled = phase === PRICE_ARENA_PHASE.RUNNING && (arena?.participantCount ?? 0) < 2
  const awaitingSettlement = phase === PRICE_ARENA_PHASE.RUNNING
    && nowMs > 0
    && Number(arena!.deadline) * 1_000 <= nowMs
  const displayedPhase = underfilled ? 'Cancelling' : awaitingSettlement ? 'Settling' : arena ? arenaPhaseLabel(phase) : '…'
  const clock = target && nowMs > 0 && Number(target) * 1_000 > nowMs && !underfilled
    ? formatCountdown(Number(target) * 1_000 - nowMs)
    : awaitingSettlement || underfilled
      ? 'Pending'
      : displayedPhase

  async function submitEntry() {
    if (!arena || !publicKey || !token) return
    setError(null)
    try {
      if (usdQuoted && amount.trim() && !live.solUsd) throw new Error('SolUsdQuoteStale')
      const frozenQuote = usdQuoted && amount.trim() && live.solUsd ? freezeStakeQuote(amount, stakeInputUnit, live.solUsd) : null
      const additional = frozenQuote?.lamports ?? (!usdQuoted && amount.trim() ? parseTokenAmount(amount, token.decimals) : 0n)
      setFrozenEntryQuote(frozenQuote)
      const predicted = parsePrediction(prediction, arena.priceDecimals)
      if (!walletEntry && (predicted <= 0n || additional <= 0n)) throw new EntryInputError(usdQuoted ? 'Enter a price and a stake from $1 to $50' : 'Enter a price and a stake')
      if (walletEntry && predicted === 0n && additional === 0n) throw new EntryInputError('Enter a new price or a top-up amount')
      const guardrail = stakeGuardrailViolation(additional, {
        minInitial: minStake,
        maxCumulative: maxStake,
        existingStake: walletEntry?.stake ?? 0n,
        initialStake: !walletEntry,
      })
      if (guardrail) {
        setError(stakeGuardrailMessage(guardrail))
        setFrozenEntryQuote(null)
        return
      }
      setTxLabel(walletEntry ? 'Confirm arena update…' : 'Confirm arena entry…')
      const instructions = await arenaEntryInstructions(games, {
        arena: arena.address,
        stakeMint: arena.stakeMint,
        player: publicKey,
        prediction: predicted,
        amount: additional,
        update: !!walletEntry,
      })
      setTxLabel('Waiting for confirmation…')
      await send(instructions)
      setPrediction(''); setAmount(''); setTxLabel(null); setFrozenEntryQuote(null)
      await Promise.all([refetch(), balance.refetch(), queryClient.invalidateQueries({ queryKey: ['history'] })])
    } catch (cause) {
      setTxLabel(null)
      setFrozenEntryQuote(null)
      setError(stakeQuoteErrorMessage(cause) ?? (cause instanceof EntryInputError ? cause.message : shortTxError(cause, 'arena-join')))
    }
  }

  async function settle(action: 'claim' | 'refund') {
    if (!arena || !publicKey) return
    setError(null)
    try {
      setTxLabel(`Confirm ${action}…`)
      const instructions = await settleArenaInstructions(games, { arena: arena.address, stakeMint: arena.stakeMint, player: publicKey, action })
      await send(instructions)
      setTxLabel(null)
      await Promise.all([refetch(), balance.refetch(), queryClient.invalidateQueries({ queryKey: ['history'] })])
    } catch (cause) { setTxLabel(null); setError(shortTxError(cause, 'arena-settlement')) }
  }

  if (arenaId == null) return <div className="mx-auto max-w-4xl px-4 py-12 text-rose-300">Invalid arena ID.</div>
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8">
      <Link to={`/onchain/arenas${arena ? `?mode=${modeForArenaCategory(arena.category)}` : ''}`} className="text-sm font-bold text-white/40 hover:text-white">← All arenas</Link>
      {isLoading ? <p className="py-20 text-center text-white/40">Loading arena…</p> : readError ? <div className="mt-6 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-5 text-rose-300">Could not read this arena.</div> : !arena ? <p className="py-20 text-center text-white/40">Arena not found.</p> : <>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3"><TokenLogo ticker={arena.symbol} className="mt-1 h-12 w-12 shrink-0 rounded-2xl" /><div className="min-w-0"><p className="text-sm font-bold text-[#B7CEFF]">{arena.symbol} Price Arena · #{arena.id.toString()}</p><h1 className="mt-1 break-words font-display text-3xl font-bold sm:text-4xl">{arena.title}</h1><p className="mt-1 text-xs text-white/40">Created by <AddressLabel address={arena.creator} className="text-white/60" /> · {arenaDurationLabel(arena.duration)} game</p><PriceSourceLink href={arena.asset?.priceUrl} symbol={arena.symbol} tone="arena" className="mt-2 bg-[#7A9FF0]/10 px-3 py-1.5" /></div></div>
          <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 sm:w-auto sm:flex-nowrap sm:justify-start"><ShareInviteButton kind="arena" id={arena.id} /><div className="text-right"><div className="text-xs font-bold uppercase tracking-wider text-white/35">{displayedPhase}</div><div className="font-mono text-3xl font-bold">{clock}</div></div></div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="min-w-0 rounded-2xl border border-white/5 bg-[#241b2f] p-4"><div className="text-xs text-white/35">Players</div><div className="mt-1 truncate font-mono text-2xl font-bold tabular-nums">{arena.participantCount} / {PRICE_ARENA_MAX_PARTICIPANTS}</div></div>
          <div className="min-w-0 rounded-2xl border border-white/5 bg-[#241b2f] p-4"><div className="text-xs text-white/35">Prize pool</div><div title={fmtExact(arena.totalPool)} className="mt-1 truncate font-mono text-2xl font-bold tabular-nums">{fmt(arena.totalPool)}</div></div>
          <div className="min-w-0 rounded-2xl border border-white/5 bg-[#241b2f] p-4"><div className="text-xs text-white/35">{phase === PRICE_ARENA_PHASE.RESOLVED ? 'Final price' : 'Live price'}</div><div className="mt-1 truncate font-mono text-2xl font-bold tabular-nums">{displayPrice(referencePrice, arena.priceDecimals)}</div></div>
        </div>

        {!token ? <p className="py-10 text-center text-sm text-white/40">Loading stake currency…</p> : phase === PRICE_ARENA_PHASE.LOBBY ? <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <section className="min-w-0"><h2 className="font-display text-xl font-bold">Lobby stakes</h2><p className="mt-1 text-sm text-white/40">Predictions stay hidden here until the game starts. Account data on Solana is public, so this is a display courtesy, not secrecy.</p><div className="mt-4 space-y-2">{entries.map((entry) => <div key={entry.player} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#241b2f] px-4 py-3"><AddressLabel address={entry.player} className="min-w-0 font-bold text-white/70" /><span title={fmtExact(entry.stake)} className="shrink-0 whitespace-nowrap font-mono">{fmt(entry.stake)} · prediction hidden</span></div>)}{entries.length === 0 && <p className="py-8 text-sm text-white/35">Be the first player.</p>}</div></section>
          <section className="rounded-3xl border border-[#7A9FF0]/20 bg-[#241b2f] p-5">
            <h2 className="font-display text-xl font-bold">{walletEntry ? 'Update your entry' : 'Make your prediction'}</h2>
            {walletEntry && <p title={fmtExact(walletEntry.stake)} className="mt-2 text-sm text-white/50">Your current stake is {fmt(walletEntry.stake)}. Leave price empty to keep it. Money cannot be withdrawn before settlement.</p>}
            <label className="mt-5 block">
              <span className="mb-1.5 block text-sm text-white/50">{walletEntry ? 'New price · optional' : 'Predicted final price · USD'}</span>
              <input value={prediction} onChange={(event) => setPrediction(event.target.value)} inputMode="decimal" placeholder={walletEntry ? 'Keep current prediction' : '0.00'} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono outline-none focus:border-[#7A9FF0]" />
            </label>
            <div className="mt-4">
              <StakeAmountInput
                id="arena-stake"
                label={walletEntry ? 'Additional stake (optional)' : 'Stake'}
                value={amount}
                inputUnit={stakeInputUnit}
                onChange={(value) => { setAmount(value); setFrozenEntryQuote(null) }}
                onInputUnitChange={(unit) => {
                  if (unit === stakeInputUnit) return
                  setStakeInputUnit(unit)
                  setAmount('')
                  setFrozenEntryQuote(null)
                  setError(null)
                }}
                disabled={!!txLabel}
                tone="arena"
                token={token}
              />
            </div>
            <p className="mt-2 text-xs text-white/45">
              {violation
                ? stakeGuardrailMessage(violation)
                : displayedEntryAmount > 0n
                  ? usdQuoted && stakeInputUnit === 'SOL' && displayedEntryQuote
                    ? `Wallet will send exactly ${fmtExact(displayedEntryAmount)} · about ${formatUsdCents(displayedEntryQuote.usdCents)} at the displayed rate.`
                    : `Wallet will send exactly ${fmtExact(displayedEntryAmount)}.`
                  : !usdQuoted
                    ? `Enter a stake in ${token.symbol}.`
                    : live.solUsd
                      ? `Enter a stake worth $1–$50 in ${stakeInputUnit}.`
                      : 'SOL/USD rate unavailable'}
            </p>
            {balance.data != null && <p title={fmtExact(balance.data)} className="mt-1 text-xs text-white/30">Wallet balance: {fmt(balance.data)}</p>}
            {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
            {!connected
              ? <div className="mt-5"><WalletOptionsList tone="arena" /></div>
              : <button
                  onClick={submitEntry}
                  disabled={!!txLabel || (!walletEntry && displayedEntryAmount <= 0n) || !!violation}
                  className="mt-5 w-full rounded-xl bg-gradient-to-r from-[#8EB1F8] to-[#7A9FF0] py-3 font-bold text-[#152447] disabled:opacity-40"
                >
                  {txLabel ?? (walletEntry ? 'Update entry' : `Enter arena with ${token.symbol}`)}
                </button>}
          </section>
        </div> : phase === PRICE_ARENA_PHASE.CANCELLED ? <div className="mt-6 rounded-3xl border border-amber-400/20 bg-amber-400/10 p-6"><h2 className="font-display text-2xl font-bold">Arena cancelled</h2><p className="mt-2 text-sm text-white/55">{cancelReasonText(arena.cancelReason)} Every player gets a full refund.</p>{walletEntry && !walletEntry.settled && <button title={fmtExact(walletEntry.stake)} onClick={() => settle('refund')} disabled={!!txLabel} className="mt-5 max-w-full truncate rounded-xl bg-[#7A9FF0] px-6 py-3 font-bold text-[#152447] hover:bg-[#8EB1F8]">{txLabel ?? `Refund ${fmt(walletEntry.stake)}`}</button>}{walletEntry?.settled && <div className="mt-5 text-sm font-bold text-white/40">Refunded</div>}{error && <p className="mt-3 text-sm text-rose-400">{error}</p>}</div> : <section className="mt-7"><div className="mb-4 flex items-end justify-between"><div><h2 className="font-display text-2xl font-bold">{phase === PRICE_ARENA_PHASE.RUNNING ? underfilled ? 'Not enough players' : awaitingSettlement ? 'Settlement pending' : 'Live leaderboard' : 'Final standings'}</h2><p className="mt-1 text-sm text-white/40">{phase === PRICE_ARENA_PHASE.RUNNING ? underfilled ? 'Fewer than two players joined. The keeper cancels this arena and every stake becomes refundable.' : awaitingSettlement ? 'The round is closed. The keeper is fixing the deadline price and final ranking onchain.' : 'Positions update with the display price; settlement uses the signed pool price at the deadline.' : `Closest ${arena.winnerCount} player${arena.winnerCount === 1 ? '' : 's'} won.`}</p></div>{phase === PRICE_ARENA_PHASE.RUNNING && !awaitingSettlement && live.disconnected && <span className="text-xs font-bold text-amber-300">Live feed reconnecting…</span>}</div><ArenaBoard rows={entries} referencePrice={referencePrice} decimals={arena.priceDecimals} resolved={phase === PRICE_ARENA_PHASE.RESOLVED} winnerCount={arena.winnerCount} token={token} />{phase === PRICE_ARENA_PHASE.RESOLVED && walletEntry && walletEntry.payout > 0n && !walletEntry.settled ? (!connected ? <div className="mt-6"><WalletOptionsList tone="arena" /></div> : <button title={fmtExact(walletEntry.payout)} onClick={() => settle('claim')} disabled={!!txLabel} className="mt-6 w-full truncate rounded-xl bg-gradient-to-r from-[#8EB1F8] to-[#7A9FF0] py-3 font-bold text-[#152447]">{txLabel ?? `Claim ${fmt(walletEntry.payout)}`}</button>) : phase === PRICE_ARENA_PHASE.RESOLVED && walletEntry?.settled ? <div className="mt-6 rounded-xl bg-white/5 py-3 text-center font-bold text-white/40">Already claimed</div> : null}{error && <p className="mt-3 text-sm text-rose-400">{error}</p>}</section>}
      </>}
    </div>
  )
}
