import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatUnits, parseUnits, zeroAddress, type Address } from 'viem'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { useAccount, useChainId, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { assetRaceChain, wagmiConfig } from '@/chain/config'
import { erc20Abi } from '@/chain/contracts'
import { useAssetRaceClock } from '@/chain/useAssetRaceClock'
import { useAssetRaceLiveDisplay } from '@/chain/useAssetRaceLiveDisplay'
import { usePriceArena } from '@/chain/usePriceArena'
import {
  PRICE_ARENA_ADDRESS,
  PRICE_ARENA_PHASE,
  PRICE_ARENA_TOKEN_DECIMALS,
  arenaDurationLabel,
  arenaPhaseLabel,
  modeForArenaCategory,
  priceArenaAbi,
  type PriceArenaEntry,
} from '@/chain/priceArena'
import { AddressLabel } from '@/components/AddressLabel'
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
          <div><AddressLabel address={player} className="font-bold text-white/80" /><div className="text-xs text-white/30">{Number(formatUnits(entry.stake, 6)).toFixed(2)} USDG</div></div>
          <div><div className="text-xs text-white/30">Prediction</div><div className="font-mono font-bold">{displayPrice(entry.prediction, decimals, quote)}</div></div>
          <div className="sm:text-right"><div className="text-xs text-white/30">{resolved ? (winning ? 'Payout' : 'Result') : 'Live error'}</div><div className={`font-mono font-bold ${winning ? 'text-emerald-300' : 'text-white/50'}`}>{resolved ? (entry.payout > 0n ? `${Number(formatUnits(entry.payout, 6)).toFixed(2)} USDG` : 'Lost') : `${error.toFixed(4)}%`}</div></div>
        </div>
      })}
    </div>
  )
}

export function OnchainArenaPage() {
  const arenaId = parseId(useParams().arenaId)
  const { address, isConnected } = useAccount()
  const { arena, entries, walletEntry, isLoading, error: readError, refetch } = usePriceArena(arenaId, address)
  const chainId = useChainId()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const [prediction, setPrediction] = useState('')
  const [amount, setAmount] = useState('')
  const [txLabel, setTxLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const nowMs = useAssetRaceClock()
  const live = useAssetRaceLiveDisplay({ enabled: arena?.phase === PRICE_ARENA_PHASE.RUNNING })
  const liveAsset = arena?.asset ? live.assets[arena.asset.symbol] : undefined
  const livePrice = liveAsset ? BigInt(liveAsset.priceRaw) : 0n
  const quote = arena?.asset?.quoteSymbol ?? 'USDG'
  const referencePrice = arena?.phase === PRICE_ARENA_PHASE.RESOLVED ? arena.finalPrice : livePrice
  const readAddress = PRICE_ARENA_ADDRESS ?? zeroAddress
  const tokenQuery = useReadContract({ address: readAddress, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'betToken', query: { enabled: !!PRICE_ARENA_ADDRESS } })
  const tokenAddress = tokenQuery.data ?? zeroAddress
  const allowanceQuery = useReadContract({ address: tokenAddress, chainId: assetRaceChain.id, abi: erc20Abi, functionName: 'allowance', args: address && PRICE_ARENA_ADDRESS ? [address, PRICE_ARENA_ADDRESS] : undefined, query: { enabled: !!address && !!tokenQuery.data && !!PRICE_ARENA_ADDRESS } })
  const balanceQuery = useReadContract({ address: tokenAddress, chainId: assetRaceChain.id, abi: erc20Abi, functionName: 'balanceOf', args: address ? [address] : undefined, query: { enabled: !!address && !!tokenQuery.data } })

  const target = arena?.phase === PRICE_ARENA_PHASE.LOBBY ? arena.startsAt : arena?.phase === PRICE_ARENA_PHASE.RUNNING ? arena.deadline : 0n
  const clock = target && Number(target) * 1_000 > nowMs ? formatCountdown(Number(target) * 1_000 - nowMs) : arena ? arenaPhaseLabel(arena.phase) : '…'

  async function submitEntry() {
    if (!PRICE_ARENA_ADDRESS || arenaId == null || !arena) return
    setError(null)
    try {
      const additional = amount.trim() ? parseUnits(amount, PRICE_ARENA_TOKEN_DECIMALS) : 0n
      const predicted = prediction.trim() ? parseUnits(prediction.replace(',', '.'), arena.priceDecimals) : 0n
      if (!walletEntry?.exists && (predicted <= 0n || additional < 1_000_000n)) throw new Error('Enter a price and a stake of at least 1 USDG')
      if (walletEntry?.exists && predicted === 0n && additional === 0n) throw new Error('Enter a new price or a top-up amount')
      if ((allowanceQuery.data ?? 0n) < additional) {
        setTxLabel('Confirm USDG approval…')
        const approveHash = await writeContractAsync({ address: tokenAddress, chainId: assetRaceChain.id, abi: erc20Abi, functionName: 'approve', args: [PRICE_ARENA_ADDRESS, additional] })
        await waitForTransactionReceipt(wagmiConfig, { hash: approveHash, chainId: assetRaceChain.id })
      }
      setTxLabel(walletEntry?.exists ? 'Confirm arena update…' : 'Confirm arena entry…')
      const hash = walletEntry?.exists
        ? await writeContractAsync({ address: PRICE_ARENA_ADDRESS, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'updateEntry', args: [arenaId, predicted, additional] })
        : await writeContractAsync({ address: PRICE_ARENA_ADDRESS, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'enter', args: [arenaId, predicted, additional] })
      setTxLabel('Waiting for confirmation…')
      await waitForTransactionReceipt(wagmiConfig, { hash, chainId: assetRaceChain.id })
      setPrediction(''); setAmount(''); setTxLabel(null)
      await Promise.all([refetch(), allowanceQuery.refetch(), balanceQuery.refetch()])
    } catch (cause) {
      setTxLabel(null)
      setError(cause instanceof Error && !cause.message.includes('\n') ? cause.message : shortTxError(cause))
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
          <div><p className={`text-sm font-bold ${arena.category === 1 ? 'text-[#F2A65A]' : 'text-[#B3A7FA]'}`}>{arena.asset?.symbol} Price Arena · #{arena.id.toString()}</p><h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">{arena.title}</h1><p className="mt-1 text-xs text-white/40">Created by <AddressLabel address={arena.creator} className="text-white/60" /> · {arenaDurationLabel(arena.duration)} game</p></div>
          <div className="text-right"><div className="text-xs font-bold uppercase tracking-wider text-white/35">{arenaPhaseLabel(arena.phase)}</div><div className="font-mono text-3xl font-bold">{clock}</div></div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/5 bg-[#241b2f] p-4"><div className="text-xs text-white/35">Players</div><div className="mt-1 font-mono text-2xl font-bold">{arena.participantCount} / 20</div></div>
          <div className="rounded-2xl border border-white/5 bg-[#241b2f] p-4"><div className="text-xs text-white/35">Prize pool</div><div className="mt-1 font-mono text-2xl font-bold">{Number(formatUnits(arena.totalPool, 6)).toFixed(2)} USDG</div></div>
          <div className="rounded-2xl border border-white/5 bg-[#241b2f] p-4"><div className="text-xs text-white/35">{arena.phase === PRICE_ARENA_PHASE.RESOLVED ? 'Final price' : 'Live price'}</div><div className="mt-1 font-mono text-2xl font-bold">{displayPrice(referencePrice, arena.priceDecimals, quote)}</div></div>
        </div>

        {arena.phase === PRICE_ARENA_PHASE.LOBBY ? <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <section><h2 className="font-display text-xl font-bold">Lobby stakes</h2><p className="mt-1 text-sm text-white/40">Prices stay hidden until the game starts. Blockchain data itself remains public.</p><div className="mt-4 space-y-2">{entries.map(({ player, entry }) => <div key={player} className="flex items-center justify-between rounded-xl border border-white/5 bg-[#241b2f] px-4 py-3"><AddressLabel address={player} className="font-bold text-white/70" /><span className="font-mono">{Number(formatUnits(entry.stake, 6)).toFixed(2)} USDG · prediction hidden</span></div>)}{entries.length === 0 && <p className="py-8 text-sm text-white/35">Be the first player.</p>}</div></section>
          <section className="rounded-3xl border border-[#8B7CF7]/20 bg-[#241b2f] p-5"><h2 className="font-display text-xl font-bold">{walletEntry?.exists ? 'Update your entry' : 'Make your prediction'}</h2>{walletEntry?.exists && <p className="mt-2 text-sm text-white/50">Your current stake is {Number(formatUnits(walletEntry.stake, 6)).toFixed(2)} USDG. Leave price empty to keep it. Money cannot be withdrawn before settlement.</p>}<label className="mt-5 block"><span className="mb-1.5 block text-sm text-white/50">{walletEntry?.exists ? 'New price · optional' : `Predicted final price · ${quote}`}</span><input value={prediction} onChange={(event) => setPrediction(event.target.value)} inputMode="decimal" placeholder={walletEntry?.exists ? 'Keep current prediction' : '0.00'} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono outline-none focus:border-[#8B7CF7]" /></label><label className="mt-4 block"><span className="mb-1.5 block text-sm text-white/50">{walletEntry?.exists ? 'Add stake · optional' : 'Stake · 1–50 USDG'}</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder={walletEntry?.exists ? '0' : '1'} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono outline-none focus:border-[#8B7CF7]" /></label>{balanceQuery.data != null && <p className="mt-2 text-xs text-white/30">Balance: {Number(formatUnits(balanceQuery.data, 6)).toFixed(2)} USDG</p>}{error && <p className="mt-3 text-sm text-rose-400">{error}</p>}{!isConnected ? <div className="mt-5"><WalletOptionsList /></div> : chainId !== assetRaceChain.id ? <button onClick={() => switchChain({ chainId: assetRaceChain.id })} disabled={isSwitching} className="mt-5 w-full rounded-xl bg-[#F2A65A] py-3 font-bold text-[#3b2416]">Switch network</button> : <button onClick={submitEntry} disabled={!!txLabel} className="mt-5 w-full rounded-xl bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] py-3 font-bold disabled:opacity-40">{txLabel ?? (walletEntry?.exists ? 'Update entry' : 'Enter arena')}</button>}</section>
        </div> : arena.phase === PRICE_ARENA_PHASE.CANCELLED ? <div className="mt-6 rounded-3xl border border-amber-400/20 bg-amber-400/10 p-6"><h2 className="font-display text-2xl font-bold">Arena cancelled</h2><p className="mt-2 text-sm text-white/55">The round did not have enough players or could not obtain a valid deadline price. Every player gets a full refund.</p>{walletEntry?.exists && !walletEntry.settled && <button onClick={() => settle('refund')} disabled={!!txLabel} className="mt-5 rounded-xl bg-[#F2A65A] px-6 py-3 font-bold text-[#3b2416]">{txLabel ?? `Refund ${Number(formatUnits(walletEntry.stake, 6)).toFixed(2)} USDG`}</button>}{error && <p className="mt-3 text-sm text-rose-400">{error}</p>}</div> : <section className="mt-7"><div className="mb-4 flex items-end justify-between"><div><h2 className="font-display text-2xl font-bold">{arena.phase === PRICE_ARENA_PHASE.RUNNING ? 'Live leaderboard' : 'Final standings'}</h2><p className="mt-1 text-sm text-white/40">{arena.phase === PRICE_ARENA_PHASE.RUNNING ? 'Positions update with the display price; onchain settlement uses the last block before the deadline.' : `Closest ${arena.winnerCount} player${arena.winnerCount === 1 ? '' : 's'} won.`}</p></div>{arena.phase === PRICE_ARENA_PHASE.RUNNING && live.disconnected && <span className="text-xs font-bold text-amber-300">Live feed reconnecting…</span>}</div><ArenaBoard rows={entries} referencePrice={referencePrice} decimals={arena.priceDecimals} quote={quote} resolved={arena.phase === PRICE_ARENA_PHASE.RESOLVED} winnerCount={arena.winnerCount} />{arena.phase === PRICE_ARENA_PHASE.RESOLVED && walletEntry?.payout && walletEntry.payout > 0n && !walletEntry.settled ? <button onClick={() => settle('claim')} disabled={!!txLabel} className="mt-6 w-full rounded-xl bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] py-3 font-bold">{txLabel ?? `Claim ${Number(formatUnits(walletEntry.payout, 6)).toFixed(2)} USDG`}</button> : arena.phase === PRICE_ARENA_PHASE.RESOLVED && walletEntry?.settled ? <div className="mt-6 rounded-xl bg-white/5 py-3 text-center font-bold text-white/40">Already claimed</div> : null}{error && <p className="mt-3 text-sm text-rose-400">{error}</p>}</section>}
      </>}
    </div>
  )
}
