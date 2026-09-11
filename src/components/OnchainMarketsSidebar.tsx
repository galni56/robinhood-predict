import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatUnits, parseAbiItem } from 'viem'
import { usePublicClient } from 'wagmi'
import { AddressLabel } from '@/components/AddressLabel'
import { SideBadge } from '@/components/Pills'
import { robinhoodMainnet } from '@/chain/config'
import { DEPLOY_BLOCK, MarketSideOnchain, PREDICTION_MARKET_ADDRESS } from '@/chain/contracts'
import { formatUsd } from '@/lib/format'
import { shortHash } from '@/lib/hash'

const BET_PLACED_EVENT = parseAbiItem(
  'event BetPlaced(uint256 indexed id, address indexed user, uint8 side, uint256 amount, uint256 weightBp)',
)
const CLAIMED_EVENT = parseAbiItem('event Claimed(uint256 indexed id, address indexed user, uint256 payout)')

const BET_TOKEN_DECIMALS = 6 // USDG's real decimals

interface UserStats {
  address: `0x${string}`
  staked: bigint
  claimed: bigint
  bets: number
}

interface BetLog {
  id: bigint
  user: `0x${string}`
  side: number
  amount: bigint
  txHash: `0x${string}`
  blockNumber: bigint
}

/** Side-rail widgets for the real markets list, mirroring the mock app's
 * MarketsSidebar (top-5 mini leaderboard + recent-bets feed) but built from
 * the contract's own BetPlaced/Claimed events via getLogs -- same technique
 * as OnchainLeaderboardPage, just condensed. Real data, not simulated. */
export function OnchainMarketsSidebar() {
  const client = usePublicClient()
  const [stats, setStats] = useState<UserStats[] | null>(null)
  const [recent, setRecent] = useState<BetLog[] | null>(null)

  useEffect(() => {
    if (!client) return
    let cancelled = false

    async function run() {
      try {
        const [betLogs, claimLogs] = await Promise.all([
          client!.getLogs({ address: PREDICTION_MARKET_ADDRESS, event: BET_PLACED_EVENT, fromBlock: DEPLOY_BLOCK, toBlock: 'latest' }),
          client!.getLogs({ address: PREDICTION_MARKET_ADDRESS, event: CLAIMED_EVENT, fromBlock: DEPLOY_BLOCK, toBlock: 'latest' }),
        ])
        if (cancelled) return

        const byUser = new Map<string, UserStats>()
        function get(addr: `0x${string}`): UserStats {
          const key = addr.toLowerCase()
          let s = byUser.get(key)
          if (!s) {
            s = { address: addr, staked: 0n, claimed: 0n, bets: 0 }
            byUser.set(key, s)
          }
          return s
        }
        for (const log of betLogs) {
          if (!log.args.user || log.args.amount == null) continue
          const s = get(log.args.user)
          s.staked += log.args.amount
          s.bets += 1
        }
        for (const log of claimLogs) {
          if (!log.args.user || log.args.payout == null) continue
          get(log.args.user).claimed += log.args.payout
        }

        const ranked = Array.from(byUser.values())
          .sort((a, b) => {
            const na = a.claimed - a.staked
            const nb = b.claimed - b.staked
            return na === nb ? 0 : na > nb ? -1 : 1
          })
          .slice(0, 5)

        const recentBets: BetLog[] = betLogs
          .filter((log) => log.args.id != null && log.args.user && log.args.side != null && log.args.amount != null)
          .map((log) => ({
            id: log.args.id!,
            user: log.args.user!,
            side: log.args.side!,
            amount: log.args.amount!,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
          }))
          .sort((a, b) => (a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0))
          .slice(0, 8)

        setStats(ranked)
        setRecent(recentBets)
      } catch {
        if (!cancelled) {
          setStats([])
          setRecent([])
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [client])

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-[#12121c]/95 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold flex items-center gap-1.5">🏆 Leaderboard</h2>
          <Link to="/onchain/leaderboard" className="text-xs text-[#C6FF3D]/80 hover:text-[#d9ff80]">
            all →
          </Link>
        </div>
        <div className="space-y-1">
          {stats == null ? (
            <p className="text-white/30 text-xs text-center py-4">Scanning chain…</p>
          ) : stats.length === 0 ? (
            <p className="text-white/30 text-xs text-center py-4">No bets placed yet</p>
          ) : (
            stats.map((s, i) => {
              const net = s.claimed - s.staked
              return (
                <a
                  key={s.address}
                  href={`${robinhoodMainnet.blockExplorers.default.url}/address/${s.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors"
                >
                  <span className="w-4 text-white/30 text-xs font-mono text-center">{i + 1}</span>
                  <AddressLabel address={s.address} link={false} className="font-mono text-xs truncate flex-1" />
                  <span className={`font-mono text-xs ${net >= 0n ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {net >= 0n ? '+' : ''}
                    {formatUsd(Number(formatUnits(net, BET_TOKEN_DECIMALS)), 0)}
                  </span>
                </a>
              )
            })
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#12121c]/95 p-4">
        <h2 className="text-sm font-bold flex items-center gap-1.5 mb-3">⚡ Recent bets</h2>
        <div className="space-y-1.5">
          {recent == null ? (
            <p className="text-white/30 text-xs text-center py-4">Scanning chain…</p>
          ) : recent.length === 0 ? (
            <p className="text-white/30 text-xs text-center py-4">No bets yet</p>
          ) : (
            recent.map((log) => (
              <div key={log.txHash + log.id.toString()} className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-lg bg-black/20">
                <div className="flex items-center gap-1.5 min-w-0">
                  <SideBadge side={log.side === MarketSideOnchain.YES ? 'YES' : 'NO'} />
                  <AddressLabel address={log.user} className="font-mono text-white/60 hover:text-white truncate" />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-white/70">{formatUnits(log.amount, BET_TOKEN_DECIMALS)} USDG</span>
                  <a
                    href={`${robinhoodMainnet.blockExplorers.default.url}/tx/${log.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-white/40 hover:text-white"
                  >
                    {shortHash(log.txHash)}
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
