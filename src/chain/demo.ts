import type { BetLog } from '@/chain/betLogs'

/** Presentation-only overlay: realistic-looking pools and a bets feed,
 * deterministic per market id, generated purely client-side — nothing is
 * read from or written to the chain. On by default in `npm run dev`; in a
 * production build it stays OFF unless the page is opened with ?demo=1
 * (persisted to localStorage, cleared with ?demo=0). */
export function isDemoMode(): boolean {
  try {
    const href = window.location.href
    if (href.includes('demo=0')) {
      localStorage.removeItem('prophet_demo')
      return false
    }
    if (href.includes('demo=1')) {
      localStorage.setItem('prophet_demo', '1')
      return true
    }
    if (localStorage.getItem('prophet_demo') === '1') return true
  } catch {
    /* storage unavailable — fall through */
  }
  return import.meta.env.DEV
}

// mulberry32 — tiny deterministic PRNG so every reload shows the same
// numbers (stable across a whole presentation, no reshuffling mid-demo).
function prng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const USDG = (n: number) => BigInt(Math.round(n * 1e6)) // 6 decimals

export const DEMO_MARKET_IDS = Array.from({ length: 11 }, (_, i) => BigInt(i))

export function demoPools(id: bigint): { poolYes: bigint; poolNo: bigint } {
  const r = prng(Number(id) * 7919 + 17)
  const total = 60 + Math.floor(r() * 420) // 60–480 USDG per market
  const yesShare = 0.22 + r() * 0.56 // 22%–78% YES
  const yes = Math.round(total * yesShare) // whole dollars, so pool totals read clean
  return { poolYes: USDG(yes), poolNo: USDG(total - yes) }
}

function demoAddress(r: () => number): `0x${string}` {
  let s = '0x'
  for (let i = 0; i < 40; i++) s += Math.floor(r() * 16).toString(16)
  return s as `0x${string}`
}

function demoTxHash(r: () => number): `0x${string}` {
  let s = '0x'
  for (let i = 0; i < 64; i++) s += Math.floor(r() * 16).toString(16)
  return s as `0x${string}`
}

/** A fixed roster of recurring demo bettors — bets across markets land on
 * these same wallets, so leaderboard entries accumulate several bets each
 * instead of every address appearing exactly once. */
export const DEMO_USERS: `0x${string}`[] = (() => {
  const r = prng(424242)
  return Array.from({ length: 22 }, () => demoAddress(r))
})()

/** 3–7 bets per market, amounts 2–50 USDG (the real per-wallet cap), sides
 * roughly following that market's demoPools split, bettors drawn from the
 * DEMO_USERS roster. */
export function demoBetLogs(ids: bigint[]): BetLog[] {
  const out: BetLog[] = []
  for (const id of ids) {
    const r = prng(Number(id) * 104729 + 31)
    const { poolYes, poolNo } = demoPools(id)
    const yesShare = Number(poolYes) / Number(poolYes + poolNo)
    const betCount = 3 + Math.floor(r() * 5)
    for (let i = 0; i < betCount; i++) {
      out.push({
        id,
        user: DEMO_USERS[Math.floor(r() * DEMO_USERS.length)],
        side: r() < yesShare ? 0 : 1,
        amount: USDG(2 + Math.floor(r() * 49)),
        txHash: demoTxHash(r),
        blockNumber: BigInt(9_500_000 + Math.floor(r() * 400_000)),
      })
    }
  }
  return out
}

/** One shared leaderboard state for demo mode, used by BOTH the /onchain
 * sidebar widgets and the full leaderboard page so they always agree. The
 * leaderboard page evolves it (live ticks) and persists it here; anything
 * else reads it. BigInts serialized as strings. */
export interface DemoLeaderboardStat {
  address: `0x${string}`
  staked: bigint
  claimed: bigint
  bets: number
}

const DEMO_LB_KEY = 'prophet_demo_leaderboard_v2'

interface SavedStat {
  a: `0x${string}`
  s: string
  c: string
  b: number
}
interface SavedBet {
  i: string
  u: `0x${string}`
  sd: number
  am: string
  t: `0x${string}`
  bn: string
}

export function saveDemoLeaderboard(stats: DemoLeaderboardStat[], recent: BetLog[]) {
  try {
    localStorage.setItem(
      DEMO_LB_KEY,
      JSON.stringify({
        stats: stats.map((s): SavedStat => ({ a: s.address, s: s.staked.toString(), c: s.claimed.toString(), b: s.bets })),
        recent: recent.map(
          (r): SavedBet => ({ i: r.id.toString(), u: r.user, sd: r.side, am: r.amount.toString(), t: r.txHash, bn: r.blockNumber.toString() }),
        ),
      }),
    )
  } catch {
    /* storage unavailable — demo-only, ignore */
  }
}

export function loadDemoLeaderboard(): { stats: DemoLeaderboardStat[]; recent: BetLog[] } | null {
  try {
    const raw = localStorage.getItem(DEMO_LB_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as { stats: SavedStat[]; recent: SavedBet[] }
    return {
      stats: p.stats.map((x) => ({ address: x.a, staked: BigInt(x.s), claimed: BigInt(x.c), bets: x.b })),
      recent: p.recent.map((x) => ({ id: BigInt(x.i), user: x.u, side: x.sd, amount: BigInt(x.am), txHash: x.t, blockNumber: BigInt(x.bn) })),
    }
  } catch {
    return null
  }
}

/** Winnings for the demo bettors: base wins on roughly half the bets, then
 * a deterministic top-up so EVERY roster bettor nets positive — the
 * leaderboard is a winners' top-20, so the baseline must supply at least
 * that many positive nets. */
export function demoClaimLogs(ids: bigint[]): { user: `0x${string}`; payout: bigint }[] {
  const bets = demoBetLogs(ids)
  const claims = bets
    .filter((_, i) => i % 2 === 0)
    .map((b, i) => {
      const r = prng(Number(b.id) * 613 + i)
      return { user: b.user, payout: BigInt(Math.round(Number(b.amount) * (1.2 + r() * 1.8))) }
    })

  const stakedBy = new Map<string, bigint>()
  for (const b of bets) stakedBy.set(b.user, (stakedBy.get(b.user) ?? 0n) + b.amount)
  const claimedBy = new Map<string, bigint>()
  for (const c of claims) claimedBy.set(c.user, (claimedBy.get(c.user) ?? 0n) + c.payout)

  const r = prng(987654)
  for (const user of DEMO_USERS) {
    const staked = stakedBy.get(user)
    if (!staked) continue
    const net = (claimedBy.get(user) ?? 0n) - staked
    if (net <= 0n) claims.push({ user, payout: -net + USDG(2 + Math.floor(r() * 34)) })
  }
  return claims
}
