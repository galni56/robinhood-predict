import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatUnits, parseAbiItem } from 'viem'
import { usePublicClient } from 'wagmi'
import { AddressLabel } from '@/components/AddressLabel'
import { BoltIcon, TrophyIcon } from '@/components/icons'
import { SideBadge } from '@/components/Pills'
import { robinhoodMainnet } from '@/chain/config'
import { useBetLogs } from '@/chain/betLogs'
import { DEMO_MARKET_IDS, demoBetLogs, demoClaimLogs, isDemoMode, loadDemoLeaderboard } from '@/chain/demo'
import { DEPLOY_BLOCK, MarketSideOnchain, PREDICTION_MARKET_ADDRESS } from '@/chain/contracts'
import { formatUsd } from '@/lib/format'
import { shortHash } from '@/lib/hash'

const CLAIMED_EVENT = parseAbiItem('event Claimed(uint256 indexed id, address indexed user, uint256 payout)')

const BET_TOKEN_DECIMALS = 6 // USDG's real decimals

interface UserStats {
  address: `0x${string}`
  staked: bigint
  claimed: bigint
  bets: number
}

/** Side-rail widgets for the real markets list, mirroring the mock app's
 * MarketsSidebar (top-5 mini leaderboard + recent-bets feed) but built from
 * the contract's own BetPlaced/Claimed events via getLogs -- same technique
 * as OnchainLeaderboardPage, just condensed. Real data, not simulated. */
export function OnchainMarketsSidebar() {
  const client = usePublicClient()
  const betLogs = useBetLogs()
  const [stats, setStats] = useState<UserStats[] | null>(null)

  useEffect(() => {
    // Demo mode: the leaderboard page owns and evolves this state (see
    // saveDemoLeaderboard) — read the same snapshot so both widgets and the
    // full page always agree, and don't depend on the RPC being up.
    if (isDemoMode()) {
      const byNetDesc = (a: UserStats, b: UserStats) => {
        const na = a.claimed - a.staked
        const nb = b.claimed - b.staked
        return na === nb ? 0 : na > nb ? -1 : 1
      }
      const saved = loadDemoLeaderboard()
      let all: UserStats[]
      if (saved && saved.stats.length > 0) {
        all = saved.stats
      } else {
        const byUser = new Map<string, UserStats>()
        const get = (addr: `0x${string}`): UserStats => {
          const key = addr.toLowerCase()
          let s = byUser.get(key)
          if (!s) {
            s = { address: addr, staked: 0n, claimed: 0n, bets: 0 }
            byUser.set(key, s)
          }
          return s
        }
        for (const b of demoBetLogs(DEMO_MARKET_IDS)) {
          const s = get(b.user)
          s.staked += b.amount
          s.bets += 1
        }
        for (const c of demoClaimLogs(DEMO_MARKET_IDS)) get(c.user).claimed += c.payout
        all = Array.from(byUser.values())
      }
      setStats([...all].filter((s) => s.claimed - s.staked > 0n).sort(byNetDesc).slice(0, 5))
      return
    }

    if (!client || !betLogs.data) return
    let cancelled = false

    async function run() {
      try {
        const claimLogs = await client!.getLogs({ address: PREDICTION_MARKET_ADDRESS, event: CLAIMED_EVENT, fromBlock: DEPLOY_BLOCK, toBlock: 'latest' })
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
        for (const log of betLogs.data!) {
          const s = get(log.user)
          s.staked += log.amount
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

        setStats(ranked)
      } catch {
        if (!cancelled) setStats([])
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [client, betLogs.data])

  // Demo mode shows the same feed (and order) as the leaderboard page;
  // otherwise the biggest real bets.
  const demoSaved = isDemoMode() ? loadDemoLeaderboard() : null
  const recent =
    demoSaved && demoSaved.recent.length > 0
      ? demoSaved.recent.slice(0, 8)
      : betLogs.data == null
        ? null
        : [...betLogs.data].sort((a, b) => (a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0)).slice(0, 8)

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/5 bg-[#241b2f] p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-sm font-bold flex items-center gap-2">
            <TrophyIcon className="w-4 h-4 text-[#F2A65A]" />
            Leaderboard
          </h2>
          <Link to="/onchain/leaderboard" className="text-xs font-bold text-[#B3A7FA] hover:text-white">
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
                  <span className={`font-mono text-xs ${net >= 0n ? 'text-[#B3A7FA]' : 'text-rose-400'}`}>
                    {net >= 0n ? '+' : ''}
                    {formatUsd(Number(formatUnits(net, BET_TOKEN_DECIMALS)), 0)}
                  </span>
                </a>
              )
            })
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-white/5 bg-[#241b2f] p-4">
        <h2 className="font-display text-sm font-bold flex items-center gap-2 mb-3">
          <BoltIcon className="w-4 h-4 text-[#B3A7FA]" />
          Recent bets
        </h2>
        <div className="space-y-1.5">
          {recent == null ? (
            <p className="text-white/30 text-xs text-center py-4">Scanning chain…</p>
          ) : recent.length === 0 ? (
            <p className="text-white/30 text-xs text-center py-4">No bets yet</p>
          ) : (
            recent.map((log) => (
              <div key={log.txHash + log.id.toString()} className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-lg bg-white/5">
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
