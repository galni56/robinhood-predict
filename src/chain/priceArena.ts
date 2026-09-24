import { getAddress, isAddress, stringToHex, type Address, type Hex } from 'viem'
import { assetRaceCatalog, type AssetRaceCategoryName } from '@/chain/assetRaceRegistry'
import { assetRaceNetworkKey } from '@/chain/config'

const rawAddress = import.meta.env.VITE_PRICE_ARENA_ADDRESS?.trim()
export const PRICE_ARENA_ADDRESS: Address | undefined = rawAddress && isAddress(rawAddress)
  ? getAddress(rawAddress)
  : undefined
export const PRICE_ARENA_CONFIG_ERROR = rawAddress && !PRICE_ARENA_ADDRESS
  ? 'VITE_PRICE_ARENA_ADDRESS is invalid.'
  : null

export const PRICE_ARENA_CATEGORY = { STOCK: 0, MEME: 1 } as const
export const PRICE_ARENA_STATUS = { OPEN: 0, RESOLVED: 1, CANCELLED: 2 } as const
export const PRICE_ARENA_PHASE = { LOBBY: 0, RUNNING: 1, RESOLVED: 2, CANCELLED: 3 } as const
export const PRICE_ARENA_DURATIONS = [60n, 300n, 900n, 3600n] as const
export const PRICE_ARENA_LOBBY_SECONDS = 600n
export const PRICE_ARENA_MIN_STAKE = 1
export const PRICE_ARENA_MAX_STAKE = 50
export const PRICE_ARENA_TOKEN_DECIMALS = 6
export const MAX_ARENAS_TO_LIST = 100

export type PriceArenaMode = 'stocks' | 'memes'

export interface PriceArenaAsset {
  assetId: Hex
  symbol: string
  name: string
  category: number
  categoryName: AssetRaceCategoryName
  quoteSymbol: 'USDG' | 'ETH'
}

export const PRICE_ARENA_ASSETS: PriceArenaAsset[] = assetRaceCatalog.flatMap((asset) => {
  const network = asset.networks[assetRaceNetworkKey]
  if (!network.enabled || network.oracle?.type !== 'SIGNED_POOL_BLOCK_PAIR') return []
  return [{
    assetId: stringToHex(asset.assetId, { size: 32 }),
    symbol: asset.symbol,
    name: asset.displayName,
    category: asset.category === 'MEME' ? PRICE_ARENA_CATEGORY.MEME : PRICE_ARENA_CATEGORY.STOCK,
    categoryName: asset.category,
    quoteSymbol: asset.category === 'MEME' ? 'ETH' : 'USDG',
  }]
})

const ASSET_BY_ID = new Map(PRICE_ARENA_ASSETS.map((asset) => [asset.assetId.toLowerCase(), asset]))

export function priceArenaAsset(assetId?: Hex | string) {
  return assetId ? ASSET_BY_ID.get(assetId.toLowerCase()) : undefined
}

export function categoryForArenaMode(mode: PriceArenaMode) {
  return mode === 'memes' ? PRICE_ARENA_CATEGORY.MEME : PRICE_ARENA_CATEGORY.STOCK
}

export function modeForArenaCategory(category: number): PriceArenaMode {
  return category === PRICE_ARENA_CATEGORY.MEME ? 'memes' : 'stocks'
}

export function arenaDurationLabel(seconds: bigint | number) {
  const value = BigInt(seconds)
  if (value === 3600n) return '1 hour'
  return `${value / 60n} min`
}

export function arenaPhaseLabel(phase: number) {
  if (phase === PRICE_ARENA_PHASE.LOBBY) return 'Lobby'
  if (phase === PRICE_ARENA_PHASE.RUNNING) return 'Live'
  if (phase === PRICE_ARENA_PHASE.RESOLVED) return 'Finished'
  return 'Cancelled'
}

export interface PriceArenaData {
  assetId: Hex
  oracleId: Hex
  oracle: Address
  creator: Address
  priceDecimals: number
  category: number
  status: number
  createdAt: bigint
  startsAt: bigint
  deadline: bigint
  resolvedAt: bigint
  duration: number
  participantCount: number
  winnerCount: number
  feeBp: number
  totalPool: bigint
  finalPrice: bigint
  finalUpdatedAt: bigint
  observationId: Hex
  protocolFee: bigint
  remainingLiability: bigint
  title: string
}

export interface PriceArenaEntry {
  prediction: bigint
  stake: bigint
  predictionUpdatedAt: bigint
  payout: bigint
  rank: number
  accuracyMultiplierBp: number
  exists: boolean
  settled: boolean
}

export interface PriceArenaViewModel extends PriceArenaData {
  id: bigint
  phase: number
  asset?: PriceArenaAsset
}

export const priceArenaAbi = [
  { type: 'function', name: 'arenaCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'betToken', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    type: 'function', name: 'getArena', stateMutability: 'view', inputs: [{ name: 'arenaId', type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'assetId', type: 'bytes32' }, { name: 'oracleId', type: 'bytes32' },
        { name: 'oracle', type: 'address' }, { name: 'creator', type: 'address' },
        { name: 'priceDecimals', type: 'uint8' }, { name: 'category', type: 'uint8' },
        { name: 'status', type: 'uint8' }, { name: 'createdAt', type: 'uint64' },
        { name: 'startsAt', type: 'uint64' }, { name: 'deadline', type: 'uint64' },
        { name: 'resolvedAt', type: 'uint64' }, { name: 'duration', type: 'uint32' },
        { name: 'participantCount', type: 'uint16' }, { name: 'winnerCount', type: 'uint16' },
        { name: 'feeBp', type: 'uint16' }, { name: 'totalPool', type: 'uint256' },
        { name: 'finalPrice', type: 'uint256' }, { name: 'finalUpdatedAt', type: 'uint256' },
        { name: 'observationId', type: 'bytes32' }, { name: 'protocolFee', type: 'uint256' },
        { name: 'remainingLiability', type: 'uint256' }, { name: 'title', type: 'string' },
      ],
    }],
  },
  { type: 'function', name: 'phase', stateMutability: 'view', inputs: [{ name: 'arenaId', type: 'uint256' }], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'getParticipants', stateMutability: 'view', inputs: [{ name: 'arenaId', type: 'uint256' }], outputs: [{ type: 'address[]' }] },
  {
    type: 'function', name: 'getEntry', stateMutability: 'view',
    inputs: [{ name: 'arenaId', type: 'uint256' }, { name: 'player', type: 'address' }],
    outputs: [{
      type: 'tuple', components: [
        { name: 'prediction', type: 'uint256' }, { name: 'stake', type: 'uint256' },
        { name: 'predictionUpdatedAt', type: 'uint256' }, { name: 'payout', type: 'uint256' },
        { name: 'rank', type: 'uint32' }, { name: 'accuracyMultiplierBp', type: 'uint32' },
        { name: 'exists', type: 'bool' }, { name: 'settled', type: 'bool' },
      ],
    }],
  },
  {
    type: 'function', name: 'approvedAssets', stateMutability: 'view', inputs: [{ name: 'assetId', type: 'bytes32' }],
    outputs: [
      { name: 'oracle', type: 'address' }, { name: 'oracleId', type: 'bytes32' },
      { name: 'decimals', type: 'uint8' }, { name: 'category', type: 'uint8' }, { name: 'enabled', type: 'bool' },
    ],
  },
  {
    type: 'function', name: 'createArena', stateMutability: 'nonpayable',
    inputs: [{ name: 'assetId', type: 'bytes32' }, { name: 'category', type: 'uint8' }, { name: 'duration', type: 'uint256' }, { name: 'title', type: 'string' }],
    outputs: [{ name: 'arenaId', type: 'uint256' }],
  },
  {
    type: 'function', name: 'enter', stateMutability: 'nonpayable',
    inputs: [{ name: 'arenaId', type: 'uint256' }, { name: 'prediction', type: 'uint256' }, { name: 'amount', type: 'uint256' }], outputs: [],
  },
  {
    type: 'function', name: 'updateEntry', stateMutability: 'nonpayable',
    inputs: [{ name: 'arenaId', type: 'uint256' }, { name: 'newPrediction', type: 'uint256' }, { name: 'additionalAmount', type: 'uint256' }], outputs: [],
  },
  { type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [{ name: 'arenaId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'refund', stateMutability: 'nonpayable', inputs: [{ name: 'arenaId', type: 'uint256' }], outputs: [] },
] as const
