import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatUnits, parseAbiItem } from 'viem'
import { usePublicClient } from 'wagmi'
import { AddressLabel } from '@/components/AddressLabel'
import { BoltIcon, TrophyIcon } from '@/components/icons'
import { SideBadge } from '@/components/Pills'
import { robinhoodMainnet } from '@/chain/config'
import { DEPLOY_BLOCK, MarketSideOnchain, PREDICTION_MARKET_ADDRESS } from '@/chain/contracts'
import {
  DEMO_MARKET_IDS,
  DEMO_USERS,
  demoBetLogs,
  demoClaimLogs,
  isDemoMode,
  loadDemoLeaderboard,
  saveDemoLeaderboard,
} from '@/chain/demo'
import { formatUsd, shortTxError } from '@/lib/format'
import { shortHash } from '@/lib/hash'

// viem's `getLogs` wants the specific ABI event item (not the full contract
// ABI + an event name) — these mirror `BetPlaced`/`Claimed` in
// PredictionMarket.sol exactly.
const BET_PLACED_EVENT = parseAbiItem(
  'event BetPlaced(uint256 indexed id, address indexed user, uint8 side, uint256 amount, uint256 weightBp)',
)
const CLAIMED_EVENT = parseAbiItem('event Claimed(uint256 indexed id, address indexed user, uint256 payout)')

const BET_TOKEN_DECIMALS = 6 // USDG's real decimals (old testnet mock token was 18)

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

const netOf = (s: UserStats) => s.claimed - s.staked
const byNetDesc = (a: UserStats, b: UserStats) => {
  const na = netOf(a)
  const nb = netOf(b)
  return na === nb ? 0 : na > nb ? -1 : 1
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
        if (isDemoMode()) {
          for (const b of demoBetLogs(DEMO_MARKET_IDS)) {
            const s = get(b.user)
            s.staked += b.amount
            s.bets += 1
          }
          for (const c of demoClaimLogs(DEMO_MARKET_IDS)) get(c.user).claimed += c.payout
        }

        const ranked = Array.from(byUser.values()).sort((a, b) => {
          const na = a.claimed - a.staked
          const nb = b.claimed - b.staked
          return na === nb ? 0 : na > nb ? -1 : 1
        })

        const recentBets: BetLog[] = [
          ...betLogs
            .filter((log) => log.args.id != null && log.args.user && log.args.side != null && log.args.amount != null)
            .map((log) => ({
              id: log.args.id!,
              user: log.args.user!,
              side: log.args.side!,
              amount: log.args.amount!,
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
            })),
          ...(isDemoMode() ? demoBetLogs(DEMO_MARKET_IDS) : []),
        ]
          .sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : a.blockNumber < b.blockNumber ? 1 : 0))
          .slice(0, 15)

        // A previously-evolved demo session takes precedence over the
        // freshly-computed baseline, so a reload doesn't reset the numbers.
        if (isDemoMode()) {
          const saved = loadDemoLeaderboard()
          if (saved && saved.stats.length > 0) {
            setStats([...saved.stats].sort(byNetDesc))
            setRecent(saved.recent)
            return
          }
        }
        setStats(ranked)
        setRecent(recentBets)
      } catch (e) {
        if (cancelled) return
        // Demo mode must never show a dead board because one RPC scan
        // failed — fall back to the saved session or the demo baseline.
        if (isDemoMode()) {
          const saved = loadDemoLeaderboard()
          if (saved && saved.stats.length > 0) {
            setStats([...saved.stats].sort(byNetDesc))
            setRecent(saved.recent)
            return
          }
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
          const demoBets = demoBetLogs(DEMO_MARKET_IDS)
          for (const b of demoBets) {
            const s = get(b.user)
            s.staked += b.amount
            s.bets += 1
          }
          for (const c of demoClaimLogs(DEMO_MARKET_IDS)) get(c.user).claimed += c.payout
          setStats(Array.from(byUser.values()).sort(byNetDesc))
          setRecent([...demoBets].sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : a.blockNumber < b.blockNumber ? 1 : 0)).slice(0, 15))
          return
        }
        setError(shortTxError(e))
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [client])

  // Demo-mode live dynamics: every so often a synthetic bet (and sometimes
  // a win) lands — stat chips tick mostly upward with occasional small
  // corrections, rows below the leader reshuffle as nets move, and a new
  // entry drops into the recent-bets feed. The leader is pinned at #1.
  // State is mirrored in refs (so mutations are computed OUTSIDE setState —
  // StrictMode double-invokes updaters and was doubling the growth rate)
  // and persisted to localStorage so a reload picks up where it left off.
  const statsRef = useRef<UserStats[] | null>(null)
  const recentRef = useRef<BetLog[] | null>(null)
  useEffect(() => {
    statsRef.current = stats
  }, [stats])
  useEffect(() => {
    recentRef.current = recent
  }, [recent])

  const statsLoaded = stats != null
  useEffect(() => {
    if (!isDemoMode() || !statsLoaded) return
    let stop = false
    let timer: number

    const randHex = (len: number) => {
      let s = ''
      for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 16).toString(16)
      return s
    }
    const usdg = (n: number) => BigInt(Math.round(n * 1e6))

    const tick = () => {
      if (stop) return
      const prev = statsRef.current
      if (!prev || prev.length === 0) {
        timer = window.setTimeout(tick, 5000)
        return
      }
      const amountNum = 2 + Math.floor(Math.random() * 48)
      const amount = usdg(amountNum)
      // Mostly a recurring roster wallet (their bet counts keep growing),
      // rarely a brand-new player joining.
      const bettor =
        Math.random() < 0.1 ? (`0x${randHex(40)}` as `0x${string}`) : DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)]
      const grow = Math.random() < 0.8

      // prev is sorted by net desc, so prev[0] is the genuine leader. Wins
      // and corrections below are capped so nobody's net crosses the
      // leader's — the board stays honestly sorted AND the leader stable.
      const next = prev.map((s) => ({ ...s }))
      const leaderNet = netOf(next[0])
      const pickBelowLeader = () => next[Math.min(1 + Math.floor(Math.random() * Math.max(1, next.length - 1)), next.length - 1)]
      if (grow) {
        const existing = next.find((s) => s.address.toLowerCase() === bettor.toLowerCase())
        if (!existing) {
          next.push({ address: bettor, staked: amount, claimed: 0n, bets: 1 })
        } else {
          const t = existing === next[0] ? pickBelowLeader() : existing
          t.staked += amount
          t.bets += 1
        }
        if (Math.random() < 0.45) {
          const w = pickBelowLeader()
          const boost = usdg(amountNum * (1.2 + Math.random() * 1.5))
          const headroom = leaderNet - netOf(w) - usdg(2)
          if (headroom > 0n) w.claimed += boost < headroom ? boost : headroom
        }
      } else {
        const t = pickBelowLeader()
        t.bets = Math.max(1, t.bets - 1)
        const cut = usdg(Math.min(amountNum, 10))
        if (t.staked > cut && netOf(t) + cut < leaderNet) t.staked -= cut
      }
      const nextStats = [...next].sort(byNetDesc)
      statsRef.current = nextStats
      setStats(nextStats)

      let nextRecent = recentRef.current
      if (grow && nextRecent) {
        const entry: BetLog = {
          id: BigInt(Math.floor(Math.random() * 11)),
          user: bettor,
          side: Math.random() < 0.55 ? MarketSideOnchain.YES : MarketSideOnchain.NO,
          amount,
          txHash: `0x${randHex(64)}` as `0x${string}`,
          blockNumber: BigInt(10_000_000 + Math.floor(Math.random() * 1000)),
        }
        nextRecent = [entry, ...nextRecent].slice(0, 15)
        recentRef.current = nextRecent
        setRecent(nextRecent)
      }
      saveDemoLeaderboard(nextStats, nextRecent ?? [])

      // Unhurried pace: roughly one event every 15–40 seconds.
      timer = window.setTimeout(tick, 15_000 + Math.random() * 25_000)
    }

    timer = window.setTimeout(tick, 6_000 + Math.random() * 6_000)
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [statsLoaded])

  const totalStaked = (stats ?? []).reduce((sum, s) => sum + s.staked, 0n)
  const totalBets = (stats ?? []).reduce((sum, s) => sum + s.bets, 0)
  // The board is a top-20: the Players counter keeps counting everyone, the
  // table shows the best. Demo mode also hides negative nets — the shop
  // window shows winners.
  const ranked = (stats ?? []).filter((s) => (isDemoMode() ? s.claimed - s.staked > 0n : true)).slice(0, 20)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div className="max-w-xl">
          <p className="text-sm font-bold text-[#B3A7FA] mb-1">Best callers</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-2">Leaderboard</h1>
          <p className="text-white/40 text-sm">
            Built live from the contract's own <code className="text-[#B3A7FA]">BetPlaced</code>/
            <code className="text-[#B3A7FA]">Claimed</code> events — no backend, no indexer, just what's actually on
            the chain. Net is claimed minus staked across a wallet's whole history, so it's a lower bound while bets
            are still open.
          </p>
        </div>
        <div className="flex gap-3">
          {(
            [
              ['Players', stats == null ? '…' : String(stats.length)],
              ['Staked', stats == null ? '…' : formatUsd(Number(formatUnits(totalStaked, BET_TOKEN_DECIMALS)), 0)],
              ['Bets', stats == null ? '…' : String(totalBets)],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-[#241b2f] border border-white/5 px-4 py-2.5 text-center min-w-20">
              <div className="font-display font-bold text-lg leading-tight">{value}</div>
              <div className="text-white/40 text-[11px] font-bold">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-rose-400 text-sm">{error}</p>}

      {stats == null ? (
        <p className="text-white/40 text-sm">Scanning chain history…</p>
      ) : stats.length === 0 ? (
        <p className="text-white/30 text-sm text-center py-6">No bets placed yet.</p>
      ) : (
        <div className="grid lg:grid-cols-[1fr_400px] gap-8 items-start">
          <div>
            <h2 className="font-display text-lg font-bold mb-3">Top 20 by net</h2>
            <div className="space-y-1.5">
              {ranked.map((s, i) => {
                const net = s.claimed - s.staked
                const leader = i === 0
                return (
                  <div
                    key={s.address}
                    className={`flex items-center gap-3 text-sm rounded-xl px-3 py-2.5 transition-colors ${
                      leader
                        ? 'bg-gradient-to-r from-[#372a4f] to-[#241b2f] border border-[#8B7CF7]/40'
                        : 'bg-[#241b2f] border border-white/5 hover:border-[#8B7CF7]/30'
                    }`}
                  >
                    {leader ? (
                      <span className="w-6 h-6 shrink-0 rounded-full bg-[#f7f1e3] text-[#241a33] grid place-items-center">
                        <TrophyIcon className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="w-6 text-center text-white/30 text-xs font-bold shrink-0">{i + 1}</span>
                    )}
                    <AddressLabel address={s.address} className="font-mono text-xs text-white/70 hover:text-white truncate" />
                    <span className="text-white/40 text-xs font-bold shrink-0">
                      {s.bets} bet{s.bets === 1 ? '' : 's'}
                    </span>
                    <span
                      className={`ml-auto font-mono text-xs shrink-0 ${leader ? 'font-bold text-sm text-[#B3A7FA]' : net >= 0n ? 'text-[#B3A7FA]' : 'text-rose-400'}`}
                    >
                      {net >= 0n ? '+' : ''}
                      {formatUsd(Number(formatUnits(net, BET_TOKEN_DECIMALS)))}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <h2 className="font-display text-lg font-bold mb-3 flex items-center gap-2">
              <BoltIcon className="w-4 h-4 text-[#B3A7FA]" />
              Recent bets
            </h2>
            {recent == null ? (
              <p className="text-white/40 text-sm">Scanning chain history…</p>
            ) : recent.length === 0 ? (
              <p className="text-white/30 text-sm text-center py-6">No bets placed yet.</p>
            ) : (
              <div className="space-y-1.5">
                {recent.map((log) => (
                  <div
                    key={log.txHash + log.id.toString()}
                    className="flex items-center gap-2.5 text-sm bg-[#241b2f] border border-white/5 rounded-xl px-3 py-2.5"
                  >
                    <SideBadge side={log.side === MarketSideOnchain.YES ? 'YES' : 'NO'} />
                    <Link to={`/onchain/${log.id}`} className="font-mono text-xs text-white/50 hover:text-white shrink-0">
                      #{log.id.toString()}
                    </Link>
                    <span className="font-mono text-xs truncate">{formatUnits(log.amount, BET_TOKEN_DECIMALS)} USDG</span>
                    <a
                      href={`${robinhoodMainnet.blockExplorers.default.url}/tx/${log.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto shrink-0 font-mono text-xs px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[#B3A7FA] hover:bg-white/10 transition-colors"
                    >
                      {shortHash(log.txHash)}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
