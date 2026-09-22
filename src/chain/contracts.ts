import type { Address } from 'viem'

// PredictionMarket redeployed 2026-09-10 to remove the flat $500 target-price
// cap and make the anti-griefing guardrails (min duration, target-price
// deviation band, max stake per side) actually live on-chain — see
// ROADMAP.md and contracts/CLAUDE.md. Public contract addresses — not
// secrets. Override via Vite env vars if the contracts get redeployed again.
export const PREDICTION_MARKET_ADDRESS = (import.meta.env.VITE_MARKET_ADDRESS ??
  '0xd95ed19edBCd330498CADe7BA8569ac940A4182f') as Address
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
  { ticker: 'AMD', address: '0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72' as Address },
  { ticker: 'ASML', address: '0xB4106147E8cce40b7d46124090d373A71b70f87D' as Address },
  { ticker: 'BABA', address: '0x62Cc8F9b5f56a33c9C8A60c8B92779f523c4E984' as Address },
  { ticker: 'CLSK', address: '0x810c12D3a554Bc47fd39597Fe3b3AAC4941F50eF' as Address },
  { ticker: 'COIN', address: '0xA3a468A452940B7D6b69991207B508c609a98Ef2' as Address },
  { ticker: 'CRCL', address: '0x6652eDf64bA3731C4F2D3ce821A0Fb1f1f6b482a' as Address },
  { ticker: 'MSFT', address: '0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E' as Address },
  { ticker: 'GOOGL', address: '0xF6f373a037c30F0e5010d854385cA89185AE638b' as Address },
  { ticker: 'AMZN', address: '0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C' as Address },
  { ticker: 'CRWV', address: '0xe1b3aABCAFAd1c94708dc1367dcfF8Aa4407487C' as Address },
  { ticker: 'DELL', address: '0x1C6c8cADBe02E19129c39dDB92281cE4c0bf206b' as Address },
  { ticker: 'EWY', address: '0xEFdf54610B62A7753Ec30bDc380847c12D32e1D1' as Address },
  { ticker: 'GME', address: '0x27C71df6A64fB476468EdF256CF72c038baB5B67' as Address },
  { ticker: 'INTC', address: '0x3f390C5C24628Ac7C489515402235FeAD71D1913' as Address },
  { ticker: 'IONQ', address: '0x22EfeC4919baf55F360E0EDee4AbEB26DE4971eb' as Address },
  { ticker: 'META', address: '0x7C38C00C30BEe9378381E7B6135d7283356D71b1' as Address },
  { ticker: 'MSTR', address: '0x396118bdFB181e6240E74D243F266B061c0edc3D' as Address },
  { ticker: 'MU', address: '0x425EEFdCf05ed6526C3cE61Af99429A228a6d596' as Address },
  { ticker: 'NBIS', address: '0xE1D87B116Ba0fe898998f1D140339D1fA1E09705' as Address },
  { ticker: 'ORCL', address: '0x0e6a64a2B58A6693a531E6c555f3A5d042eEA844' as Address },
  { ticker: 'PLTR', address: '0x820ABedFF239034956B7A9d2F0a331f9F075eB4c' as Address },
  { ticker: 'QQQ', address: '0x80901d846d5D7B030F26B480776EE3b29374C2ae' as Address },
  { ticker: 'RGTI', address: '0x2A045cF1C49c61c166C036d2f06FA2D2d984f765' as Address },
  { ticker: 'RKLB', address: '0x045477BF65Aef6f4F2386ad0164579e48381CC74' as Address },
  { ticker: 'SLV', address: '0x209b73908e92Ae021826eD79609845451Ecba2ce' as Address },
  { ticker: 'SNDK', address: '0xfb133Fa4B7b385802B693a293606682Df47109A3' as Address },
  { ticker: 'SPCX', address: '0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb' as Address },
  { ticker: 'SPY', address: '0x319724394D3A0e3669269846abE664Cd621f9f6A' as Address },
  { ticker: 'TSM', address: '0x874cF94aa8eC88Fd9560094dD065f2fB3E41Fc2F' as Address },
  { ticker: 'USO', address: '0x75a9c76Ef439e2C7c2E5a34Ab105EcFe3766431c' as Address },
] as const

export function feedAddressForTicker(ticker: string): Address | undefined {
  return ALLOWLISTED_FEEDS.find((f) => f.ticker.toLowerCase() === ticker.toLowerCase())?.address
}

const TICKER_BY_FEED_ADDRESS = new Map(ALLOWLISTED_FEEDS.map((f) => [f.address.toLowerCase(), f.ticker]))

/** Instant, no-network ticker lookup for an allowlisted feed -- every market
 * created through this app uses one of these, so this resolves the ticker
 * synchronously instead of waiting on a live `description()` chain read
 * (which otherwise adds a full extra round trip before a market page can
 * show its own title). Falls back to undefined for a feed outside the
 * allowlist; callers should still fall back to tickerFromFeedDescription()
 * off a live read in that case. */
export function tickerForFeedAddress(address?: Address): string | undefined {
  return address ? TICKER_BY_FEED_ADDRESS.get(address.toLowerCase()) : undefined
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

// Mirrors the target-price floor/ceiling guard added to createMarket
// (contracts/src/PredictionMarket.sol) — live on the mainnet contract as of
// the 2026-09-10 redeploy (verified: MIN_TARGET_DEVIATION_BP() etc. return
// real values, not a revert). A createMarket tx outside this range will
// actually revert on-chain, not just get flagged in the UI.
export const MIN_TARGET_DEVIATION_BP = 200n // 2%, all duration tiers
export const SHORT_DURATION_SECONDS = 2n * 60n * 60n
export const MEDIUM_DURATION_SECONDS = 24n * 60n * 60n
export const SHORT_MAX_DEVIATION_BP = 400n // 4%
export const MEDIUM_MAX_DEVIATION_BP = 1500n // 15%
export const LONG_MAX_DEVIATION_BP = 2000n // 20%

export function maxDeviationBpForDuration(durationSeconds: number): bigint {
  if (durationSeconds <= Number(SHORT_DURATION_SECONDS)) return SHORT_MAX_DEVIATION_BP
  if (durationSeconds <= Number(MEDIUM_DURATION_SECONDS)) return MEDIUM_MAX_DEVIATION_BP
  return LONG_MAX_DEVIATION_BP
}

/** Outer [min, max] a target price could be for a given current price +
 * duration — plain numbers (not scaled to feed decimals), for UI display
 * only. Note this isn't one continuous valid range: the actual rule also
 * excludes a band within MIN_TARGET_DEVIATION_BP of the current price (too
 * close to be a real bet) — see recommendedMinDeviationUsd. */
export function recommendedTargetRange(currentPrice: number, durationSeconds: number): [number, number] {
  const maxBp = maxDeviationBpForDuration(durationSeconds)
  const mult = Number(maxBp) / 10_000
  return [currentPrice * (1 - mult), currentPrice * (1 + mult)]
}

/** How close (in $) a target may sit to the current price before it's
 * rejected as too close to be a real bet — the excluded band is
 * [current - this, current + this]. */
export function recommendedMinDeviationUsd(currentPrice: number): number {
  return (currentPrice * Number(MIN_TARGET_DEVIATION_BP)) / 10_000
}

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
