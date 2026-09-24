import { getAddress, hexToString, isAddress, type Address, type Hex } from 'viem'
import { assetRaceNetworkConfigError, isLocalAssetRace } from '@/chain/config'
import { ALLOWLISTED_FEEDS } from '@/chain/contracts'

export const ASSET_RACE_STATUS = {
  BETTING: 0,
  RUNNING: 1,
  RESOLVED: 2,
  CANCELLED: 3,
  VOID: 4,
  LOBBY: 5,
} as const

export const ASSET_RACE_CATEGORY = { STOCK: 0, MEME: 1 } as const
export type AssetRaceMode = 'stocks' | 'memes'
export const ASSET_RACE_ORIGIN = { PLATFORM: 0, COMMUNITY: 1 } as const
export const USDG_DECIMALS = 6
export const RETURN_SCALE = 10n ** 18n
export const BP_DENOMINATOR = 10_000n
export const MAX_RACES_TO_LIST = 50
export const ASSET_RACE_TOKEN_LABEL = isLocalAssetRace ? 'fake USDG' : 'USDG'

const configuredAddress = import.meta.env.VITE_ASSET_RACE_ADDRESS?.trim()

export const ASSET_RACE_ADDRESS: Address | undefined =
  !assetRaceNetworkConfigError && configuredAddress && isAddress(configuredAddress) ? getAddress(configuredAddress) : undefined

export const ASSET_RACE_CONFIG_ERROR =
  assetRaceNetworkConfigError
  ?? (configuredAddress && !ASSET_RACE_ADDRESS ? 'VITE_ASSET_RACE_ADDRESS is not a valid EVM address.' : null)

export interface AssetRaceData {
  category: number
  status: number
  bettingStartTime: bigint
  bettingEndTime: bigint
  actualStartTime: bigint
  raceEndTime: bigint
  resolvedAt: bigint
  raceDuration: bigint
  startGrace: bigint
  resolutionGrace: bigint
  maxOracleTimestampSkew: bigint
  feeBp: number
  minActiveContenders: number
  candidateCount: number
  activeCount: number
  winningAssetIndex: number
  endSnapshotsCaptured: boolean
  minStake: bigint
  maxStakePerWallet: bigint
  totalPool: bigint
  winningPool: bigint
  distributableLosingPool: bigint
  protocolFee: bigint
  remainingLiability: bigint
  origin: number
  creator: Address
  title: string
  lobbyEndTime: bigint
  bettingWindow: bigint
}

export interface ApprovedRaceAsset {
  assetId: Hex
  registered: boolean
  enabled: boolean
  category: number
  oracle: Address
  oracleId: Hex
  expectedDecimals: number
  maxPriceAge: bigint
  maxEndpointLag: bigint
  symbol: string
  name: string
  logoUrl?: string
}

export interface AssetRaceAsset {
  assetIndex: number
  assetId: Hex
  oracle: Address
  oracleId: Hex
  expectedDecimals: number
  maxPriceAge: bigint
  maxEndpointLag: bigint
  active: boolean
  pool: bigint
  startPrice: bigint
  endPrice: bigint
  startOracleUpdatedAt: bigint
  endOracleUpdatedAt: bigint
  startObservationId: Hex
  endObservationId: Hex
  returnValue: bigint
  symbol: string
  feedAddress?: Address
  livePrice?: bigint
  liveDecimals?: number
  liveUpdatedAt?: bigint
  liveProvider?: 'ROBINHOOD_POOL_RPC' | 'ORACLE'
  liveStale?: boolean
}

export interface AssetRacePosition {
  stake: bigint
  assetIndex: number
  exists: boolean
  settled: boolean
}

export interface AssetRaceViewModel extends AssetRaceData {
  id: bigint
  assets: AssetRaceAsset[]
  source: 'onchain' | 'preview'
  previewPosition?: AssetRacePosition
}

export const assetRaceAbi = [
  {
    type: 'function',
    name: 'raceCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'betToken',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'getRace',
    stateMutability: 'view',
    inputs: [{ name: 'raceId', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'category', type: 'uint8' },
          { name: 'status', type: 'uint8' },
          { name: 'bettingStartTime', type: 'uint64' },
          { name: 'bettingEndTime', type: 'uint64' },
          { name: 'actualStartTime', type: 'uint64' },
          { name: 'raceEndTime', type: 'uint64' },
          { name: 'resolvedAt', type: 'uint64' },
          { name: 'raceDuration', type: 'uint64' },
          { name: 'startGrace', type: 'uint64' },
          { name: 'resolutionGrace', type: 'uint64' },
          { name: 'maxOracleTimestampSkew', type: 'uint64' },
          { name: 'feeBp', type: 'uint16' },
          { name: 'minActiveContenders', type: 'uint8' },
          { name: 'candidateCount', type: 'uint8' },
          { name: 'activeCount', type: 'uint8' },
          { name: 'winningAssetIndex', type: 'uint8' },
          { name: 'endSnapshotsCaptured', type: 'bool' },
          { name: 'minStake', type: 'uint256' },
          { name: 'maxStakePerWallet', type: 'uint256' },
          { name: 'totalPool', type: 'uint256' },
          { name: 'winningPool', type: 'uint256' },
          { name: 'distributableLosingPool', type: 'uint256' },
          { name: 'protocolFee', type: 'uint256' },
          { name: 'remainingLiability', type: 'uint256' },
          { name: 'origin', type: 'uint8' },
          { name: 'creator', type: 'address' },
          { name: 'title', type: 'string' },
          { name: 'lobbyEndTime', type: 'uint64' },
          { name: 'bettingWindow', type: 'uint64' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getApprovedAssetIds',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bytes32[]' }],
  },
  {
    type: 'function',
    name: 'getApprovedRaceDurations',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint64[]' }],
  },
  {
    type: 'function',
    name: 'approvedAssets',
    stateMutability: 'view',
    inputs: [{ name: 'assetId', type: 'bytes32' }],
    outputs: [
      { name: 'registered', type: 'bool' },
      { name: 'enabled', type: 'bool' },
      { name: 'category', type: 'uint8' },
      { name: 'oracle', type: 'address' },
      { name: 'oracleId', type: 'bytes32' },
      { name: 'expectedDecimals', type: 'uint8' },
      { name: 'maxPriceAge', type: 'uint64' },
      { name: 'maxEndpointLag', type: 'uint64' },
    ],
  },
  {
    type: 'function',
    name: 'lobbyAssetAddedByWallet',
    stateMutability: 'view',
    inputs: [
      { name: 'raceId', type: 'uint256' },
      { name: 'wallet', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'createCommunityRace',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'title', type: 'string' },
      { name: 'category', type: 'uint8' },
      { name: 'raceDuration', type: 'uint64' },
      { name: 'initialAssetIds', type: 'bytes32[]' },
    ],
    outputs: [{ name: 'raceId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'addLobbyAsset',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'raceId', type: 'uint256' },
      { name: 'assetId', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'openBetting',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'raceId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getRaceAssets',
    stateMutability: 'view',
    inputs: [{ name: 'raceId', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple[]',
        components: [
          { name: 'assetId', type: 'bytes32' },
          { name: 'oracle', type: 'address' },
          { name: 'oracleId', type: 'bytes32' },
          { name: 'expectedDecimals', type: 'uint8' },
          { name: 'maxPriceAge', type: 'uint64' },
          { name: 'maxEndpointLag', type: 'uint64' },
          { name: 'active', type: 'bool' },
          { name: 'pool', type: 'uint256' },
          { name: 'startPrice', type: 'uint256' },
          { name: 'endPrice', type: 'uint256' },
          { name: 'startOracleUpdatedAt', type: 'uint256' },
          { name: 'endOracleUpdatedAt', type: 'uint256' },
          { name: 'startObservationId', type: 'bytes32' },
          { name: 'endObservationId', type: 'bytes32' },
          { name: 'returnValue', type: 'int256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getPosition',
    stateMutability: 'view',
    inputs: [
      { name: 'raceId', type: 'uint256' },
      { name: 'user', type: 'address' },
    ],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'stake', type: 'uint256' },
          { name: 'assetIndex', type: 'uint8' },
          { name: 'exists', type: 'bool' },
          { name: 'settled', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'bet',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'raceId', type: 'uint256' },
      { name: 'assetIndex', type: 'uint8' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'raceId', type: 'uint256' }],
    outputs: [{ name: 'payout', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'refund',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'raceId', type: 'uint256' }],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
] as const

export const mockRaceOracleAbi = [
  {
    type: 'function',
    name: 'latestObservation',
    stateMutability: 'view',
    inputs: [{ name: 'oracleId', type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'price', type: 'uint256' },
          { name: 'decimals', type: 'uint8' },
          { name: 'updatedAt', type: 'uint256' },
          { name: 'observationId', type: 'bytes32' },
        ],
      },
    ],
  },
] as const

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
  return category === ASSET_RACE_CATEGORY.MEME ? 'MEME' : 'STOCK'
}

export function categoryForRaceMode(mode: AssetRaceMode) {
  return mode === 'memes' ? ASSET_RACE_CATEGORY.MEME : ASSET_RACE_CATEGORY.STOCK
}

export function raceModeForCategory(category: number): AssetRaceMode {
  return category === ASSET_RACE_CATEGORY.MEME ? 'memes' : 'stocks'
}

export function oracleIdToFeedAddress(oracleId: Hex): Address | undefined {
  const raw = oracleId.slice(2)
  if (raw.length !== 64 || !/^0{24}/.test(raw)) return undefined
  const candidate = `0x${raw.slice(24)}`
  return isAddress(candidate) && candidate !== '0x0000000000000000000000000000000000000000'
    ? getAddress(candidate)
    : undefined
}

function symbolFromAssetId(assetId: Hex) {
  try {
    const decoded = hexToString(assetId).replaceAll('\0', '').trim()
    return /^[A-Z0-9.-]{1,12}$/.test(decoded) ? decoded : undefined
  } catch {
    return undefined
  }
}

export function symbolForRaceAsset(assetId: Hex, oracleId: Hex, index: number) {
  const encodedSymbol = symbolFromAssetId(assetId)
  if (encodedSymbol) return encodedSymbol
  const feed = oracleIdToFeedAddress(oracleId)
  const match = feed
    ? ALLOWLISTED_FEEDS.find((item) => item.address.toLowerCase() === feed.toLowerCase())
    : undefined
  return match?.ticker ?? `ASSET ${index + 1}`
}

export function normalizeRaceAssets(assets: readonly Omit<AssetRaceAsset, 'assetIndex' | 'symbol' | 'feedAddress'>[]) {
  return assets.map((asset, assetIndex) => ({
    ...asset,
    assetIndex,
    symbol: symbolForRaceAsset(asset.assetId, asset.oracleId, assetIndex),
    feedAddress: oracleIdToFeedAddress(asset.oracleId),
  }))
}

export function formatUsdRaw(raw: bigint, decimals = USDG_DECIMALS, maxFractionDigits = 2) {
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

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address
const ZERO_BYTES = `0x${'0'.repeat(64)}` as Hex

function previewAsset(
  assetIndex: number,
  symbol: string,
  pool: bigint,
  startPrice: bigint,
  returnValue = 0n,
): AssetRaceAsset {
  const feed = ALLOWLISTED_FEEDS.find((item) => item.ticker === symbol)?.address
  const endPrice = startPrice + (startPrice * returnValue) / RETURN_SCALE
  return {
    assetIndex,
    assetId: ZERO_BYTES,
    oracle: ZERO_ADDRESS,
    oracleId: ZERO_BYTES,
    expectedDecimals: 8,
    maxPriceAge: 120n,
    maxEndpointLag: 120n,
    active: pool > 0n,
    pool,
    startPrice,
    endPrice,
    startOracleUpdatedAt: 0n,
    endOracleUpdatedAt: 0n,
    startObservationId: ZERO_BYTES,
    endObservationId: ZERO_BYTES,
    returnValue,
    symbol,
    feedAddress: feed,
    livePrice: endPrice || startPrice,
    liveDecimals: 8,
  }
}

function previewRace(
  id: bigint,
  status: number,
  now: bigint,
  assets: AssetRaceAsset[],
  winningAssetIndex = 255,
  category: number = ASSET_RACE_CATEGORY.STOCK,
  title?: string,
): AssetRaceViewModel {
  const totalPool = assets.reduce((sum, asset) => sum + asset.pool, 0n)
  const winningPool = winningAssetIndex < assets.length ? assets[winningAssetIndex].pool : 0n
  const fee = status === ASSET_RACE_STATUS.RESOLVED ? ((totalPool - winningPool) * 200n) / BP_DENOMINATOR : 0n
  return {
    id,
    source: 'preview',
    category,
    status,
    bettingStartTime: now - 600n,
    bettingEndTime: status === ASSET_RACE_STATUS.BETTING ? now + 1_200n : now - 700n,
    actualStartTime: status === ASSET_RACE_STATUS.BETTING || status === ASSET_RACE_STATUS.CANCELLED ? 0n : now - 600n,
    raceEndTime: status === ASSET_RACE_STATUS.RUNNING ? now + 300n : now - 60n,
    resolvedAt: status >= ASSET_RACE_STATUS.RESOLVED ? now - 45n : 0n,
    raceDuration: 900n,
    startGrace: 120n,
    resolutionGrace: 120n,
    maxOracleTimestampSkew: 10n,
    feeBp: 200,
    minActiveContenders: 2,
    candidateCount: assets.length,
    activeCount: status === ASSET_RACE_STATUS.BETTING ? 0 : assets.filter((asset) => asset.active).length,
    winningAssetIndex,
    endSnapshotsCaptured: status === ASSET_RACE_STATUS.RESOLVED || status === ASSET_RACE_STATUS.VOID,
    minStake: 1_000_000n,
    maxStakePerWallet: 50_000_000n,
    totalPool,
    winningPool,
    distributableLosingPool: totalPool - winningPool - fee,
    protocolFee: fee,
    remainingLiability: totalPool - fee,
    origin: ASSET_RACE_ORIGIN.PLATFORM,
    creator: ZERO_ADDRESS,
    title: title ?? (id === 0n ? 'PROPHET TECH RACE' : 'FEATURED ASSET RACE'),
    lobbyEndTime: 0n,
    bettingWindow: 0n,
    assets,
    previewPosition:
      status === ASSET_RACE_STATUS.BETTING
        ? undefined
        : {
            stake: 12_000_000n,
            assetIndex: status === ASSET_RACE_STATUS.RESOLVED ? winningAssetIndex : status === ASSET_RACE_STATUS.CANCELLED ? 0 : 1,
            exists: true,
            settled: false,
          },
  }
}

export function buildPreviewRaces(nowSeconds = BigInt(Math.floor(Date.now() / 1000))) {
  // Mirror the currently enabled production meme set in preview cards, so
  // every preview contender has the same supplied artwork as real games.
  const memeSymbols = ['AI', 'CASHCAT', 'HOOD', 'BLORB']

  return [
    previewRace(0n, ASSET_RACE_STATUS.BETTING, nowSeconds, [
      previewAsset(0, 'NVDA', 125_000_000n, 119_43000000n),
      previewAsset(1, 'TSLA', 95_000_000n, 347_21000000n),
      previewAsset(2, 'META', 60_000_000n, 642_88000000n),
      previewAsset(3, 'AAPL', 20_000_000n, 228_64000000n),
    ]),
    previewRace(1n, ASSET_RACE_STATUS.RUNNING, nowSeconds, [
      previewAsset(0, 'NVDA', 180_000_000n, 119_43000000n, 48_200_000_000_000_000n),
      previewAsset(1, 'TSLA', 140_000_000n, 347_21000000n, 31_100_000_000_000_000n),
      previewAsset(2, 'META', 90_000_000n, 642_88000000n, 7_300_000_000_000_000n),
      previewAsset(3, 'AAPL', 65_000_000n, 228_64000000n, -10_400_000_000_000_000n),
    ]),
    previewRace(
      2n,
      ASSET_RACE_STATUS.RESOLVED,
      nowSeconds,
      [
        previewAsset(0, 'NVDA', 200_000_000n, 118_00000000n, 61_000_000_000_000_000n),
        previewAsset(1, 'TSLA', 180_000_000n, 350_00000000n, 22_000_000_000_000_000n),
        previewAsset(2, 'META', 120_000_000n, 640_00000000n, -8_000_000_000_000_000n),
        previewAsset(3, 'AAPL', 100_000_000n, 230_00000000n, -17_000_000_000_000_000n),
      ],
      0,
    ),
    previewRace(3n, ASSET_RACE_STATUS.VOID, nowSeconds, [
      previewAsset(0, 'NVDA', 75_000_000n, 120_00000000n, 20_000_000_000_000_000n),
      previewAsset(1, 'TSLA', 75_000_000n, 350_00000000n, 20_000_000_000_000_000n),
      previewAsset(2, 'META', 45_000_000n, 640_00000000n, -5_000_000_000_000_000n),
    ]),
    previewRace(4n, ASSET_RACE_STATUS.CANCELLED, nowSeconds, [
      previewAsset(0, 'NVDA', 25_000_000n, 0n),
      previewAsset(1, 'TSLA', 0n, 0n),
      previewAsset(2, 'META', 0n, 0n),
      previewAsset(3, 'AAPL', 0n, 0n),
    ]),
    previewRace(5n, ASSET_RACE_STATUS.BETTING, nowSeconds, [
      previewAsset(0, memeSymbols[0], 95_000_000n, 100_00000000n),
      previewAsset(1, memeSymbols[1], 82_000_000n, 100_00000000n),
      previewAsset(2, memeSymbols[2], 64_000_000n, 100_00000000n),
      previewAsset(3, memeSymbols[3], 39_000_000n, 100_00000000n),
    ], 255, ASSET_RACE_CATEGORY.MEME, 'MEME MAYHEM'),
    previewRace(6n, ASSET_RACE_STATUS.RUNNING, nowSeconds, [
      previewAsset(0, memeSymbols[0], 110_000_000n, 100_00000000n, 30_000_000_000_000_000n),
      previewAsset(1, memeSymbols[1], 105_000_000n, 100_00000000n, 80_000_000_000_000_000n),
      previewAsset(2, memeSymbols[2], 70_000_000n, 100_00000000n, 60_000_000_000_000_000n),
      previewAsset(3, memeSymbols[3], 45_000_000n, 100_00000000n, -10_000_000_000_000_000n),
    ], 255, ASSET_RACE_CATEGORY.MEME, 'WHO LET THE MEMES RUN?'),
    previewRace(7n, ASSET_RACE_STATUS.RESOLVED, nowSeconds, [
      previewAsset(0, memeSymbols[0], 120_000_000n, 100_00000000n, 30_000_000_000_000_000n),
      previewAsset(1, memeSymbols[1], 115_000_000n, 100_00000000n, 80_000_000_000_000_000n),
      previewAsset(2, memeSymbols[2], 75_000_000n, 100_00000000n, 60_000_000_000_000_000n),
      previewAsset(3, memeSymbols[3], 50_000_000n, 100_00000000n, -10_000_000_000_000_000n),
    ], 1, ASSET_RACE_CATEGORY.MEME, 'MEME CHAMPIONSHIP'),
  ]
}
