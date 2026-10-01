#!/usr/bin/env node

import { privateKeyToAccount } from 'viem/accounts'
import {
  PROPHET_TOKEN_DEPLOYER_ADDRESS,
  tokenDeployerPrivateKeyFromEnvironment,
} from './buyback-burn-keeper.mjs'

const privateKey = tokenDeployerPrivateKeyFromEnvironment()
const source = process.env.BUYBACK_TOKEN_DEPLOYER_PRIVATE_KEY?.trim()
  ? 'BUYBACK_TOKEN_DEPLOYER_PRIVATE_KEY'
  : process.env.PRIVATE_KEY?.trim()
    ? 'PRIVATE_KEY'
    : null

if (!privateKey || !source) {
  throw new Error('BUYBACK_TOKEN_DEPLOYER_PRIVATE_KEY or PRIVATE_KEY is not configured')
}
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error(`${source} has an invalid private key format`)
}

const signerAddress = privateKeyToAccount(privateKey).address
if (signerAddress.toLowerCase() !== PROPHET_TOKEN_DEPLOYER_ADDRESS.toLowerCase()) {
  throw new Error(`${source} resolves to ${signerAddress}, not the reviewed token deployer`)
}

console.log(JSON.stringify({
  expectedAddress: PROPHET_TOKEN_DEPLOYER_ADDRESS,
  signerAddress,
  source,
  status: 'MATCH',
}, null, 2))
