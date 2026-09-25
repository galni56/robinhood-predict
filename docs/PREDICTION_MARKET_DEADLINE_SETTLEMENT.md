# Prediction Market deadline settlement

Status: native-ETH PredictionMarket is deployed and configured at
`0xe6C4aAf95f43E35Ef309eEa61bAfb345226333EB`; tiny-value canary and keeper/
frontend binding are pending. The earlier USDG contracts
`0x1a62098AcEd3F7F8C41fff1bc1395A541678b0F1` and
`0xd95ed19edBCd330498CADe7BA8569ac940A4182f` contain owner test activity only
and are unsupported/denylisted. See `NATIVE_ETH_MAINNET_DEPLOYMENT.md`.

## Price source and outcome rule

The replacement uses the same reviewed Robinhood Chain liquidity sources as
Asset Race: StockToken/USDG Uniswap V3/V4 pools from
`config/asset-race-assets.json`. It does not use the reference-stock Chainlink
feeds. Production is limited to the ten confirmed pool-backed assets:

`NVDA, TSLA, AAPL, META, MSTR, AMZN, MSFT, GOOGL, MU, NFLX`.

A market asks whether its tokenized-stock price is at or above the target at
the scheduled deadline. Settlement uses the pool state from the last Robinhood
block strictly before that deadline:

1. the price signer collects two consecutive canonical blocks around the
   deadline;
2. the first block timestamp must be before the deadline and its child must be
   at or after it;
3. both pool observations are signed as EIP-712 data for the deployed
   `SignedPoolRaceOracle`;
4. the oracle verifies the trusted signer's signatures, signed block linkage,
   timestamps, pool identity, positive prices, and decimals onchain;
5. `PredictionMarket` accepts the first block's price only when it is less than
   60 seconds before the deadline.

The market stores the accepted price, block timestamp, and block hash in
`settlements(marketId)`. Calling `resolve()` minutes or days later cannot select
a different price. A valid proof showing an endpoint older than 60 seconds
cancels the market and enables full refunds; a one-sided market cancels without
requiring an oracle proof. If no proof can be built at all, resolution remains
pending until the proof source recovers or the owner explicitly voids the market.

## Asset configuration

The owner maps each `bytes32 assetId` to one reviewed `oracleId` and decimal
scale through `setAssetAllowed`. Market creation is permissionless after that.
Every market freezes its asset id, pool oracle id, and decimals, so later owner
configuration changes cannot alter an open market.

The EVM cannot read arbitrary historical pool storage by block number. The
price signer is therefore a trusted data attester: it reads the reviewed pool
at the boundary blocks and signs the result. The transaction keeper only
relays that proof and cannot alter it, but a compromised or dishonest price
signer could attest false price or block metadata. Keeping the signer separate
from the funded keeper limits key exposure; it does not remove this trust
assumption.

The contract deliberately does not read a current DEX spot price during market
creation. The frontend uses the existing Asset Race LIVE service to show the
current pool price and enforce a recommended target range. This avoids adding a
second signed creation-price transaction, but means the target-range rule is UI
guidance rather than an onchain invariant. Approved assets, minimum duration,
stake cap, payout math, settlement, and refunds remain enforced onchain.

## Keeper

`scripts/prediction-market-keeper.mjs` reuses `PoolPriceEngine`,
`PoolEndpointCollector`, the archive RPC fallback, and the separate pool price
signer already used by Asset Race. It verifies the chain id, market/oracle
binding, oracle proof type, trusted signer, and every onchain
`assetId -> oracleId/decimals` binding against the exact ten-stock registry
before operating.

Required environment (root-only file outside the repository):

```text
PREDICTION_MARKET_RPC_URL=<lifecycle-rpc>
PREDICTION_MARKET_POOL_RPC_URL=<archive-rpc>
PREDICTION_MARKET_ADDRESS=<new-market-address>
PREDICTION_MARKET_CHAIN_ID=4663
PREDICTION_MARKET_POLL_INTERVAL_MS=5000
PREDICTION_MARKET_SIGNED_POOL_ORACLE_ADDRESS=0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7
PREDICTION_MARKET_KEEPER_PRIVATE_KEY=<transaction-keeper-key>
PREDICTION_MARKET_POOL_PRICE_SIGNER_PRIVATE_KEY=<price-signer-key>
PREDICTION_MARKET_ENDPOINT_CACHE_FILE=<outside-repo-path>
PREDICTION_MARKET_ALLOW_LIVE=false
DRY_RUN=true
RUN_ONCE=true
```

`PREDICTION_MARKET_RPC_URL` remains intentionally mandatory and does not fall
back implicitly to another variable. On the VPS, the lifecycle/pool variables
for all four services currently point to one paid Alchemy account instead of
public Robinhood or mixed free RPCs; logical service separation still remains.
`PREDICTION_MARKET_POOL_RPC_URL` may be omitted when that same endpoint supports
archive reads. The corresponding `ASSET_RACE_*` oracle,
keeper, and price-signer identities remain accepted as fallbacks so the
existing restricted VPS identities can be reused without copying secrets into
the repository.

The keeper reconciles all existing markets once at startup, then reads only
new markets and open markets whose deadline has arrived. Future markets are
scheduled in memory rather than reread on every poll. The five-second default
poll interval affects only how soon settlement is submitted after the deadline;
the signed proof still fixes the price at the exact deadline block boundary.

## Rollout gate

1. Simulate the native-ETH deployment with the existing SignedPoolRaceOracle
   and explicit wei caps. Do not configure a bet token, WETH wrapper or swap.
2. Configure the ten symbols/oracle IDs generated by
   `check-asset-race-registry.mjs --deployment-symbols` and
   `--deployment-oracle-ids`.
3. Verify contract constants, asset bindings, trusted signer, and bytecode.
4. Run keeper once with `DRY_RUN=true`, then test a small complete market.
5. Keep both USDG contract addresses in the native-binding denylist. The owner
   waived recovery for these owner-only mainnet tests; do not expose their ABI or
   keepers in the supported release.
6. Only after explicit approval deploy the native-ETH replacement and switch
   new frontend writes. Do not change keeper/VPS/nginx state as part of local work.

A read-only check on 2026-09-23 found a funded market at the older Chainlink
address. The owner confirmed it is their test activity and explicitly waived any
unclaimed value. The contract remains immutable onchain but unsupported.
