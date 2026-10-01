# Complete Asset Types Release

## Scope

This release makes Stocks, Memes and Crypto available in Prediction Markets,
Asset Races and Price Arena at the same coordinated cutover. The first reviewed
Crypto assets are Bitcoin and Ethereum. Race categories never mix.

## Reviewed mainnet sources

Both assets use deterministic Robinhood Chain pool snapshots with 18-decimal
normalized output. Live display and deadline settlement use the same frozen
pool identity.

| Asset | Onchain base | Quote | Protocol | Pool |
| --- | --- | --- | --- | --- |
| BTC | cbBTC `0xCEC185eB182c47d1bA1EFc84e6959e18cd620Be4` | USDG | Uniswap V4 | `0x94c62eebf6454231b2fcd0259ede448ae3c6ad8617718cd88dab20b30cfae48a` |
| ETH | WETH `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | USDG | Uniswap V3 | `0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca` |

BTC is the product symbol shown to users. Its reviewed onchain representation
is cbBTC. ETH uses WETH as its reviewed pool representation. Stakes and payouts
remain native ETH; USDG is only the price quote.

## Contract compatibility

PredictionMarket does not store a category enum. Its current implementation can
support all 25 reviewed assets after the owner adds the 13 Meme and 2 Crypto
asset/oracle bindings. Meme targets are ETH-denominated; Stock and Crypto
targets are USDG-denominated.

AssetRace V2 and PriceArena V2 encode only `STOCK = 0` and `MEME = 1` in their
deployed bytecode. The source in this release adds `CRYPTO = 2`, so production
requires new AssetRace and PriceArena deployments before the Crypto UI is
enabled. Existing V2 addresses must remain available for old claims and refunds.

## Mainnet release bindings

- PredictionMarket: `0xF62CF5Db594c4b706555584ccEC9Fb9a61541D4a`
- AssetRace: `0xebA246E4B548b93079Bf4D85faA50fa8b7Ff9c6e`
  (deployed at block `77663890`)
- PriceArena: `0x541be0c7c1011a63465Ff53408e9F76DA870b29f`
  (deployed at block `77664309`)
- Signed pool oracle: `0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7`

All 25 reviewed bindings were verified onchain on 2026-10-01. Both replacement
contracts are unpaused and preserve the 2% losing-pool protocol fee with half
of that fee accruing to the creator.

## Zero-downtime production rollout

The current V2 site, seeder and keepers remain unchanged while the new
AssetRace and PriceArena deployments are prepared. No existing contract is
paused, disabled or removed.

Both release switches are fail-closed and default to `false`:

- `VITE_ALL_ASSET_TYPES_ENABLED=false` keeps the coordinated expanded UI hidden
  while the site is still bound to V2.
- `EVENT_SEEDER_ALL_ASSET_TYPES_ENABLED=false` prevents automatic Meme and
  Crypto creation while the seeder still targets V2.
- `PREDICTION_MARKET_ALL_ASSET_TYPES_ENABLED=false` keeps the market keeper on
  the existing 10 Stock bindings until all 25 PredictionMarket bindings have
  passed read-only verification.

1. Deploy the updated AssetRace and PriceArena contracts without changing any
   production frontend or automation address.
2. Configure the same signed pool oracle, the 10 Stocks, 13 Memes and 2 Crypto
   assets, all existing policy values and duration presets.
3. Add the 13 Meme plus BTC and ETH bindings to PredictionMarket. Existing
   Prediction Markets continue on the same compatible contract. Verify the
   complete registry with `npm run preflight:prediction-market-v2 -- --all-asset-bindings`.
   Generate the exact configuration arrays with
   `node scripts/check-asset-race-registry.mjs --deployment-all-symbols` and
   `node scripts/check-asset-race-registry.mjs --deployment-all-oracle-ids`.
4. Run the no-broadcast deployment simulation, contract tests and read-only
   postcondition checks against the new addresses.
5. Run a dry keeper cycle against the new contracts. After all 25 market
   bindings verify, set `PREDICTION_MARKET_ALL_ASSET_TYPES_ENABLED=true`. Do not
   create automatic expanded-category events until all product simulations pass.
6. During the short automation cutover, stop only the old keeper processes and
   event seeder. Do not stop the website. Start the updated keepers with the new
   address as active and current V2 as legacy:
   - `ASSET_RACE_ADDRESS=<new>`
   - `ASSET_RACE_LEGACY_ADDRESSES=0x98f9af1756148c8995729E9ccEA770fd15124bC9`
   - `PRICE_ARENA_ADDRESS=<new>`
   - `PRICE_ARENA_LEGACY_ADDRESSES=0x8c1c5544E00C2f8ea2C564B179CdEB38504805d5`
   - `PRICE_ARENA_ACTIVE_SUPPORTS_CRYPTO=true`
7. Point the event seeder only at the new active addresses. It must never create
   new events on a legacy deployment.
8. Switch the frontend to the new exact addresses only after the combined
   keepers are healthy, then set `VITE_ALL_ASSET_TYPES_ENABLED=true`. Legacy V2
   claims and refunds remain available through the legacy routes.
9. Enable automatic Meme and Crypto targets last, after one manually created
   game of each category in each mode completes through settlement, by setting
   `EVENT_SEEDER_ALL_ASSET_TYPES_ENABLED=true`.

The combined Race and Arena keepers poll active and legacy deployments in one
process and submit transactions sequentially with one transaction signer. This
avoids competing processes and nonce collisions while current V2 games finish.

## Rollback

If the new release fails after the frontend switch, point the frontend and event
seeder back to the current V2 addresses. Keep the combined keepers running with
both deployments so already-created games on either generation still settle.
Claims and refunds have no artificial expiry, and old deployments must remain
reachable even after all automatic creation moves to the new contracts.

The replacement mainnet contracts and all 25 bindings are deployed. The
frontend and automation switch remains a separate atomic production operation.
