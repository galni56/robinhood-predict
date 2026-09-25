import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { validateAssetRaceProductionBuild, validateNativeEthProductionBindings } from '../vite.config.ts'
import { archiveLookbacks, archiveRpcMinIntervalMs, archiveRpcUrl } from './asset-race-archive-options.mjs'

const configured = { VITE_ASSET_RACE_NETWORK: 'robinhood-mainnet',
  VITE_ASSET_RACE_ADDRESS: '0x1111111111111111111111111111111111111111',
  VITE_ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS: '0x2222222222222222222222222222222222222222' }
const registry = JSON.parse(readFileSync(new URL('../config/asset-race-assets.json', import.meta.url), 'utf8'))
const pagesWorkflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')
const deployAssetRaceScript = readFileSync(new URL('../contracts/script/DeployAssetRace.s.sol', import.meta.url), 'utf8')
const nativeSimulationScript = readFileSync(
  new URL('../contracts/script/SimulateNativeEthDeployment.s.sol', import.meta.url),
  'utf8',
)

test('production LIVE defaults to one shared two-second pool heartbeat', () => {
  assert.equal(registry.poolInfrastructure.livePollIntervalMs, 2_000)
  assert.equal(registry.liveDisplayProfiles.DEXSCREENER_STOCK_TOKEN_V1.pollIntervalMs, 2_000)
})

test('archive probe accepts explicit multiple positive historical lookbacks', () => {
  assert.deepEqual(archiveLookbacks('60,300,600,3600'), [60n, 300n, 600n, 3600n])
  assert.deepEqual(archiveLookbacks(), [60n])
})

test('archive probe rejects empty, negative, fractional, zero and duplicate lookbacks before RPC', () => {
  for (const raw of ['', '-1', '1.5', '0', '60,60', '60,', 'garbage']) {
    assert.throws(() => archiveLookbacks(raw), /InvalidArchiveLookbacks/)
  }
})

test('archive probes accept a secret environment URL without requiring it in process arguments', () => {
  const secretUrl = 'https://robinhood-mainnet.g.alchemy.com/v2/secret-not-printed'
  assert.equal(archiveRpcUrl([], { ASSET_RACE_POOL_RPC_URL: secretUrl }), secretUrl)
  assert.equal(archiveRpcUrl(['--rpc-url', 'https://rpc.mainnet.chain.robinhood.com'], {
    ASSET_RACE_POOL_RPC_URL: secretUrl,
  }), 'https://rpc.mainnet.chain.robinhood.com')
  for (const invalid of [undefined, '', 'not-a-url']) {
    assert.throws(() => archiveRpcUrl([], { ASSET_RACE_POOL_RPC_URL: invalid }), /MissingOrInvalidArchiveRpcUrl/)
  }
  assert.throws(() => archiveRpcUrl(['--rpc-url'], {}), /MissingOrInvalidArchiveRpcUrl/)
})

test('archive probes conservatively pace free-provider calls and reject unsafe values', () => {
  assert.equal(archiveRpcMinIntervalMs([]), 150)
  assert.equal(archiveRpcMinIntervalMs(['--rpc-min-interval-ms', '250']), 250)
  assert.equal(archiveRpcMinIntervalMs([], { ASSET_RACE_ARCHIVE_MIN_INTERVAL_MS: '200' }), 200)
  for (const value of ['0', '49', '-1', '1.5', 'fast']) {
    assert.throws(() => archiveRpcMinIntervalMs(['--rpc-min-interval-ms', value]), /InvalidArchiveRpcMinInterval/)
  }
})

test('mainnet build requires both explicit nonzero contract bindings, never a silent preview', () => {
  validateAssetRaceProductionBuild(configured)
  for (const name of ['VITE_ASSET_RACE_ADDRESS', 'VITE_ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS']) {
    for (const value of [undefined, '', 'invalid', '0x0000000000000000000000000000000000000000']) {
      assert.throws(() => validateAssetRaceProductionBuild({ ...configured, [name]: value }), /requires a nonzero/)
    }
  }
})

test('implicit mainnet with a contract cannot omit its oracle; network typos and identical bindings fail', () => {
  assert.throws(() => validateAssetRaceProductionBuild({ VITE_ASSET_RACE_ADDRESS: configured.VITE_ASSET_RACE_ADDRESS }), /SIGNED_POOL_ORACLE/)
  assert.throws(() => validateAssetRaceProductionBuild({ ...configured, VITE_ASSET_RACE_NETWORK: 'mainnett' }), /Unsupported/)
  assert.throws(() => validateAssetRaceProductionBuild({ ...configured,
    VITE_ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS: configured.VITE_ASSET_RACE_ADDRESS }), /different contract/)
})

test('GitHub Pages stays fail-closed until native-ETH contracts are deployed', () => {
  assert.doesNotMatch(pagesWorkflow, /VITE_(?:MARKET|ASSET_RACE|PRICE_ARENA)_ADDRESS:/)
  assert.doesNotMatch(pagesWorkflow, /0x63E582bb395527CED97F2F94662eA93A7EDf65Ff/i)
  assert.match(pagesWorkflow, /VITE_ASSET_RACE_LIVE_ENABLED: ["']false["']/)
})

test('native-ETH builds reject every known USDG contract binding', () => {
  for (const [name, address] of [
    ['VITE_MARKET_ADDRESS', '0x1a62098AcEd3F7F8C41fff1bc1395A541678b0F1'],
    ['VITE_MARKET_ADDRESS', '0xd95ed19edBCd330498CADe7BA8569ac940A4182f'],
    ['VITE_ASSET_RACE_ADDRESS', '0x63E582bb395527CED97F2F94662eA93A7EDf65Ff'],
    ['VITE_PRICE_ARENA_ADDRESS', '0xBAca2605914d8f7f0DF5663AA01f79FB8a6DA8ae'],
  ]) {
    assert.throws(() => validateNativeEthProductionBindings({ [name]: address }), /legacy USDG/)
  }
  validateNativeEthProductionBindings({
    VITE_MARKET_ADDRESS: '0x1111111111111111111111111111111111111111',
    VITE_ASSET_RACE_ADDRESS: '0x2222222222222222222222222222222222222222',
    VITE_PRICE_ARENA_ADDRESS: '0x3333333333333333333333333333333333333333',
  })
})

test('native AssetRace deployment reuses the existing signed-pool oracle', () => {
  assert.match(deployAssetRaceScript, /envAddress\("ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS"\)/)
  assert.match(deployAssetRaceScript, /TRUSTED_SIGNER\(\) == priceSigner/)
  assert.doesNotMatch(deployAssetRaceScript, /new SignedPoolRaceOracle/)
})

test('chain-4663 simulation cannot read a private key or broadcast', () => {
  assert.doesNotMatch(nativeSimulationScript, /env(?:Uint|Bytes32)\([^\n]*PRIVATE_KEY/)
  assert.doesNotMatch(nativeSimulationScript, /vm\.(?:startBroadcast|broadcast)\s*\(/)
  assert.match(nativeSimulationScript, /block\.chainid == EXPECTED_CHAIN_ID/)
  assert.match(nativeSimulationScript, /TRUSTED_SIGNER\(\) == inputs\.priceSigner/)
})

test('LIVE enablement rejects build-time typos', () => {
  validateAssetRaceProductionBuild({ ...configured, VITE_ASSET_RACE_LIVE_ENABLED: 'false' })
  validateAssetRaceProductionBuild({ ...configured, VITE_ASSET_RACE_LIVE_ENABLED: 'true' })
  assert.throws(
    () => validateAssetRaceProductionBuild({ ...configured, VITE_ASSET_RACE_LIVE_ENABLED: 'disabled' }),
    /must be true or false/,
  )
})

test('explicit local/testnet builds and deliberately unconfigured labelled preview remain available', () => {
  validateAssetRaceProductionBuild({})
  validateAssetRaceProductionBuild({ VITE_ASSET_RACE_NETWORK: 'local' })
  validateAssetRaceProductionBuild({ VITE_ASSET_RACE_NETWORK: 'robinhood-testnet' })
  validateAssetRaceProductionBuild({ ...configured, VITE_ASSET_RACE_NETWORK: 'mainnet' })
})
