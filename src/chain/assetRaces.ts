import { assetRaceCatalogByPool, assetIdHexForSymbol } from '@/chain/assetRaceRegistry'
import type { ServerPayout, ServerRace } from '@/chain/gameServer'
import { SOL_DECIMALS } from '@/solana/config'

// Asset Race view model on top of the game server's race (same fields as the
// former program account). Numeric status/category codes are kept stable for
// the UI components.

export const ASSET_RACE_STATUS = {
  BETTING: 0,
  RUNNING: 1,
  RESOLVED: 2,
  CANCELLED: 3,
  VOID: 4,
  LOBBY: 5,
  /** A status variant this build does not know (program upgraded ahead of
   * the frontend). Fails closed: no gate matches it, so no actions render. */
  UNKNOWN: 99,
} as const

export const ASSET_RACE_CATEGORY = { STOCK: 0, MEME: 1, CRYPTO: 2 } as const
export type AssetRaceMode = 'stocks' | 'memes' | 'crypto'
export const ASSET_RACE_ORIGIN = { PLATFORM: 0, COMMUNITY: 1 } as const
/** Stake currency decimals (native SOL). */
export const STAKE_DECIMALS = SOL_DECIMALS
export const RETURN_SCALE = 10n ** 18n
export const BP_DENOMINATOR = 10_000n
export interface ApprovedRaceAsset {
  assetId: string
  enabled: boolean
  category: number
  priceSource: string
  expectedDecimals: number
  symbol: string
  name: string
  logoUrl?: string
  priceUrl?: string
  /** 'catalog' (owner-reviewed) or 'pumpswap' (added automatically). */
  source?: 'catalog' | 'pumpswap'
  /** Launched from the Prophet launchpad. */
  launchedOnProphet?: boolean
  /** Token mint, when known (PumpSwap coins). */
  mint?: string
}

export interface AssetRaceAsset {
  assetIndex: number
  assetId: string
  symbol: string
  priceSource: string
  /** USD price precision of the signed pool price. */
  expectedDecimals: number
  active: boolean
  pool: bigint
  startPrice: bigint
  endPrice: bigint
  returnValue: bigint
  endOracleUpdatedAt: bigint
  livePrice?: bigint
  liveDecimals?: number
  liveProvider?: 'PRICE_SERVICE'
  liveStale?: boolean
  /** Display market cap from the live price and mint supply (memes). */
  liveMarketCapUsd?: number
}

export interface AssetRacePosition {
  stake: bigint
  assetIndex: number
  exists: boolean
  /** Its payout or refund reached the wallet (or there was nothing to pay). */
  settled: boolean
}

/** A payout the game server owes or made for this race. */
export interface RacePayout {
  wallet: string
  kind: string
  amount: bigint
  status: ServerPayout['status']
  signature: string | null
}

export interface AssetRaceViewModel {
  id: bigint
  address: string
  category: number
  status: number
  origin: number
  creator: string
  stakeMint: string
  title: string
  bettingStartTime: bigint
  bettingEndTime: bigint
  actualStartTime: bigint
  raceEndTime: bigint
  resolvedAt: bigint
  raceDuration: bigint
  startGrace: bigint
  resolutionGrace: bigint
  lobbyEndTime: bigint
  bettingWindow: bigint
  feeBp: number
  minActiveContenders: number
  candidateCount: number
  activeCount: number
  winningAssetIndex: number
  minStake: bigint
  maxStakePerWallet: bigint
  totalPool: bigint
  winningPool: bigint
  distributableLosingPool: bigint
  protocolFee: bigint
  creatorFee: bigint
  remainingLiability: bigint
  /** Wallets that already used their one lobby addition. */
  lobbyAdders: string[]
  assets: AssetRaceAsset[]
  positions: { owner: string; assetIndex: number; stake: bigint; payout: bigint }[]
  payouts: RacePayout[]
  /** Show prices or market caps (display only). */
  unit: 'price' | 'cap'
  source: 'onchain'
}

const STATUS_CODES: Record<string, number> = {
  betting: ASSET_RACE_STATUS.BETTING,
  running: ASSET_RACE_STATUS.RUNNING,
  resolved: ASSET_RACE_STATUS.RESOLVED,
  cancelled: ASSET_RACE_STATUS.CANCELLED,
  void: ASSET_RACE_STATUS.VOID,
  lobby: ASSET_RACE_STATUS.LOBBY,
}
const CATEGORY_CODES: Record<string, number> = { stock: 0, meme: 1, crypto: 2 }
const big = (value: string | number) => BigInt(value)

export function categoryCode(category: string) {
  return CATEGORY_CODES[category.toLowerCase()] ?? 0
}

export const payoutFromServer = (p: ServerPayout): RacePayout => ({ ...p, amount: big(p.amount) })

export function raceFromServer(r: ServerRace): AssetRaceViewModel {
  const status = STATUS_CODES[r.status] ?? ASSET_RACE_STATUS.UNKNOWN
  return {
    id: big(r.id),
    address: r.address,
    category: categoryCode(r.category),
    status,
    origin: r.origin === 'community' ? ASSET_RACE_ORIGIN.COMMUNITY : ASSET_RACE_ORIGIN.PLATFORM,
    creator: r.creator,
    stakeMint: r.stakeMint,
    title: r.title,
    bettingStartTime: big(r.bettingStartTime),
    bettingEndTime: big(r.bettingEndTime),
    // P0 is fixed at the betting cutoff.
    actualStartTime: status === ASSET_RACE_STATUS.BETTING || status === ASSET_RACE_STATUS.LOBBY ? 0n : big(r.bettingEndTime),
    raceEndTime: big(r.raceEndTime),
    resolvedAt: big(r.resolvedAt),
    raceDuration: big(r.raceDuration),
    startGrace: big(r.startGrace),
    resolutionGrace: big(r.resolutionGrace),
    lobbyEndTime: big(r.lobbyEndTime),
    bettingWindow: big(r.bettingWindow),
    feeBp: r.feeBp,
    minActiveContenders: r.minActiveContenders,
    candidateCount: r.assets.length,
    activeCount: r.activeCount,
    winningAssetIndex: r.winningAssetIndex,
    minStake: big(r.minStake),
    maxStakePerWallet: big(r.maxStakePerWallet),
    totalPool: big(r.totalPool),
    winningPool: big(r.winningPool),
    distributableLosingPool: big(r.distributableLosingPool),
    protocolFee: big(r.protocolFee),
    creatorFee: big(r.creatorFee),
    remainingLiability: big(r.remainingLiability),
    lobbyAdders: r.lobbyAdders,
    assets: r.assets.map((a, assetIndex) => {
      const source = a.priceSource
      const catalog = assetRaceCatalogByPool.get(source)
      const symbol = catalog?.symbol ?? a.symbol
      return {
        assetIndex,
        assetId: catalog?.assetId ?? assetIdHexForSymbol(symbol),
        symbol,
        priceSource: source,
        expectedDecimals: a.priceDecimals,
        active: a.active,
        pool: big(a.pool),
        startPrice: big(a.startPrice),
        endPrice: big(a.endPrice),
        returnValue: big(a.returnValue),
        endOracleUpdatedAt: big(r.endPriceTime),
      }
    }),
    positions: r.positions.map((p) => ({ owner: p.owner, assetIndex: p.assetIndex, stake: big(p.stake), payout: big(p.payout) })),
    payouts: r.payouts.map(payoutFromServer),
    unit: r.unit === 'cap' ? 'cap' : 'price',
    source: 'onchain',
  }
}

const FINAL_RACE = new Set<number>([ASSET_RACE_STATUS.RESOLVED, ASSET_RACE_STATUS.CANCELLED, ASSET_RACE_STATUS.VOID])

/** The wallet's position: settled once its payout landed, or at once for a loss. */
export function positionFor(race: AssetRaceViewModel, wallet?: string | null): AssetRacePosition | undefined {
  const p = wallet ? race.positions.find((item) => item.owner === wallet) : undefined
  if (!p) return undefined
  const owed = payoutFor(race, wallet)
  const settled = FINAL_RACE.has(race.status) && (owed ? owed.status === 'done' : true)
  return { stake: p.stake, assetIndex: p.assetIndex, exists: true, settled }
}

/** The wallet's payout or refund for this race, once the server queued it. */
export function payoutFor(race: AssetRaceViewModel, wallet?: string | null): RacePayout | undefined {
  return wallet ? race.payouts.find((item) => item.wallet === wallet && (item.kind === 'win' || item.kind === 'refund')) : undefined
}

export function assetRaceStatusLabel(status: number) {
  if (status === ASSET_RACE_STATUS.LOBBY) return 'LOBBY'
  if (status === ASSET_RACE_STATUS.BETTING) return 'BETTING'
  if (status === ASSET_RACE_STATUS.RUNNING) return 'RUNNING'
  if (status === ASSET_RACE_STATUS.RESOLVED) return 'RESOLVED'
  if (status === ASSET_RACE_STATUS.CANCELLED) return 'CANCELLED'
  if (status === ASSET_RACE_STATUS.VOID) return 'VOID'
  return 'UNKNOWN'
}

export function assetRaceCategoryLabel(category: number) {
  if (category === ASSET_RACE_CATEGORY.MEME) return 'MEME'
  if (category === ASSET_RACE_CATEGORY.CRYPTO) return 'CRYPTO'
  return 'STOCK'
}


export function raceModeForCategory(category: number): AssetRaceMode {
  if (category === ASSET_RACE_CATEGORY.MEME) return 'memes'
  if (category === ASSET_RACE_CATEGORY.CRYPTO) return 'crypto'
  return 'stocks'
}

export function formatStakeRaw(raw: bigint, decimals = STAKE_DECIMALS, maxFractionDigits = 6) {
  const negative = raw < 0n
  const value = negative ? -raw : raw
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const fraction = (value % base).toString().padStart(decimals, '0').slice(0, maxFractionDigits).replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole.toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}`
}

export function formatPoolShare(pool: bigint, total: bigint) {
  if (total === 0n) return '0.00%'
  const hundredths = (pool * 10_000n) / total
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, '0')}%`
}

export function calculateReturnWad(startPrice: bigint, endPrice: bigint) {
  if (startPrice <= 0n || endPrice <= 0n) return 0n
  return ((endPrice - startPrice) * RETURN_SCALE) / startPrice
}

export function formatReturnWad(value: bigint, digits = 2) {
  const negative = value < 0n
  const absolute = negative ? -value : value
  const precision = 10n ** BigInt(digits)
  const scaled = (absolute * 100n * precision) / RETURN_SCALE
  const whole = scaled / precision
  const fraction = (scaled % precision).toString().padStart(digits, '0')
  return `${negative ? '-' : '+'}${whole}.${fraction}%`
}

/**
 * A return with as many decimals as it needs to not read as zero: short
 * races on quiet coins move by thousandths of a percent.
 */
export function formatReturnAdaptive(value: bigint) {
  const absolute = value < 0n ? -value : value
  // Two significant digits past the leading zeros, never fewer than 2 decimals
  // (RETURN_SCALE is 100%, so 10^-(k+2) of it is 10^-k %).
  let digits = 2
  while (digits < 10 && absolute > 0n && absolute * 10n ** BigInt(digits + 2) < RETURN_SCALE * 10n) digits++
  return formatReturnWad(value, digits)
}

export function estimateRacePayout(
  selectedPool: bigint,
  totalPool: bigint,
  currentUserStake: bigint,
  addedStake: bigint,
  feeBp: number,
) {
  if (addedStake < 0n) return 0n
  const winningPoolAfter = selectedPool + addedStake
  const userStakeAfter = currentUserStake + addedStake
  const totalPoolAfter = totalPool + addedStake
  if (winningPoolAfter <= 0n || userStakeAfter <= 0n || totalPoolAfter < winningPoolAfter) return 0n
  const losingPool = totalPoolAfter - winningPoolAfter
  const fee = (losingPool * BigInt(feeBp)) / BP_DENOMINATOR
  const distributable = losingPool - fee
  return userStakeAfter + (userStakeAfter * distributable) / winningPoolAfter
}

export function resolvedPositionPayout(race: AssetRaceViewModel, position?: AssetRacePosition) {
  if (!position?.exists || position.assetIndex !== race.winningAssetIndex || race.winningPool === 0n) return 0n
  return position.stake + (position.stake * race.distributableLosingPool) / race.winningPool
}
