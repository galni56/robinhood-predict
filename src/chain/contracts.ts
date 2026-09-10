import type { Address } from 'viem'

// Addresses from the 2026-09-07 mainnet deploy (see ROADMAP.md and
// contracts/CLAUDE.md). Public contract addresses — not secrets.
// Override via Vite env vars if the contracts get redeployed.
export const PREDICTION_MARKET_ADDRESS = (import.meta.env.VITE_MARKET_ADDRESS ??
  '0xE476e7d1Fdc05406921AD9671566048393813fc5') as Address
export const BET_TOKEN_ADDRESS = (import.meta.env.VITE_BET_TOKEN_ADDRESS ??
  '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168') as Address

// Price feeds the owner has allowlisted so far (real Chainlink Robinhood
// feeds, each verified on-chain via decimals()/description()/latestRoundData()
// before allowlisting — see contracts/CLAUDE.md). `createMarket` is
// permissionless, but the feed it settles against must already be
// owner-allowlisted, and there's no on-chain way to enumerate allowlisted
// feeds (it's a mapping, not a list) — so the create-market UI can only
// offer tickers from this hardcoded list until more get allowlisted (see
// contracts/script/AllowlistFeed.s.sol).
export const ALLOWLISTED_FEEDS = [
  { ticker: 'TSLA', address: '0x4A1166a659A55625345e9515b32adECea5547C38' as Address },
  { ticker: 'NVDA', address: '0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15' as Address },
  { ticker: 'AAPL', address: '0x6B22A786bAa607d76728168703a39Ea9C99f2cD0' as Address },
  { ticker: 'MSFT', address: '0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E' as Address },
  { ticker: 'GOOGL', address: '0xF6f373a037c30F0e5010d854385cA89185AE638b' as Address },
  { ticker: 'AMZN', address: '0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C' as Address },
] as const

export function feedAddressForTicker(ticker: string): Address | undefined {
  return ALLOWLISTED_FEEDS.find((f) => f.ticker.toLowerCase() === ticker.toLowerCase())?.address
}

/** Block the contract was deployed at, if known — narrows `getLogs` scans
 * (leaderboard/activity feed) instead of scanning from genesis, which can
 * hit RPC range limits or rate limits on a public endpoint. Defaults to 0
 * (scan everything) when unset; set `VITE_DEPLOY_BLOCK` once the real
 * deployment block is known to speed this up. */
export const DEPLOY_BLOCK = BigInt(import.meta.env.VITE_DEPLOY_BLOCK ?? 0)

export const predictionMarketAbi = [
  {
    type: 'function',
    name: 'marketCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getMarket',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'priceFeed', type: 'address' },
          { name: 'targetPrice', type: 'int256' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
          { name: 'poolYes', type: 'uint256' },
          { name: 'poolNo', type: 'uint256' },
          { name: 'weightedPoolYes', type: 'uint256' },
          { name: 'weightedPoolNo', type: 'uint256' },
          { name: 'status', type: 'uint8' },
          { name: 'outcome', type: 'uint8' },
          { name: 'feeBp', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'stakes',
    stateMutability: 'view',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'user', type: 'address' },
      { name: 'side', type: 'uint8' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claimed',
    stateMutability: 'view',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'user', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'createMarket',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'priceFeed', type: 'address' },
      { name: 'targetPrice', type: 'int256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'initialYesAmount', type: 'uint256' },
      { name: 'initialNoAmount', type: 'uint256' },
    ],
    outputs: [{ name: 'id', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'bet',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'side', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'resolve',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'bettingWindowEnd',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'currentWeightBp',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'refund',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'side', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'BetPlaced',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'user', type: 'address', indexed: true },
      { name: 'side', type: 'uint8', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'weightBp', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Claimed',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'user', type: 'address', indexed: true },
      { name: 'payout', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MarketResolved',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'outcome', type: 'uint8', indexed: false },
      { name: 'settlePrice', type: 'int256', indexed: false },
    ],
  },
] as const

export const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const

export const aggregatorV3Abi = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'description',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'latestRoundData',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
] as const

export const MarketSideOnchain = { YES: 0, NO: 1 } as const
export const MarketStatusOnchain = { Open: 0, Resolved: 1, Cancelled: 2 } as const

// Mirrors the contract's constants of the same name — betting closes at
// createdAt + (deadline-createdAt) * BETTING_WINDOW_BP/10000, and a bet's
// share of the losing pool is weighted from MAX_WEIGHT_BP (right when
// betting opens) down to MIN_WEIGHT_BP (right as betting closes).
export const BETTING_WINDOW_BP = 6667n
export const MAX_WEIGHT_BP = 20_000n
export const MIN_WEIGHT_BP = 5_000n
export const BP_DENOMINATOR = 10_000n

/** Mirrors `PredictionMarket.bettingWindowEnd()` exactly (same truncating
 * integer division) — the unix-seconds timestamp betting closes at. */
export function bettingWindowEndSeconds(createdAt: bigint, deadline: bigint): bigint {
  return createdAt + ((deadline - createdAt) * BETTING_WINDOW_BP) / BP_DENOMINATOR
}

/** Mirrors `PredictionMarket.currentWeightBp()` exactly. Returns `null` once
 * betting has closed (the contract would revert "betting closed" instead). */
export function currentWeightBp(createdAt: bigint, deadline: bigint, nowSeconds: bigint): bigint | null {
  const windowEnd = bettingWindowEndSeconds(createdAt, deadline)
  if (nowSeconds >= windowEnd) return null
  const windowDuration = windowEnd - createdAt
  const elapsed = nowSeconds - createdAt
  const range = MAX_WEIGHT_BP - MIN_WEIGHT_BP
  const decay = (range * elapsed) / windowDuration
  return MAX_WEIGHT_BP - decay
}

/** Chainlink feed descriptions for Robinhood tokenized equities aren't
 * consistently formatted — some are "RHNVDA / USD", others "Robinhood AAPL /
 * USD" — strip either issuer prefix and the " / USD" quote suffix to get a
 * bare ticker. */
export function tickerFromFeedDescription(desc?: string): string | undefined {
  return desc?.replace(/^(Robinhood\s+|RH)/i, '').replace(/\s*\/\s*USD$/i, '')
}
