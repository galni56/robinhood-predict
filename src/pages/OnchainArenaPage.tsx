import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { formatEther, formatUnits, parseUnits, type Address } from 'viem'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { useAccount, useBalance, useChainId, useSwitchChain, useWriteContract } from 'wagmi'
import { assetRaceChain, wagmiConfig } from '@/chain/config'
import {
  formatUsdCents,
  freezeNativeStakeQuote,
  nativeStakeGuardrailMessage,
  nativeStakeGuardrailViolation,
  nativeStakeQuoteErrorMessage,
  type FrozenNativeStakeQuote,
  type StakeInputUnit,
} from '@/chain/ethUsd'
import { useAssetRaceClock } from '@/chain/useAssetRaceClock'
import { useAssetRaceLiveDisplay } from '@/chain/useAssetRaceLiveDisplay'
import { usePriceArena } from '@/chain/usePriceArena'
import {
  PRICE_ARENA_ADDRESS,
  LEGACY_PRICE_ARENA_ADDRESS,
  PRICE_ARENA_PHASE,
  arenaDurationLabel,
  arenaPhaseLabel,
  modeForArenaCategory,
  priceArenaAbi,
  type PriceArenaEntry,
} from '@/chain/priceArena'
import { AddressLabel } from '@/components/AddressLabel'
import { ShareInviteButton } from '@/components/ShareInviteButton'
import { PriceSourceLink } from '@/components/PriceSourceLink'
import { StakeAmountInput } from '@/components/StakeAmountInput'
import { TokenLogo } from '@/components/TokenLogo'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { formatCompactEth, formatCountdown, shortTxError } from '@/lib/format'

function parseId(value?: string) {
  if (!value || !/^\d+$/.test(value)) return null
  try { return BigInt(value) } catch { return null }
}

function displayPrice(raw: bigint, decimals: number, quote: string) {
  if (raw <= 0n) return '—'
  const value = Number(formatUnits(raw, decimals))
  const digits = value >= 100 ? 2 : value >= 1 ? 4 : 8
  return `${value.toLocaleString(undefined, { maximumFractionDigits: digits })} ${quote}`
}

function absError(a: bigint, b: bigint) { return a >= b ? a - b : b - a }

function ArenaBoard({ rows, referencePrice, decimals, quote, resolved, winnerCount }: {
  rows: { player: Address; entry: PriceArenaEntry }[]
  referencePrice: bigint
  decimals: number
  quote: string
  resolved: boolean
  winnerCount: number
}) {
  const ranked = useMemo(() => [...rows].sort((left, right) => {
    if (resolved && left.entry.rank !== right.entry.rank) return left.entry.rank - right.entry.rank
    const leftError = absError(left.entry.prediction, referencePrice)
    const rightError = absError(right.entry.prediction, referencePrice)
    if (leftError !== rightError) return leftError < rightError ? -1 : 1
    if (left.entry.predictionUpdatedAt !== right.entry.predictionUpdatedAt) return left.entry.predictionUpdatedAt < right.entry.predictionUpdatedAt ? -1 : 1
    return left.player.toLowerCase().localeCompare(right.player.toLowerCase())
  }), [referencePrice, resolved, rows])
  const provisionalWinners = resolved ? winnerCount : Math.floor(rows.length / 2)
  return (
    <div className="space-y-2">
      {ranked.map(({ player, entry }, index) => {
        const winning = index < provisionalWinners
        const error = referencePrice > 0n ? Number(absError(entry.prediction, referencePrice) * 1_000_000n / referencePrice) / 10_000 : 0
        return <div key={player} className={`grid gap-3 rounded-2xl border p-4 sm:grid-cols-[2.5rem_1fr_1fr_1fr] sm:items-center ${winning ? 'border-emerald-400/25 bg-emerald-400/[0.06]' : 'border-white/5 bg-white/[0.02]'}`}>
          <div className="font-mono text-lg text-white/40">#{resolved ? entry.rank : index + 1}</div>
          <div className="min-w-0"><AddressLabel address={player} className="font-bold text-white/80" /><div title={`${formatEther(entry.stake)} ETH`} className="truncate text-xs text-white/30">{formatCompactEth(entry.stake)}</div></div>
          <div><div className="text-xs text-white/30">Prediction</div><div className="font-mono font-bold">{displayPrice(entry.prediction, decimals, quote)}</div></div>
          <div className="min-w-0 sm:text-right"><div className="text-xs text-white/30">{resolved ? (winning ? 'Payout' : 'Result') : 'Live error'}</div><div title={resolved && entry.payout > 0n ? `${formatEther(entry.payout)} ETH` : undefined} className={`truncate font-mono font-bold ${winning ? 'text-emerald-300' : 'text-white/50'}`}>{resolved ? (entry.payout > 0n ? formatCompactEth(entry.payout) : 'Lost') : `${error.toFixed(4)}%`}</div></div>
        </div>
      })}
    </div>
  )
}

export function OnchainArenaPage({ legacy = false }: { legacy?: boolean }) {
  const arenaId = parseId(useParams().arenaId)
  const { address, isConnected } = useAccount()
  const {
    arena,
    entries,
    walletEntry,
    minStakeWei,
    maxStakeWei,
    isLoading,
    error: readError,
    refetch,
  } = usePriceArena(arenaId, address, legacy ? LEGACY_PRICE_ARENA_ADDRESS : PRICE_ARENA_ADDRESS)
  const arenaContractAddress = legacy ? LEGACY_PRICE_ARENA_ADDRESS : PRICE_ARENA_ADDRESS
  const chainId = useChainId()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const queryClient = useQueryClient()
  const [prediction, setPrediction] = useState('')
  const [amount, setAmount] = useState('')
  const [stakeInputUnit, setStakeInputUnit] = useState<StakeInputUnit>('USD')
  const [frozenEntryQuote, setFrozenEntryQuote] = useState<FrozenNativeStakeQuote | null>(null)
  const [txLabel, setTxLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const nowMs = useAssetRaceClock()
  const live = useAssetRaceLiveDisplay({ enabled: true })
  const liveAsset = arena?.asset ? live.assets[arena.asset.symbol] : undefined
  const livePrice = liveAsset ? BigInt(liveAsset.priceRaw) : 0n
  const quote = arena?.asset?.quoteSymbol ?? 'USDG'
  const referencePrice = arena?.phase === PRICE_ARENA_PHASE.RESOLVED ? arena.finalPrice : livePrice
  const balanceQuery = useBalance({ address, chainId: assetRaceChain.id, query: { enabled: !!address && !!arenaContractAddress } })
  let quotedEntry: FrozenNativeStakeQuote | undefined
  try {
    quotedEntry = amount.trim() && live.ethUsd
      ? freezeNativeStakeQuote(amount, stakeInputUnit, live.ethUsd)
      : undefined
  } catch {
    quotedEntry = undefined
  }
  const displayedEntryQuote = frozenEntryQuote ?? quotedEntry
  const displayedEntryWei = displayedEntryQuote?.wei ?? 0n
  const stakeGuardrailsRequired = !walletEntry?.exists || displayedEntryWei > 0n
  const stakeGuardrailsUnavailable = stakeGuardrailsRequired && (minStakeWei == null || maxStakeWei == null)
  const stakeGuardrailViolation = minStakeWei == null || maxStakeWei == null
    ? undefined
    : nativeStakeGuardrailViolation(displayedEntryWei, {
        minInitialWei: minStakeWei,
        maxCumulativeWei: maxStakeWei,
        existingStakeWei: walletEntry?.stake ?? 0n,
        initialStake: !walletEntry?.exists,
      })

  const target = arena?.phase === PRICE_ARENA_PHASE.LOBBY ? arena.startsAt : arena?.phase === PRICE_ARENA_PHASE.RUNNING ? arena.deadline : 0n
  const awaitingSettlement = arena?.phase === PRICE_ARENA_PHASE.RUNNING
    && nowMs > 0
    && Number(arena.deadline) * 1_000 <= nowMs
  const displayedPhase = awaitingSettlement ? 'Settling' : arena ? arenaPhaseLabel(arena.phase) : '…'
  const clock = target && nowMs > 0 && Number(target) * 1_000 > nowMs
    ? formatCountdown(Number(target) * 1_000 - nowMs)
    : awaitingSettlement
      ? 'Pending'
      : displayedPhase

  async function submitEntry() {
    if (legacy || !arenaContractAddress || arenaId == null || !arena) return
    setError(null)
    try {
      if (amount.trim() && !live.ethUsd) throw new Error('EthUsdQuoteStale')
      const frozenQuote = amount.trim() && live.ethUsd
        ? freezeNativeStakeQuote(amount, stakeInputUnit, live.ethUsd)
        : null
      const additional = frozenQuote?.wei ?? 0n
      setFrozenEntryQuote(frozenQuote)
      const predicted = prediction.trim() ? parseUnits(prediction.replace(',', '.'), arena.priceDecimals) : 0n
      if (!walletEntry?.exists && (predicted <= 0n || additional <= 0n)) throw new Error('Enter a price and a stake from $1 to $50')
      if (walletEntry?.exists && predicted === 0n && additional === 0n) throw new Error('Enter a new price or a top-up amount')
      const guardrailsRequired = !walletEntry?.exists || additional > 0n
      if (guardrailsRequired && (minStakeWei == null || maxStakeWei == null)) {
        setError('The contract stake limits are unavailable. No transaction was sent.')
        setFrozenEntryQuote(null)
        return
      }
      const guardrailViolation = nativeStakeGuardrailViolation(additional, {
        minInitialWei: minStakeWei,
        maxCumulativeWei: maxStakeWei,
        existingStakeWei: walletEntry?.stake ?? 0n,
        initialStake: !walletEntry?.exists,
      })
      if (guardrailViolation) {
        setError(nativeStakeGuardrailMessage(guardrailViolation))
        setFrozenEntryQuote(null)
        return
      }
      setTxLabel(walletEntry?.exists ? 'Confirm arena update…' : 'Confirm arena entry…')
      const hash = walletEntry?.exists
        ? await writeContractAsync({ address: arenaContractAddress, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'updateEntry', args: [arenaId, predicted, additional], value: additional })
        : await writeContractAsync({ address: arenaContractAddress, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'enter', args: [arenaId, predicted, additional], value: additional })
      setTxLabel('Waiting for confirmation…')
      await waitForTransactionReceipt(wagmiConfig, { hash, chainId: assetRaceChain.id })
      setPrediction(''); setAmount(''); setTxLabel(null); setFrozenEntryQuote(null)
      await Promise.all([refetch(), balanceQuery.refetch()])
    } catch (cause) {
      setTxLabel(null)
      setFrozenEntryQuote(null)
      setError(nativeStakeQuoteErrorMessage(cause) ?? (cause instanceof Error && !cause.message.includes('\n') ? cause.message : shortTxError(cause)))
    }
  }

  async function settle(functionName: 'claim' | 'refund') {
    if (!arenaContractAddress || arenaId == null) return
    setError(null)
    try {
      setTxLabel(`Confirm ${functionName}…`)
      const hash = await writeContractAsync({ address: arenaContractAddress, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName, args: [arenaId] })
      await waitForTransactionReceipt(wagmiConfig, { hash, chainId: assetRaceChain.id })
      setTxLabel(null)
      await Promise.all([
        refetch(),
        balanceQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['game-activity', 'arena'] }),
      ])
    } catch (cause) { setTxLabel(null); setError(shortTxError(cause)) }
  }

  if (arenaId == null) return <div className="mx-auto max-w-4xl px-4 py-12 text-rose-300">Invalid arena ID.</div>
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8">
      {legacy && <div className="mb-5 rounded-2xl border border-[#8A72F8]/25 bg-[#8A72F8]/10 px-4 py-3 text-sm font-medium text-[#B3A7FA]">Legacy Price Arena — new entries are disabled. Existing claims and refunds remain available here.</div>}
      <Link to={legacy ? '/onchain/legacy?mode=arenas' : `/onchain/arenas${arena ? `?mode=${modeForArenaCategory(arena.category)}` : ''}`} className="text-sm font-bold text-white/40 hover:text-white">← {legacy ? 'Legacy games' : 'All arenas'}</Link>
      {isLoading ? <p className="py-20 text-center text-white/40">Loading arena…</p> : readError ? <div className="mt-6 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-5 text-rose-300">Could not read this arena.</div> : !arena ? <p className="py-20 text-center text-white/40">Arena not found.</p> : <>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3"><TokenLogo ticker={arena.asset?.symbol} className="mt-1 h-12 w-12 shrink-0 rounded-2xl" /><div className="min-w-0"><p className="text-sm font-bold text-[#B7CEFF]">{arena.asset?.symbol} Price Arena · #{arena.id.toString()}</p><h1 className="mt-1 break-words font-display text-3xl font-bold sm:text-4xl">{arena.title}</h1><p className="mt-1 text-xs text-white/40">Created by <AddressLabel address={arena.creator} className="text-white/60" /> · {arenaDurationLabel(arena.duration)} game</p><PriceSourceLink href={arena.asset?.priceUrl} symbol={arena.asset?.symbol} tone="arena" className="mt-2 bg-[#7A9FF0]/10 px-3 py-1.5" /></div></div>
          <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 sm:w-auto sm:flex-nowrap sm:justify-start">{!legacy && <ShareInviteButton kind="arena" id={arena.id} />}<div className="text-right"><div className="text-xs font-bold uppercase tracking-wider text-white/35">{displayedPhase}</div><div className="font-mono text-3xl font-bold">{clock}</div></div></div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="min-w-0 rounded-2xl border border-white/5 bg-[#241b2f] p-4"><div className="text-xs text-white/35">Players</div><div className="mt-1 truncate font-mono text-2xl font-bold tabular-nums">{arena.participantCount} / 20</div></div>
          <div className="min-w-0 rounded-2xl border border-white/5 bg-[#241b2f] p-4"><div className="text-xs text-white/35">Prize pool</div><div title={`${formatEther(arena.totalPool)} ETH`} className="mt-1 truncate font-mono text-2xl font-bold tabular-nums">{formatCompactEth(arena.totalPool)}</div></div>
          <div className="min-w-0 rounded-2xl border border-white/5 bg-[#241b2f] p-4"><div className="text-xs text-white/35">{arena.phase === PRICE_ARENA_PHASE.RESOLVED ? 'Final price' : 'Live price'}</div><div className="mt-1 truncate font-mono text-2xl font-bold tabular-nums">{displayPrice(referencePrice, arena.priceDecimals, quote)}</div></div>
        </div>

        {legacy && arena.phase === PRICE_ARENA_PHASE.LOBBY ? <div className="mt-6 rounded-3xl border border-white/10 bg-[#241b2f] p-6 text-sm text-white/55">This legacy arena is settlement-only. No new entries can be added.</div> : arena.phase === PRICE_ARENA_PHASE.LOBBY ? <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <section className="min-w-0"><h2 className="font-display text-xl font-bold">Lobby stakes</h2><p className="mt-1 text-sm text-white/40">Prices stay hidden until the game starts. Blockchain data itself remains public.</p><div className="mt-4 space-y-2">{entries.map(({ player, entry }) => <div key={player} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#241b2f] px-4 py-3"><AddressLabel address={player} className="min-w-0 font-bold text-white/70" /><span title={`${formatEther(entry.stake)} ETH`} className="shrink-0 whitespace-nowrap font-mono">{formatCompactEth(entry.stake)} · prediction hidden</span></div>)}{entries.length === 0 && <p className="py-8 text-sm text-white/35">Be the first player.</p>}</div></section>
          <section className="rounded-3xl border border-[#7A9FF0]/20 bg-[#241b2f] p-5">
            <h2 className="font-display text-xl font-bold">{walletEntry?.exists ? 'Update your entry' : 'Make your prediction'}</h2>
            {walletEntry?.exists && <p title={`${formatEther(walletEntry.stake)} ETH`} className="mt-2 text-sm text-white/50">Your current stake is {formatCompactEth(walletEntry.stake)}. Leave price empty to keep it. Money cannot be withdrawn before settlement.</p>}
            <label className="mt-5 block">
              <span className="mb-1.5 block text-sm text-white/50">{walletEntry?.exists ? 'New price · optional' : `Predicted final price · ${quote}`}</span>
              <input value={prediction} onChange={(event) => setPrediction(event.target.value)} inputMode="decimal" placeholder={walletEntry?.exists ? 'Keep current prediction' : '0.00'} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono outline-none focus:border-[#7A9FF0]" />
            </label>
            <div className="mt-4">
              <StakeAmountInput
                id="arena-stake"
                label={walletEntry?.exists ? 'Additional stake (optional)' : 'Stake'}
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
              />
            </div>
            <p className="mt-2 text-xs text-white/45">
              {stakeGuardrailViolation
                ? nativeStakeGuardrailMessage(stakeGuardrailViolation)
                : stakeGuardrailsUnavailable
                  ? 'The contract stake limits are unavailable. No transaction can be sent.'
                  : displayedEntryQuote
                    ? stakeInputUnit === 'ETH'
                      ? `Wallet will send exactly ${formatEther(displayedEntryQuote.wei)} ETH · about ${formatUsdCents(displayedEntryQuote.usdCents)} at the displayed quote.`
                      : `Wallet will send exactly ${formatEther(displayedEntryQuote.wei)} ETH.`
                    : live.ethUsd
                      ? `Enter a stake worth $1–$50 in ${stakeInputUnit}.`
                      : 'ETH/USD quote unavailable'}
            </p>
            {balanceQuery.data != null && <p title={`${formatEther(balanceQuery.data.value)} ETH`} className="mt-1 text-xs text-white/30">Native balance: {formatCompactEth(balanceQuery.data.value)}</p>}
            {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
            {!isConnected
              ? <div className="mt-5"><WalletOptionsList tone="arena" /></div>
              : chainId !== assetRaceChain.id
                ? <button onClick={() => switchChain({ chainId: assetRaceChain.id })} disabled={isSwitching} className="mt-5 w-full rounded-xl bg-[#7A9FF0] py-3 font-bold text-[#152447] hover:bg-[#8EB1F8]">Switch network</button>
                : <button
                    onClick={submitEntry}
                    disabled={
                      !!txLabel || (!walletEntry?.exists && displayedEntryWei <= 0n)
                        || stakeGuardrailsUnavailable
                        || !!stakeGuardrailViolation
                    }
                    className="mt-5 w-full rounded-xl bg-gradient-to-r from-[#8EB1F8] to-[#7A9FF0] py-3 font-bold text-[#152447] disabled:opacity-40"
                  >
                    {txLabel ?? (walletEntry?.exists ? 'Update entry' : 'Enter arena with ETH')}
                  </button>}
          </section>
        </div> : arena.phase === PRICE_ARENA_PHASE.CANCELLED ? <div className="mt-6 rounded-3xl border border-amber-400/20 bg-amber-400/10 p-6"><h2 className="font-display text-2xl font-bold">Arena cancelled</h2><p className="mt-2 text-sm text-white/55">The round did not have enough players or could not obtain a valid deadline price. Every player gets a full refund.</p>{walletEntry?.exists && !walletEntry.settled && <button title={`${formatEther(walletEntry.stake)} ETH`} onClick={() => settle('refund')} disabled={!!txLabel} className="mt-5 max-w-full truncate rounded-xl bg-[#7A9FF0] px-6 py-3 font-bold text-[#152447] hover:bg-[#8EB1F8]">{txLabel ?? `Refund ${formatCompactEth(walletEntry.stake)}`}</button>}{error && <p className="mt-3 text-sm text-rose-400">{error}</p>}</div> : <section className="mt-7"><div className="mb-4 flex items-end justify-between"><div><h2 className="font-display text-2xl font-bold">{arena.phase === PRICE_ARENA_PHASE.RUNNING ? awaitingSettlement ? 'Settlement pending' : 'Live leaderboard' : 'Final standings'}</h2><p className="mt-1 text-sm text-white/40">{arena.phase === PRICE_ARENA_PHASE.RUNNING ? awaitingSettlement ? 'The round is closed. The keeper is fixing the deadline price and final ranking onchain.' : 'Positions update with the display price; onchain settlement uses the last block before the deadline.' : `Closest ${arena.winnerCount} player${arena.winnerCount === 1 ? '' : 's'} won.`}</p></div>{arena.phase === PRICE_ARENA_PHASE.RUNNING && !awaitingSettlement && live.disconnected && <span className="text-xs font-bold text-amber-300">Live feed reconnecting…</span>}</div><ArenaBoard rows={entries} referencePrice={referencePrice} decimals={arena.priceDecimals} quote={quote} resolved={arena.phase === PRICE_ARENA_PHASE.RESOLVED} winnerCount={arena.winnerCount} />{arena.phase === PRICE_ARENA_PHASE.RESOLVED && walletEntry?.payout && walletEntry.payout > 0n && !walletEntry.settled ? <button title={`${formatEther(walletEntry.payout)} ETH`} onClick={() => settle('claim')} disabled={!!txLabel} className="mt-6 w-full truncate rounded-xl bg-gradient-to-r from-[#8EB1F8] to-[#7A9FF0] py-3 font-bold text-[#152447]">{txLabel ?? `Claim ${formatCompactEth(walletEntry.payout)}`}</button> : arena.phase === PRICE_ARENA_PHASE.RESOLVED && walletEntry?.settled ? <div className="mt-6 rounded-xl bg-white/5 py-3 text-center font-bold text-white/40">Already claimed</div> : null}{error && <p className="mt-3 text-sm text-rose-400">{error}</p>}</section>}
      </>}
    </div>
  )
}
