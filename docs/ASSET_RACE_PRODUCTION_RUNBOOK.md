# Asset Race production runbook

> The concrete contract address below belongs to the USDG generation. It is
> retained for historical operations and legacy claims only. The native-ETH
> frontend must remain unbound until a separately approved successor deployment.

Current staged checks, operator inputs and readiness verdict:
`ASSET_RACE_PREDEPLOY_CHECKLIST.md`. Local E2E and sampled Alchemy archive reads
through one hour are green. Contracts are deployed/configured and independently
read-checked; production service/frontend wiring is not live yet.

Current Robinhood Chain mainnet deployment (chain4663):

- `SignedPoolRaceOracle`: `0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7`
- `AssetRace`: `0x63E582bb395527CED97F2F94662eA93A7EDf65Ff`
- owner: `0x6d68157bEDa778346Dd27f8Ef4F917f69aD2Dc41`
- price signer: `0x79F4991Ccc64Cbb8143fB61e4cBD49b8b64d3635`
- settlement token: USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`

Use a dedicated deployment/owner account, a separate price-signing account,
and a third keeper transaction account. Never place their private keys in the
repository, shell command arguments, or logs.

The price signer is a real settlement trust boundary: the contract verifies its
signature, not historical pool state independently. For the zero-cost MVP, use a
dedicated zero-balance software wallet loaded only by the locked-down Asset Race
keeper service on the existing VPS. Store its secret outside the repository in a
service-only file (`0600`), with no deployer/owner credentials and no secret
logging. The price signer and keeper transaction signer remain different
blockchain addresses, but the free MVP keeps both inside the keeper process trust
boundary. This is weaker than a non-exportable HSM/KMS key; keep launch limits
small and retain the pause/new-oracle recovery procedure below.

## Recommended timing

- `ASSET_RACE_MAX_PRICE_AGE=60`
- `ASSET_RACE_MAX_ENDPOINT_LAG=0` (unused for pool proofs)
- `ASSET_RACE_MAX_ORACLE_TIMESTAMP_SKEW=0`
- `ASSET_RACE_START_GRACE=180`
- `ASSET_RACE_RESOLUTION_GRACE=300`
- `POLL_INTERVAL_MS=1000`

The endpoint price is the pool state of the last Robinhood Chain block strictly
before fixed T0=bettingEndTime or T1=T0+raceDuration. Its consecutive child has
timestamp >= T and parentHash=endpoint.hash, proving that no later block existed
before T. A gap before that child does not invalidate the endpoint. All active
pools use the same endpoint hash. Grace values only determine when an unavailable P0
cancels or unavailable P1 voids; they do not change the endpoint or limit claims.

## Deployment configuration

Generate and review all public values from the registry/manifest. Only the
deployer key belongs exclusively in the operator's secret-aware environment:

- `ASSET_RACE_DEPLOYER_PRIVATE_KEY`
- `ASSET_RACE_PRICE_SIGNER_ADDRESS` (public address only)
- `ASSET_RACE_ADDRESS` after deployment
- `ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS` (the existing verified oracle)
- `ASSET_RACE_MAX_PRICE_AGE`
- `ASSET_RACE_MAX_ENDPOINT_LAG`
- `ASSET_RACE_MAX_ORACLE_TIMESTAMP_SKEW`
- `ASSET_RACE_LOBBY_DURATION`
- `ASSET_RACE_BETTING_DURATION`
- `ASSET_RACE_START_GRACE`
- `ASSET_RACE_RESOLUTION_GRACE`
- `ASSET_RACE_FEE_BP`
- `ASSET_RACE_MIN_ACTIVE_CONTENDERS`
- `ASSET_RACE_MIN_STAKE_WEI`
- `ASSET_RACE_MAX_STAKE_PER_WALLET_WEI`
- optional `ASSET_RACE_DURATION_PRESET_1` through `_3`

After a testnet rehearsal, the operator runs the following commands manually;
never automate or run these from an AI session:

From the repository root, derive the two public approval arrays from the single
validated catalog (do not copy a second list into scripts):

```sh
export ASSET_RACE_STOCK_SYMBOLS="$(node scripts/check-asset-race-registry.mjs --deployment-symbols)"
export ASSET_RACE_STOCK_ORACLE_IDS="$(node scripts/check-asset-race-registry.mjs --deployment-oracle-ids)"
export ASSET_RACE_MEME_SYMBOLS="$(node scripts/check-asset-race-registry.mjs --deployment-meme-symbols)"
export ASSET_RACE_MEME_ORACLE_IDS="$(node scripts/check-asset-race-registry.mjs --deployment-meme-oracle-ids)"
```

Meme arrays are optional (omit both for a Stock-only configuration). The same
oracle registers each category separately; a race cannot mix Stocks and Memes.
Stock pool quotes remain USDG; approved Meme pool quotes are canonical WETH or
hook-free V4 native ETH, normalized to ETH_QUOTE/18. Historical deployed races
bet/pay in USDG; the replacement AssetRace bets/pays directly in native ETH with
no conversion hop. See `ASSET_RACE_MEME_CATALOG_EXPANSION.md` for the thirteen
approved identities/sources and unresolved candidates.

```sh
forge script script/DeployAssetRace.s.sol:DeployAssetRace --rpc-url <rpc-alias> --broadcast
forge script script/ConfigureAssetRace.s.sol:ConfigureAssetRace --rpc-url <rpc-alias> --broadcast
```

`DeployAssetRace` requires `ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS` and verifies
its onchain `TRUSTED_SIGNER`; it deploys only the replacement AssetRace and must
not create a second oracle.

## Keeper configuration

- `ASSET_RACE_RPC_URL`
- `ASSET_RACE_POOL_RPC_URL` (archive-capable T0/T1 reads; defaults to the RPC above)
- `ASSET_RACE_ARCHIVE_MIN_INTERVAL_MS=150` (keeps fallback below 200 CU/s)
- `ASSET_RACE_REALTIME_ENDPOINT_WINDOW_SECONDS=30` (fresh T0/T1 use public RPC;
  older recovery skips directly to the paced archive RPC)
- `ASSET_RACE_ENDPOINT_CACHE_FILE` (optional; defaults outside the repository to
  `~/.local/state/prophet/asset-race-endpoints.json`)
- `ASSET_RACE_ADDRESS`
- `ASSET_RACE_CHAIN_ID=4663`
- `ASSET_RACE_KEEPER_PRIVATE_KEY`
- `ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS`
- `ASSET_RACE_POOL_PRICE_SIGNER_PRIVATE_KEY`
- `POLL_INTERVAL_MS=1000`
- `RACE_SCAN_FROM=0`
- `ASSET_RACE_ALLOW_LIVE=true` only after the controlled rehearsal

Keeper startup reads the deployed `AssetRace.owner()` and oracle
`TRUSTED_SIGNER()`. It fails closed unless owner, transaction keeper and price
signer are three distinct public addresses. Deployment/configuration scripts
also reject a price signer equal to the deployer/owner.

The zero-cost split is: public Robinhood RPC for lifecycle, transaction submission
and timely T0/T1 collection; an Alchemy Free Robinhood archive endpoint in
`ASSET_RACE_POOL_RPC_URL` is recovery-only. Within the 30-second realtime window,
near-tip collection searches backward from latest instead of binary-searching
the full chain. Signed proof pairs are
atomically cached in a `0600` file outside the repository, reused across retries/
restarts, and scoped by chain/oracle/timestamp/source IDs. The cache contains no
private key. Archive operations are serialized at least 150 ms apart and retry
429s with bounded exponential backoff. Never replace an unavailable historical
read with current pool state; endpoint failure must cancel/VOID/refund.

The separate LIVE service uses `ASSET_RACE_LIVE_RPC_URL`, normally the public
Robinhood RPC. If unset, it uses that public endpoint directly and never falls
back to `ASSET_RACE_POOL_RPC_URL`. It reads all enabled pools through canonical Multicall3 and polls only while
at least one SSE client is connected, once every two seconds by default. LIVE is
display-only: rate limits retain a stale snapshot and cannot change settlement.

Read-only archive probe. For a credential-bearing endpoint, load
`ASSET_RACE_POOL_RPC_URL` from an operator-owned secret file outside the
repository; never place it after `--rpc-url`. That option remains only for
non-secret public endpoints.

```sh
npm run check:asset-race-stock-pools -- --lookback-seconds 300
npm run check:asset-race-meme-pools -- --archive-only --enabled-only --lookback-seconds 60,300,600,3600
```

The lookback must cover the larger configured start/resolution grace, plus an
operational margin. Both probes pace archive operations at 150 ms by default and
report operation/retry counts as `rpcBudget`; do not lower the interval below the
guarded minimum. Alert on failed historical reads; fail closed.

Frontend build-time configuration:

- `VITE_ASSET_RACE_NETWORK=robinhood-mainnet`
- `VITE_ASSET_RACE_ADDRESS=<new native-ETH deployment>`; never use the legacy
  USDG address `0x63E582bb395527CED97F2F94662eA93A7EDf65Ff`
- `VITE_ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS=0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7`
- `VITE_ASSET_RACE_LIVE_ENABLED=true` on the VPS after its same-origin SSE
  service is healthy; `false` on GitHub Pages until a CORS-safe public endpoint
  exists
- the existing production `VITE_RPC_URL`

## Controlled launch checklist

1. Provision the secure server-side price signer and record only its public address.
2. Provision a separate keeper account and fund it with a small gas balance.
3. Rehearse deployment and signed pool block-pairs on testnet using test keys.
4. Deploy `SignedPoolRaceOracle(priceSignerAddress)`.
5. Deploy the updated `AssetRace` with the approved settlement token.
6. Verify both contracts, ownership, signer, chain ID, and settlement token.
7. Register only production-enabled assets from the centralized registry: 10 Stocks unchanged plus 13 Memes (AI/CASHCAT/CHUMP/PIPEDOG/IF/TENDIES/BONER/JUGGERNAUT/MOO/FRONG/HOOD/BLORB/DOGO). FRONG uses the reviewed hook-free native V4 pool. Keep AMC/DEGEN/UBIK disabled and ZZZ/SHROOM/ASTRO unconfigured. See the current catalog review for exact sources. Registry enablement is not an onchain registration or deployment.
8. Configure timing, skew, economics, and approved duration presets.
9. Configure frontend and keeper addresses; keep both private keys server-side.
10. Start the demand-driven live pool service and active-race keeper; verify all
    pools share each source block, the two-second cadence, and zero SSE clients
    produce zero LIVE polls. Verify the endpoint cache is outside Git and mode0600.
11. Create one tiny controlled Stock race and verify signed pool P0 at T0.
12. Verify signed P1 at T1, finalize later, and claim successfully.
    Repeat with at least three Meme contenders, checking normalized ETH quotes,
    delayed capture/finalization, USDG payout, and late claim. Do not use
    mainnet pool addresses as testnet fixtures.
13. Exercise one P0-missing cancellation and one P1-missing void/refund using
    controlled test conditions.
14. Enable alerts for RPC archive depth, endpoint failures, pool liquidity, and
    signer/keeper health before opening public races.

## Price-signer rotation and incident recovery

`TRUSTED_SIGNER` is deliberately immutable. Making it mutable would let an admin
change the accepted price authority for already-frozen races. Rotation therefore
deploys a new `SignedPoolRaceOracle`; `AssetRace` registry changes affect only
future races, while existing races retain their old oracle address.

For planned rotation:

1. Provision the new isolated signer and record only its public address.
2. Call `setNewActivityPaused(true)` so no race/bet is created during the registry
   transition. Lifecycle transitions, claims and refunds remain permissionless.
3. Deploy a new oracle with the new public signer and verify its bytecode, EIP-712
   domain, proof type and `TRUSTED_SIGNER`.
4. Set `ASSET_RACE_OLD_SIGNED_POOL_ORACLE_ADDRESS` to the old adapter and the
   normal deployment variables to the race/new adapter/new public signer, then
   have the operator run:

   ```sh
   forge script script/RotateAssetRaceOracle.s.sol:RotateAssetRaceOracle \
     --rpc-url <rpc-alias> --broadcast
   ```

   The idempotent script requires the race to be paused and updates every enabled
   asset still using exactly the old adapter while preserving category, oracleId,
   decimals and timing limits. It never unpauses automatically.
5. Read-verify every enabled registry entry, update keeper/frontend public oracle
   bindings, run a signed dry-run, then explicitly unpause new activity.
6. Drain old races with a separate old-oracle worker and separate gas EOA. Retire
   the old signer only after no old race still needs P0/P1 proof generation.

For suspected signer compromise:

1. Pause new activity and stop the compromised signing/collector service.
2. Do not accept a newly generated old-oracle proof merely to keep a race alive.
   Races with both endpoints captured can still resolve and claim without signer
   access. Races missing P0 cancel after start grace; races missing P1 become VOID
   after resolution grace; refunds remain available indefinitely.
3. Deploy and verify a new oracle/signer, rotate enabled registry entries as above,
   replace keeper/frontend public bindings, and only then reopen activity.
4. Preserve incident logs and independently reproduce every already-submitted
   signed observation. A compromised signer is a production security incident,
   not a routine keeper restart.

Normal rotation can use overlapping old/new workers because every race freezes
its adapter. Never share one keeper gas EOA across workers: there is no cross-
process nonce lock. Emergency rotation intentionally fails old incomplete races
closed rather than allowing a new signer to rewrite their settlement authority.

## Local protocol-shaped E2E

Only on isolated, non-forked Anvil. The harness requires a loopback HTTP URL,
chain 31337 and an Anvil client; it uses unlocked local accounts, not key files.
Keep startup silent so Anvil does not print test keys. Build from `contracts/`
first, then run these root commands against the task-owned local node:

```sh
anvil --silent --host 127.0.0.1 --port 18545 --chain-id 31337
npm run e2e:asset-race-meme -- --assets AI,IF,FRONG
npm run e2e:asset-race-meme -- --assets AI,FRONG,IF
npm run e2e:asset-race-meme -- --assets AI,IF,FRONG --void
npm run e2e:asset-race-stock
```

Meme fixture sources preserve the central canonical addresses, V3 fees and V4
PoolKeys on this local chain only; signed identities use the local chain domain.
Native V4 uses a minimal StateView-shaped mapping keyed by the complete PoolKey,
not an ERC20 at address zero. This validates historical pricing/settlement
integration, not real Uniswap PoolManager swaps, hooks or public-chain operation.
The normal flow captures historical P1 after 60 seconds, resolves after one day,
and claims after 60 days. `--void` creates an exact final tie and checks every
bettor's full late refund. Do not run these fixture operations on public chains.

## Spot manipulation risk

Settlement intentionally uses the exact approved pool spot at one endpoint
block. A sufficiently funded trader may manipulate a thin pool for that block.
Keep race exposure conservative until pool liquidity/depth limits are reviewed;
the registry and live snapshots expose the frozen pool identifier and protocol
for operational monitoring.
