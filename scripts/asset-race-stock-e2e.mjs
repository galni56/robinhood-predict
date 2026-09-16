#!/usr/bin/env node

// Local unlocked Anvil accounts only. Never reads env/keys or signs with a key.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, defineChain, formatUnits, http, stringToHex, zeroAddress } from 'viem'
import { PoolEndpointCollector } from './asset-race-pool-endpoints.mjs'
import { endpointProofsForRace, startCallForRace } from './asset-race-keeper.mjs'
import { PoolPriceEngine, poolConfigsFromRegistry, poolOracleId, v4PoolId, UNISWAP_V3_FACTORY, UNISWAP_V4_STATE_VIEW } from './asset-race-pool-price-engine.mjs'

const meme = process.argv.includes('--meme')
const voidRace = process.argv.includes('--void')
const category = meme ? 'MEME' : 'STOCK'
const categoryId = meme ? 1 : 0
const args = process.argv.slice(2)
const assetOption = args.indexOf('--assets')
const requestedIds = assetOption < 0 ? undefined : args[assetOption + 1]?.split(',')
if (assetOption >= 0 && !requestedIds?.length) throw new Error('--assets requires comma-separated approved asset IDs')
const positional = args.filter((arg, index) => !arg.startsWith('--') && (assetOption < 0 || index !== assetOption + 1))
if (positional.length > 1) throw new Error('Only one local RPC URL is accepted')
const rpcUrl = positional[0] ?? 'http://127.0.0.1:18545'
const url = new URL(rpcUrl)
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Local Anvil URL required')
const chain = defineChain({ id: 31337, name: `Local ${category} E2E`, nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } })
const client = createPublicClient({ chain, pollingInterval: 50, transport: http(rpcUrl) })
if (await client.getChainId() !== 31337) throw new Error('Anvil chain 31337 required')
if (!/anvil/i.test(await client.request({ method: 'web3_clientVersion' }))) throw new Error('Local Anvil client required')
const wallet = createWalletClient({ chain, transport: http(rpcUrl) })
const accounts = await wallet.getAddresses()
const [owner, alice, bob, charlie, signer] = accounts
if (!signer) throw new Error('Five unlocked local accounts required')
function artifact(file, name) {
  return JSON.parse(readFileSync(new URL(`../contracts/out/${file}/${name}.json`, import.meta.url), 'utf8'))
}
const tokenArtifact = artifact('StockPoolE2E.sol', 'LocalPoolToken')
const poolArtifact = artifact('StockPoolE2E.sol', 'LocalRaceV3Pool')
const factoryArtifact = artifact('StockPoolE2E.sol', 'LocalRaceV3Factory')
const v4Artifact = meme ? artifact('StockPoolE2E.sol', 'LocalRaceV4StateView') : undefined
const raceArtifact = artifact('AssetRace.sol', 'AssetRace')
const oracleArtifact = artifact('SignedPoolRaceOracle.sol', 'SignedPoolRaceOracle')
assert.ok(raceArtifact.deployedBytecode.object.replace(/^0x/, '').length / 2 <= 24_576, 'AssetRace exceeds EIP-170; rebuild with the repository compiler settings')
async function deploy(art, args) {
  const hash = await wallet.deployContract({ account: owner, abi: art.abi, bytecode: art.bytecode.object, args })
  const receipt = await client.waitForTransactionReceipt({ hash })
  assert.equal(receipt.status, 'success')
  return receipt.contractAddress
}
async function send(address, abi, functionName, args, account = owner) {
  const hash = await wallet.writeContract({ account, address, abi, functionName, args })
  const receipt = await client.waitForTransactionReceipt({ hash })
  assert.equal(receipt.status, 'success')
  return receipt
}
async function mineAt(timestamp) {
  await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number(timestamp)] })
  await client.request({ method: 'evm_mine', params: [] })
}
function sqrt(value) {
  if (value < 2n) return value
  let x = value, next = (x + 1n) >> 1n
  while (next < x) { x = next; next = (x + value / x) >> 1n }
  return x
}
function sqrtFor(config, quoteUnits) {
  const price = quoteUnits * 10n ** 18n, q192 = 1n << 192n
  return config.baseIsToken0
    ? sqrt(price * 10n ** BigInt(config.quoteDecimals) * q192 / (10n ** BigInt(config.baseDecimals + 18)))
    : sqrt(10n ** BigInt(config.baseDecimals + 18) * q192 / (price * 10n ** BigInt(config.quoteDecimals)))
}
function closePrice(actual, dollars) {
  const difference = actual - dollars * 10n ** 18n
  assert.ok(difference > -1_000_000n && difference < 1_000_000n)
}
const catalog = JSON.parse(readFileSync(new URL('../config/asset-race-assets.json', import.meta.url), 'utf8'))
const ids = requestedIds ?? (meme ? catalog.assets.filter((asset) => asset.category === 'MEME' && asset.networks['robinhood-mainnet'].enabled).slice(0, 3).map((asset) => asset.assetId) : ['NVDA', 'TSLA', 'MU'])
assert.ok(ids.length >= 3 && ids.length <= 6 && new Set(ids).size === ids.length, 'Three to six distinct approved contenders required')
for (const id of ids) assert.ok(catalog.assets.some((asset) => asset.assetId === id && asset.category === category && asset.networks['robinhood-mainnet'].enabled), `${id}: not production-approved for ${category}`)
const bettors = [alice, bob, charlie, ...accounts.slice(5)].slice(0, ids.length)
assert.equal(bettors.length, ids.length, 'One unlocked local bettor per contender required')
const finalPrices = ids.map((_, index) => voidRace ? 100n : index === 1 ? 105n : 102n + BigInt(index % 3))
const movedIndex = ids.length - 1
const betToken = await deploy(tokenArtifact, ['Local USDG', 'USDG', 6])
const quoteDecimals = meme ? catalog.marketQuoteUniverses.MEME.decimals : 6
const quote = meme ? await deploy(tokenArtifact, ['Local WETH', 'WETH', quoteDecimals]) : betToken
const factory = await deploy(factoryArtifact, [])
await client.request({ method: 'anvil_setCode', params: [UNISWAP_V3_FACTORY, await client.getBytecode({ address: factory })] })
const configs = []
const productionConfigs = meme ? poolConfigsFromRegistry(catalog, { category: 'MEME' }) : []
async function installCode(address, deployedAddress) {
  await client.request({ method: 'anvil_setCode', params: [address, await client.getBytecode({ address: deployedAddress })] })
}
if (meme) {
  await installCode(catalog.marketQuoteUniverses.MEME.address, quote)
  if (ids.some((id) => productionConfigs.find((config) => config.assetId === id).protocol === 'UNISWAP_V4')) {
    await installCode(UNISWAP_V4_STATE_VIEW, await deploy(v4Artifact, []))
  }
}
for (const assetId of ids) {
  const token = await deploy(tokenArtifact, [`Local ${assetId}`, assetId, 18])
  if (meme) {
    // Exact production source identities are fixtures on this isolated local
    // chain only. Never replace native ETH with a synthetic ERC20/WETH quote.
    const source = productionConfigs.find((config) => config.assetId === assetId)
    const config = { ...source, chainId: 31337 }
    await installCode(config.baseToken, token)
    if (config.protocol === 'UNISWAP_V4') {
      assert.equal(config.quoteToken, zeroAddress)
      assert.equal(config.poolKey.hooks, zeroAddress)
      assert.equal(v4PoolId(config.poolKey), config.poolIdentifier)
      await send(UNISWAP_V4_STATE_VIEW, v4Artifact.abi, 'setSqrtPrice', [config.poolKey, sqrtFor(config, 100n)])
    } else {
      const token0 = config.baseIsToken0 ? config.baseToken : config.quoteToken
      const token1 = config.baseIsToken0 ? config.quoteToken : config.baseToken
      const pool = await deploy(poolArtifact, [token0, token1, UNISWAP_V3_FACTORY, config.fee, sqrtFor(config, 100n)])
      await installCode(config.poolIdentifier, pool)
      await send(UNISWAP_V3_FACTORY, factoryArtifact.abi, 'setPool', [token0, token1, config.fee, config.poolIdentifier])
      // setCode copies runtime/immutables, not constructor-written storage.
      await send(config.poolIdentifier, poolArtifact.abi, 'setSqrtPrice', [sqrtFor(config, 100n)])
    }
    config.oracleId = poolOracleId(config)
    assert.notEqual(config.oracleId, source.oracleId, 'Local attestations must not replay on production chain')
    configs.push(config)
    continue
  }
  const baseToken = token
  const baseIsToken0 = BigInt(baseToken) < BigInt(quote)
  const config = { assetId, category, chainId: 31337, protocol: 'UNISWAP_V3', baseToken, quoteToken: quote, quoteSymbol: meme ? 'WETH' : 'USDG', baseDecimals: 18, quoteDecimals, baseIsToken0, fee: 3000 }
  const token0 = baseIsToken0 ? baseToken : quote, token1 = baseIsToken0 ? quote : baseToken
  config.poolIdentifier = await deploy(poolArtifact, [token0, token1, UNISWAP_V3_FACTORY, 3000, sqrtFor(config, 100n)])
  await send(UNISWAP_V3_FACTORY, factoryArtifact.abi, 'setPool', [token0, token1, 3000, config.poolIdentifier])
  config.oracleId = poolOracleId(config)
  configs.push(config)
}
const engine = new PoolPriceEngine({ client, configs })
// Guard all shared engine reads, including verify()/historical endpoint reads.
const readContract = client.readContract.bind(client)
let nativeErc20Calls = 0
client.readContract = (request) => {
  if (request.address.toLowerCase() === zeroAddress) {
    nativeErc20Calls += 1
    throw new Error('Native currency must never be queried as ERC20')
  }
  return readContract(request)
}
await engine.verify()
for (const asset of Object.values((await engine.latestSnapshot()).assets)) closePrice(asset.priceRaw, 100n)
async function setPrice(config, price) {
  return config.protocol === 'UNISWAP_V4'
    ? send(UNISWAP_V4_STATE_VIEW, v4Artifact.abi, 'setSqrtPrice', [config.poolKey, sqrtFor(config, price)])
    : send(config.poolIdentifier, poolArtifact.abi, 'setSqrtPrice', [sqrtFor(config, price)])
}
const oracle = await deploy(oracleArtifact, [signer])
const race = await deploy(raceArtifact, [betToken])
const collector = new PoolEndpointCollector({ account: { signTypedData: (request) => wallet.signTypedData({ ...request, account: signer }) }, chainId: 31337, engine, verifyingContract: oracle })
const candidates = configs.map((config) => ({ category: categoryId, assetId: stringToHex(config.assetId, { size: 32 }), oracle, oracleId: config.oracleId, expectedDecimals: 18, maxPriceAge: 60n, maxEndpointLag: 0n }))
for (const candidate of candidates) await send(race, raceArtifact.abi, 'setApprovedAsset', [candidate, true])
const now = (await client.getBlock({ blockTag: 'latest' })).timestamp
const t0 = now + 60n, t1 = t0 + 30n
// The local RPC may take longer than the two-second betting lead. Fix the
// creation block rather than let workstation wall-clock timing invalidate it.
await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number(now + 1n)] })
await send(race, raceArtifact.abi, 'createRace', [{ category: categoryId, bettingStartTime: now + 2n, bettingEndTime: t0, raceDuration: 30n,
  startGrace: 120n, resolutionGrace: 180n, maxOracleTimestampSkew: 0n, feeBp: 200, minActiveContenders: 2,
  minStake: 1_000_000n, maxStakePerWallet: 50_000_000n }, candidates])
await mineAt(now + 2n)
for (const [index, account] of bettors.entries()) {
  await send(betToken, tokenArtifact.abi, 'mint', [account, 100_000_000n])
  await send(betToken, tokenArtifact.abi, 'approve', [race, 100_000_000n], account)
  await send(race, raceArtifact.abi, 'bet', [0n, index, 10_000_000n], account)
}
await mineAt(t0 - 1n)
const p0Block = await client.getBlock({ blockTag: 'latest' })
await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number(t0)] })
await setPrice(configs[movedIndex], 200n)
const started = await startCallForRace(client, race, 0n, { bettingEndTime: t0, minActiveContenders: 2 }, collector)
await send(race, raceArtifact.abi, started.functionName, started.args)
const getAssets = () => client.readContract({ address: race, abi: raceArtifact.abi, functionName: 'getRaceAssets', args: [0n] })
const getRace = () => client.readContract({ address: race, abi: raceArtifact.abi, functionName: 'getRace', args: [0n] })
let assets = await getAssets()
assert.ok(assets.every((asset) => asset.startObservationId === p0Block.hash))
for (const asset of assets) closePrice(asset.startPrice, 100n)
const live = await engine.latestSnapshot()
closePrice(live.assets[ids[movedIndex]].priceRaw, 200n)
assert.equal(live.assets[ids[movedIndex]].oracleId, assets[movedIndex].oracleId)
assert.equal((await getRace()).actualStartTime, t0)
assert.equal((await getRace()).raceEndTime, t1)
assert.equal((await getRace()).status, 1) // RUNNING
for (const [index, dollars] of finalPrices.entries()) await setPrice(configs[index], dollars)
await mineAt(t1 - 1n)
const p1Block = await client.getBlock({ blockTag: 'latest' })
await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number(t1)] })
await setPrice(configs[movedIndex], 400n)
await mineAt(t1 + 60n)
const proofs = await endpointProofsForRace(client, race, 0n, t1, collector)
await send(race, raceArtifact.abi, 'captureEndSnapshots', [0n, proofs])
assets = await getAssets()
assert.ok(assets.every((asset) => asset.endObservationId === p1Block.hash))
for (const [index, dollars] of finalPrices.entries()) closePrice(assets[index].endPrice, dollars)
await mineAt(t1 + 86_400n)
await setPrice(configs[movedIndex], 500n)
await send(race, raceArtifact.abi, 'resolveRace', [0n], charlie)
assert.equal((await getRace()).winningAssetIndex, voidRace ? 255 : 1)
assert.equal((await getRace()).status, voidRace ? 4 : 2) // VOID / RESOLVED
assert.deepEqual((await getAssets()).map((asset) => asset.endPrice), assets.map((asset) => asset.endPrice))
for (const asset of await getAssets()) {
  const expectedReturn = (asset.endPrice - asset.startPrice) * 10n ** 18n / asset.startPrice
  assert.equal(asset.returnValue, expectedReturn)
  assert.equal(asset.oracleId, configs.find((config) => stringToHex(config.assetId, { size: 32 }) === asset.assetId).oracleId)
}
await mineAt(t1 + 60n * 86_400n)
const balance = (account = bob) => client.readContract({ address: betToken, abi: tokenArtifact.abi, functionName: 'balanceOf', args: [account] })
const before = await balance()
const expectedPayout = BigInt(ids.length) * 10_000_000n - BigInt(ids.length - 1) * 10_000_000n * 200n / 10_000n
if (voidRace) {
  for (const bettor of bettors) {
    const beforeRefund = await balance(bettor)
    await send(race, raceArtifact.abi, 'refund', [0n], bettor)
    assert.equal(await balance(bettor) - beforeRefund, 10_000_000n)
  }
} else {
  await send(race, raceArtifact.abi, 'claim', [0n], bob)
  assert.equal(await balance() - before, expectedPayout)
}
assert.equal(nativeErc20Calls, 0)
console.log(JSON.stringify({ passed: true, category, assets: ids, quote: meme ? 'ETH_QUOTE' : 'USDG', betToken: 'USDG', liveAndFinalSource: 'same local protocol-shape fixtures/shared PoolPriceEngine',
  sources: configs.map(({ assetId, protocol, poolIdentifier, poolKey, quoteKind, baseDecimals, quoteDecimals, baseIsToken0 }) => ({ assetId, protocol, poolIdentifier, poolKey, quoteKind, baseDecimals, quoteDecimals, baseIsToken0 })), nativeErc20Calls,
  p0Block: p0Block.number.toString(), p0Hash: p0Block.hash, p1Block: p1Block.number.toString(), p1Hash: p1Block.hash,
  boundaryMovementIgnored: true, captureDelaySeconds: 60, resolveDelaySeconds: 86400, claimDelayDays: 60,
  terminalState: voidRace ? 'VOID' : 'RESOLVED', winner: voidRace ? null : ids[1],
  payoutUsd: voidRace ? null : formatUnits(expectedPayout, 6), refundedContenders: voidRace ? ids.length : 0 }))
