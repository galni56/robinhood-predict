import { useMemo, useState } from 'react'
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
  PRICE_ARENA_PHASE,
  arenaDurationLabel,
  arenaPhaseLabel,
  modeForArenaCategory,
  priceArenaAbi,
  type PriceArenaEntry,
} from '@/chain/priceArena'
import { AddressLabel } from '@/components/AddressLabel'
import { ShareInviteButton } from '@/components/ShareInviteButton'
import { StakeAmountInput } from '@/components/StakeAmountInput'
import { TokenLogo } from '@/components/TokenLogo'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { formatCountdown, shortTxError } from '@/lib/format'

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
          <div><AddressLabel address={player} className="font-bold text-white/80" /><div className="text-xs text-white/30">{formatEther(entry.stake)} ETH</div></div>
          <div><div className="text-xs text-white/30">Prediction</div><div className="font-mono font-bold">{displayPrice(entry.prediction, decimals, quote)}</div></div>
          <div className="sm:text-right"><div className="text-xs text-white/30">{resolved ? (winning ? 'Payout' : 'Result') : 'Live error'}</div><div className={`font-mono font-bold ${winning ? 'text-emerald-300' : 'text-white/50'}`}>{resolved ? (entry.payout > 0n ? `${formatEther(entry.payout)} ETH` : 'Lost') : `${error.toFixed(4)}%`}</div></div>
        </div>
      })}
    </div>
  )
}

export function OnchainArenaPage() {
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
  } = usePriceArena(arenaId, address)
  const chainId = useChainId()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
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
  const balanceQuery = useBalance({ address, chainId: assetRaceChain.id, query: { enabled: !!address && !!PRICE_ARENA_ADDRESS } })
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
  const clock = target && nowMs > 0 && Number(target) * 1_000 > nowMs
    ? formatCountdown(Number(target) * 1_000 - nowMs)
    : arena
      ? arenaPhaseLabel(arena.phase)
      : '…'

  async function submitEntry() {
    if (!PRICE_ARENA_ADDRESS || arenaId == null || !arena) return
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
        ? await writeContractAsync({ address: PRICE_ARENA_ADDRESS, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'updateEntry', args: [arenaId, predicted, additional], value: additional })
        : await writeContractAsync({ address: PRICE_ARENA_ADDRESS, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'enter', args: [arenaId, predicted, additional], value: additional })
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
    if (!PRICE_ARENA_ADDRESS || arenaId == null) return
    setError(null)
    try {
      setTxLabel(`Confirm ${functionName}…`)
      const hash = await writeContractAsync({ address: PRICE_ARENA_ADDRESS, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName, args: [arenaId] })
      await waitForTransactionReceipt(wagmiConfig, { hash, chainId: assetRaceChain.id })
      setTxLabel(null); await refetch()
    } catch (cause) { setTxLabel(null); setError(shortTxError(cause)) }
  }

  if (arenaId == null) return <div className="mx-auto max-w-4xl px-4 py-12 text-rose-300">Invalid arena ID.</div>
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8">
      <Link to={`/onchain/arenas${arena ? `?mode=${modeForArenaCategory(arena.category)}` : ''}`} className="text-sm font-bold text-white/40 hover:text-white">← All arenas</Link>
      {isLoading ? <p className="py-20 text-center text-white/40">Loading arena…</p> : readError ? <div className="mt-6 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-5 text-rose-300">Could not read this arena.</div> : !arena ? <p className="py-20 text-center text-white/40">Arena not found.</p> : <>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-start gap-3"><TokenLogo ticker={arena.asset?.symbol} className="mt-1 h-12 w-12 rounded-2xl" /><div><p className={`text-sm font-bold ${arena.category === 1 ? 'text-[#F2A65A]' : 'text-[#B3A7FA]'}`}>{arena.asset?.symbol} Price Arena · #{arena.id.toString()}</p><h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">{arena.title}</h1><p className="mt-1 text-xs text-white/40">Created by <AddressLabel address={arena.creator} className="text-white/60" /> · {arenaDurationLabel(arena.duration)} game</p></div></div>
          <div className="flex items-center gap-3"><ShareInviteButton kind="arena" id={arena.id} /><div className="text-right"><div className="text-xs font-bold uppercase tracking-wider text-white/35">{arenaPhaseLabel(arena.phase)}</div><div className="font-mono text-3xl font-bold">{clock}</div></div></div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/5 bg-[#241b2f] p-4"><div className="text-xs text-white/35">Players</div><div className="mt-1 font-mono text-2xl font-bold">{arena.participantCount} / 20</div></div>
          <div className="rounded-2xl border border-white/5 bg-[#241b2f] p-4"><div className="text-xs text-white/35">Prize pool</div><div className="mt-1 font-mono text-2xl font-bold">{formatEther(arena.totalPool)} ETH</div></div>
          <div className="rounded-2xl border border-white/5 bg-[#241b2f] p-4"><div className="text-xs text-white/35">{arena.phase === PRICE_ARENA_PHASE.RESOLVED ? 'Final price' : 'Live price'}</div><div className="mt-1 font-mono text-2xl font-bold">{displayPrice(referencePrice, arena.priceDecimals, quote)}</div></div>
        </div>

        {arena.phase === PRICE_ARENA_PHASE.LOBBY ? <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <section><h2 className="font-display text-xl font-bold">Lobby stakes</h2><p className="mt-1 text-sm text-white/40">Prices stay hidden until the game starts. Blockchain data itself remains public.</p><div className="mt-4 space-y-2">{entries.map(({ player, entry }) => <div key={player} className="flex items-center justify-between rounded-xl border border-white/5 bg-[#241b2f] px-4 py-3"><AddressLabel address={player} className="font-bold text-white/70" /><span className="font-mono">{formatEther(entry.stake)} ETH · prediction hidden</span></div>)}{entries.length === 0 && <p className="py-8 text-sm text-white/35">Be the first player.</p>}</div></section>
          <section className="rounded-3xl border border-[#8B7CF7]/20 bg-[#241b2f] p-5">
            <h2 className="font-display text-xl font-bold">{walletEntry?.exists ? 'Update your entry' : 'Make your prediction'}</h2>
            {walletEntry?.exists && <p className="mt-2 text-sm text-white/50">Your current stake is {formatEther(walletEntry.stake)} ETH. Leave price empty to keep it. Money cannot be withdrawn before settlement.</p>}
            <label className="mt-5 block">
              <span className="mb-1.5 block text-sm text-white/50">{walletEntry?.exists ? 'New price · optional' : `Predicted final price · ${quote}`}</span>
              <input value={prediction} onChange={(event) => setPrediction(event.target.value)} inputMode="decimal" placeholder={walletEntry?.exists ? 'Keep current prediction' : '0.00'} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono outline-none focus:border-[#8B7CF7]" />
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
            {balanceQuery.data != null && <p className="mt-1 text-xs text-white/30">Native balance: {formatEther(balanceQuery.data.value)} ETH</p>}
            {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
            {!isConnected
              ? <div className="mt-5"><WalletOptionsList /></div>
              : chainId !== assetRaceChain.id
                ? <button onClick={() => switchChain({ chainId: assetRaceChain.id })} disabled={isSwitching} className="mt-5 w-full rounded-xl bg-[#F2A65A] py-3 font-bold text-[#3b2416]">Switch network</button>
                : <button
                    onClick={submitEntry}
                    disabled={
                      !!txLabel || (!walletEntry?.exists && displayedEntryWei <= 0n)
                        || stakeGuardrailsUnavailable
                        || !!stakeGuardrailViolation
                    }
                    className="mt-5 w-full rounded-xl bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] py-3 font-bold disabled:opacity-40"
                  >
                    {txLabel ?? (walletEntry?.exists ? 'Update entry' : 'Enter arena with ETH')}
                  </button>}
          </section>
        </div> : arena.phase === PRICE_ARENA_PHASE.CANCELLED ? <div className="mt-6 rounded-3xl border border-amber-400/20 bg-amber-400/10 p-6"><h2 className="font-display text-2xl font-bold">Arena cancelled</h2><p className="mt-2 text-sm text-white/55">The round did not have enough players or could not obtain a valid deadline price. Every player gets a full refund.</p>{walletEntry?.exists && !walletEntry.settled && <button onClick={() => settle('refund')} disabled={!!txLabel} className="mt-5 rounded-xl bg-[#F2A65A] px-6 py-3 font-bold text-[#3b2416]">{txLabel ?? `Refund ${formatEther(walletEntry.stake)} ETH`}</button>}{error && <p className="mt-3 text-sm text-rose-400">{error}</p>}</div> : <section className="mt-7"><div className="mb-4 flex items-end justify-between"><div><h2 className="font-display text-2xl font-bold">{arena.phase === PRICE_ARENA_PHASE.RUNNING ? 'Live leaderboard' : 'Final standings'}</h2><p className="mt-1 text-sm text-white/40">{arena.phase === PRICE_ARENA_PHASE.RUNNING ? 'Positions update with the display price; onchain settlement uses the last block before the deadline.' : `Closest ${arena.winnerCount} player${arena.winnerCount === 1 ? '' : 's'} won.`}</p></div>{arena.phase === PRICE_ARENA_PHASE.RUNNING && live.disconnected && <span className="text-xs font-bold text-amber-300">Live feed reconnecting…</span>}</div><ArenaBoard rows={entries} referencePrice={referencePrice} decimals={arena.priceDecimals} quote={quote} resolved={arena.phase === PRICE_ARENA_PHASE.RESOLVED} winnerCount={arena.winnerCount} />{arena.phase === PRICE_ARENA_PHASE.RESOLVED && walletEntry?.payout && walletEntry.payout > 0n && !walletEntry.settled ? <button onClick={() => settle('claim')} disabled={!!txLabel} className="mt-6 w-full rounded-xl bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] py-3 font-bold">{txLabel ?? `Claim ${formatEther(walletEntry.payout)} ETH`}</button> : arena.phase === PRICE_ARENA_PHASE.RESOLVED && walletEntry?.settled ? <div className="mt-6 rounded-xl bg-white/5 py-3 text-center font-bold text-white/40">Already claimed</div> : null}{error && <p className="mt-3 text-sm text-rose-400">{error}</p>}</section>}
      </>}
    </div>
  )
}
