# Asset Race production runbook

Current staged checks, operator inputs and readiness verdict:
`ASSET_RACE_PREDEPLOY_CHECKLIST.md`. Local E2E is green; intended production
provider/archive and actual deployed-address wiring are not yet verified.

Use a dedicated deployment/owner account, a separate price-signing account,
and a third keeper transaction account. Never place their private keys in the
repository, shell command arguments, or logs.

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

Set these only in the operator's secret-aware process environment:

- `ASSET_RACE_DEPLOYER_PRIVATE_KEY`
- `ASSET_RACE_PRICE_SIGNER_ADDRESS` (public address only)
- `ASSET_RACE_BET_TOKEN_ADDRESS`
- `ASSET_RACE_ADDRESS` after deployment
- `ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS` after deployment
- `ASSET_RACE_MAX_PRICE_AGE`
- `ASSET_RACE_MAX_ENDPOINT_LAG`
- `ASSET_RACE_MAX_ORACLE_TIMESTAMP_SKEW`
- `ASSET_RACE_LOBBY_DURATION`
- `ASSET_RACE_BETTING_DURATION`
- `ASSET_RACE_START_GRACE`
- `ASSET_RACE_RESOLUTION_GRACE`
- `ASSET_RACE_FEE_BP`
- `ASSET_RACE_MIN_ACTIVE_CONTENDERS`
- `ASSET_RACE_MIN_STAKE`
- `ASSET_RACE_MAX_STAKE_PER_WALLET`
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
hook-free V4 native ETH, normalized to ETH_QUOTE/18. Bets/payouts remain USDG;
there is no conversion hop. See `ASSET_RACE_MEME_CATALOG_EXPANSION.md` for the
thirteen approved identities/sources and unresolved candidates.

```sh
forge script script/DeployAssetRace.s.sol:DeployAssetRace --rpc-url <rpc-alias> --broadcast
forge script script/ConfigureAssetRace.s.sol:ConfigureAssetRace --rpc-url <rpc-alias> --broadcast
```

## Keeper configuration

- `ASSET_RACE_RPC_URL`
- `ASSET_RACE_ADDRESS`
- `ASSET_RACE_CHAIN_ID=4663`
- `ASSET_RACE_KEEPER_PRIVATE_KEY`
- `ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS`
- `ASSET_RACE_POOL_PRICE_SIGNER_PRIVATE_KEY`
- `POLL_INTERVAL_MS=1000`
- `RACE_SCAN_FROM=0`
- `ASSET_RACE_ALLOW_LIVE=true` only after the controlled rehearsal

The RPC must provide historical `eth_call` state for longer than the configured
start/resolution grace. The public RPC returned recent state around 5,000 blocks
deep during validation but rejected deeper reads; production should use an RPC
with a documented archive window and monitoring. Never replace an unavailable
historical read with current pool state.

Read-only archive probe (use a monitored provider, not public-RPC success as an SLA):

```sh
npm run check:asset-race-stock-pools -- --rpc-url <public-rpc-url> --lookback-seconds 300
npm run check:asset-race-meme-pools -- --rpc-url <public-rpc-url> --enabled-only --quote-usd <approximate-weth-usd>
npm run check:asset-race-meme-pools -- --rpc-url <non-secret-intended-rpc-or-proxy> --archive-only --enabled-only --lookback-seconds 60,300,600,3600
```

The lookback must cover the larger configured start/resolution grace, plus an
operational margin. Alert on any failed historical state read; fail closed.

Frontend build-time configuration:

- `VITE_ASSET_RACE_NETWORK=robinhood-mainnet`
- `VITE_ASSET_RACE_ADDRESS`
- `VITE_ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS`
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
10. Start the live pool service and keeper; verify all pools share each source block.
11. Create one tiny controlled Stock race and verify signed pool P0 at T0.
12. Verify signed P1 at T1, finalize later, and claim successfully.
    Repeat with at least three Meme contenders, checking normalized ETH quotes,
    delayed capture/finalization, USDG payout, and late claim. Do not use
    mainnet pool addresses as testnet fixtures.
13. Exercise one P0-missing cancellation and one P1-missing void/refund using
    controlled test conditions.
14. Enable alerts for RPC archive depth, endpoint failures, pool liquidity, and
    signer/keeper health before opening public races.

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
