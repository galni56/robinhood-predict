// ── Everything in this file describes MOCK data only. ────────────────────
// No field here is backed by a real market feed, a real chain, or real funds.

export interface Token {
  /** e.g. "xHOOD" — the tokenized-stock ticker as it appears on-chain */
  symbol: string
  /** e.g. "Robinhood Markets Inc." — underlying company (display only) */
  name: string
  /** deterministic mock contract address for this token on RHChain (testnet) */
  contractAddress: string
  /** starting mock price in USD, chosen so the "$100 by Friday" market is meaningful */
  startPrice: number
  /** tailwind color token used for the ticker chip */
  accent: string
}

export interface PricePoint {
  t: number // unix ms
  price: number
}

export type MarketSide = 'YES' | 'NO'

export interface PredictionMarket {
  /** unique per market — a symbol can have several markets over time (or none) */
  id: string
  symbol: string
  question: string
  target: number
  createdAt: number
  /** userId of the curator who created it, or "system" for demo-seeded markets */
  createdBy: string
  deadline: number // unix ms — when the market resolves
  resolved: boolean
  /** true when the deadline passed with a bet on only one side (or neither) —
   * mirrors the contract's one-sided-market cancellation. Mutually exclusive
   * with `resolved`; refunds are full, no fee. */
  cancelled: boolean
  outcome: MarketSide | null
  poolYes: number
  poolNo: number
}

export type TxType = 'FAUCET' | 'BET' | 'SETTLEMENT'

export interface ChainTx {
  hash: string
  from: string
  to: string
  type: TxType
  amount: number
  marketId?: string
  side?: MarketSide
  memo: string
  timestamp: number
  status: 'pending' | 'confirmed'
  blockNumber: number | null
}

export interface ChainBlock {
  number: number
  hash: string
  parentHash: string
  timestamp: number
  validator: string
  txHashes: string[]
}

export interface Position {
  id: string
  userId: string
  marketId: string
  side: MarketSide
  amount: number
  txHash: string
  createdAt: number
  settled: boolean
  payout: number | null
  /** true when `payout` is a full refund from a cancelled (one-sided) market,
   * not winnings — kept distinct so the UI doesn't show it as a "win". */
  refunded?: boolean
}

export type UserRole = 'admin' | 'user'

export interface User {
  id: string
  email: string
  displayName: string
  /** NOT a real hash — this is a mock demo, plaintext lives only in localStorage on the user's own machine */
  mockPassword: string
  walletAddress: string
  createdAt: number
  role: UserRole
  /** hex color for the initials-avatar placeholder */
  avatarColor: string
}

export interface UserStats {
  totalBets: number
  wins: number
  losses: number
  pending: number
  winRate: number // 0..1, over settled bets only
  totalWagered: number
  totalWon: number
  netProfit: number
  currentStreak: number // consecutive wins, most recent first; 0 if last settled bet lost
}
