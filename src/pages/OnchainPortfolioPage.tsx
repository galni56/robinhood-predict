import { Link } from 'react-router-dom'
import { formatUnits } from 'viem'
import { useAccount, useConnect, useReadContract, useReadContracts } from 'wagmi'
import { SideBadge, StatusBadge } from '@/components/Pills'
import {
  BET_TOKEN_ADDRESS,
  MarketSideOnchain,
  MarketStatusOnchain,
  PREDICTION_MARKET_ADDRESS,
  erc20Abi,
  predictionMarketAbi,
} from '@/chain/contracts'
import type { MarketSide } from '@/types'

const BET_TOKEN_DECIMALS = 18

interface Position {
  id: bigint
  status: number
  outcome: number
  yesStake: bigint
  noStake: bigint
  hasClaimed: boolean
}

export function OnchainPortfolioPage() {
  const { address, isConnected } = useAccount()
  const { connectors, connect, isPending } = useConnect()

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
        <h1 className="text-xl font-semibold mb-1">Your on-chain portfolio</h1>
        <p className="text-white/40 text-sm mb-4">Connect a wallet to see your real stakes across every market.</p>
        <div className="space-y-2">
          {connectors.map((c) => (
            <button
              key={c.uid}
              onClick={() => connect({ connector: c })}
              disabled={isPending}
              className="w-full rounded-lg border border-white/10 px-4 py-2 text-left hover:border-[#C6FF3D]/50 transition-colors"
            >
              Connect {c.name}
            </button>
          ))}
          {connectors.length === 0 && (
            <p className="text-sm text-white/50">No wallet found (MetaMask/Phantom). Install the extension and reload the page.</p>
          )}
        </div>
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold mb-1">Your on-chain portfolio</h1>
        <p className="text-white/40 text-xs font-mono break-all">{address}</p>
      </div>

      <div className="rounded-lg border border-white/10 p-4">
        <div className="text-white/40 text-xs">Balance</div>
        <div className="text-2xl font-mono font-semibold">
          {balance.data != null ? `${formatUnits(balance.data, BET_TOKEN_DECIMALS)} mUSD` : '…'}
        </div>
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
          className="flex flex-wrap items-center gap-3 text-sm bg-[#12121c]/95 border border-white/10 rounded-lg px-3 py-2.5 hover:border-[#C6FF3D]/30 transition-colors"
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
