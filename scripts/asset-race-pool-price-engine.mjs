import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  pad,
  parseAbi,
  zeroAddress,
} from 'viem'

export const POOL_PRICE_DECIMALS = 18
export const ROBINHOOD_CHAIN_ID = 4663
export const UNISWAP_V3_FACTORY = getAddress('0x1f7d7550B1b028f7571E69A784071F0205FD2EfA')
export const UNISWAP_V4_POOL_MANAGER = getAddress('0x8366a39CC670B4001A1121B8F6A443A643e40951')
export const UNISWAP_V4_STATE_VIEW = getAddress('0xf3334192d15450cdd385c8b70e03f9a6bd9e673b')
export const UNISWAP_V4_QUOTER = getAddress('0x8dc178efb8111bb0973dd9d722ebeff267c98f94')
export const UNISWAP_INTERFACE_MULTICALL = getAddress('0x282a3c4d320cc7f0d5eaf56b8029e4b88338f0a3')

export const POOL_PROTOCOL = { UNISWAP_V3: 1, UNISWAP_V4: 2 }
const Q192 = 1n << 192n

const v3PoolAbi = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function factory() view returns (address)',
  'function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)',
])
const v3FactoryAbi = parseAbi(['function getPool(address tokenA,address tokenB,uint24 fee) view returns (address pool)'])
const v4StateViewAbi = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)',
])
const erc20Abi = parseAbi(['function decimals() view returns (uint8)'])

function pow10(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 255) throw new Error('InvalidTokenDecimals')
  return 10n ** BigInt(value)
}

function normalized(value) {
  return typeof value === 'string' ? value.toLowerCase() : ''
}

function nativeQuote(config) {
  const native = normalized(config.quoteToken) === normalized(zeroAddress)
  if (normalized(config.baseToken) === normalized(zeroAddress)
    || (native && (config.category !== 'MEME' || config.protocol !== 'UNISWAP_V4'
      || config.quoteKind !== 'NATIVE_ETH' || config.quoteDecimals !== 18))) {
    throw new Error(`InvalidNativePoolCurrency:${config.assetId}`)
  }
  return native
}

function validateV4Pair(config) {
  if (!config.poolKey || normalized(v4PoolId(config.poolKey)) !== normalized(config.poolIdentifier)) {
    throw new Error(`InvalidV4PoolKey:${config.assetId}`)
  }
  const currencies = [config.poolKey.currency0, config.poolKey.currency1].map(normalized)
  if (!currencies.includes(normalized(config.baseToken)) || !currencies.includes(normalized(config.quoteToken))
    || (currencies[0] === normalized(config.baseToken)) !== config.baseIsToken0
    || BigInt(config.poolKey.currency0) >= BigInt(config.poolKey.currency1)) {
    throw new Error(`WrongV4PoolPair:${config.assetId}`)
  }
}

export function poolIdentifierBytes32(protocol, poolIdentifier) {
  if (protocol === 'UNISWAP_V3') {
    if (!isAddress(poolIdentifier)) throw new Error('InvalidV3PoolAddress')
    return pad(poolIdentifier, { size: 32 })
  }
  if (protocol === 'UNISWAP_V4' && /^0x[0-9a-fA-F]{64}$/.test(poolIdentifier)) return poolIdentifier
  throw new Error('InvalidV4PoolId')
}

export function poolOracleId({ chainId, protocol, poolIdentifier, baseToken, quoteToken }) {
  const protocolId = POOL_PROTOCOL[protocol]
  if (!protocolId || !isAddress(baseToken) || !isAddress(quoteToken)) throw new Error('InvalidPoolIdentity')
  return keccak256(encodeAbiParameters(
    [
      { type: 'uint256' },
      { type: 'uint8' },
      { type: 'bytes32' },
      { type: 'address' },
      { type: 'address' },
    ],
    [BigInt(chainId), protocolId, poolIdentifierBytes32(protocol, poolIdentifier), baseToken, quoteToken],
  ))
}

export function v4PoolId(poolKey) {
  return keccak256(encodeAbiParameters(
    [{
      type: 'tuple',
      components: [
        { name: 'currency0', type: 'address' },
        { name: 'currency1', type: 'address' },
        { name: 'fee', type: 'uint24' },
        { name: 'tickSpacing', type: 'int24' },
        { name: 'hooks', type: 'address' },
      ],
    }],
    [{
      currency0: poolKey.currency0,
      currency1: poolKey.currency1,
      fee: poolKey.fee,
      tickSpacing: poolKey.tickSpacing,
      hooks: poolKey.hooks,
    }],
  ))
}

export function priceFromSqrtPriceX96({
  sqrtPriceX96,
  baseIsToken0,
  baseDecimals,
  quoteDecimals,
  outputDecimals = POOL_PRICE_DECIMALS,
}) {
  const sqrt = BigInt(sqrtPriceX96)
  if (sqrt <= 0n) throw new Error('InvalidSqrtPrice')
  const squared = sqrt * sqrt
  const numeratorScale = pow10(baseDecimals) * pow10(outputDecimals)
  const quoteScale = pow10(quoteDecimals)
  const result = baseIsToken0
    ? (squared * numeratorScale) / (Q192 * quoteScale)
    : (Q192 * numeratorScale) / (squared * quoteScale)
  if (result <= 0n) throw new Error('NonPositivePoolPrice')
  return result
}

export function poolConfigsFromRegistry(registry, { includeDisabled = false, category } = {}) {
  const chainId = registry?.networks?.['robinhood-mainnet']?.chainId
  if (chainId !== ROBINHOOD_CHAIN_ID) throw new Error('InvalidRobinhoodChainId')
  return registry.assets
    .filter((asset) => ['STOCK', 'MEME'].includes(asset.category) && (!category || asset.category === category) && (asset.networks?.['robinhood-mainnet']?.enabled
      || (includeDisabled && asset.marketSource)))
    .map((asset) => {
      const source = asset.marketSource
      if (!source || !POOL_PROTOCOL[source.type]) throw new Error(`MissingPoolMarketSource:${asset.assetId}`)
      const config = {
        assetId: asset.assetId,
        category: asset.category,
        chainId,
        protocol: source.type,
        poolIdentifier: source.poolIdentifier,
        baseToken: getAddress(source.baseToken),
        quoteToken: getAddress(source.quoteToken),
        ...(asset.category === 'MEME' ? { quoteKind: source.quoteKind ?? 'WETH' } : {}),
        baseDecimals: source.baseDecimals,
        quoteDecimals: source.quoteDecimals,
        baseIsToken0: source.baseIsToken0,
        fee: source.fee,
        poolKey: source.poolKey,
      }
      if (normalized(config.baseToken) !== normalized(asset.canonicalTokenAddress)) {
        throw new Error(`WrongPoolBaseToken:${asset.assetId}`)
      }
      const quote = asset.category === 'STOCK'
        ? registry.networks['robinhood-mainnet'].settlementToken
        : registry.marketQuoteUniverses?.MEME
      const native = nativeQuote(config)
      if (!quote || (!native && normalized(config.quoteToken) !== normalized(quote.address)) || config.quoteDecimals !== quote.decimals
        || (asset.category === 'MEME' && config.quoteKind !== (native ? 'NATIVE_ETH' : 'WETH'))) {
        throw new Error(`WrongPoolQuoteToken:${asset.assetId}`)
      }
      config.quoteSymbol = asset.category === 'MEME' ? 'ETH' : quote.symbol
      config.quoteUnit = asset.category === 'MEME' ? 'ETH_QUOTE' : quote.symbol
      if (!['BASE_STOCK_QUOTE_USDG', 'BASE_TOKEN_QUOTE_TOKEN'].includes(source.orientation) || typeof config.baseIsToken0 !== 'boolean') {
        throw new Error(`InvalidPoolOrientation:${asset.assetId}`)
      }
      if (config.protocol === 'UNISWAP_V4') {
        validateV4Pair(config)
      }
      config.oracleId = poolOracleId(config)
      const configuredOracleId = asset.networks['robinhood-mainnet'].oracle?.identifier
      if (asset.networks['robinhood-mainnet'].enabled && normalized(configuredOracleId) !== normalized(config.oracleId)) {
        throw new Error(`WrongPoolOracleId:${asset.assetId}`)
      }
      return config
    })
}

function poolRead(config) {
  if (config.protocol === 'UNISWAP_V3') {
    return { address: getAddress(config.poolIdentifier), abi: v3PoolAbi, functionName: 'slot0' }
  }
  return { address: UNISWAP_V4_STATE_VIEW, abi: v4StateViewAbi, functionName: 'getSlot0', args: [config.poolIdentifier] }
}

export async function verifyPoolConfigs(client, configs) {
  for (const config of configs) {
    const native = nativeQuote(config)
    const [baseDecimals, quoteDecimals] = await Promise.all([
      client.readContract({ address: config.baseToken, abi: erc20Abi, functionName: 'decimals' }),
      native ? Promise.resolve(18) : client.readContract({ address: config.quoteToken, abi: erc20Abi, functionName: 'decimals' }),
    ])
    if (baseDecimals !== config.baseDecimals || quoteDecimals !== config.quoteDecimals) {
      throw new Error(`PoolTokenDecimalsMismatch:${config.assetId}`)
    }
    if (config.protocol === 'UNISWAP_V3') {
      const pool = getAddress(config.poolIdentifier)
      const [token0, token1, fee, factory] = await Promise.all([
        client.readContract({ address: pool, abi: v3PoolAbi, functionName: 'token0' }),
        client.readContract({ address: pool, abi: v3PoolAbi, functionName: 'token1' }),
        client.readContract({ address: pool, abi: v3PoolAbi, functionName: 'fee' }),
        client.readContract({ address: pool, abi: v3PoolAbi, functionName: 'factory' }),
      ])
      const expectedToken0 = config.baseIsToken0 ? config.baseToken : config.quoteToken
      const expectedToken1 = config.baseIsToken0 ? config.quoteToken : config.baseToken
      if (normalized(token0) !== normalized(expectedToken0) || normalized(token1) !== normalized(expectedToken1)
        || fee !== config.fee || normalized(factory) !== normalized(UNISWAP_V3_FACTORY)) {
        throw new Error(`V3PoolMetadataMismatch:${config.assetId}`)
      }
      const discovered = await client.readContract({
        address: UNISWAP_V3_FACTORY,
        abi: v3FactoryAbi,
        functionName: 'getPool',
        args: [token0, token1, fee],
      })
      if (normalized(discovered) !== normalized(pool)) throw new Error(`V3FactoryPoolMismatch:${config.assetId}`)
    } else {
      validateV4Pair(config)
      const state = await client.readContract({
        address: UNISWAP_V4_STATE_VIEW,
        abi: v4StateViewAbi,
        functionName: 'getSlot0',
        args: [config.poolIdentifier],
      })
      if (state[0] <= 0n) throw new Error(`V4PoolNotInitialized:${config.assetId}`)
    }
  }
  return true
}

export async function findEndpointBlock(client, targetTimestamp) {
  const target = BigInt(targetTimestamp)
  const latest = await client.getBlock({ blockTag: 'latest' })
  if (latest.timestamp < target) throw new Error('EndpointBlockNotAvailable')

  let low = 1n
  let high = latest.number
  while (low < high) {
    const middle = (low + high) >> 1n
    const block = await client.getBlock({ blockNumber: middle })
    if (block.timestamp >= target) high = middle
    else low = middle + 1n
  }
  const [previous, selected] = await Promise.all([
    client.getBlock({ blockNumber: low - 1n }),
    client.getBlock({ blockNumber: low }),
  ])
  if (previous.number + 1n !== selected.number || previous.timestamp >= target || selected.timestamp < target) {
    throw new Error('InvalidEndpointBlockBoundary')
  }
  if (!previous.hash || !selected.hash || selected.parentHash !== previous.hash) throw new Error('InvalidEndpointBlockLineage')
  return { previous, selected }
}

export class PoolPriceEngine {
  constructor({ client, configs }) {
    if (!client || !Array.isArray(configs) || configs.length === 0) throw new Error('InvalidPoolPriceEngineConfig')
    this.client = client
    this.configs = configs
  }

  async verify() {
    return verifyPoolConfigs(this.client, this.configs)
  }

  async snapshotAtBlock(blockOrNumber, configs = this.configs) {
    const block = typeof blockOrNumber === 'bigint'
      ? await this.client.getBlock({ blockNumber: blockOrNumber })
      : blockOrNumber
    if (!block?.hash || typeof block.number !== 'bigint') throw new Error('InvalidPoolSnapshotBlock')
    const contracts = configs.map(poolRead)
    let results
    if (typeof this.client.multicall === 'function' && this.client.chain?.contracts?.multicall3) {
      results = await this.client.multicall({ contracts, allowFailure: false, blockNumber: block.number })
    } else {
      results = await Promise.all(contracts.map((contract) => this.client.readContract({ ...contract, blockNumber: block.number })))
    }
    // Never sign/display a price read by number with metadata from a different
    // canonical block if the chain reorganized while the eth_calls ran.
    const confirmed = await this.client.getBlock({ blockNumber: block.number })
    if (normalized(confirmed.hash) !== normalized(block.hash)) throw new Error('PoolSnapshotBlockReorganized')
    const assets = {}
    for (let index = 0; index < configs.length; index += 1) {
      const config = configs[index]
      const sqrtPriceX96 = results[index][0]
      const priceRaw = priceFromSqrtPriceX96({ ...config, sqrtPriceX96 })
      assets[config.assetId] = {
        assetId: config.assetId,
        oracleId: config.oracleId,
        quoteToken: config.quoteToken,
        quoteKind: config.quoteKind,
        quoteUnit: config.quoteUnit,
        quoteSymbol: config.quoteSymbol ?? 'USDG',
        priceRaw,
        decimals: POOL_PRICE_DECIMALS,
        blockNumber: block.number,
        blockHash: block.hash,
        parentBlockHash: block.parentHash,
        blockTimestamp: block.timestamp,
        poolIdentifier: config.poolIdentifier,
        protocol: config.protocol,
        provider: 'ROBINHOOD_POOL_RPC',
      }
    }
    return { block, assets }
  }

  async latestSnapshot() {
    const block = await this.client.getBlock({ blockTag: 'latest' })
    return this.snapshotAtBlock(block)
  }

  async endpointPair(targetTimestamp, oracleIds) {
    const requested = oracleIds && new Set(oracleIds.map(normalized))
    const configs = requested ? this.configs.filter((config) => requested.has(normalized(config.oracleId))) : this.configs
    if (requested && (!requested.size || configs.length !== requested.size)) throw new Error('UnknownPoolOracleId')
    const boundary = await findEndpointBlock(this.client, targetTimestamp)
    const [previous, selected] = await Promise.all([
      this.snapshotAtBlock(boundary.previous, configs),
      this.snapshotAtBlock(boundary.selected, configs),
    ])
    return { previous, selected }
  }
}

export const poolEngineAbis = { erc20Abi, v3FactoryAbi, v3PoolAbi, v4StateViewAbi }
export const EMPTY_HOOKS = zeroAddress
