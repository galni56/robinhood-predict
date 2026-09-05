import type { Address } from 'viem'

// Addresses from the 2026-09-05 testnet deploy (see ROADMAP.md §2 and
// contracts/CLAUDE.md). Public testnet contract addresses — not secrets.
// Override via Vite env vars if the contracts get redeployed.
// PREDICTION_MARKET_ADDRESS was redeployed same-day to pick up the
// liquidity mechanics (one-sided cancel, house seed, protocol fee) —
// BET_TOKEN_ADDRESS is unchanged and reused as-is.
export const PREDICTION_MARKET_ADDRESS = (import.meta.env.VITE_MARKET_ADDRESS ??
  '0x70E4630054F8EA42Efb32a77b1d672f5bCF0203f') as Address
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
export const DEFAULT_PRICE_FEED_LABEL = 'TSLA (тестовый фид)'

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
          { name: 'deadline', type: 'uint256' },
          { name: 'poolYes', type: 'uint256' },
          { name: 'poolNo', type: 'uint256' },
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
    name: 'refund',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'side', type: 'uint8' },
    ],
    outputs: [],
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
