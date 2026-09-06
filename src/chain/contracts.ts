import type { Address } from 'viem'

// Addresses from the 2026-09-05 testnet deploy (see ROADMAP.md §2 and
// contracts/CLAUDE.md). Public testnet contract addresses — not secrets.
// Override via Vite env vars if the contracts get redeployed.
// PREDICTION_MARKET_ADDRESS has been redeployed twice as the contract grew
// (liquidity mechanics 2026-09-05, time-weighted early-bet mechanic
// 2026-09-06) — BET_TOKEN_ADDRESS is unchanged and reused as-is throughout.
export const PREDICTION_MARKET_ADDRESS = (import.meta.env.VITE_MARKET_ADDRESS ??
  '0xE1BA3CBD9D6e5B88af2a3d283D11d7c88e4eC4a7') as Address
export const BET_TOKEN_ADDRESS = (import.meta.env.VITE_BET_TOKEN_ADDRESS ??
  '0xBDc0F8045Baa2377F11A03d3c867E81dB263A93A') as Address

// The only price feed the owner has allowlisted on testnet so far (mock
// TSLA feed — see contracts/CLAUDE.md). `createMarket` is permissionless,
// but the feed it settles against must already be owner-allowlisted, and
// there's no on-chain way to enumerate allowlisted feeds (it's a mapping,
// not a list) — so the create-market UI offers this one until more feeds
// get allowlisted.
export const DEFAULT_PRICE_FEED_ADDRESS = (import.meta.env.VITE_PRICE_FEED_ADDRESS ??
  '0x3d8cC74a198ad948D77c65d88Ed24acFeE77Cd67') as Address
export const DEFAULT_PRICE_FEED_LABEL = 'TSLA (test feed)'

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
