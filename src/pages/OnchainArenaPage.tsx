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
import { arenaStakeMemo, stakeInstructions } from '@/chain/gameTx'
import { depositOutcomeMessage, reportDeposit, useGameServerConfig, useSignedAction } from '@/chain/gameServer'
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
import { ClusterBanner } from '@/components/ClusterBanner'
import { ShareInviteButton } from '@/components/ShareInviteButton'
import { StakeAmountInput } from '@/components/StakeAmountInput'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { formatStakeAmount, formatStakeExact, useStakeBalance, useStakeToken, type StakeToken } from '@/solana/stakeTokens'
import { explorerUrl } from '@/solana/config'
import { TxUnconfirmedError, useSendInstructions } from '@/solana/tx'
import { formatCompactUsd, formatCountdown, formatUnits, formatUsdPrice, parseUnits, shortTxError } from '@/lib/format'
import { FightStage } from '@/retro/arena'
import { CREAM, INK } from '@/retro/scene'
import { PIXEL } from '@/retro/race'

function parseId(value?: string) {
  if (!value || !/^\d+$/.test(value)) return null
  try { return BigInt(value) } catch { return null }
}

function absError(a: bigint, b: bigint) { return a >= b ? a - b : b - a }

/** Coin supply in whole tokens (memes): turns a price into a market cap. */
type Supply = number | undefined

/** "4.2M", "850k", "1.5b" or a plain number, in USD. */
function parseCapUsd(value: string) {
  const match = /^\s*\$?\s*([0-9]+(?:[.,][0-9]+)?)\s*([kmb]?)\s*$/i.exec(value)
  if (!match) return null
  const base = Number(match[1].replace(',', '.'))
  const scale = { '': 1, k: 1e3, m: 1e6, b: 1e9 }[match[2].toLowerCase() as '' | 'k' | 'm' | 'b']
  return base * scale
}

/** A market cap entered by a player, as the raw price the game settles on. */
function capToPrice(capUsd: number, supply: number, decimals: number) {
  const price = capUsd / supply
  return BigInt(Math.round(price * 10 ** decimals))
}

function displayValue(raw: bigint, decimals: number, supply: Supply) {
  if (raw <= 0n) return '-'
  const price = Number(formatUnits(raw, decimals))
  return supply ? formatCompactUsd(price * supply) : formatUsdPrice(price)
}

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

function ArenaBoard({ rows, referencePrice, decimals, resolved, winnerCount, token, supply }: {
  rows: PriceArenaEntry[]
  token: StakeToken
  supply: Supply
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
        return <div key={entry.player} className={`grid gap-3 rounded-none border-[3px] border-[#1B1340] p-4 text-[#1B1340] sm:grid-cols-[2.5rem_1fr_1fr_1fr] sm:items-center ${winning ? 'bg-[#8BE89A]/60' : 'bg-white'}`}>
          <div className="font-mono text-lg text-[#1B1340]/60">#{resolved ? entry.rank : index + 1}</div>
          <div className="min-w-0"><AddressLabel address={entry.player} className="font-bold text-[#1B1340]" /><div title={fmtExact(entry.stake)} className="truncate text-sm font-semibold text-[#1B1340]/55">{fmt(entry.stake)}</div></div>
          <div><div className="text-sm font-semibold text-[#1B1340]/55">{supply ? 'Market cap call' : 'Prediction'}</div><div className="font-mono font-bold">{displayValue(entry.prediction, decimals, supply)}</div></div>
          <div className="min-w-0 sm:text-right"><div className="text-sm font-semibold text-[#1B1340]/55">{resolved ? (winning ? 'Payout' : 'Result') : 'Live deviation'}</div><div title={resolved && entry.payout > 0n ? fmtExact(entry.payout) : undefined} className={`truncate font-mono font-bold ${winning ? 'text-[#1E7A36]' : 'text-[#1B1340]/60'}`}>{resolved ? (entry.payout > 0n ? fmt(entry.payout) : 'Lost') : `${error.toFixed(4)}%`}</div></div>
        </div>
      })}
    </div>
  )
}

export function OnchainArenaPage() {
  const arenaId = parseId(useParams().arenaId)
  const { publicKey, connected } = useWallet()
  const send = useSendInstructions()
  const act = useSignedAction()
  const serverConfig = useGameServerConfig()
  const { arena, entries, walletEntry, payout, minStake, maxStake, isLoading, error: readError, refetch } = usePriceArena(arenaId, publicKey)
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
  // Memes are called by market cap (price x supply) unless the player picks price.
  const supplyTokens = liveAsset?.supply ? Number(liveAsset.supply.raw) / 10 ** liveAsset.supply.decimals : undefined
  // The creator picked the arena's unit; a player may still switch the input.
  const [unitChoice, setUnitChoice] = useState<'cap' | 'price' | null>(null)
  const unit = supplyTokens ? (unitChoice ?? arena?.unit ?? 'price') : 'price'
  const supply: Supply = unit === 'cap' ? supplyTokens : undefined
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

  async function refetchAfterTx() {
    await Promise.all([
      refetch(),
      balance.refetch(),
      queryClient.invalidateQueries({ queryKey: ['history'] }),
      queryClient.invalidateQueries({ queryKey: ['game-state'] }),
    ])
  }

  async function submitEntry() {
    if (!arena || !publicKey || !token) return
    setError(null)
    try {
      if (usdQuoted && amount.trim() && !live.solUsd) throw new Error('SolUsdQuoteStale')
      const frozenQuote = usdQuoted && amount.trim() && live.solUsd ? freezeStakeQuote(amount, stakeInputUnit, live.solUsd) : null
      const additional = frozenQuote?.lamports ?? (!usdQuoted && amount.trim() ? parseTokenAmount(amount, token.decimals) : 0n)
      setFrozenEntryQuote(frozenQuote)
      let predicted: bigint
      if (unit === 'cap' && supplyTokens && prediction.trim()) {
        const cap = parseCapUsd(prediction)
        if (cap == null || cap <= 0) throw new EntryInputError('Enter a market cap like 4.2M or 850K')
        predicted = capToPrice(cap, supplyTokens, arena.priceDecimals)
      } else {
        predicted = parsePrediction(prediction, arena.priceDecimals)
      }
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
      if (additional === 0n) {
        // Only the prediction changes: a signed message, no transaction.
        setTxLabel('Signing…')
        await act({ action: 'change-prediction', arena: Number(arena.id), prediction: predicted.toString() })
        setPrediction(''); setTxLabel(null)
        await refetchAfterTx()
        return
      }
      const gameWallet = serverConfig.data?.gameWallet
      if (!gameWallet) throw new Error('The game server is not reachable right now')
      setTxLabel(walletEntry ? 'Preparing arena update…' : 'Preparing arena entry…')
      const instructions = stakeInstructions({ player: publicKey, gameWallet, lamports: additional, memo: arenaStakeMemo(arena.id, predicted) })
      const signature = await send(instructions, {
        onPhase: (phase) => setTxLabel(phase === 'signing' ? 'Sending…' : 'Waiting for confirmation…'),
      })
      setTxLabel('Recording your entry…')
      const outcome = await reportDeposit(signature).catch(() => null)
      setPrediction(''); setAmount(''); setTxLabel(null); setFrozenEntryQuote(null)
      if (outcome) setError(depositOutcomeMessage(outcome))
      await refetchAfterTx()
    } catch (cause) {
      setTxLabel(null)
      setFrozenEntryQuote(null)
      setError(stakeQuoteErrorMessage(cause) ?? (cause instanceof EntryInputError ? cause.message : shortTxError(cause, 'arena-join')))
      // Unknown outcome: the entry may have landed - show the real state
      // instead of inviting a duplicate entry.
      if (cause instanceof TxUnconfirmedError) void refetchAfterTx()
    }
  }

  // Winnings and refunds are sent by the game server; this only reports them.
  const payoutNote = payout
    ? payout.status === 'done' && payout.signature
      ? <a href={explorerUrl('tx', payout.signature)} target="_blank" rel="noreferrer" className="mt-5 block text-center text-sm font-bold opacity-70 hover:opacity-100">{payout.kind === 'refund' ? 'Refunded' : 'Paid'} {fmt(payout.amount)} to your wallet ↗</a>
      : <div className="mt-5 text-center text-sm font-bold" style={{ color: '#B8860B' }}>{payout.status === 'stuck' ? 'Payout delayed - the team has been alerted' : `Sending ${fmt(payout.amount)} to your wallet…`}</div>
    : null

  if (arenaId == null) return <div style={{ padding: 48, textAlign: 'center', fontFamily: PIXEL, fontSize: 12 }}>INVALID ARENA ID</div>
  return (
    <div style={{ minHeight: '100%', background: '#4B37B0', color: CREAM, fontFamily: "'Pixelify Sans', 'Courier New', monospace" }}>
    <div className="mx-auto max-w-[1200px] px-4 py-8">
      <ClusterBanner className="mb-5" />
      <Link to={`/onchain/arenas${arena ? `?mode=${modeForArenaCategory(arena.category)}` : ''}`} style={{ color: CREAM, fontSize: 20, fontWeight: 600 }}>← All arenas</Link>
      {isLoading ? <p className="py-20 text-center text-[#FFF6DF]/80">Loading arena…</p> : readError ? <div className="mt-6 rounded-none border rx-raised bg-[#FFF6DF] p-5 text-[#C2245A]">Could not read this arena.</div> : !arena ? <p className="py-20 text-center text-[#FFF6DF]/80">Arena not found.</p> : <>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <h1 style={{ margin: 0, fontFamily: PIXEL, fontSize: 'clamp(18px, 2vw, 28px)', fontWeight: 400, lineHeight: 1.3, textShadow: `4px 4px 0 ${INK}` }}>
            ARENA · FIGHT #{arena.id.toString()}
          </h1>
          <ShareInviteButton kind="arena" id={arena.id} />
        </div>
        {arena.title && <p style={{ margin: '10px 0 0', fontSize: 20, fontWeight: 600 }}>{arena.title} · by <AddressLabel address={arena.creator} /> · {arenaDurationLabel(arena.duration)}</p>}

        <div className="mt-6">
          <FightStage
            leftLabel={arena.symbol}
            rightLabel="MARKET"
            timerLabel={phase === PRICE_ARENA_PHASE.LOBBY ? 'to the fight' : phase === PRICE_ARENA_PHASE.RUNNING ? 'to the bell' : displayedPhase.toLowerCase()}
            timerValue={clock}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3" style={{ fontSize: 20, fontWeight: 600 }}>
          <span>Players {arena.participantCount} / {PRICE_ARENA_MAX_PARTICIPANTS}</span>
          <span style={{ fontFamily: PIXEL, fontSize: 14 }}>BANK {fmt(arena.totalPool)}</span>
          <span>{phase === PRICE_ARENA_PHASE.RESOLVED ? (supply ? 'Final cap' : 'Final price') : (supply ? 'Live cap' : 'Live price')} <span style={{ fontFamily: PIXEL, fontSize: 14 }}>{displayValue(referencePrice, arena.priceDecimals, supply)}</span></span>
        </div>

        {!token ? <p className="py-10 text-center text-sm text-[#FFF6DF]/80">Loading stake currency…</p> : phase === PRICE_ARENA_PHASE.LOBBY ? <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <section className="rx-raised min-w-0" style={{ background: CREAM, color: INK, padding: 24 }}><h2 style={{ margin: 0, fontFamily: PIXEL, fontSize: 14, fontWeight: 400, lineHeight: 1.4 }}>LOBBY STAKES</h2><p className="mt-2" style={{ fontSize: 18, fontWeight: 500, opacity: 0.7 }}>Predictions stay hidden here until the game starts. They travel in the stake transaction's public memo, so this is a display courtesy, not secrecy.</p><div className="mt-4 space-y-2">{entries.map((entry) => <div key={entry.player} className="rx-plate flex min-w-0 items-center justify-between gap-3 px-4 py-3" style={{ background: '#FFFFFF' }}><AddressLabel address={entry.player} className="min-w-0 font-bold" /><span title={fmtExact(entry.stake)} className="shrink-0 whitespace-nowrap font-mono">{fmt(entry.stake)} · prediction hidden</span></div>)}{entries.length === 0 && <p className="py-8" style={{ fontSize: 18, fontWeight: 500, opacity: 0.6 }}>Be the first player.</p>}</div></section>
          <section className="rx-raised" style={{ background: CREAM, color: INK, padding: 24 }}>
            <h2 style={{ margin: 0, fontFamily: PIXEL, fontSize: 14, fontWeight: 400, lineHeight: 1.4 }}>{walletEntry ? 'UPDATE YOUR ENTRY' : 'YOUR CALL'}</h2>
            {walletEntry && <p title={fmtExact(walletEntry.stake)} className="mt-2 text-sm text-[#1B1340]/55">Your current stake is {fmt(walletEntry.stake)}. Leave price empty to keep it. Money cannot be withdrawn before settlement.</p>}
            {supplyTokens && (
              <div className="mt-5" style={{ display: 'flex', gap: 4 }}>
                {(['cap', 'price'] as const).map((choice) => (
                  <button key={choice} type="button" onClick={() => { setUnitChoice(choice); setPrediction('') }} className={`rx-btn ${unit === choice ? 'rx-btn-yellow' : 'rx-btn-white'}`} style={{ padding: '8px 14px', fontSize: 14, fontWeight: 700 }}>
                    {choice === 'cap' ? 'Market cap' : 'Price'}
                  </button>
                ))}
              </div>
            )}
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm text-[#1B1340]/55">{walletEntry ? `New ${unit === 'cap' ? 'market cap' : 'price'} · optional` : unit === 'cap' ? 'Final market cap · USD (e.g. 4.2M)' : 'Predicted final price · USD'}</span>
              <input value={prediction} onChange={(event) => setPrediction(event.target.value)} inputMode="decimal" placeholder={walletEntry ? 'Keep current prediction' : unit === 'cap' ? `now ${displayValue(livePrice, arena.priceDecimals, supplyTokens)}` : '0.00'} className="rx-input" style={{ width: 'calc(100% - 8px)', height: 56, padding: '0 16px', fontFamily: PIXEL, fontSize: 20 }} />
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
            <p className="mt-2 text-xs text-[#1B1340]/55">
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
            {balance.data != null && <p title={fmtExact(balance.data)} className="mt-1 text-xs text-[#1B1340]/55">Wallet balance: {fmt(balance.data)}</p>}
            {error && <p className="mt-3 text-sm text-[#C2245A]">{error}</p>}
            {!connected
              ? <div className="mt-5"><WalletOptionsList tone="arena" /></div>
              : <button
                  onClick={submitEntry}
                  disabled={!!txLabel || (!walletEntry && displayedEntryAmount <= 0n) || !!violation}
                  className="rx-btn rx-btn-pink mt-5 w-full"
                  style={{ minHeight: 64, fontFamily: PIXEL, fontSize: 14 }}
                >
                  {txLabel ?? (walletEntry ? 'UPDATE ENTRY' : 'STEP INTO THE RING')}
                </button>}
          </section>
        </div> : phase === PRICE_ARENA_PHASE.CANCELLED ? <div className="rx-raised mt-6" style={{ background: CREAM, color: INK, padding: 24 }}><h2 style={{ margin: 0, fontFamily: PIXEL, fontSize: 16 }}>ARENA CANCELLED</h2><p className="mt-2 text-sm text-[#1B1340]/55">{cancelReasonText(arena.cancelReason)} Every player gets a full refund, sent to their wallet automatically.</p>{walletEntry && (payoutNote ?? <div className="mt-5 text-center text-sm font-bold" style={{ color: '#B8860B' }}>Preparing your refund…</div>)}{error && <p className="mt-3 text-sm text-[#C2245A]">{error}</p>}</div> : <section className="rx-raised mt-7" style={{ background: CREAM, color: INK, padding: 24 }}><div className="mb-4 flex items-end justify-between"><div><h2 style={{ margin: 0, fontFamily: PIXEL, fontSize: 14, fontWeight: 400, lineHeight: 1.4 }}>{phase === PRICE_ARENA_PHASE.RUNNING ? underfilled ? 'NOT ENOUGH PLAYERS' : awaitingSettlement ? 'SETTLEMENT PENDING' : 'LIVE LEADERBOARD' : 'FINAL STANDINGS'}</h2><p className="mt-2" style={{ fontSize: 18, fontWeight: 500, opacity: 0.7 }}>{phase === PRICE_ARENA_PHASE.RUNNING ? underfilled ? 'Fewer than two players joined. This arena is being cancelled and every stake goes back to its wallet.' : awaitingSettlement ? 'The round is closed. The game server is fixing the signed deadline price and the final ranking.' : 'Positions update with the display price; settlement uses the signed pool price at the deadline.' : `Closest ${arena.winnerCount} player${arena.winnerCount === 1 ? '' : 's'} won.`}</p></div>{phase === PRICE_ARENA_PHASE.RUNNING && !awaitingSettlement && live.disconnected && <span className="text-xs font-bold text-[#B8860B]">Live feed reconnecting…</span>}</div><ArenaBoard rows={entries} referencePrice={referencePrice} decimals={arena.priceDecimals} resolved={phase === PRICE_ARENA_PHASE.RESOLVED} winnerCount={arena.winnerCount} token={token} supply={supply} />{phase === PRICE_ARENA_PHASE.RESOLVED && walletEntry && walletEntry.payout > 0n ? (payoutNote ?? <div className="mt-5 text-center text-sm font-bold" style={{ color: '#B8860B' }}>Preparing your payout…</div>) : null}{error && <p className="mt-3 text-sm text-[#C2245A]">{error}</p>}</section>}
      </>}
    </div>
    </div>
  )
}
