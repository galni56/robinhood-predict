import { getAddress, isAddress, keccak256, padHex, stringToBytes, stringToHex, type Address, type Hex } from 'viem'
import registryJson from '../../config/asset-race-assets.json'

export type AssetRaceNetworkKey = 'local' | 'robinhood-testnet' | 'robinhood-mainnet'
export type AssetRaceCategoryName = 'STOCK' | 'MEME'
export type AssetRaceOracleType = 'CHAINLINK_V3' | 'SIGNED_POOL_BLOCK_PAIR' | 'DEX_V2_SPOT' | 'DEX_V3_SPOT' | 'MOCK_LOCAL'

interface OracleConfig {
  type: AssetRaceOracleType
  identifier?: string
  feedAddress?: string
  expectedDecimals: number
  validationProfile: string
  provenance?: string
}

interface NetworkAssetConfig {
  enabled: boolean
  oracle: OracleConfig | null
  blocker?: string
}

export interface AssetRaceCatalogAsset {
  assetId: string
  symbol: string
  displayName: string
  category: AssetRaceCategoryName
  canonicalTokenAddress: string | null
  maxRecommendedRaceExposureUsd?: number | null // Advisory only; not a consensus stake/payout cap.
  raceExposureReviewStatus?: 'PENDING_CURRENT_EXECUTABLE_DEPTH' | 'REVIEWED'
  liveDisplay?: {
    type: 'DEXSCREENER_STOCK_TOKEN'
    profile: 'DEXSCREENER_STOCK_TOKEN_V1'
    pairAddress: string
    baseTokenAddress: string
    quoteTokenAddress: string
    orientation: 'BASE_STOCK_QUOTE_USDG'
  }
  productionStatus?: 'A' | 'B' | 'C'
  networks: Record<AssetRaceNetworkKey, NetworkAssetConfig>
}

interface ValidationProfile {
  maxPriceAgeSeconds: number
  maxEndpointLagSeconds: number
}

interface AssetRaceRegistry {
  assets: AssetRaceCatalogAsset[]
  networks: Record<AssetRaceNetworkKey, { chainId: number; allowedOracleTypes: AssetRaceOracleType[] }>
  validationProfiles: Record<string, ValidationProfile>
  liveDisplayProfiles: Record<string, {
    provider: 'DEXSCREENER'
    chainId: string
    quoteTokenAddress: string
    priceField: 'priceNative'
    pollIntervalMs: number
    staleAfterMs: number
  }>
}

export const assetRaceRegistry = registryJson as unknown as AssetRaceRegistry
export const assetRaceCatalog = assetRaceRegistry.assets
export const assetRaceMemeQuote = { ...registryJson.marketQuoteUniverses.MEME, symbol: 'ETH' }
export const assetRaceCatalogById = new Map(
  assetRaceCatalog.map((asset) => [stringToHex(asset.assetId, { size: 32 }).toLowerCase(), asset]),
)

export function configuredChainlinkRaceOracle(): Address | undefined {
  const value = import.meta.env.VITE_ASSET_RACE_CHAINLINK_ORACLE_ADDRESS?.trim()
  return value && isAddress(value) ? getAddress(value) : undefined
}

export function configuredSignedPoolRaceOracle(): Address | undefined {
  const value = import.meta.env.VITE_ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS?.trim()
  return value && isAddress(value) ? getAddress(value) : undefined
}

export function oracleIdForCatalogAsset(asset: AssetRaceCatalogAsset, network: AssetRaceNetworkKey): Hex | undefined {
  const oracle = asset.networks[network].oracle
  if (!oracle) return undefined
  if (oracle.type === 'MOCK_LOCAL' && oracle.identifier) return keccak256(stringToBytes(oracle.identifier))
  if (oracle.type === 'SIGNED_POOL_BLOCK_PAIR' && /^0x[0-9a-fA-F]{64}$/.test(oracle.identifier ?? '')) {
    return oracle.identifier as Hex
  }
  if (oracle.type === 'CHAINLINK_V3' && oracle.feedAddress && isAddress(oracle.feedAddress)) {
    return padHex(getAddress(oracle.feedAddress), { size: 32 })
  }
  return undefined
}

export function approvedAssetMatchesCatalog(args: {
  asset: AssetRaceCatalogAsset
  network: AssetRaceNetworkKey
  category: number
  oracle: Address
  oracleId: Hex
  expectedDecimals: number
  maxPriceAge: bigint
  maxEndpointLag: bigint
}): boolean {
  const { asset, network, category, oracle, oracleId, expectedDecimals, maxPriceAge, maxEndpointLag } = args
  const networkConfig = asset.networks[network]
  const source = networkConfig.oracle
  if (!networkConfig.enabled || !source) return false
  if (category !== (asset.category === 'MEME' ? 1 : 0)) return false
  if (!assetRaceRegistry.networks[network].allowedOracleTypes.includes(source.type)) return false
  if (expectedDecimals !== source.expectedDecimals) return false
  const profile = assetRaceRegistry.validationProfiles[source.validationProfile]
  if (!profile || maxPriceAge !== BigInt(profile.maxPriceAgeSeconds)) return false
  if (maxEndpointLag !== BigInt(profile.maxEndpointLagSeconds)) return false
  if (oracleIdForCatalogAsset(asset, network)?.toLowerCase() !== oracleId.toLowerCase()) return false

  if (network === 'local') return source.type === 'MOCK_LOCAL'
  if (source.type === 'SIGNED_POOL_BLOCK_PAIR') {
    const adapter = configuredSignedPoolRaceOracle()
    return !!adapter && adapter.toLowerCase() === oracle.toLowerCase()
  }
  if (source.type !== 'CHAINLINK_V3') return false
  const adapter = configuredChainlinkRaceOracle()
  return !!adapter && adapter.toLowerCase() === oracle.toLowerCase()
}
