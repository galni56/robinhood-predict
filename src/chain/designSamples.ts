import { assetRaceCatalog } from '@/chain/assetRaceRegistry'
import {
  ASSET_RACE_CATEGORY,
  ASSET_RACE_ORIGIN,
  ASSET_RACE_STATUS,
  type AssetRaceAsset,
  type AssetRaceViewModel,
} from '@/chain/assetRaces'
import {
  PRICE_ARENA_CATEGORY,
  PRICE_ARENA_STATUS,
  priceArenaAssetForPool,
  type PriceArenaViewModel,
} from '@/chain/priceArena'
import { NATIVE_SOL } from '@/solana/config'

// Dev-only sample games so list pages, the landing and the archive can be
// designed and reviewed without the local servers. Never ships: the
// flag is false in production builds, and the samples only appear when the
// real data source returned nothing.
export const DESIGN_SAMPLES_ENABLED = import.meta.env.DEV

const nowSec = () => BigInt(Math.floor(Date.now() / 1000))
const SOL = (value: number) => BigInt(Math.round(value * 1e9))
const CREATOR = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
const SOL_MINT = NATIVE_SOL.toBase58()

const bySymbol = new Map(assetRaceCatalog.map((asset) => [asset.symbol, asset]))

function raceAsset(symbol: string, assetIndex: number, poolSol: number, returnBp: number): AssetRaceAsset {
  const cat = bySymbol.get(symbol)
  return {
    assetIndex,
    assetId: cat?.assetId ?? `0x${'0'.repeat(64)}`,
    symbol,
    priceSource: cat?.pool ?? '',
    expectedDecimals: cat?.priceDecimals ?? 6,
    active: true,
    pool: SOL(poolSol),
    startPrice: 1_000_000n,
    endPrice: BigInt(1_000_000 + returnBp * 100),
    // WAD-scaled return, same scale calculateReturnWad produces.
    returnValue: BigInt(returnBp) * 10n ** 14n,
    endOracleUpdatedAt: 0n,
  }
}

function race(overrides: {
  id: number
  title: string
  category: number
  status: number
  origin?: number
  assets: AssetRaceAsset[]
  totalPoolSol: number
  startsInSec?: number
  endsInSec?: number
  winningAssetIndex?: number
}): AssetRaceViewModel {
  const now = nowSec()
  const running = overrides.status === ASSET_RACE_STATUS.RUNNING
  const resolved = overrides.status === ASSET_RACE_STATUS.RESOLVED
  const lobby = overrides.status === ASSET_RACE_STATUS.LOBBY
  const endsIn = BigInt(overrides.endsInSec ?? 300)
  return {
    id: BigInt(overrides.id),
    address: `design-race-${overrides.id}`,
    category: overrides.category,
    status: overrides.status,
    origin: overrides.origin ?? ASSET_RACE_ORIGIN.PLATFORM,
    creator: CREATOR,
    stakeMint: SOL_MINT,
    title: overrides.title,
    bettingStartTime: now - 600n,
    bettingEndTime: lobby ? now + 600n : running || resolved ? now - 120n : now + endsIn,
    actualStartTime: running || resolved ? now - 120n : 0n,
    raceEndTime: resolved ? now - 900n : now + endsIn,
    resolvedAt: resolved ? now - 840n : 0n,
    raceDuration: 300n,
    startGrace: 180n,
    resolutionGrace: 300n,
    lobbyEndTime: lobby ? now + BigInt(overrides.startsInSec ?? 240) : now - 900n,
    bettingWindow: 300n,
    feeBp: 200,
    minActiveContenders: 2,
    candidateCount: overrides.assets.length,
    activeCount: overrides.assets.length,
    winningAssetIndex: overrides.winningAssetIndex ?? 255,
    minStake: SOL(0.005),
    maxStakePerWallet: SOL(0.35),
    totalPool: SOL(overrides.totalPoolSol),
    winningPool: resolved ? overrides.assets[overrides.winningAssetIndex ?? 0].pool : 0n,
    distributableLosingPool: 0n,
    protocolFee: 0n,
    creatorFee: 0n,
    remainingLiability: 0n,
    lobbyAdders: [],
    assets: overrides.assets,
    positions: [],
    payouts: [],
    source: 'onchain',
  }
}

export const SAMPLE_RACES: AssetRaceViewModel[] = [
  race({
    id: 901,
    title: 'Magnificent tech sprint',
    category: ASSET_RACE_CATEGORY.STOCK,
    status: ASSET_RACE_STATUS.RUNNING,
    totalPoolSol: 12.4,
    endsInSec: 107,
    assets: [
      raceAsset('NVDAx', 0, 5.2, 98),
      raceAsset('TSLAx', 1, 3.9, 89),
      raceAsset('AAPLx', 2, 2.1, 16),
      raceAsset('METAx', 3, 1.2, -4),
    ],
  }),
  race({
    id: 902,
    title: 'Meme mayhem',
    category: ASSET_RACE_CATEGORY.MEME,
    status: ASSET_RACE_STATUS.BETTING,
    totalPoolSol: 6.8,
    endsInSec: 190,
    assets: [raceAsset('TRUMP', 0, 3.1, 0), raceAsset('WIF', 1, 2.2, 0), raceAsset('POPCAT', 2, 1.5, 0)],
  }),
  race({
    id: 903,
    title: 'Chip rivalry',
    category: ASSET_RACE_CATEGORY.STOCK,
    status: ASSET_RACE_STATUS.LOBBY,
    origin: ASSET_RACE_ORIGIN.COMMUNITY,
    totalPoolSol: 0,
    startsInSec: 240,
    assets: [raceAsset('NVDAx', 0, 0, 0), raceAsset('MSFTx', 1, 0, 0)],
  }),
  race({
    id: 904,
    title: 'Dog coin derby',
    category: ASSET_RACE_CATEGORY.MEME,
    status: ASSET_RACE_STATUS.RESOLVED,
    totalPoolSol: 9.3,
    winningAssetIndex: 0,
    assets: [raceAsset('WIF', 0, 4.4, 212), raceAsset('PENGU', 1, 3.2, 140), raceAsset('POPCAT', 2, 1.7, -35)],
  }),
]

function arena(overrides: {
  id: number
  title: string
  symbol: string
  category: number
  status: number
  startsInSec?: number
  endsInSec?: number
  players: number
  totalPoolSol: number
}): PriceArenaViewModel {
  const now = nowSec()
  const cat = bySymbol.get(overrides.symbol)
  const resolved = overrides.status === PRICE_ARENA_STATUS.RESOLVED
  return {
    id: BigInt(overrides.id),
    address: `design-arena-${overrides.id}`,
    assetId: cat?.assetId ?? `0x${'0'.repeat(64)}`,
    symbol: overrides.symbol,
    priceSource: cat?.pool ?? '',
    creator: CREATOR,
    stakeMint: SOL_MINT,
    priceDecimals: cat?.priceDecimals ?? 6,
    category: overrides.category,
    status: overrides.status,
    cancelReason: 0,
    createdAt: now - 1_200n,
    startsAt: resolved ? now - 2_400n : now + BigInt(overrides.startsInSec ?? -300),
    deadline: resolved ? now - 1_500n : now + BigInt(overrides.endsInSec ?? 420),
    resolvedAt: resolved ? now - 1_400n : 0n,
    duration: 900,
    participantCount: overrides.players,
    winnerCount: resolved ? Math.ceil(overrides.players / 2) : 0,
    feeBp: 200,
    minStake: SOL(0.005),
    maxStake: SOL(0.35),
    totalPool: SOL(overrides.totalPoolSol),
    finalPrice: resolved ? 231_480_000n : 0n,
    finalUpdatedAt: 0n,
    protocolFee: 0n,
    creatorFee: 0n,
    remainingLiability: 0n,
    title: overrides.title,
    entries: Array.from({ length: overrides.players }, (_, index) => ({
      player: CREATOR,
      prediction: 230_000_000n + BigInt(index) * 750_000n,
      stake: SOL(overrides.totalPoolSol / Math.max(overrides.players, 1)),
      predictionUpdatedAt: now - 600n,
      predictionSeq: index,
      payout: 0n,
      rank: resolved ? index + 1 : 0,
      accuracyMultiplierBp: 0,
      exists: true,
      settled: false,
    })),
    payouts: [],
    asset: priceArenaAssetForPool(cat?.pool),
  }
}

export const SAMPLE_ARENAS: PriceArenaViewModel[] = [
  arena({
    id: 751,
    title: 'Name the NVDAx close',
    symbol: 'NVDAx',
    category: PRICE_ARENA_CATEGORY.STOCK,
    status: PRICE_ARENA_STATUS.OPEN,
    startsInSec: 280,
    endsInSec: 1_180,
    players: 4,
    totalPoolSol: 2.4,
  }),
  arena({
    id: 752,
    title: 'TRUMP price showdown',
    symbol: 'TRUMP',
    category: PRICE_ARENA_CATEGORY.MEME,
    status: PRICE_ARENA_STATUS.OPEN,
    startsInSec: -200,
    endsInSec: 460,
    players: 7,
    totalPoolSol: 5.1,
  }),
  arena({
    id: 753,
    title: 'SOL at the bell',
    symbol: 'SOL',
    category: PRICE_ARENA_CATEGORY.CRYPTO,
    status: PRICE_ARENA_STATUS.RESOLVED,
    players: 9,
    totalPoolSol: 8.2,
  }),
]
