import { Link } from 'react-router-dom'
import { formatUnits } from 'viem'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { SideBadge, StatusBadge } from '@/components/Pills'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import {
  BET_TOKEN_ADDRESS,
  MarketSideOnchain,
  MarketStatusOnchain,
  PREDICTION_MARKET_ADDRESS,
  erc20Abi,
  predictionMarketAbi,
} from '@/chain/contracts'
import type { MarketSide } from '@/types'

const BET_TOKEN_DECIMALS = 6 // USDG's real decimals (old testnet mock token was 18)

interface Position {
  id: bigint
  status: number
  outcome: number
  yesStake: bigint
  noStake: bigint
  hasClaimed: boolean
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#12121c]/95 p-4">
      <div className="text-white/40 text-xs mb-1">{label}</div>
      <div className="text-xl font-mono font-semibold">{value}</div>
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
  const wins = decidedPositions.filter((p) => (outcome(p) === 'YES' && p.yesStake > 0n) || (outcome(p) === 'NO' && p.noStake > 0n))
  const winRate = decidedPositions.length > 0 ? (wins.length / decidedPositions.length) * 100 : null
  const totalWagered = positions.reduce((sum, p) => sum + p.yesStake + p.noStake, 0n)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">Your on-chain portfolio</h1>
        <p className="text-white/40 text-xs font-mono break-all">{address}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Balance" value={balance.data != null ? `$${formatUnits(balance.data, BET_TOKEN_DECIMALS)}` : '…'} />
        <StatCard label="Total wagered" value={`$${formatUnits(totalWagered, BET_TOKEN_DECIMALS)}`} />
        <StatCard label="Win rate" value={winRate != null ? `${winRate.toFixed(0)}%` : '—'} />
        <StatCard label="Positions" value={String(positions.length)} />
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
