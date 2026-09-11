import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatUnits, parseAbiItem } from 'viem'
import { useAccount, usePublicClient, useReadContract, useReadContracts } from 'wagmi'
import { SideBadge, StatusBadge } from '@/components/Pills'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import {
  BET_TOKEN_ADDRESS,
  DEPLOY_BLOCK,
  MarketSideOnchain,
  MarketStatusOnchain,
  PREDICTION_MARKET_ADDRESS,
  erc20Abi,
  predictionMarketAbi,
} from '@/chain/contracts'
import { formatUsd } from '@/lib/format'
import type { MarketSide } from '@/types'

const BET_TOKEN_DECIMALS = 6 // USDG's real decimals (old testnet mock token was 18)

const CLAIMED_EVENT = parseAbiItem('event Claimed(uint256 indexed id, address indexed user, uint256 payout)')

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

interface Position {
  id: bigint
  status: number
  outcome: number
  yesStake: bigint
  noStake: bigint
  hasClaimed: boolean
}

function StatCard({ label, value, valueClassName = '' }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#12121c]/95 p-4">
      <div className="text-white/40 text-xs mb-1">{label}</div>
      <div className={`text-xl font-mono font-semibold ${valueClassName}`}>{value}</div>
    </div>
  )
}

export function OnchainPortfolioPage() {
  const { address, isConnected } = useAccount()

  const marketCount = useReadContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: predictionMarketAbi,
    functionName: 'marketCount',
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

  const balance = useReadContract({
    address: BET_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Total actually paid out to this wallet across every market it's ever
  // claimed from — read from the contract's own Claimed events (filtered
  // to this address), same technique as the leaderboard. Not derivable
  // from getMarket()/stakes() alone, since those don't track payout size.
  const client = usePublicClient()
  const [totalClaimed, setTotalClaimed] = useState<bigint | null>(null)
  useEffect(() => {
    if (!client || !address) return
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
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">Your on-chain portfolio</h1>
        <p className="text-white/40 text-sm mb-6">Connect a wallet to see your real stakes across every market.</p>
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
      return { id, status: m.status, outcome: m.outcome, yesStake, noStake, hasClaimed }
    })
    .filter((p): p is Position => p != null)

  const openPositions = positions.filter((p) => p.status === MarketStatusOnchain.Open)
  const settledPositions = positions.filter((p) => p.status !== MarketStatusOnchain.Open)
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">Your on-chain portfolio</h1>
        <p className="text-white/40 text-xs font-mono break-all">{address}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Balance" value={balance.data != null ? `$${formatUnits(balance.data, BET_TOKEN_DECIMALS)}` : '…'} />
        <StatCard label="Wallet" value={address ? truncateAddress(address) : '—'} />
        <StatCard label="Win rate" value={winRate != null ? `${winRate.toFixed(0)}%` : '—'} />
        <StatCard label="Current streak" value={streakWon == null ? '—' : `${currentStreak}${streakWon ? 'W' : 'L'}`} />
        <StatCard label="Total wagered" value={`$${formatUnits(totalWagered, BET_TOKEN_DECIMALS)}`} />
        <StatCard label="Total won" value={totalClaimed != null ? `$${formatUnits(totalClaimed, BET_TOKEN_DECIMALS)}` : '…'} />
        <StatCard
          label="Net P&L"
          value={netPnl != null ? `${netPnl >= 0n ? '+' : ''}${formatUsd(Number(formatUnits(netPnl, BET_TOKEN_DECIMALS)))}` : '…'}
          valueClassName={netPnl == null ? '' : netPnl >= 0n ? 'text-[#C6FF3D]' : 'text-rose-400'}
        />
        <StatCard label="Total bets" value={String(positions.length)} />
      </div>

      <div>
        <h2 className="font-medium mb-3">Open positions ({openPositions.length})</h2>
        <PositionList positions={openPositions} />
      </div>

      <div>
        <h2 className="font-medium mb-3">Settled ({settledPositions.length})</h2>
        <PositionList positions={settledPositions} />
      </div>
    </div>
  )
}

function PositionList({ positions }: { positions: Position[] }) {
  if (positions.length === 0) return <p className="text-white/30 text-sm text-center py-6">Nothing here yet.</p>
  return (
    <div className="space-y-2">
      {positions.map((p) => (
        <Link
          key={p.id.toString()}
          to={`/onchain/${p.id}`}
          className="flex flex-wrap items-center gap-3 text-sm bg-[#12121c]/95 border border-white/10 rounded-xl px-4 py-3 hover:border-[#C6FF3D]/30 hover:bg-[#181829]/95 transition-colors"
        >
          <span className="font-mono text-white/70">#{p.id.toString()}</span>
          {p.yesStake > 0n && (
            <span className="flex items-center gap-1.5">
              <SideBadge side="YES" />
              <span className="font-mono text-xs">{formatUnits(p.yesStake, BET_TOKEN_DECIMALS)}</span>
            </span>
          )}
          {p.noStake > 0n && (
            <span className="flex items-center gap-1.5">
              <SideBadge side="NO" />
              <span className="font-mono text-xs">{formatUnits(p.noStake, BET_TOKEN_DECIMALS)}</span>
            </span>
          )}
          <span className="ml-auto text-xs">
            {p.status === MarketStatusOnchain.Open ? (
              <StatusBadge status="pending" />
            ) : p.status === MarketStatusOnchain.Cancelled ? (
              <span className="text-white/40">cancelled — refundable</span>
            ) : p.hasClaimed ? (
              <span className="text-white/40">claimed</span>
            ) : (outcome(p) === 'YES' && p.yesStake > 0n) || (outcome(p) === 'NO' && p.noStake > 0n) ? (
              <span className="text-[#C6FF3D]">won — claim now</span>
            ) : (
              <span className="text-rose-400">lost</span>
            )}
          </span>
        </Link>
      ))}
    </div>
  )
}

function outcome(p: Position): MarketSide {
  return p.outcome === MarketSideOnchain.YES ? 'YES' : 'NO'
}
