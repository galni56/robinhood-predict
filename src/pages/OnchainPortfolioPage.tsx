import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatEther, parseAbiItem, zeroAddress } from 'viem'
import { waitForTransactionReceipt } from 'wagmi/actions'
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWriteContract,
} from 'wagmi'
import { truncateAddress } from '@/components/AddressLabel'
import { SideBadge, StatusBadge } from '@/components/Pills'
import { SetNicknameModal } from '@/components/SetNicknameModal'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { PriceSourceLink } from '@/components/PriceSourceLink'
import { TokenLogo } from '@/components/TokenLogo'
import {
  DEPLOY_BLOCK,
  MarketSideOnchain,
  MarketStatusOnchain,
  PREDICTION_MARKET_ADDRESS,
  PREDICTION_MARKET_CONFIGURED,
  predictionMarketAbi,
} from '@/chain/contracts'
import { priceSourceUrlForSymbol } from '@/chain/assetRaceRegistry'
import { tickerForPredictionAssetId } from '@/chain/predictionMarketAssets'
import { robinhoodMainnet, wagmiConfig } from '@/chain/config'
import { ACTIVE_GAME_POLL_INTERVAL_MS, ACTIVE_GAME_REFRESH_OPTIONS } from '@/chain/gameSnapshots'
import { useNickname } from '@/chain/nicknames'
import { formatCompactEth, shortTxError } from '@/lib/format'
import type { MarketSide } from '@/types'
import {
  ASSET_RACE_ADDRESS,
  ASSET_RACE_STATUS,
  assetRaceAbi,
  assetRaceStatusLabel,
} from '@/chain/assetRaces'
import {
  PRICE_ARENA_ADDRESS,
  PRICE_ARENA_PHASE,
  arenaPhaseLabel,
  priceArenaAbi,
} from '@/chain/priceArena'
import {
  useWalletGamePositions,
  type WalletArenaPosition,
  type WalletRacePosition,
} from '@/chain/useWalletGamePositions'

const CLAIMED_EVENT = parseAbiItem('event Claimed(uint256 indexed id, address indexed user, uint256 payout)')

interface Position {
  id: bigint
  ticker?: string
  status: number
  outcome: number
  yesStake: bigint
  noStake: bigint
  hasClaimed: boolean
}

function StatCard({ label, value, valueClassName = '', title }: { label: string; value: string; valueClassName?: string; title?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/5 bg-[#241b2f] p-4">
      <div className="text-white/40 text-xs font-bold mb-1">{label}</div>
      <div title={title} className={`truncate text-xl font-mono font-semibold tabular-nums ${valueClassName}`}>{value}</div>
    </div>
  )
}

export function OnchainPortfolioPage() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const nickname = useNickname(address)
  const [nicknameModalOpen, setNicknameModalOpen] = useState(false)
  const [creatorTxLabel, setCreatorTxLabel] = useState<string | null>(null)
  const [creatorError, setCreatorError] = useState<string | null>(null)
  const [creatorSuccess, setCreatorSuccess] = useState<string | null>(null)
  const gamePositions = useWalletGamePositions(address)
  const onRightChain = chainId === robinhoodMainnet.id

  const marketCount = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'marketCount',
    query: { enabled: PREDICTION_MARKET_CONFIGURED },
  })
  const count = marketCount.data != null ? Number(marketCount.data) : 0
  const ids = Array.from({ length: count }, (_, i) => BigInt(i))

  const markets = useReadContracts({
    contracts: ids.map((id) => ({ address: PREDICTION_MARKET_ADDRESS, abi: predictionMarketAbi, functionName: 'getMarket', args: [id] }) as const),
    query: { enabled: count > 0 },
  })
  const stakesYes = useReadContracts({
    contracts: ids.map((id) => ({ address: PREDICTION_MARKET_ADDRESS, abi: predictionMarketAbi, functionName: 'stakes', args: [id, address ?? '0x0', MarketSideOnchain.YES] }) as const),
    query: { enabled: count > 0 && !!address },
  })
  const stakesNo = useReadContracts({
    contracts: ids.map((id) => ({ address: PREDICTION_MARKET_ADDRESS, abi: predictionMarketAbi, functionName: 'stakes', args: [id, address ?? '0x0', MarketSideOnchain.NO] }) as const),
    query: { enabled: count > 0 && !!address },
  })
  const claimedFlags = useReadContracts({
    contracts: ids.map((id) => ({ address: PREDICTION_MARKET_ADDRESS, abi: predictionMarketAbi, functionName: 'claimed', args: [id, address ?? '0x0'] }) as const),
    query: { enabled: count > 0 && !!address },
  })

  const marketCreatorEarnings = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'creatorEarnings',
    args: address ? [address] : undefined,
    chainId: robinhoodMainnet.id,
    query: {
      enabled: PREDICTION_MARKET_CONFIGURED && !!address,
      refetchInterval: ACTIVE_GAME_POLL_INTERVAL_MS,
      ...ACTIVE_GAME_REFRESH_OPTIONS,
    },
  })
  const raceCreatorEarnings = useReadContract({
    address: ASSET_RACE_ADDRESS ?? zeroAddress,
    abi: assetRaceAbi,
    functionName: 'creatorEarnings',
    args: address ? [address] : undefined,
    chainId: robinhoodMainnet.id,
    query: {
      enabled: !!ASSET_RACE_ADDRESS && !!address,
      refetchInterval: ACTIVE_GAME_POLL_INTERVAL_MS,
      ...ACTIVE_GAME_REFRESH_OPTIONS,
    },
  })
  const arenaCreatorEarnings = useReadContract({
    address: PRICE_ARENA_ADDRESS ?? zeroAddress,
    abi: priceArenaAbi,
    functionName: 'creatorEarnings',
    args: address ? [address] : undefined,
    chainId: robinhoodMainnet.id,
    query: {
      enabled: !!PRICE_ARENA_ADDRESS && !!address,
      refetchInterval: ACTIVE_GAME_POLL_INTERVAL_MS,
      ...ACTIVE_GAME_REFRESH_OPTIONS,
    },
  })

  const balance = useBalance({ address, query: { enabled: !!address } })

  // Total actually paid out to this wallet across every market it's ever
  // claimed from - read from the contract's own Claimed events (filtered
  // to this address), same technique as the leaderboard. Not derivable
  // from getMarket()/stakes() alone, since those don't track payout size.
  const client = usePublicClient()
  const [totalClaimed, setTotalClaimed] = useState<bigint | null>(null)
  useEffect(() => {
    if (!client || !address || !PREDICTION_MARKET_CONFIGURED) return
    let cancelled = false
    client
      .getLogs({
        address: PREDICTION_MARKET_ADDRESS,
        event: CLAIMED_EVENT,
        args: { user: address },
        fromBlock: DEPLOY_BLOCK,
        toBlock: 'latest',
      })
      .then((logs) => {
        if (cancelled) return
        setTotalClaimed(logs.reduce((sum, log) => sum + (log.args.payout ?? 0n), 0n))
      })
      .catch(() => {
        if (!cancelled) setTotalClaimed(0n)
      })
    return () => {
      cancelled = true
    }
  }, [client, address])

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-sm font-bold text-[#B3A7FA] mb-1">Your account</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-1">Your market portfolio</h1>
        <p className="text-white/40 text-sm mb-6">Connect a wallet to see your Prediction Market, Asset Race and Price Arena positions.</p>
        <WalletOptionsList />
      </div>
    )
  }

  const positions: Position[] = ids
    .map((id, i): Position | null => {
      const marketResult = markets.data?.[i]
      if (!marketResult || marketResult.status !== 'success') return null
      const m = marketResult.result
      const yesStake = stakesYes.data?.[i]?.status === 'success' ? stakesYes.data[i].result : 0n
      const noStake = stakesNo.data?.[i]?.status === 'success' ? stakesNo.data[i].result : 0n
      if (yesStake === 0n && noStake === 0n) return null
      const hasClaimed = claimedFlags.data?.[i]?.status === 'success' ? claimedFlags.data[i].result : false
      return { id, ticker: tickerForPredictionAssetId(m.assetId), status: m.status, outcome: m.outcome, yesStake, noStake, hasClaimed }
    })
    .filter((p): p is Position => p != null)

  const settledPositions = positions.filter((p) => p.status !== MarketStatusOnchain.Open)
  const predictionPositionsLoading = marketCount.isLoading
    || markets.isLoading
    || stakesYes.isLoading
    || stakesNo.isLoading
    || claimedFlags.isLoading
  const predictionPositionsError = marketCount.isError
    || markets.isError
    || stakesYes.isError
    || stakesNo.isError
    || claimedFlags.isError
  const decidedPositions = settledPositions.filter((p) => p.status === MarketStatusOnchain.Resolved)
  const wonPosition = (p: Position) => (outcome(p) === 'YES' && p.yesStake > 0n) || (outcome(p) === 'NO' && p.noStake > 0n)
  const wins = decidedPositions.filter(wonPosition)
  const winRate = decidedPositions.length > 0 ? (wins.length / decidedPositions.length) * 100 : null
  const totalWagered = positions.reduce((sum, p) => sum + p.yesStake + p.noStake, 0n)

  // Most recent decided markets first (higher id = created later), counting
  // consecutive same-outcome results back from there.
  const streakOrder = [...decidedPositions].sort((a, b) => (a.id > b.id ? -1 : a.id < b.id ? 1 : 0))
  let currentStreak = 0
  let streakWon: boolean | null = null
  for (const p of streakOrder) {
    const won = wonPosition(p)
    if (streakWon === null) {
      streakWon = won
      currentStreak = 1
    } else if (won === streakWon) {
      currentStreak++
    } else {
      break
    }
  }

  // Understates true P&L while bets are still open (principal counted as
  // "out" until a market resolves and is claimed) -- same caveat as the
  // leaderboard, and for the same reason: claimed is only ever known once
  // you've actually called claim().
  const netPnl = totalClaimed != null ? totalClaimed - totalWagered : null

  const totalCreatorEarnings = (marketCreatorEarnings.data ?? 0n)
    + (raceCreatorEarnings.data ?? 0n)
    + (arenaCreatorEarnings.data ?? 0n)
  const creatorBalancesPending = marketCreatorEarnings.isPending
    || (!!ASSET_RACE_ADDRESS && raceCreatorEarnings.isPending)
    || (!!PRICE_ARENA_ADDRESS && arenaCreatorEarnings.isPending)
  const creatorBalancesError = marketCreatorEarnings.isError
    || (!!ASSET_RACE_ADDRESS && raceCreatorEarnings.isError)
    || (!!PRICE_ARENA_ADDRESS && arenaCreatorEarnings.isError)
  const creatorRevenueConfigured = PREDICTION_MARKET_CONFIGURED && !!ASSET_RACE_ADDRESS && !!PRICE_ARENA_ADDRESS

  async function withdrawCreatorEarnings() {
    if (!address || !creatorRevenueConfigured || !onRightChain || totalCreatorEarnings === 0n) return
    setCreatorError(null)
    setCreatorSuccess(null)
    try {
      const withdrawals = [
        marketCreatorEarnings.data
          ? { label: 'Prediction Markets', address: PREDICTION_MARKET_ADDRESS, abi: predictionMarketAbi }
          : null,
        raceCreatorEarnings.data && ASSET_RACE_ADDRESS
          ? { label: 'Asset Races', address: ASSET_RACE_ADDRESS, abi: assetRaceAbi }
          : null,
        arenaCreatorEarnings.data && PRICE_ARENA_ADDRESS
          ? { label: 'Price Arena', address: PRICE_ARENA_ADDRESS, abi: priceArenaAbi }
          : null,
      ].filter((withdrawal): withdrawal is NonNullable<typeof withdrawal> => withdrawal != null)

      for (let index = 0; index < withdrawals.length; index += 1) {
        const withdrawal = withdrawals[index]
        setCreatorTxLabel(`Confirm ${index + 1}/${withdrawals.length}: ${withdrawal.label}…`)
        const hash = await writeContractAsync({
          address: withdrawal.address,
          abi: withdrawal.abi,
          functionName: 'withdrawCreatorFees',
        })
        setCreatorTxLabel(`Processing ${index + 1}/${withdrawals.length}: ${withdrawal.label}…`)
        const receipt = await waitForTransactionReceipt(wagmiConfig, {
          hash,
          chainId: robinhoodMainnet.id,
        })
        if (receipt.status !== 'success') throw new Error(`${withdrawal.label} withdrawal reverted.`)
      }
      await Promise.all([
        marketCreatorEarnings.refetch(),
        raceCreatorEarnings.refetch(),
        arenaCreatorEarnings.refetch(),
        balance.refetch(),
      ])
      setCreatorSuccess(
        withdrawals.length === 1
          ? 'Creator earnings were sent to your connected wallet.'
          : `Creator earnings were sent in ${withdrawals.length} transactions.`,
      )
    } catch (error) {
      setCreatorError(shortTxError(error, 'creator-revenue'))
    } finally {
      setCreatorTxLabel(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold text-[#B3A7FA] mb-1">Your account</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-1">
            {nickname.data ? nickname.data : 'Your market portfolio'}
          </h1>
          <p className="text-white/40 text-xs font-mono break-all">{address}</p>
        </div>
        <button
          onClick={() => setNicknameModalOpen(true)}
          className="shrink-0 text-xs font-bold px-3.5 py-1.5 rounded-full border border-white/10 text-white/60 hover:text-white hover:border-[#8B7CF7]/40 transition-colors"
        >
          {nickname.data ? 'Edit nickname' : 'Set nickname'}
        </button>
      </div>

      {nicknameModalOpen && <SetNicknameModal onClose={() => setNicknameModalOpen(false)} />}

      <Link
        to="/onchain/legacy"
        className="flex items-center justify-between gap-3 rounded-2xl border border-[#8B7CF7]/25 bg-[#8B7CF7]/10 px-4 py-3 text-sm transition-colors hover:border-[#8B7CF7]/50"
      >
        <span>
          <span className="block font-bold text-[#B3A7FA]">Legacy games</span>
          <span className="mt-0.5 block text-xs text-white/45">Claim or refund markets, races and arenas created before the V2 upgrade.</span>
        </span>
        <span className="shrink-0 font-bold text-[#B3A7FA]">Open →</span>
      </Link>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Native balance" value={balance.data != null ? formatCompactEth(balance.data.value) : '…'} title={balance.data != null ? `${formatEther(balance.data.value)} ETH` : undefined} />
        <StatCard label="Wallet" value={address ? (nickname.data || truncateAddress(address)) : '-'} />
        <StatCard label="Win rate" value={winRate != null ? `${winRate.toFixed(0)}%` : '-'} />
        <StatCard label="Current streak" value={streakWon == null ? '-' : `${currentStreak}${streakWon ? 'W' : 'L'}`} />
        <StatCard label="Markets wagered" value={formatCompactEth(totalWagered)} title={`${formatEther(totalWagered)} ETH`} />
        <StatCard label="Markets claimed" value={totalClaimed != null ? formatCompactEth(totalClaimed) : '…'} title={totalClaimed != null ? `${formatEther(totalClaimed)} ETH` : undefined} />
        <StatCard
          label="Markets net P&L"
          value={netPnl != null ? `${netPnl >= 0n ? '+' : ''}${formatCompactEth(netPnl)}` : '…'}
          title={netPnl != null ? `${netPnl >= 0n ? '+' : ''}${formatEther(netPnl)} ETH` : undefined}
          valueClassName={netPnl == null ? '' : netPnl >= 0n ? 'text-[#B3A7FA]' : 'text-rose-400'}
        />
        <StatCard label="All positions" value={String(positions.length + gamePositions.races.length + gamePositions.arenas.length)} />
      </div>

      <section className="relative overflow-hidden rounded-3xl border border-[#8B7CF7]/30 bg-gradient-to-br from-[#2b2140] via-[#241b32] to-[#21192b] p-5 sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[#8B7CF7]/15 blur-3xl" />
        <div className="relative grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)] sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#B3A7FA]">Creator revenue</p>
            <h2 className="mt-2 font-display text-2xl font-bold">Your market earnings</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/55">
              Your share from every Prediction Market, Asset Race and Price Arena you create is shown together here. Earnings stay available until you withdraw them.
            </p>
            <p className="mt-3 text-xs text-white/35">
              Small balances can keep accumulating, so you can withdraw later in a single transaction and avoid spending gas repeatedly.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 p-4 sm:p-5">
            <p className="text-xs font-bold text-white/45">Available to withdraw</p>
            <div
              className="mt-1 truncate font-mono text-2xl font-semibold tabular-nums text-[#C8BFFF]"
              title={`${formatEther(totalCreatorEarnings)} ETH`}
            >
              {!creatorRevenueConfigured || creatorBalancesError
                ? 'Unavailable'
                : creatorBalancesPending
                  ? 'Loading…'
                  : formatCompactEth(totalCreatorEarnings)}
            </div>

            {creatorRevenueConfigured && !creatorBalancesPending && !creatorBalancesError && (
              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-white/45">
                <span title={`${formatEther(marketCreatorEarnings.data ?? 0n)} ETH`}>Markets<br /><b className="text-white/65">{formatCompactEth(marketCreatorEarnings.data ?? 0n)}</b></span>
                <span title={`${formatEther(raceCreatorEarnings.data ?? 0n)} ETH`}>Races<br /><b className="text-white/65">{formatCompactEth(raceCreatorEarnings.data ?? 0n)}</b></span>
                <span title={`${formatEther(arenaCreatorEarnings.data ?? 0n)} ETH`}>Arena<br /><b className="text-white/65">{formatCompactEth(arenaCreatorEarnings.data ?? 0n)}</b></span>
              </div>
            )}

            {!creatorRevenueConfigured ? (
              <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                Creator withdrawals are not configured on this network.
              </p>
            ) : !onRightChain ? (
              <button
                type="button"
                onClick={() => switchChain({ chainId: robinhoodMainnet.id })}
                disabled={isSwitching}
                className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#8B7CF7] to-[#6E58E8] px-4 py-3 text-sm font-bold text-white shadow-[0_10px_30px_rgba(110,88,232,0.2)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSwitching ? 'Switching network…' : `Switch to ${robinhoodMainnet.name}`}
              </button>
            ) : (
              <button
                type="button"
                onClick={withdrawCreatorEarnings}
                disabled={creatorBalancesPending || !!creatorTxLabel || totalCreatorEarnings === 0n}
                className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#8B7CF7] to-[#6E58E8] px-4 py-3 text-sm font-bold text-white shadow-[0_10px_30px_rgba(110,88,232,0.2)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {creatorTxLabel ?? (totalCreatorEarnings > 0n ? 'Withdraw all to wallet' : 'Nothing to withdraw')}
              </button>
            )}

            {creatorError && <p className="mt-3 text-xs text-rose-300">{creatorError}</p>}
            {creatorSuccess && <p className="mt-3 text-xs text-emerald-300">{creatorSuccess}</p>}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-[#8B7CF7]/20 bg-[#1f1829] p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#B3A7FA]">Prediction Markets</p>
            <h2 className="mt-1 font-display text-xl font-bold">Your market positions ({positions.length})</h2>
          </div>
          <Link to="/onchain/archive?mode=markets" className="text-xs font-bold text-[#B3A7FA] hover:text-white">Market history →</Link>
        </div>
        <PositionList positions={positions} isLoading={predictionPositionsLoading} />
        {predictionPositionsError && (
          <p className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            Some Prediction Market positions could not be loaded. Refresh to retry.
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-[#F2A65A]/15 bg-[#1f1829] p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#F2A65A]">Asset Races</p>
            <h2 className="mt-1 font-display text-xl font-bold">Your race positions ({gamePositions.races.length})</h2>
          </div>
          <Link to="/onchain/archive?mode=races" className="text-xs font-bold text-[#F2A65A] hover:text-white">Race history →</Link>
        </div>
        <RacePositionList positions={gamePositions.races} isLoading={gamePositions.isLoading} />
      </section>

      <section className="rounded-3xl border border-[#7A9FF0]/15 bg-[#1f1829] p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#B7CEFF]">Price Arena</p>
            <h2 className="mt-1 font-display text-xl font-bold">Your arena positions ({gamePositions.arenas.length})</h2>
          </div>
          <Link to="/onchain/archive?mode=arenas" className="text-xs font-bold text-[#B7CEFF] hover:text-white">Arena history →</Link>
        </div>
        <ArenaPositionList positions={gamePositions.arenas} isLoading={gamePositions.isLoading} />
      </section>

      {gamePositions.error && (
        <p className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">
          Some Race or Arena positions could not be loaded. Refresh to retry.
        </p>
      )}
    </div>
  )
}

function RacePositionList({ positions, isLoading }: { positions: WalletRacePosition[]; isLoading: boolean }) {
  if (isLoading && positions.length === 0) return <p className="py-6 text-center text-sm text-white/35">Finding your race positions…</p>
  if (positions.length === 0) return <p className="py-6 text-center text-sm text-white/30">No race positions for this wallet.</p>
  const ordered = [...positions].sort((a, b) => {
    const actionable = (item: WalletRacePosition) => !item.position.settled && (
      item.race.status === ASSET_RACE_STATUS.CANCELLED
      || item.race.status === ASSET_RACE_STATUS.VOID
      || (item.race.status === ASSET_RACE_STATUS.RESOLVED && item.position.assetIndex === item.race.winningAssetIndex)
    )
    const priority = Number(actionable(b)) - Number(actionable(a))
    return priority || (a.race.id === b.race.id ? 0 : a.race.id > b.race.id ? -1 : 1)
  })
  return (
    <div className="space-y-2">
      {ordered.map(({ race, position }) => {
        const asset = race.assets[position.assetIndex]
        const won = race.status === ASSET_RACE_STATUS.RESOLVED && position.assetIndex === race.winningAssetIndex
        const refundable = race.status === ASSET_RACE_STATUS.CANCELLED || race.status === ASSET_RACE_STATUS.VOID
        const action = position.settled
          ? (refundable ? 'refunded' : 'claimed')
          : refundable ? 'refund available'
            : won ? 'won · claim now'
              : race.status === ASSET_RACE_STATUS.RESOLVED ? 'finished · no payout'
                : assetRaceStatusLabel(race.status)
        const actionable = !position.settled && (refundable || won)
        return (
          <Link key={race.id.toString()} to={`/onchain/races/${race.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-[#241b2f] px-4 py-3 transition-colors hover:border-[#F2A65A]/40">
            <TokenLogo ticker={asset?.symbol} className="h-8 w-8 rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{race.title || race.assets.map((item) => item.symbol).join(' vs ')}</span><span className="font-mono text-xs text-white/35">#{race.id.toString()}</span></div>
              <div className="mt-1 text-xs text-white/40">Backed {asset?.symbol ?? `asset ${position.assetIndex}`} · <span title={`${formatEther(position.stake)} ETH`} className="font-mono">{formatCompactEth(position.stake)} ETH</span></div>
            </div>
            <span className={`text-xs font-bold ${actionable ? 'text-[#F2A65A]' : 'text-white/45'}`}>{action} →</span>
          </Link>
        )
      })}
    </div>
  )
}

function ArenaPositionList({ positions, isLoading }: { positions: WalletArenaPosition[]; isLoading: boolean }) {
  if (isLoading && positions.length === 0) return <p className="py-6 text-center text-sm text-white/35">Finding your arena positions…</p>
  if (positions.length === 0) return <p className="py-6 text-center text-sm text-white/30">No arena positions for this wallet.</p>
  const ordered = [...positions].sort((a, b) => {
    const actionable = (item: WalletArenaPosition) => !item.entry.settled && (
      item.arena.phase === PRICE_ARENA_PHASE.CANCELLED
      || (item.arena.phase === PRICE_ARENA_PHASE.RESOLVED && item.entry.payout > 0n)
    )
    const priority = Number(actionable(b)) - Number(actionable(a))
    return priority || (a.arena.id === b.arena.id ? 0 : a.arena.id > b.arena.id ? -1 : 1)
  })
  return (
    <div className="space-y-2">
      {ordered.map(({ arena, entry }) => {
        const refundable = arena.phase === PRICE_ARENA_PHASE.CANCELLED
        const won = arena.phase === PRICE_ARENA_PHASE.RESOLVED && entry.payout > 0n
        const action = entry.settled
          ? (refundable ? 'refunded' : 'claimed')
          : refundable ? 'refund available'
            : won ? 'won · claim now'
              : arena.phase === PRICE_ARENA_PHASE.RESOLVED ? 'finished · no payout'
                : arenaPhaseLabel(arena.phase)
        const actionable = !entry.settled && (refundable || won)
        return (
          <Link key={arena.id.toString()} to={`/onchain/arenas/${arena.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-[#241b2f] px-4 py-3 transition-colors hover:border-[#7A9FF0]/45">
            <TokenLogo ticker={arena.asset?.symbol} className="h-8 w-8 rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className="truncate font-bold">{arena.title}</span><span className="font-mono text-xs text-white/35">#{arena.id.toString()}</span></div>
              <div className="mt-1 text-xs text-white/40">{arena.asset?.symbol ?? 'Arena'} · stake <span title={`${formatEther(entry.stake)} ETH`} className="font-mono">{formatCompactEth(entry.stake)} ETH</span>{entry.payout > 0n ? <> · payout <span title={`${formatEther(entry.payout)} ETH`} className="font-mono">{formatCompactEth(entry.payout)} ETH</span></> : null}</div>
            </div>
            <span className={`text-xs font-bold ${actionable ? 'text-[#B7CEFF]' : 'text-white/45'}`}>{action} →</span>
          </Link>
        )
      })}
    </div>
  )
}

function PositionList({ positions, isLoading = false }: { positions: Position[]; isLoading?: boolean }) {
  if (isLoading && positions.length === 0) return <p className="py-6 text-center text-sm text-white/35">Finding your market positions…</p>
  if (positions.length === 0) return <p className="py-6 text-center text-sm text-white/30">No market positions for this wallet.</p>
  const ordered = [...positions].sort((a, b) => {
    const actionable = (position: Position) => position.status === MarketStatusOnchain.Cancelled
      || (position.status === MarketStatusOnchain.Resolved && !position.hasClaimed && wonPositionForMarket(position))
    const priority = Number(actionable(b)) - Number(actionable(a))
    if (priority !== 0) return priority
    const openPriority = Number(b.status === MarketStatusOnchain.Open) - Number(a.status === MarketStatusOnchain.Open)
    return openPriority || (a.id === b.id ? 0 : a.id > b.id ? -1 : 1)
  })
  return (
    <div className="space-y-2">
      {ordered.map((p) => (
        <div
          key={p.id.toString()}
          className="flex flex-wrap items-center gap-3 text-sm bg-[#241b2f] border border-white/5 rounded-xl px-4 py-3 hover:border-[#8B7CF7]/40 transition-colors"
        >
          <Link to={`/onchain/${p.id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            {p.ticker && <TokenLogo ticker={p.ticker} className="h-7 w-7 rounded-lg" />}
            <span className="font-bold text-white/80">{p.ticker ?? `#${p.id.toString()}`}</span>
            <span className="font-mono text-xs text-white/35">#{p.id.toString()}</span>
            {p.yesStake > 0n && (
              <span className="flex items-center gap-1.5">
                <SideBadge side="YES" />
                <span title={`${formatEther(p.yesStake)} ETH`} className="whitespace-nowrap font-mono text-xs tabular-nums">{formatCompactEth(p.yesStake)}</span>
              </span>
            )}
            {p.noStake > 0n && (
              <span className="flex items-center gap-1.5">
                <SideBadge side="NO" />
                <span title={`${formatEther(p.noStake)} ETH`} className="whitespace-nowrap font-mono text-xs tabular-nums">{formatCompactEth(p.noStake)}</span>
              </span>
            )}
            <span className="ml-auto text-xs">
              {p.status === MarketStatusOnchain.Open ? (
                <StatusBadge status="pending" />
              ) : p.status === MarketStatusOnchain.Cancelled ? (
                <span className="text-white/40">cancelled - refundable</span>
              ) : p.hasClaimed ? (
                <span className="text-white/40">claimed</span>
              ) : (outcome(p) === 'YES' && p.yesStake > 0n) || (outcome(p) === 'NO' && p.noStake > 0n) ? (
                <span className="font-bold text-[#B3A7FA]">won - claim now</span>
              ) : (
                <span className="text-rose-400">lost</span>
              )}
            </span>
          </Link>
          <PriceSourceLink
            href={priceSourceUrlForSymbol(p.ticker)}
            symbol={p.ticker}
            tone="market"
            className="bg-[#8B7CF7]/10 px-2.5 py-1"
          />
        </div>
      ))}
    </div>
  )
}

function wonPositionForMarket(position: Position) {
  return (outcome(position) === 'YES' && position.yesStake > 0n)
    || (outcome(position) === 'NO' && position.noStake > 0n)
}

function outcome(p: Position): MarketSide {
  return p.outcome === MarketSideOnchain.YES ? 'YES' : 'NO'
}
