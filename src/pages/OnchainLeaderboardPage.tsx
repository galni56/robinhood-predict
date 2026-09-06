import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatUnits, parseAbiItem } from 'viem'
import { usePublicClient } from 'wagmi'
import { SideBadge } from '@/components/Pills'
import { robinhoodTestnet } from '@/chain/config'
import { DEPLOY_BLOCK, MarketSideOnchain, PREDICTION_MARKET_ADDRESS } from '@/chain/contracts'
import { formatUsd } from '@/lib/format'
import { shortHash } from '@/lib/hash'

// viem's `getLogs` wants the specific ABI event item (not the full contract
// ABI + an event name) — these mirror `BetPlaced`/`Claimed` in
// PredictionMarket.sol exactly.
const BET_PLACED_EVENT = parseAbiItem(
  'event BetPlaced(uint256 indexed id, address indexed user, uint8 side, uint256 amount, uint256 weightBp)',
)
const CLAIMED_EVENT = parseAbiItem('event Claimed(uint256 indexed id, address indexed user, uint256 payout)')

const BET_TOKEN_DECIMALS = 18

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

/** Real leaderboard + activity feed, built by scanning the contract's own
 * `BetPlaced`/`Claimed` events via `getLogs` — no backend/indexer needed,
 * since the contract already emits everything needed to reconstruct this
 * client-side. Net figure is claimed-minus-staked across a user's whole
 * history, so it understates true P&L while bets are still open (principal
 * counted as "out" until settled) — self-corrects as more markets resolve. */
export function OnchainLeaderboardPage() {
  const client = usePublicClient()
  const [stats, setStats] = useState<UserStats[] | null>(null)
  const [recent, setRecent] = useState<BetLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!client) return
    let cancelled = false

    async function run() {
      try {
        const [betLogs, claimLogs] = await Promise.all([
          client!.getLogs({
            address: PREDICTION_MARKET_ADDRESS,
            event: BET_PLACED_EVENT,
            fromBlock: DEPLOY_BLOCK,
            toBlock: 'latest',
          }),
          client!.getLogs({
            address: PREDICTION_MARKET_ADDRESS,
            event: CLAIMED_EVENT,
            fromBlock: DEPLOY_BLOCK,
            toBlock: 'latest',
          }),
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
          const s = get(log.args.user)
          s.claimed += log.args.payout
        }

        const ranked = Array.from(byUser.values()).sort((a, b) => {
          const na = a.claimed - a.staked
          const nb = b.claimed - b.staked
          return na === nb ? 0 : na > nb ? -1 : 1
        })

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
          .sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : a.blockNumber < b.blockNumber ? 1 : 0))
          .slice(0, 15)

        setStats(ranked)
        setRecent(recentBets)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to read activity from the chain')
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [client])

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold mb-1">On-chain leaderboard</h1>
        <p className="text-white/40 text-sm">
          Built live from the contract's own <code className="text-[#C6FF3D]">BetPlaced</code>/
          <code className="text-[#C6FF3D]">Claimed</code> events — no backend, no indexer, just what's actually on
          the chain. Net is claimed minus staked across a wallet's whole history, so it's a lower bound while bets
          are still open.
        </p>
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      <div>
        <h2 className="font-medium mb-3">Ranked by net</h2>
        {stats == null ? (
          <p className="text-white/40 text-sm">Scanning chain history…</p>
        ) : stats.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-6">No bets placed yet.</p>
        ) : (
          <div className="space-y-1.5">
            {stats.slice(0, 20).map((s, i) => {
              const net = s.claimed - s.staked
              return (
                <div
                  key={s.address}
                  className="flex items-center gap-3 text-sm bg-[#12121c]/95 border border-white/10 rounded-lg px-3 py-2.5"
                >
                  <span className="w-5 text-white/30 text-center font-mono text-xs">{i + 1}</span>
                  <a
                    href={`${robinhoodTestnet.blockExplorers.default.url}/address/${s.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-white/70 hover:text-white truncate"
                  >
                    {s.address}
                  </a>
                  <span className="text-white/40 text-xs shrink-0">{s.bets} bets</span>
                  <span
                    className={`ml-auto font-mono text-xs shrink-0 ${net >= 0n ? 'text-[#C6FF3D]' : 'text-rose-400'}`}
                  >
                    {net >= 0n ? '+' : ''}
                    {formatUsd(Number(formatUnits(net, BET_TOKEN_DECIMALS)))}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="font-medium mb-3">Recent bets</h2>
        {recent == null ? (
          <p className="text-white/40 text-sm">Scanning chain history…</p>
        ) : recent.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-6">No bets placed yet.</p>
        ) : (
          <div className="space-y-1.5">
            {recent.map((log) => (
              <div
                key={log.txHash + log.id.toString()}
                className="flex items-center gap-3 text-sm bg-[#12121c]/95 border border-white/10 rounded-lg px-3 py-2.5"
              >
                <Link to={`/onchain/${log.id}`} className="font-mono text-xs text-white/70 hover:text-white">
                  #{log.id.toString()}
                </Link>
                <SideBadge side={log.side === MarketSideOnchain.YES ? 'YES' : 'NO'} />
                <span className="font-mono text-xs">{formatUnits(log.amount, BET_TOKEN_DECIMALS)} mUSD</span>
                <a
                  href={`${robinhoodTestnet.blockExplorers.default.url}/tx/${log.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto shrink-0 font-mono text-xs px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[#C6FF3D]/90 hover:bg-white/10 transition-colors"
                >
                  {shortHash(log.txHash)}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
