# Project Map

Prophet is a prediction-market frontend with real-chain and browser-only demo
modes. Existing PredictionMarket functionality is live on Robinhood Chain
mainnet (4663), uses real funds and has no external audit. Asset Race work is
separate; configured production sources do not imply a deployed race environment.

React/TypeScript/Vite frontend, wagmi/viem chain access, Foundry contracts.
There is no general application-backend framework: server-side race functionality
is implemented as small Node scripts/services. Mock demo state stays in-browser.

Current code/Git are authoritative. Counts, pending work and validation belong
in HANDOFF, not this map. Read AGENTS for permissions and startup rules.

## Areas and entry points

| Area | Principal paths/files |
| --- | --- |
| Frontend bootstrap/routes | `src/main.tsx`, `src/App.tsx` |
| Real-chain pages | `src/pages/Onchain*.tsx`; races: `OnchainRacesListPage.tsx`, `OnchainRacePage.tsx`, `OnchainCreateRacePage.tsx` |
| Race UI | `src/components/AssetRaceLeaderboard.tsx`, `AssetRaceLiveView.tsx` |
| Chain configuration | `src/chain/config.ts`, `src/chain/contracts.ts` |
| Race reads/writes | `src/chain/assetRaces.ts`, `useAssetRace.ts`, `useApprovedRaceAssets.ts` |
| Central asset/source registry | `config/asset-race-assets.json`, `src/chain/assetRaceRegistry.ts` |
| Race lifecycle/economics | `contracts/src/AssetRace.sol` |
| Existing market/nicknames | `contracts/src/PredictionMarket.sol`, `NicknameRegistry.sol` |
| Oracle contract interface | `contracts/src/interfaces/IAssetRaceOracle.sol` |
| Current signed-pool verifier | `contracts/src/oracles/SignedPoolRaceOracle.sol` |
| Other oracle adapters | `contracts/src/oracles/ChainlinkV3RaceOracle.sol`, `SignedRobinhoodRaceOracle.sol` |
| Local mock oracle | `contracts/src/mocks/MockRaceOracle.sol` |
| Shared direct-pool pricing | `scripts/asset-race-pool-price-engine.mjs` |
| Historical endpoint selection/collection | `scripts/asset-race-pool-endpoints.mjs` |
| Other signed observations | `scripts/asset-race-stock-observations.mjs` |
| Lifecycle automation | `scripts/asset-race-keeper.mjs` |
| LIVE collection/service | `scripts/asset-race-live-prices.mjs`, `asset-race-live-server.mjs` |
| LIVE frontend/display math | `src/chain/useAssetRaceLiveDisplay.ts`, `assetRaceLiveDisplay.ts` |
| Registry/runtime market review | `scripts/check-asset-race-registry.mjs`, `check-asset-race-stock-pools.mjs`, `check-asset-race-meme-pools.mjs` |
| Read-only executable quotes | `scripts/asset-race-pool-quotes.mjs` |
| Browser-only simulation | `src/store/`, `src/market/`, `src/components/ChainEngine.tsx` |
| Contract tests | `contracts/test/`, `contracts/test/helpers/` |
| Script/display tests | `scripts/*.test.mjs` |
| Local setup | `contracts/local-demo.sh`, `contracts/script/LocalAssetRace.s.sol` |
| Race local transaction E2E | `scripts/asset-race-stock-e2e.mjs` (Stock and Meme modes) |
| Race deployment/configuration | `contracts/script/DeployAssetRace.s.sol`, `ConfigureAssetRace.s.sol` |
| Build configuration | `vite.config.ts`, `package.json`, `contracts/foundry.toml` |

## Pricing and settlement pointers

Approved race pricing uses frozen DEX sources and signed historical endpoint
block pairs. The signed-pool adapter authenticates configured signer attestations;
it is not a general onchain proof of arbitrary historical pool state.
Stocks quote USDG; Memes use canonical WETH or approved V4 native ETH, normalized
to ETH_QUOTE. Exact token/PoolKey/quote representation remains source-bound.
LIVE is provisional display, not a settlement price authority. Consult the pool
engine, endpoint collector, signed-pool adapter and related tests for changes.
Economics and irreversible snapshots live in AssetRace; automation lives in keeper.

## Existing commands

From repository root (dependencies already installed; installation requires permission):

```sh
npm run dev
npm run build                 # tsc -b followed by Vite build
npm run lint
npm run preview
npm run check:asset-race-registry
npm run test:asset-race-collector
npm run test:asset-race-keeper
npm run test:asset-race-live
```

No dedicated npm typecheck or aggregate test script exists. Build includes
typechecking; run the relevant test commands, not an invented `npm test`.

From `contracts/` (Foundry binaries may require `~/.foundry/bin` on PATH):

```sh
forge build
forge test
forge test --match-contract 'AssetRace.*'
forge test --match-contract SignedPoolRaceOracleTest
forge test --match-contract AssetRaceInvariantTest
```

Configuration-dependent runtime commands (check scope/authorization first):

```sh
npm run keeper:asset-race
npm run live:asset-race
npm run e2e:asset-race-stock
npm run e2e:asset-race-meme
npm run check:asset-race-stock-pools
npm run check:asset-race-meme-pools
```

Review checker commands are read-only; E2E/tooling may transact on local Anvil.
Do not infer external-chain authorization from a command's existence. Read the
runbook/local script before execution; never inspect secret/.env contents.

## Documentation instead of rediscovery

- `CLAUDE.md`: authoritative product overview and operating cautions.
- `README.md`: mock/demo architecture only; not a description of real mode.
- `ROADMAP.md`: product history and explicitly deferred work.
- `contracts/CLAUDE.md`: contract workflow and legacy deployment detail;
  its dated status/test counts predate Asset Race work.
- `docs/ASSET_RACE_PRODUCTION_RUNBOOK.md`: signed-pool deployment/keeper setup,
  timing, launch checklist and trust/spot-manipulation cautions.
- `docs/ASSET_RACE_LIVE_DISPLAY.md`: direct-pool LIVE, display anchors/fallback.
- `docs/ASSET_RACE_STOCK_POOL_REVIEW.md`: Stock identities, pools and evidence.
- `docs/ASSET_RACE_MEME_POOL_REVIEW.md`: original approved Meme pool evidence.
- `docs/ASSET_RACE_MEME_CATALOG_EXPANSION.md`: previous expansion review.
- `docs/ASSET_RACE_TARGETED_MEME_REVIEW.md`: partial native-ETH expansion evidence.

## Sensitive areas

Payout/liability/fee accounting; endpoint lineage/common blocks; signer trust;
canonical token/pool bindings; decimals/orientation; production enablement;
claim/refund semantics; deployments and existing live PredictionMarket behavior.
Honor AGENTS authorization rules; preserve the actual dirty working tree.
