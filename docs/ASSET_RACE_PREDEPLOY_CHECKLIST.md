# Asset Race deployment readiness and launch record — 2026-09-22

> Historical USDG-generation record. The deployed address in this document is
> not ABI/payment-compatible with the native-ETH successor. Never bind the new
> payable frontend to it; use `/onchain/legacy` for old claims/refunds.

The operator deployed and configured Asset Race on Robinhood Chain mainnet after
separate dry runs and explicit transaction authorization. Private material stayed
in operator-owned external environment files and was never read or recorded by
the agent. The production keeper, LIVE service and frontend binding are not live
yet; no race has been created.

## A. Already verified

- Registry: 10 unchanged Stocks +13 approved Memes: AI, CASHCAT, CHUMP, PIPEDOG,
  IF, TENDIES, BONER, JUGGERNAUT, MOO, FRONG, HOOD, BLORB, DOGO.
  Nine V3/WETH, four hook-free V4/native; exact configurations in catalog review.
- All13 local fixture lifecycles passed previously; ETH_QUOTE/18, decimals/
  orientation, MAX6, frozen common predecessor blocks, scoring and indefinite
  claims/refunds unchanged. This is not intended-provider archive evidence.
- Deployment/collector/oracle ABI and EIP712 domain agree. Deploy receives public
  ASSET_RACE_PRICE_SIGNER_ADDRESS; Configure checks deployed TRUSTED_SIGNER.
  Deploy/Configure reject signer=deployer/owner. Keeper verifies the actual
  onchain signer/adapter and rejects any owner/keeper/price-signer overlap.
- LIVE now checks actual RPC chain ID, logs startup error types only, and exposes
  a generic public SSE failure rather than credential-bearing RPC error messages.
- LIVE uses canonical Multicall3 for one common-block pool read, starts polling
  on the first SSE viewer, polls every two seconds and pauses at zero viewers.
  Keeper performs one startup reconciliation, then reads only new races and
  active races whose transition is due.
- Timely T0/T1 capture now tries the public lifecycle RPC first with a near-tip
  backward search. Proofs are atomically cached outside Git at mode0600 and reused
  after retries/restarts. Alchemy is a 150 ms-paced recovery path with bounded
  429 backoff, not a LIVE source; identical concurrent work is deduplicated.
- Mainnet-bound builds require separate nonzero race/oracle addresses; unknown
  networks fail. Default unconfigured builds retain explicitly labelled previews
  and are NOT production Asset Race release builds.
- Frontend: central JSON -> assetRaceCatalogById -> getApprovedAssetIds /
  approvedAssets -> approvedAssetMatchesCatalog -> picker. All13 central entries
  exist; exposure requires matching onchain registration, adapter, decimals18,
  age60/lag0. FRONG keeps exact native source and ETH label. RUNNING missing/stale
  LIVE does not invent mock/underlying prices; Mock reads require local mode.
- 70 Asset Race JS tests passed across engine/endpoint/native, keeper,
  LIVE/display, cache, RPC-budget and configuration paths; registry,
  build/typecheck, lint, syntax/diff also passed.
  Existing lint/bundle warnings remain. No Solidity changed; no Solidity suite
  rerun. Prior local Solidity/E2E validation remains historical green evidence.
  Explicit-mainnet empty-address integration build failed as expected before
  bundling; that is the fail-closed guard check, not a code failure.
- Operator-run Alchemy Robinhood Mainnet probes passed all 10 enabled Stocks and
  all 13 enabled Memes at current plus 60/300/600/3600-second lookbacks. Every
  sampled historical endpoint had its consecutive boundary block; configured
  V3/V4 reads and native-V4 FRONG succeeded. This is sampled capability evidence,
  not a provider availability or retention SLA.
- Operator-run `cast chain-id` returned 4663 and `DeployAssetRace` completed a
  no-broadcast simulation with the approved signer and canonical USDG. Sampled
  estimate: 7,213,211 gas and 0.000856294711445211 ETH. The printed oracle/race
  addresses are simulation-only and must not be used as deployed configuration.
- Removed-oracle artifacts were cleared; a clean 76-file Forge build and all 145
  Solidity tests pass. Invariants completed 256 runs/128,000 calls with zero
  unexpected reverts; fuzz tests pass.
- Deployed `SignedPoolRaceOracle` at
  `0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7` in transaction
  `0x7fd876c5b87a2ace05da3585ce0d258ec7e3b8ceb11dbece3c8465b0b8f9d0c0` and
  `AssetRace` at `0x63E582bb395527CED97F2F94662eA93A7EDf65Ff` in transaction
  `0xd5effcf246df0988b33752a1bfc0b3e4060e1e06349631e178b9314ecee578b2`.
  Both receipts have status1 and deployed bytecode. Deployment paid
  `0.000321449684798 ETH`.
- The owner configured all10 Stocks+13 Memes, policy and 60/300/900-second
  duration presets in 27 successful transactions, paying
  `0.00019117456959 ETH`. Read-only post-deploy verification found all23 registry
  entries exact: correct category, shared adapter, oracle ID, decimals18,
  age60/lag0. Policy is lobby300, betting300, start grace180, resolution
  grace300, skew0, fee200 bp, minimum2 contenders, stake range1-50 USDG.
  `communityPolicyConfigured=true`, `newActivityPaused=false`, `raceCount=0`.
- A production-shaped frontend build passed with the deployed bindings,
  mainnet network, `/api/rpc/` and `/api/asset-race/live`; registry validation
  remains 29 total/local, 0 testnet and 23 mainnet-enabled assets.
- Operator-run keeper startup passed with chain4663, the deployed race/oracle,
  separate keeper and price-signer keys, and the archive RPC loaded from the
  external secret file. `DRY_RUN=true RUN_ONCE=true` exited cleanly with
  `raceCount=0`; it sent no transaction and spent no ETH.
- Explorer source publication has not been recorded. Receipt status, deployed
  bytecode and runtime ownership/token/signer/configuration were verified; source
  publication is a separate remaining transparency step if the chain explorer
  supports it.

## B. Operator values/secrets still needed

| Input | Where / constraint |
| --- | --- |
| Public lifecycle RPC | ASSET_RACE_RPC_URL (keeper); public Robinhood endpoint for zero-cost MVP |
| Free archive RPC | ASSET_RACE_POOL_RPC_URL (Alchemy recovery-only; sampled pass) |
| Archive pacing | ASSET_RACE_ARCHIVE_MIN_INTERVAL_MS=150; minimum 50 ms is enforced |
| Realtime window | ASSET_RACE_REALTIME_ENDPOINT_WINDOW_SECONDS=30; older endpoints skip public RPC |
| Endpoint cache | ASSET_RACE_ENDPOINT_CACHE_FILE; outside Git, service-only, mode0600 |
| LIVE RPC | ASSET_RACE_LIVE_RPC_URL; public Robinhood endpoint, demand-driven Multicall3 |
| Foundry RPC alias | ROBINHOOD_MAINNET_RPC, for separately authorized operator deployment |
| Owner/deployer public address | Confirmed: `0x6d68157bEDa778346Dd27f8Ef4F917f69aD2Dc41` |
| Keeper public address | Confirmed: `0xaF95287026339B51b1Ff45DC385b4D56F507634a`; distinct from owner |
| Dedicated price signer public address | Confirmed: `0x79F4991Ccc64Cbb8143fB61e4cBD49b8b64d3635`; distinct from owner/keeper |
| Private price signer material | ASSET_RACE_POOL_PRICE_SIGNER_PRIVATE_KEY, server-managed environment only |
| Deployer/owner private material | ASSET_RACE_DEPLOYER_PRIVATE_KEY, operator-only deployment process |
| Separate keeper gas signer | ASSET_RACE_KEEPER_PRIVATE_KEY, server-managed; no unlocked public RPC account |
| Settlement token | ASSET_RACE_BET_TOKEN_ADDRESS = canonical USDG in central mainnet registry |
| Policy/presets | Existing approved economics and runbook timing/preset inputs; age60/lag0/skew0 |
| Frontend public routing | VITE_RPC_URL public URL or same-origin proxy; VITE_BASE_PATH matched to host |
| LIVE hosting/proxy | Same-origin /api/asset-race/live; VITE_ASSET_RACE_LIVE_URL if overriding; Pages disables LIVE until a CORS-safe endpoint exists |

Owner/deployer, keeper and price-signer public addresses are confirmed above and
pairwise distinct. Contract addresses are confirmed above. The historical GitHub
Pages build once had explicit USDG mainnet bindings; the native-ETH branch removes
them until new contracts are deployed. Secret-bearing runtime values remain
absent from the repository and agent process.

The operator reports that keeper and price-signer private keys are stored in the
external mode-`0600` secret file. Their contents were not read by the agent and
operator-run public-address derivation returned `OK` for both roles. The
separately stored owner/deployer key also passed its operator-run address check.
No private material was supplied to or read by the agent.
Actual race/oracle addresses are deployment outputs, never guessed. Private keys/
RPC credentials must not enter Git, CLI arguments, logs or VITE_ variables:
VITE_ values are public in the browser bundle. The agent must not handle keys.

### Archive coverage: SAMPLED PASS for all23

On 2026-09-22, using the operator-held Alchemy Robinhood Mainnet endpoint, all
10 enabled Stocks and these 13 Memes passed current and 60/300/600/3600-second
historical reads: AI, CASHCAT, CHUMP, PIPEDOG, IF, TENDIES, BONER, JUGGERNAUT,
MOO, FRONG, HOOD, BLORB, DOGO. The probes verified historical endpoint and
consecutive-boundary blocks plus configured V3/V4 state; FRONG's native-V4 path
also passed. No credential was printed or persisted in this repository.

The operator loads the secret endpoint from an outside-repository `0600` file
into `ASSET_RACE_POOL_RPC_URL`, then runs this read-only probe. The checker never
prints the URL; `--rpc-url` is reserved for non-secret public endpoints.

```sh
npm run check:asset-race-meme-pools -- --archive-only --enabled-only --lookback-seconds 60,300,600,3600
```

New archive-only mode uses approved sources and checks current plus historical
E/B prices, decimals/orientation and V3 factory or V4 key/source identity.
It exercises production-style HTTP JSON-RPC batching; no quote/depth analysis,
liquidity policy or --quote-usd is required. Calls are serialized at 150 ms by
default, 429s back off, and output includes only operation/retry counts—not URLs.
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

- TRUSTED_SIGNER is immutable by design; in-place rotation would alter authority
  for frozen races. `RotateAssetRaceOracle.s.sol` switches every enabled entry
  still using an explicitly named old adapter while the race is paused, preserving
  all other registry fields. Frozen races retain the old oracle. During planned
  rotation keep its isolated signer until endpoints capture/cancel/void; during a
  suspected compromise stop it and let incomplete races fail closed. Captured
  endpoints and later claims require no signing key. No concrete address supplied.
  Each keeper has one configured oracle: during migration use separate old/new
  oracle workers with distinct gas EOAs until old races no longer need proofs.
- Production requires lifecycle+archive RPCs, race address, ASSET_RACE_CHAIN_ID=4663, signed oracle
  address+price key, separate keeper key, archive pacing/cache configuration,
  POLL_INTERVAL_MS=1000, RACE_SCAN_FROM=0.
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
- Restart performs one onchain reconciliation from `RACE_SCAN_FROM`; afterward it
  tracks only newly created/nonterminal races and refreshes a race when its next
  transition is due. Previously signed endpoint proofs are reused from the local
  atomic cache; the chain remains authoritative. Do not skip active races with
  scanFrom; monitor pending transactions/nonce state after crashes.
- Duplicate transitions cannot overwrite endpoints/terminal states. Redundant
  separate gas EOAs can revert/spend gas benignly. No cross-process nonce lock:
  use one active worker per gas EOA. Multiple bots are not winner authorities.

## C. During deployment — separately authorized operator only

- Confirm chain/owner, canonical USDG, compiler output and public signer; never
  reuse the existing PredictionMarket address. Deploy existing oracle/race scripts.
- Record ASSET_RACE_ADDRESS and ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS outputs;
  verify deployed TRUSTED_SIGNER equals the intended public address and confirm
  owner, keeper and signer public addresses are all distinct.
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

Contracts, roles, all23 asset registrations, policy, archive samples, local tests,
production-shaped build and a zero-write keeper startup were verified for the
USDG generation. GitHub Pages now stays unbound until native successors exist. A
native rollout requires separate deployment/service approval, monitoring and
explicitly authorized tiny mainnet lifecycle rehearsals. Never request private-key
contents or infer deployment/broadcast authorization.
