#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createPublicClient, getAddress, http, parseAbiItem } from 'viem'
import { poolConfigsFromRegistry } from './asset-race-pool-price-engine.mjs'
import {
  REVIEWED_LEGACY_PREDICTION_MARKET_ADDRESS,
  assessPredictionMarketCanaries,
  verifyPredictionMarketRelease,
} from './prediction-market-release.mjs'

export const REVIEWED_PREDICTION_MARKET_V2 = '0xF62CF5Db594c4b706555584ccEC9Fb9a61541D4a'
export const REVIEWED_PREDICTION_MARKET_V2_DEPLOY_BLOCK = 76_951_947n
export const REVIEWED_SIGNED_POOL_ORACLE = '0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7'
const ROBINHOOD_MAINNET_CHAIN_ID = 4_663
const DEFAULT_PUBLIC_RPC = 'https://rpc.mainnet.chain.robinhood.com'

const marketStatusAbi = [
  { type: 'function', name: 'marketCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'accumulatedFees', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalCreatorEarningsLiability', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'marketCreatorFees', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'creatorEarnings', stateMutability: 'view', inputs: [{ name: 'creator', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'participantCount', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'stakes', stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }, { name: 'user', type: 'address' }, { name: 'side', type: 'uint8' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'claimed', stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }, { name: 'user', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function', name: 'getMarket', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'assetId', type: 'bytes32' }, { name: 'oracleId', type: 'bytes32' },
        { name: 'priceDecimals', type: 'uint8' }, { name: 'targetPrice', type: 'int256' },
        { name: 'createdAt', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
        { name: 'poolYes', type: 'uint256' }, { name: 'poolNo', type: 'uint256' },
        { name: 'weightedPoolYes', type: 'uint256' }, { name: 'weightedPoolNo', type: 'uint256' },
        { name: 'status', type: 'uint8' }, { name: 'outcome', type: 'uint8' },
        { name: 'feeBp', type: 'uint256' }, { name: 'creator', type: 'address' },
      ],
    }],
  },
]

const BET_PLACED_EVENT = parseAbiItem(
  'event BetPlaced(uint256 indexed id, address indexed user, uint8 side, uint256 amount, uint256 weightBp)',
)

const legacyMarketStatusAbi = marketStatusAbi.map((item) => {
  if (item.name !== 'getMarket') return item
  return {
    ...item,
    outputs: [{ ...item.outputs[0], components: item.outputs[0].components.slice(0, -1) }],
  }
})

function stockConfigs() {
  const registry = JSON.parse(readFileSync(
    fileURLToPath(new URL('../config/asset-race-assets.json', import.meta.url)),
    'utf8',
  ))
  return poolConfigsFromRegistry(registry, { category: 'STOCK' })
}

async function readPositionStakeTotal(client, marketAddress, marketId, logs) {
  const uniquePositions = new Map()
  for (const log of logs) {
    if (!log.args.user || log.args.side == null) continue
    uniquePositions.set(`${log.args.user.toLowerCase()}:${log.args.side}`, {
      user: log.args.user,
      side: log.args.side,
    })
  }
  const stakes = await Promise.all([...uniquePositions.values()].map(({ user, side }) => client.readContract({
    address: marketAddress,
    abi: marketStatusAbi,
    functionName: 'stakes',
    args: [marketId, user, side],
  })))
  return stakes.reduce((total, stake) => total + stake, 0n)
}

export async function readPredictionMarketReleaseStatus({
  client,
  marketAddress = REVIEWED_PREDICTION_MARKET_V2,
  expectedOracleAddress = REVIEWED_SIGNED_POOL_ORACLE,
} = {}) {
  const address = getAddress(marketAddress)
  const chainId = await client.getChainId()
  if (chainId !== ROBINHOOD_MAINNET_CHAIN_ID) {
    throw new Error(`Wrong chain: expected ${ROBINHOOD_MAINNET_CHAIN_ID}, got ${chainId}`)
  }
  const configs = stockConfigs()
  if (configs.length !== 10) throw new Error(`Expected 10 reviewed Stock bindings, got ${configs.length}`)
  await verifyPredictionMarketRelease(client, address, configs, { expectedOracleAddress })

  const [
    marketCount,
    owner,
    settlementMarket,
    cancellationMarket,
    settlementParticipantCount,
    cancellationParticipantCount,
    accumulatedFees,
    totalCreatorEarningsLiability,
    marketCreatorFee,
    contractBalance,
    settlementLogs,
    cancellationLogs,
  ] = await Promise.all([
    client.readContract({ address, abi: marketStatusAbi, functionName: 'marketCount' }),
    client.readContract({ address, abi: marketStatusAbi, functionName: 'owner' }),
    client.readContract({ address, abi: marketStatusAbi, functionName: 'getMarket', args: [0n] }),
    client.readContract({ address, abi: marketStatusAbi, functionName: 'getMarket', args: [1n] }),
    client.readContract({ address, abi: marketStatusAbi, functionName: 'participantCount', args: [0n] }),
    client.readContract({ address, abi: marketStatusAbi, functionName: 'participantCount', args: [1n] }),
    client.readContract({ address, abi: marketStatusAbi, functionName: 'accumulatedFees' }),
    client.readContract({ address, abi: marketStatusAbi, functionName: 'totalCreatorEarningsLiability' }),
    client.readContract({ address, abi: marketStatusAbi, functionName: 'marketCreatorFees', args: [0n] }),
    client.getBalance({ address }),
    client.getLogs({ address, event: BET_PLACED_EVENT, args: { id: 0n }, fromBlock: REVIEWED_PREDICTION_MARKET_V2_DEPLOY_BLOCK, toBlock: 'latest' }),
    client.getLogs({ address, event: BET_PLACED_EVENT, args: { id: 1n }, fromBlock: REVIEWED_PREDICTION_MARKET_V2_DEPLOY_BLOCK, toBlock: 'latest' }),
  ])

  const winnerLog = Number(settlementMarket.status) === 1
    ? settlementLogs.find((log) => Number(log.args.side) === Number(settlementMarket.outcome))
    : undefined
  const [winnerClaimed, cancellationStakesRemaining, creatorEarnings] = await Promise.all([
    winnerLog?.args.user
      ? client.readContract({ address, abi: marketStatusAbi, functionName: 'claimed', args: [0n, winnerLog.args.user] })
      : false,
    readPositionStakeTotal(client, address, 1n, cancellationLogs),
    client.readContract({ address, abi: marketStatusAbi, functionName: 'creatorEarnings', args: [settlementMarket.creator] }),
  ])

  const canaries = assessPredictionMarketCanaries({
    marketCount,
    settlementMarket,
    cancellationMarket,
    settlementParticipantCount,
    cancellationParticipantCount,
    winnerClaimed,
    cancellationStakesRemaining,
    marketCreatorFee,
    creatorEarnings,
    totalCreatorEarningsLiability,
    accumulatedFees,
    contractBalance,
  })

  return {
    chainId,
    address,
    owner,
    reviewedAssetBindings: configs.length,
    marketCount,
    settlementCanary: {
      status: Number(settlementMarket.status),
      deadline: settlementMarket.deadline,
      poolYes: settlementMarket.poolYes,
      poolNo: settlementMarket.poolNo,
      participantCount: settlementParticipantCount,
      winner: winnerLog?.args.user ?? null,
      winnerClaimed,
    },
    cancellationCanary: {
      status: Number(cancellationMarket.status),
      deadline: cancellationMarket.deadline,
      poolYes: cancellationMarket.poolYes,
      poolNo: cancellationMarket.poolNo,
      participantCount: cancellationParticipantCount,
      stakesRemaining: cancellationStakesRemaining,
    },
    accounting: {
      marketCreatorFee,
      creatorEarnings,
      totalCreatorEarningsLiability,
      accumulatedFees,
      contractBalance,
    },
    canaries,
  }
}

export async function readLegacyPredictionMarketStatus({
  client,
  marketAddress = REVIEWED_LEGACY_PREDICTION_MARKET_ADDRESS,
} = {}) {
  const address = getAddress(marketAddress)
  const [marketCount, contractBalance] = await Promise.all([
    client.readContract({ address, abi: legacyMarketStatusAbi, functionName: 'marketCount' }),
    client.getBalance({ address }),
  ])
  const markets = []
  for (let start = 0n; start < marketCount; start += 20n) {
    const end = start + 20n < marketCount ? start + 20n : marketCount
    const batch = await Promise.all(Array.from(
      { length: Number(end - start) },
      (_, index) => client.readContract({
        address,
        abi: legacyMarketStatusAbi,
        functionName: 'getMarket',
        args: [start + BigInt(index)],
      }),
    ))
    markets.push(...batch)
  }

  const now = BigInt(Math.floor(Date.now() / 1_000))
  const openIds = []
  const openMarkets = []
  const overdueOpenIds = []
  const fundedMarkets = []
  const statusCounts = { open: 0, resolved: 0, cancelled: 0 }
  markets.forEach((market, index) => {
    const status = Number(market.status)
    if (status === 0) {
      statusCounts.open += 1
      openIds.push(index)
      openMarkets.push({
        deadline: market.deadline,
        id: index,
        poolNo: market.poolNo,
        poolYes: market.poolYes,
      })
      if (market.deadline <= now) overdueOpenIds.push(index)
    } else if (status === 1) {
      statusCounts.resolved += 1
    } else if (status === 2) {
      statusCounts.cancelled += 1
    }
    if (market.poolYes > 0n || market.poolNo > 0n) {
      fundedMarkets.push({
        deadline: market.deadline,
        id: index,
        poolNo: market.poolNo,
        poolYes: market.poolYes,
        status,
      })
    }
  })

  return {
    address,
    contractBalance,
    fundedMarkets,
    marketCount,
    openIds,
    openMarkets,
    overdueOpenIds,
    statusCounts,
  }
}

function jsonBigInt(_key, value) {
  return typeof value === 'bigint' ? value.toString() : value
}

async function main() {
  const rpcUrl = process.env.PREDICTION_MARKET_RPC_URL?.trim() || DEFAULT_PUBLIC_RPC
  const client = createPublicClient({ transport: http(rpcUrl, { batch: true }) })
  const [status, legacy] = await Promise.all([
    readPredictionMarketReleaseStatus({ client }),
    readLegacyPredictionMarketStatus({ client }),
  ])
  const migrationReady = status.canaries.complete && legacy.overdueOpenIds.length === 0
  console.log(JSON.stringify({ ...status, legacy, migrationReady }, jsonBigInt, 2))
  if (process.argv.includes('--require-complete') && !migrationReady) process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[prediction-market-release] ${error instanceof Error ? error.message.split('\n')[0] : 'Unknown error'}`)
    process.exitCode = 1
  })
}
