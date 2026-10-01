# Prediction Market creator revenue release

This release keeps the player-facing Prediction Market fee at `200` basis
points of a winner's losing-pool share. It changes only the destination:

- 50% of the collected fee (1 percentage point at the release fee) accrues to
  the immutable market creator.
- 50% (1 percentage point) accrues to Prophet as `accumulatedFees`.
- Principal and cancelled-market refunds remain fee-free.

Creator attribution is the wallet that calls `createMarket`. Share/referral
URLs are distribution and analytics tools only; they never decide who receives
onchain creator earnings.

## Safety model

Creator fees are pull payments. Winner claims only update
`creatorEarnings[creator]`; they never call the creator address. A creator later
calls `withdrawCreatorFees()`. A reverting creator contract therefore cannot
block winner claims, and the owner's `withdrawFees` cannot withdraw creator
liability.

The currently deployed PredictionMarket is not upgradeable. This source must be
deployed as a fresh contract. Existing markets stay on the old address and must
be allowed to finish, claim, or refund there; never pretend that storage moved.

## Pre-broadcast gate

Run the full contract suite and require it to pass:

```sh
cd contracts
forge test
```

Dry-run the deployment first with the normal reviewed role and cap variables.
`Deploy.s.sol` rejects any release fee other than `200` and verifies the
immutable 50% creator share:

```sh
forge script script/Deploy.s.sol:Deploy --rpc-url "$ROBINHOOD_MAINNET_RPC"
```

Only after reviewing the simulation, separately approve the same command with
`--broadcast --slow`. Record the new address and deployment block.

## Required post-deploy reads

```sh
cast call "$MARKET_ADDRESS" "feeBp()(uint256)" --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$MARKET_ADDRESS" "CREATOR_FEE_SHARE_BP()(uint256)" --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$MARKET_ADDRESS" "totalCreatorEarningsLiability()(uint256)" --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$MARKET_ADDRESS" "owner()(address)" --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$MARKET_ADDRESS" "endpointOracle()(address)" --rpc-url "$ROBINHOOD_MAINNET_RPC"
```

Expected values before use are `200`, `5000`, `0`, the reviewed owner, and the
reviewed shared oracle.

Configure all ten reviewed assets with
`ConfigurePredictionMarket.s.sol`; it also rejects the wrong fee or creator
share. Then dry-run and execute the two-market canary with the new
`MARKET_ADDRESS` environment variable. The canary verifies the separate creator
and protocol fee deltas plus unchanged cancellation refunds.

## Frontend and automation cutover

Do not publish the new frontend ABI against the old contract. After the canary:

1. Pause only new Prediction Market creation by setting
   `EVENT_SEEDER_MARKET_ENABLED=false` and restarting the existing event
   seeder. Race and Arena seeding continue normally. In disabled mode the
   seeder deliberately does not validate or touch the configured market
   address, so an old V1 value cannot take down the other two products. Do not
   stop the keeper: funded V1 positions must keep resolving.
2. Reconfigure the single Prediction Market keeper with V2 as its primary
   address and V1 as its settlement-only legacy address:

   ```sh
   PREDICTION_MARKET_ADDRESS=0xF62CF5Db594c4b706555584ccEC9Fb9a61541D4a
   MARKET_SCAN_FROM=0
   PREDICTION_MARKET_LEGACY_ADDRESS=0x4bfd0efc15C3198fe3AFf4741FF121AB2F38060e
   PREDICTION_MARKET_LEGACY_SCAN_FROM=0
   ```

   Keep the existing private-key and paid-RPC environment files unchanged.
   The process validates V2 code, fee `200`, creator share `5000`, signed
   oracle and all ten bindings. It separately validates the pinned V1 code,
   fee, oracle and bindings, then services both queues sequentially. Do not run
   two keeper processes with the same transaction key: concurrent processes
   can race the account nonce.
3. Start this combined keeper in dry-run, require both release gates to pass,
   then switch the same process to live mode and let it transition canary `#0`
   and `#1`. Dry-run and then separately broadcast the guarded finalizer.
4. Verify settlement, cancellation/refunds, winner payout, creator accrual,
   protocol accrual, and remaining contract liability from public reads.
5. Point the event seeder and share-preview service at V2. The seeder performs
   the same V2 compatibility gate and simulates its exact `createMarket` call
   even in dry-run before it can write. Set its expected oracle explicitly via
   `EVENT_SEEDER_MARKET_ORACLE_ADDRESS` (the Prediction Market or Asset Race
   signed-oracle variables remain accepted fallbacks). Only after those checks
   pass, set `EVENT_SEEDER_MARKET_ENABLED=true`.
6. Set `VITE_MARKET_ADDRESS` and `VITE_DEPLOY_BLOCK` to the recorded V2 values,
   build with `VITE_NATIVE_ETH_RELEASE=true`, and publish the frontend last.
7. Keep the explicit V1 settlement-only list/detail routes until every funded
   V1 market is terminal and all claims/refunds remain discoverable.
8. Create one tiny market through the public UI, fund both sides with two
   wallets, resolve, claim, verify the 50/50 accrual, and withdraw creator fees.

Before publishing anything, run the reproducible read-only gate:

```sh
npm run preflight:prediction-market-v2
```

It exits non-zero until both V2 canaries have completed exact lifecycle and
accounting checks and no V1 market is overdue while still open. Future-dated V1
markets do not block migration because the combined keeper continues to own
their lifecycle. The JSON output also lists every funded V1 market and the V1
contract balance, so legacy liabilities remain visible during the cutover.

If any gate fails, do not publish the frontend and do not let the seeder create
V2 markets. Leave V1 claim/refund access and its keeper running while the V2
service configuration is corrected. No storage or user balance is migrated
between the two addresses.

Never broadcast deployment, configuration, canary, or cutover transactions in
one combined command.

## Mainnet release record — 2026-10-01

- V2 contract: `0xF62CF5Db594c4b706555584ccEC9Fb9a61541D4a`
- Deployment transaction:
  `0x91857b9c0da189d52c49a7a33c78aeacbd9ea176b60367aad01859f911f1ca3f`
- Deployment block: `76951947`
- Ten reviewed stock assets configured and individually verified onchain.
- Canary markets: settlement `#0`, cancellation/refund `#1`.
- Canary deadline: `2026-10-01 01:17:59 UTC`.

The old native-ETH V1 remains at
`0x4bfd0efc15C3198fe3AFf4741FF121AB2F38060e`. It still holds funded user
positions, so its keeper and explicit claim/refund UI must remain available
after migration.

At the final cutover audit V1 had 43 markets: 3 resolved and 40 cancelled, with
no open markets. The final empty IDs #40–#42 were owner-voided only after a
guarded script verified their zero YES/NO pools. Four older markets had non-zero
historical pools and the contract still held `0.000776434080414848 ETH`, so V1
must not be shut down or hidden. New creation points only at V2; V1 remains
reachable solely for historical claims and refunds.

### Production cutover completed — 2026-10-01

The combined keeper resolved V2 canary #0 and cancelled #1. The guarded
finalizer paid `0.000198 ETH` to the winner, refunded `0.0002 ETH`, accrued
exactly `0.000001 ETH` to the creator and `0.000001 ETH` to Prophet, and left
the expected `0.000002 ETH` contract balance. The release gate passed before
public seeding. The VPS frontend and share-preview service now target V2, the
single keeper services V2 plus legacy V1 sequentially, and the unified event
seeder creates Prediction Markets, Asset Races and Price Arenas. The first
automated V2 markets were IDs #2–#4 (NVDA, TSLA and AAPL).
