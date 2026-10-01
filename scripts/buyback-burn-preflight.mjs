#!/usr/bin/env node

import { createPublicClient, defineChain, http, zeroAddress } from 'viem'
import {
  PONS_V2_FEE_ESCROW,
  ROBINHOOD_CHAIN_ID,
  feeEscrowAbi,
  pendingBuybackForCredits,
  readBuybackKeeperConfig,
  readCumulativeCredits,
  verifyBuybackRelease,
} from './buyback-burn-keeper.mjs'

const config = readBuybackKeeperConfig()
const chain = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
})
const client = createPublicClient({ chain, transport: http(config.rpcUrl) })
const status = await verifyBuybackRelease(client, config.executorAddress, config.feeRecipient)
const requireBound = process.argv.includes('--require-bound')
if (requireBound && status.token === zeroAddress) throw new Error('Buyback executor is not bound to a token')

const [{ confirmedBlock, totalCredited }, escrowBalance, ownerBalance] = await Promise.all([
  status.token === zeroAddress
    ? Promise.resolve({ confirmedBlock: 0n, totalCredited: 0n })
    : readCumulativeCredits(client, config),
  client.readContract({
    address: PONS_V2_FEE_ESCROW,
    abi: feeEscrowAbi,
    functionName: 'balanceOf',
    args: [status.feeRecipient],
  }),
  client.getBalance({ address: status.feeRecipient }),
])
const pending = pendingBuybackForCredits(totalCredited, status.totalSpent)

console.log(JSON.stringify({
  confirmedBlock: confirmedBlock.toString(),
  creditStartBlock: config.creditStartBlock.toString(),
  creatorFeeRecipient: status.feeRecipient,
  curve: status.curve,
  escrowBalanceWei: escrowBalance.toString(),
  executor: config.executorAddress,
  maxBuybackPerCallWei: status.maxPerCall.toString(),
  owner: status.owner,
  ownerBalanceWei: ownerBalance.toString(),
  paused: status.paused,
  pendingBuybackWei: pending.toString(),
  phase: status.launch ? Number(status.launch.phase) : null,
  tokenDeployer: status.launch?.deployer ?? null,
  status: status.token === zeroAddress ? 'AWAITING_TOKEN' : 'BOUND',
  token: status.token,
  totalCreditedWei: totalCredited.toString(),
  totalNativeSpentWei: status.totalSpent.toString(),
  totalTokensBurned: status.totalBurned.toString(),
  v4Executor: status.v4Executor,
}, null, 2))
