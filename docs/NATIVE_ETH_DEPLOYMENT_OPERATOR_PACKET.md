# Native ETH mainnet deployment operator packet

Status: **prepared procedure only; no broadcast, deployment, service change or
`main` merge is authorized by this document**.

Execution record: the separately authorized deploy/configure stages completed on
2026-09-25. See `NATIVE_ETH_MAINNET_DEPLOYMENT.md`. This packet still does not
authorize canary, service/frontend binding or `main` actions.

This is the canonical operator procedure for the native-ETH replacements. Run it
only from the exact reviewed release commit and only after the owner explicitly
approves real Robinhood Chain mainnet transactions. The required order is:

1. PredictionMarket deploy, configure and verify;
2. AssetRace deploy, configure and verify;
3. PriceArena deploy, configure and verify;
4. stop before any public binding, keeper change or canary transaction.

The existing `SignedPoolRaceOracle` is reused. Do not deploy another oracle, do
not use WETH as wager currency, and do not perform an ETH-to-USDG swap. USDG
remains only the quote unit of Stock settlement pools.

## Reviewed public configuration

| Role or limit | Reviewed value |
|---|---|
| Chain ID | `4663` |
| Owner/deployer | `0x6d68157bEDa778346Dd27f8Ef4F917f69aD2Dc41` |
| Shared signed-pool oracle | `0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7` |
| Expected oracle signer | `0x79F4991Ccc64Cbb8143fB61e4cBD49b8b64d3635` |
| Keeper transaction account | `0xaF95287026339B51b1Ff45DC385b4D56F507634a` |
| Protocol fee | `200` bp |
| Prediction seed cap | `100000000000000000` wei |
| Prediction stake cap per wallet/side | `100000000000000000` wei |
| Race minimum stake | `100000000000000` wei |
| Race maximum stake per wallet | `100000000000000000` wei |
| Arena minimum stake | `100000000000000` wei |
| Arena maximum stake | `100000000000000000` wei |

The owner, keeper and price signer are separate roles. The keeper is not used by
deployment scripts. Private keys and credential-bearing RPC URLs must remain in
an operator-owned environment outside the repository and must never be pasted
into a command, transcript, issue, chat or build log.

The known USDG contracts are unsupported historical tests and must never be
used as native bindings:

- PredictionMarket deadline: `0x1a62098AcEd3F7F8C41fff1bc1395A541678b0F1`
- PredictionMarket Chainlink: `0xd95ed19edBCd330498CADe7BA8569ac940A4182f`
- AssetRace: `0x63E582bb395527CED97F2F94662eA93A7EDf65Ff`
- PriceArena: `0xBAca2605914d8f7f0DF5663AA01f79FB8a6DA8ae`

## Gate 0: release and chain preflight

Record the exact commit, require a clean working tree, and confirm that it is the
reviewed release candidate. Do not deploy from an uncommitted or ad-hoc VPS tree.
The full Forge, invariant, Node, registry, build, lint and diff gates must be
green for that commit.

Use a shell variable whose value is loaded privately by the human operator. The
commands below intentionally show only the variable name:

```sh
git status --short --branch
git rev-parse HEAD
cast chain-id --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast code 0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7 --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call 0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7 \
  "TRUSTED_SIGNER()(address)" --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast balance 0x6d68157bEDa778346Dd27f8Ef4F917f69aD2Dc41 \
  --ether --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast gas-price --rpc-url "$ROBINHOOD_MAINNET_RPC"
```

Required results:

- chain ID is exactly `4663`;
- oracle code is non-empty;
- `TRUSTED_SIGNER()` is exactly the reviewed signer above;
- current owner balance safely covers freshly estimated deployment and
  configuration gas with an operator-approved margin.

Generate the public manifest from the registry and review all 10 Stock and 13
Meme bindings. Do not hand-maintain a second asset list:

```sh
node scripts/native-eth-deployment-caps.mjs
node scripts/native-eth-deployment-manifest.mjs \
  --owner-address 0x6d68157bEDa778346Dd27f8Ef4F917f69aD2Dc41 \
  --oracle-address 0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7 \
  --price-signer-address 0x79F4991Ccc64Cbb8143fB61e4cBD49b8b64d3635
node scripts/check-asset-race-registry.mjs
```

Re-estimate against the current block and gas price. The previous fork
simulation measured 15,414,910 gas across deployment and configuration, before
normal transaction overhead, over approximately 63 transactions. That number
is reproducibility evidence, not a current fee quote.

Stop if any public value, registry count, oracle identity, code hash, test gate,
chain ID or balance check differs from the reviewed release.

## Operator environment

The operator supplies secrets without printing them. All other values below are
public and must match the manifest. From the repository root, derive the asset
arrays from the registry:

```sh
export STOCK_SYMBOLS="$(node scripts/check-asset-race-registry.mjs --deployment-symbols)"
export STOCK_ORACLE_IDS="$(node scripts/check-asset-race-registry.mjs --deployment-oracle-ids)"
export MEME_SYMBOLS="$(node scripts/check-asset-race-registry.mjs --deployment-meme-symbols)"
export MEME_ORACLE_IDS="$(node scripts/check-asset-race-registry.mjs --deployment-meme-oracle-ids)"
```

Set these public values in the operator environment:

```sh
export EXPECTED_OWNER_ADDRESS=0x6d68157bEDa778346Dd27f8Ef4F917f69aD2Dc41
export SIGNED_POOL_ORACLE_ADDRESS=0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7
export PRICE_SIGNER_ADDRESS=0x79F4991Ccc64Cbb8143fB61e4cBD49b8b64d3635
export MAX_SEED_LIQUIDITY_WEI=100000000000000000
export MAX_STAKE_PER_SIDE_WEI=100000000000000000
export FEE_BP=200

export ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS="$SIGNED_POOL_ORACLE_ADDRESS"
export ASSET_RACE_PRICE_SIGNER_ADDRESS="$PRICE_SIGNER_ADDRESS"
export ASSET_RACE_MAX_PRICE_AGE=60
export ASSET_RACE_MAX_ENDPOINT_LAG=0
export ASSET_RACE_MAX_ORACLE_TIMESTAMP_SKEW=0
export ASSET_RACE_LOBBY_DURATION=300
export ASSET_RACE_BETTING_DURATION=300
export ASSET_RACE_START_GRACE=180
export ASSET_RACE_RESOLUTION_GRACE=300
export ASSET_RACE_FEE_BP=200
export ASSET_RACE_MIN_ACTIVE_CONTENDERS=2
export ASSET_RACE_MIN_STAKE_WEI=100000000000000
export ASSET_RACE_MAX_STAKE_PER_WALLET_WEI=100000000000000000
export ASSET_RACE_DURATION_PRESET_1=60
export ASSET_RACE_DURATION_PRESET_2=300
export ASSET_RACE_DURATION_PRESET_3=900
export ASSET_RACE_STOCK_SYMBOLS="$STOCK_SYMBOLS"
export ASSET_RACE_STOCK_ORACLE_IDS="$STOCK_ORACLE_IDS"
export ASSET_RACE_MEME_SYMBOLS="$MEME_SYMBOLS"
export ASSET_RACE_MEME_ORACLE_IDS="$MEME_ORACLE_IDS"

export PRICE_ARENA_MIN_STAKE_WEI=100000000000000
export PRICE_ARENA_MAX_STAKE_WEI=100000000000000000
```

`PRIVATE_KEY` is intentionally absent from this document. All three products use
that one owner/deployer key name; there is no second AssetRace deployer secret.
The operator loads the approved owner/deployer key from protected storage. The
scripts derive its public address and fail before broadcast unless it matches
`EXPECTED_OWNER_ADDRESS`.

Run Forge commands from `contracts/`. Every script is first simulated without
`--broadcast`. A successful simulation does not authorize its broadcast.

## Gate 1: PredictionMarket

Dry-run deployment:

```sh
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$ROBINHOOD_MAINNET_RPC"
```

Review the simulated address, owner, oracle, fee and both caps. Only after the
explicit transaction approval, rerun exactly the same release with:

```sh
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$ROBINHOOD_MAINNET_RPC" --broadcast --slow
```

Record the deployment transaction hash, block and new address as
`MARKET_ADDRESS`. Confirm it is not any denylisted USDG address. Before asset
configuration, verify:

```sh
cast code "$MARKET_ADDRESS" --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast codehash "$MARKET_ADDRESS" --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$MARKET_ADDRESS" "owner()(address)" --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$MARKET_ADDRESS" "endpointOracle()(address)" --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$MARKET_ADDRESS" "feeBp()(uint256)" --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$MARKET_ADDRESS" "maxSeedLiquidityWei()(uint256)" --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$MARKET_ADDRESS" "maxStakePerSideWei()(uint256)" --rpc-url "$ROBINHOOD_MAINNET_RPC"
```

Required runtime code hash for this exact release/configuration:
`0x89497de1953c2868c6f9a05bd08829dd18ca882b52db827469230dc24bc509c0`.

Export `MARKET_ADDRESS`, then dry-run and separately approve configuration:

```sh
export ASSET_SYMBOLS="$STOCK_SYMBOLS"
export ASSET_ORACLE_IDS="$STOCK_ORACLE_IDS"

forge script script/ConfigurePredictionMarket.s.sol:ConfigurePredictionMarket \
  --rpc-url "$ROBINHOOD_MAINNET_RPC"

forge script script/ConfigurePredictionMarket.s.sol:ConfigurePredictionMarket \
  --rpc-url "$ROBINHOOD_MAINNET_RPC" --broadcast --slow
```

The broadcast produces 10 asset-configuration transactions. Record every hash
and require every receipt to succeed. For each Stock symbol in the manifest,
read `approvedAssets(bytes32)(bytes32,uint8,bool)` and compare the exact oracle
ID, `18` decimals and `true` flag. Example shape:

```sh
cast call "$MARKET_ADDRESS" \
  "approvedAssets(bytes32)(bytes32,uint8,bool)" \
  "$(cast format-bytes32-string TSLA)" --rpc-url "$ROBINHOOD_MAINNET_RPC"
```

Stop here if any one of the 10 bindings differs. Do not continue to AssetRace.

## Gate 2: AssetRace

Dry-run deployment, then use the separately approved broadcast command:

```sh
forge script script/DeployAssetRace.s.sol:DeployAssetRace \
  --rpc-url "$ROBINHOOD_MAINNET_RPC"

forge script script/DeployAssetRace.s.sol:DeployAssetRace \
  --rpc-url "$ROBINHOOD_MAINNET_RPC" --broadcast --slow
```

Record the deployment transaction hash, block and new `ASSET_RACE_ADDRESS`.
Confirm it is not the denylisted USDG race. Verify non-empty code, runtime hash
`0x0d6f480489f52a24e95fd2f20b2277e4070df2a8f7cd81caa4258f2b5c3ef65d`
and exact owner before configuration:

```sh
cast code "$ASSET_RACE_ADDRESS" --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast codehash "$ASSET_RACE_ADDRESS" --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$ASSET_RACE_ADDRESS" "owner()(address)" --rpc-url "$ROBINHOOD_MAINNET_RPC"
```

Dry-run configuration, review all transactions, and only then run the separately
approved broadcast:

```sh
forge script script/ConfigureAssetRace.s.sol:ConfigureAssetRace \
  --rpc-url "$ROBINHOOD_MAINNET_RPC"

forge script script/ConfigureAssetRace.s.sol:ConfigureAssetRace \
  --rpc-url "$ROBINHOOD_MAINNET_RPC" --broadcast --slow
```

Configuration produces 23 asset transactions, one policy transaction and three
duration transactions. Record all 27 hashes and require successful receipts.
Verify:

```sh
cast call "$ASSET_RACE_ADDRESS" "communityPolicyConfigured()(bool)" \
  --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$ASSET_RACE_ADDRESS" \
  "communityPolicy()(uint64,uint64,uint64,uint64,uint64,uint16,uint8,uint256,uint256)" \
  --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$ASSET_RACE_ADDRESS" "getApprovedAssetIds()(bytes32[])" \
  --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$ASSET_RACE_ADDRESS" "approvedRaceDurations(uint64)(bool)" 60 \
  --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$ASSET_RACE_ADDRESS" "approvedRaceDurations(uint64)(bool)" 300 \
  --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$ASSET_RACE_ADDRESS" "approvedRaceDurations(uint64)(bool)" 900 \
  --rpc-url "$ROBINHOOD_MAINNET_RPC"
```

The policy tuple must be exactly
`300,300,180,300,0,200,2,100000000000000,100000000000000000` and the approved
asset array must contain exactly the manifest's 23 unique IDs. For every asset,
read
`approvedAssets(bytes32)(bool,bool,uint8,address,bytes32,uint8,uint64,uint64)`
and compare registered/enabled, category, shared oracle, exact oracle ID,
decimals `18`, max price age `60` and endpoint lag `0` with the manifest.

Stop here if any policy, duration or asset field differs. Do not continue to
PriceArena.

## Gate 3: PriceArena

Dry-run deployment, then use the separately approved broadcast command:

```sh
forge script script/DeployPriceArena.s.sol:DeployPriceArena \
  --rpc-url "$ROBINHOOD_MAINNET_RPC"

forge script script/DeployPriceArena.s.sol:DeployPriceArena \
  --rpc-url "$ROBINHOOD_MAINNET_RPC" --broadcast --slow
```

Record the deployment transaction hash, block and new `PRICE_ARENA_ADDRESS`.
Confirm it is not the denylisted USDG arena. Verify:

```sh
cast code "$PRICE_ARENA_ADDRESS" --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast codehash "$PRICE_ARENA_ADDRESS" --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$PRICE_ARENA_ADDRESS" "owner()(address)" --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$PRICE_ARENA_ADDRESS" "minStakeWei()(uint256)" --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$PRICE_ARENA_ADDRESS" "maxStakeWei()(uint256)" --rpc-url "$ROBINHOOD_MAINNET_RPC"
cast call "$PRICE_ARENA_ADDRESS" "FEE_BP()(uint256)" --rpc-url "$ROBINHOOD_MAINNET_RPC"
```

Required runtime code hash:
`0xfba5ab1762124133301d4398231b60e543206eb7244a251d603c3f73d616f47a`.
The limits must be exactly `100000000000000` and
`100000000000000000` wei; fee must be `200` bp.

Dry-run and separately approve configuration:

```sh
forge script script/ConfigurePriceArena.s.sol:ConfigurePriceArena \
  --rpc-url "$ROBINHOOD_MAINNET_RPC"

forge script script/ConfigurePriceArena.s.sol:ConfigurePriceArena \
  --rpc-url "$ROBINHOOD_MAINNET_RPC" --broadcast --slow
```

Configuration produces 23 asset transactions. Record all hashes and require
successful receipts. For every manifest asset, read
`approvedAssets(bytes32)(address,bytes32,uint8,uint8,bool)` and compare the
shared oracle, exact oracle ID, decimals `18`, category and enabled flag. Stop
if any field differs.

## Gate 4: deployment record and hard stop

After all three products pass their read-only checks, record in a reviewed
deployment report:

- release commit and compiler/tool versions;
- current block and gas price used for estimates;
- all 63 transaction hashes, receipt blocks and deployed addresses;
- runtime code hashes, owner, oracle/signer identity, fees and caps;
- the generated public manifest and exact 10/23/23 asset verification results;
- total gas and actual native ETH spent.

At this point do **not** update frontend environment values, keeper addresses,
systemd services, nginx, DNS, GitHub Pages or `main`. Do not create a market,
race or arena. Those are separate production gates.

## Following gates (not authorized by deployment approval)

1. Approve and execute tiny-value end-to-end lifecycles separately for each new
   contract, including entry, keeper transition, resolve or cancel, and claim or
   refund. Check exact ETH accounting and emitted events after every action.
2. Prepare one production-binding diff containing only the verified native
   addresses. Rebind the existing three lifecycle keepers; do not run parallel
   USDG keepers. Keep the existing live-price service and the single paid
   Alchemy routing without exposing credentials.
3. Build and visually verify the production-shaped frontend on desktop and
   mobile. Every wager must be one payable wallet transaction with no approval.
4. With explicit approval, merge the exact canary commit to `main` and deploy
   only from `/opt/robinhood-predict`. Never repoint nginx to an ad-hoc build.
5. Observe the first live lifecycles and RPC/SSE/keeper health. On an anomaly,
   stop new activity and roll back public frontend/service bindings; never bind
   the UI or keepers back to the denied USDG contracts.
