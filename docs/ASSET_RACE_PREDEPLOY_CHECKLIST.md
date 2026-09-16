# Asset Race pre-deployment readiness — 2026-09-16

No deployment, public transaction, production keeper or secret access performed.
Intended production RPC/operator configuration was not supplied to this process.
Only environment-variable presence was checked; `.env`/secret stores were not read.
Absence here does not establish absence in operator infrastructure. Local E2E
remains green and was not rerun: changes are startup/config/tooling checks only.

## A. Already verified

- Registry: 10 unchanged Stocks +13 approved Memes: AI, CASHCAT, CHUMP, PIPEDOG,
  IF, TENDIES, BONER, JUGGERNAUT, MOO, FRONG, HOOD, BLORB, DOGO.
  Nine V3/WETH, four hook-free V4/native; exact configurations in catalog review.
- All13 local fixture lifecycles passed previously; ETH_QUOTE/18, decimals/
  orientation, MAX6, frozen common predecessor blocks, scoring and indefinite
  claims/refunds unchanged. This is not intended-provider archive evidence.
- Deployment/collector/oracle ABI and EIP712 domain agree. Deploy receives public
  ASSET_RACE_PRICE_SIGNER_ADDRESS; Configure checks deployed TRUSTED_SIGNER.
  Keeper now verifies actual onchain signer and signed-pool adapter at startup.
- LIVE now checks actual RPC chain ID, logs startup error types only, and exposes
  a generic public SSE failure rather than credential-bearing RPC error messages.
- Mainnet-bound builds require separate nonzero race/oracle addresses; unknown
  networks fail. Default unconfigured builds retain explicitly labelled previews
  and are NOT production Asset Race release builds.
- Frontend: central JSON -> assetRaceCatalogById -> getApprovedAssetIds /
  approvedAssets -> approvedAssetMatchesCatalog -> picker. All13 central entries
  exist; exposure requires matching onchain registration, adapter, decimals18,
  age60/lag0. FRONG keeps exact native source and ETH label. RUNNING missing/stale
  LIVE does not invent mock/underlying prices; Mock reads require local mode.
- 50 JS tests passed (26 engine/endpoint/native, 7 keeper, 12 LIVE/display,
  5 configuration/archive-option), registry, build/typecheck, lint, syntax/diff.
  Existing lint/bundle warnings remain. No Solidity changed; no Solidity suite
  rerun. Prior local Solidity/E2E validation remains historical green evidence.
  Explicit-mainnet empty-address integration build failed as expected before
  bundling; that is the fail-closed guard check, not a code failure.

## B. Operator values/secrets still needed

| Input | Where / constraint |
| --- | --- |
| Intended server RPC, access and retention/SLA | ASSET_RACE_RPC_URL (keeper), ASSET_RACE_POOL_RPC_URL (LIVE) |
| Foundry RPC alias | ROBINHOOD_MAINNET_RPC, for separately authorized operator deployment |
| Dedicated price signer public address | ASSET_RACE_PRICE_SIGNER_ADDRESS; not deployer/keeper |
| Private price signer material | ASSET_RACE_POOL_PRICE_SIGNER_PRIVATE_KEY, server-managed environment only |
| Deployer/owner private material | ASSET_RACE_DEPLOYER_PRIVATE_KEY, operator-only deployment process |
| Separate keeper gas signer | ASSET_RACE_KEEPER_PRIVATE_KEY, server-managed; no unlocked public RPC account |
| Settlement token | ASSET_RACE_BET_TOKEN_ADDRESS = canonical USDG in central mainnet registry |
| Policy/presets | Existing approved economics and runbook timing/preset inputs; age60/lag0/skew0 |
| Frontend public routing | VITE_RPC_URL public URL or same-origin proxy; VITE_BASE_PATH matched to host |
| LIVE hosting/proxy | Same-origin /api/asset-race/live; VITE_ASSET_RACE_LIVE_URL if overriding |

Checked RPC/signer/contract/frontend variables were all absent from this process.
Actual race/oracle addresses are deployment outputs, never guessed. Private keys/
RPC credentials must not enter Git, CLI arguments, logs or VITE_ variables:
VITE_ values are public in the browser bundle. The agent must not handle keys.

### Archive coverage: BLOCKED for all13

AI, CASHCAT, CHUMP, PIPEDOG, IF, TENDIES, BONER, JUGGERNAUT, MOO, FRONG,
HOOD, BLORB, DOGO: current/multiple historical reads using the intended provider
are NOT VERIFIED. Missing: intended endpoint/access, retention commitment and
actual grace/lookback requirements. Public defaults were not substituted;
earlier public-RPC evidence does not qualify the intended production provider.

Operator supplies a non-secret endpoint/proxy, then run this read-only probe:

```sh
npm run check:asset-race-meme-pools -- --archive-only --enabled-only --rpc-url <non-secret-intended-rpc-or-proxy> --lookback-seconds 60,300,600,3600
```

New archive-only mode uses approved sources and checks current plus historical
E/B prices, decimals/orientation and V3 factory or V4 key/source identity.
It exercises production-style HTTP JSON-RPC batching; no quote/depth analysis,
liquidity policy or --quote-usd is required. Probe was not run without intended RPC.
Sample lookbacks cover runbook grace180/300 plus margin/headroom; adjust to actual
maximum graces. Credentialed providers need an operator-managed non-secret proxy
for this CLI: never pass secret-bearing URLs as arguments.

Required capabilities: chain4663; latest/historical block headers/hash/parent/
timestamp (binary search may query headers far older than grace); historical
eth_call for ERC20 decimals, V3 metadata/factory/slot0 and V4 StateView getSlot0;
complete JSON-RPC batch responses. Native ETH is literal18, no ERC20 call.
All assets use common canonical endpoint/boundary blocks. Quoter/swap access is
not required for runtime settlement. Success is sampled evidence, not an SLA;
monitor retention/availability. Apply existing Stock probe to unchanged Stocks.

### Signer/keeper readiness

- TRUSTED_SIGNER is immutable; no in-place rotation. New signer means new oracle
  and owner-approved future configuration. Frozen races retain old oracle; keep
  old signer available until endpoints captured or races cancel/void. Captured
  endpoints and later claims require no signing key. No concrete address supplied.
  Each keeper has one configured oracle: during migration use separate old/new
  oracle workers with distinct gas EOAs until old races no longer need proofs.
- Production requires RPC+race address, ASSET_RACE_CHAIN_ID=4663, signed oracle
  address+price key, separate keeper key, POLL_INTERVAL_MS=1000, RACE_SCAN_FROM=0.
  ASSET_RACE_ALLOW_LIVE=true only after new public-write authorization.
- DRY_RUN=true sends nothing; RUN_ONCE=true polls once. Signed endpoint simulation
  still needs price credentials; operator runs outside agent. Per-race failures
  continue, so RUN_ONCE exit0 alone is not proof all transitions succeeded.
- LOBBY opens/cancels; BETTING starts/cancels; RUNNING captures then resolves or
  voids when uncaptured/expired. Submissions permissionless; only signed P0/P1
  proof generation needs trusted price key. Asset/policy admin requires owner.
- Simulate before submission; per-race/poll failures retry later and do not stop
  other races. Startup config/source failures stop process: supervise/restart.
  Receipt waits/scanning serialized; 1s delay is not guaranteed 1s cycle latency.
- Restart re-reads chain status; no proof database dependency. Do not skip active
  races with scanFrom; monitor pending transactions/nonce state after crashes.
- Duplicate transitions cannot overwrite endpoints/terminal states. Redundant
  separate gas EOAs can revert/spend gas benignly. No cross-process nonce lock:
  use one active worker per gas EOA. Multiple bots are not winner authorities.

## C. During deployment — separately authorized operator only

- Confirm chain/owner, canonical USDG, compiler output and public signer; never
  reuse the existing PredictionMarket address. Deploy existing oracle/race scripts.
- Record ASSET_RACE_ADDRESS and ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS outputs;
  verify deployed TRUSTED_SIGNER equals the intended public address.
- Derive Stock/Meme arrays from registry CLI, not copied source catalogs. Meme
  arrays REQUIRED for this release although script permits omission. Register
  all10 Stocks+13 Memes with matching age60/lag0/skew0 and approved policy/presets.

## D. Immediately after deployment

- Read-check code/chain4663/owner/USDG/signer and all23 asset IDs/categories/
  adapters/decimals/profiles, policy and duration presets against central config.
- Re-run monitored archive probes including FRONG; retain evidence.
- Supply frontend race/oracle addresses, explicit mainnet network, public RPC
  and LIVE routing; rebuild. Confirm all13 picker entries, ETH label and no previews.
- Operator-only dry run: inspect valid exact endpoint proofs/failures and signer
  check, not only exit code. Keep writes off until separately authorized.
- LIVE binds loopback; same-origin SSE proxy disables buffering/cache. External
  URLs require explicitly working CORS. Verify service restart, stale behavior,
  RPC/archive/nonce/endpoint/scan-latency monitoring before public races.

## E. Optional public-chain rehearsal

Not configured/authorized. Testnet has zero approved sources and production
pool keeper requires4663: changing only chain ID is not a valid rehearsal.
Requires separately approved testnet fixture/catalog/collector plan. A mainnet
rehearsal uses real funds and needs distinct explicit authority. Local fixtures
do not verify intended public provider/deployed-address wiring.

## Verdict / next exact step

Preparation code/guards are green, but archive coverage and actual operator/
deployed-address wiring are unverified. Secrets/addresses alone are insufficient
for production sign-off until intended-provider and post-deploy read checks pass.
Next: operator supplies non-secret intended RPC/proxy reference, retention/grace
requirements and public signer address; run read-only all13 archive probe. Never
request private-key contents or infer deployment/broadcast authorization.
