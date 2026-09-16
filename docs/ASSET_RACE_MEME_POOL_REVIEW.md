# Production Meme pool review — 2026-09-16

Historical initial review. The current technical-only catalog proposal and full
known-candidate table are in ASSET_RACE_MEME_CATALOG_EXPANSION.md (13 valid of 19).
Native ETH is now supported; earlier WETH-only and impact exclusions are obsolete
for catalog selection. Actual production enablement remains the original four.

This pass changes only Meme approval/configuration and generalizes the existing
pool consumer. The ten approved Stock configurations and their price semantics
are unchanged. Catalog size is independent of MAX 6 contenders per race.

## Identity review

All identities were checked by exact contract, not ticker search. RPC metadata
was read at common block 64359774 on Robinhood Chain (4663). All eight identified
Robinhood contracts below report 18 decimals; ERC20 totalSupply was also read.
HIGH is identity confidence, not an audit/security guarantee. Explorer address
API requests returned a Cloudflare challenge, so verified-source/implementation
status could not be independently established in this pass.

| Candidate | Canonical Robinhood contract / confidence | Authoritative identity evidence / decision |
|---|---|---|
| AI | `0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18` / HIGH | [Artificial Inu](https://artificialinu.com/) publishes exact contract; RPC name Artificial Inu / AI; enabled. |
| CASHCAT | `0x020bfC650A365f8BB26819deAAbF3E21291018b4` / HIGH | [Project](https://cashcat.cc/) and [Robinhood statement](https://robinhood.com/ca/en/support/articles/crypto-asset-statements-cashcat/) publish exact contract; Cash Cat / CASHCAT; enabled. |
| HOOD | `0xDAA8f3f54c66E9BE2c44C1B6b566cBD07229CED3` / HIGH | [GreenHood](https://greenhood.club/), TheGreenHood / HOOD. Disabled: credible indexed market uses native ETH, not canonical WETH or USDG. |
| AMC | **Not verified; canonicalTokenAddress remains null** | Tracker candidate `0x385F4f8ae47651ce5F58F5265395a669f8281e18` reports MEME, and another AMC contract `0xE0514A254B465C8c804F77230FB1059f84b21E18` exists. No authoritative confirmation tying the requested identity to either contract. Disabled. |
| BLORB | `0x4d14284aFe559B7c6B9e6FAd6ebAeaA0F6051818` / HIGH | [BLORB](https://blorbmeme.xyz/), BLORB / BLORB. Disabled: credible indexed market uses native ETH, not canonical WETH or USDG. |
| CHUMP | `0x0E0d2C89a5a019FE1cF762e5e33187631DACC21B` / HIGH | [Chump Coin](https://cc21b.meme/) publishes exact contract and selected pool; Chump Coin / CHUMP; enabled subject to exposure review. |
| DEGEN | **Robinhood canonical contract not verified; null** | [Degen](https://www.degen.tips/) identifies the Base token, not an authoritative Robinhood deployment/bridge mapping. The exact Robinhood tracker candidate has only ~$167 USDG liquidity and 2 trades/day. Disabled. |
| BONER | `0x98096d17e191B3dA1d5f99a6D7b3584351b11E18` / HIGH | [Boner Coin](https://boneronlong.xyz/) publishes exact contract; Boner Coin / BONER. Disabled: WETH depth is materially weaker (~$224k TVL); $10k moves spot 3.90–4.07%. |
| PIPEDOG | `0x5Cb6F181081301b44905F3ae15419112ecaBd8A6` / HIGH | [pipedog](https://pipedog.xyz/) publishes exact contract; pipedog / PIPEDOG; enabled. |
| UBIK | `0x812486EAea648819853F8E372dc9f1516C7868Bd` / MEDIUM, not production-verified | [Exchange listing](https://www.ourbit.com/support/articles/17827791513554) identifies exact contract; ubik / UBIK, but project confirmation inaccessible/conflicting identities. Disabled: identity evidence insufficient and WETH pool ~$7.9k, ~3.6 days old, $100 moves spot ~1.45%. |

## Common quote decision

Use canonical WETH `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`, 18 decimals,
for every production Meme pool. USDG remains the 6-decimal **bet/payout token**;
there is no conversion from WETH to USDG in settlement. A Meme return is the
token's percentage return **relative to WETH**, not its dollar return.

WETH provides established active direct markets for AI/CASHCAT/CHUMP/PIPEDOG.
CHUMP's USDG pools total only a few thousand dollars; PIPEDOG's USDG pool is
~$5.5 with one trade/day. USDG would sacrifice these credible markets. HOOD and
BLORB native-ETH pools are not silently reinterpreted as WETH pools. BONER and
UBIK's stronger USDG markets cannot be mixed into this WETH universe.

Discovery compared all exact-token pairs returned by the DEX Screener API
(up to 30 per token; not a proof that unindexed pools do not exist). Discovery
metrics never enter the engine, signed proof, P0/P1 or winner calculation.

Selection details:

- AI: selected established ~$4.31m WETH V3, versus alternate ~$100k WETH V3
  and ~$2.10m / ~$0.76m USDG V4 pools. The selected pool has sustained volume
  and the best observed WETH endpoint depth.
- CASHCAT: selected 0.3% WETH pool (~$2.11m) instead of 1% WETH pool (~$4.31m).
  Their active liquidity is comparable (178159… vs 166576… raw); selected
  pool has ~4x volume / ~3x trades, lower two-way costs and similar/better
  spot resilience. The larger headline TVL alone is not the selection rule.
  USDG alternatives were ~$0.78m / ~$0.49m V4 and ~$0.33m V3.
- CHUMP: selected ~$1.07m established WETH V3; native ETH alternatives ~$67k
  and ~$23k and USDG markets are much weaker.
- PIPEDOG: selected ~$8.42m established WETH V3; other WETH and USDG markets
  are dust-sized.
- BONER: WETH ~$224k versus USDG ~$489k V4; WETH depth fails initial approval.
- UBIK: WETH ~$7.9k versus USDG ~$419k V4; WETH depth/age and identity fail.
- HOOD/BLORB: native-ETH V4 IDs are respectively
  `0xc40d3cac54f587debdcef3887912767656255c9b04f3914ffa70e01370e046f8`
  and `0x75ef5a3400b9da7bb49e776836995739f1ab0bae029e2e71fe654e52efc56b08`;
  neither is an approved WETH/USDG settlement market.

## Approved frozen sources / observed active liquidity

Every enabled pool is Uniswap V3, factory
`0x1f7d7550B1b028f7571E69A784071F0205FD2EfA`. Runtime verification checked
factory getPool, token0/token1, fee and both ERC20 decimals. Normalized prices
are WETH per Meme, with 18 output decimals. The one pool, token pair and
protocol are bound into oracleId; approval snapshots remain frozen per race.

| Asset | Pool | Fee | Active liquidity raw (not dollar TVL) |
|---|---|---:|---:|
| AI | `0xc4a21f9d6485FC5893DD4A491B320a83DAF4Da1D` | 1% | `339519948291030021308113` |
| CASHCAT | `0xd42A491087a15E5afd51FEb3606066Cc152d2b09` | 0.3% | `178159538811226385118507` |
| CHUMP | `0x714442e9A611f8561A7dF108D6d925132937cFb8` | 1% | `368673746776675507087893` |
| PIPEDOG | `0xB7f10f74B39291b9290b779978e19A7637C742D6` | 1% | `2298889859642879655127542` |

## Read-only market quality / tick-aware depth

Measurements around block 64365200, timestamp 1789547271 (2026-09-16).
TVL, volume, transaction counts and creation timestamps are discovery analytics,
not audited unique-user counts or a guarantee of future liquidity. QuoterV2
`0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7` was called via eth_call at
the common block; **no swaps, approvals or external transactions** occurred.
Dollar notionals use an explicit approximate WETH/USD=2386 solely to label
depth measurements; it does not enter settlement. Impact includes LP fee.
Quote results cross actual initialized ticks, unlike a TVL-based estimate.

| Asset | TVL | 24h volume | Transactions 24h / 1h | Pool age | $1k buy / sell impact | $10k buy / sell impact | $10k buy / sell spot move |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| AI | $4.31m | $3.66m | 1538 / 30 | 55.7d | 1.02% / 1.01% | 1.12% / 1.11% | 0.23% / 0.23% |
| CASHCAT | $2.11m | $4.25m | 8664 / 151 | 76.5d | 0.33% / 0.32% | 0.59% / 0.59% | 0.58% / 0.58% |
| CHUMP | $1.07m | $2.48m | 11207 / 302 | 47.3d | 1.04% / 1.03% | 1.34% / 1.32% | 0.65% / 0.75% |
| PIPEDOG | $8.42m | $1.25m | 829 / 42 | 49.5d | 1.02% / 1.01% | 1.19% / 1.18% | 0.37% / 0.36% |

Practical spot-movement cost brackets below are the adjacent sampled quote
notionals straddling each threshold (buy / sell); **not precise manipulation
costs**, and they exclude gas, hedges, arbitrage, temporary liquidity and
flash-loan effects. Depth can change at any moment.

| Asset | Move 0.5% | Move 1% | Move 2% |
|---|---:|---:|---:|
| AI | $10k–$25k / $10k–$25k | $25k–$50k / $25k–$50k | $50k–$100k / $50k–$100k |
| CASHCAT | $5k–$10k / $5k–$10k | $10k–$25k / $10k–$25k | $25k–$50k / $25k–$50k |
| CHUMP | $5k–$10k / $5k–$10k | $10k–$25k / $10k–$25k | $25k–$50k / $10k–$25k |
| PIPEDOG | $10k–$25k / $10k–$25k | $25k–$50k / $25k–$50k | $25k–$50k / $50k–$100k |

CHUMP is asymmetric beyond $10k: ~$25k sell-side notional moved spot ~5.13%,
while its buy-side move was ~1.54%; at $50k the sell-side move was ~12.24%.
Registry approval enables technical configuration, **not unlimited safe race
exposure**. Review maximum aggregate payout/exposure against the shallowest
direction before public launch; no stake/payout economics were changed here.

## Real endpoint reconstruction

All four enabled pools read positive prices at one common latest block:
64365200 / `0xe96d54702a572d3874c2836e0b415200978657a4840d6d041a006f4b3b81e4f2`.

For T=1789547211 the shared engine selected:

- E=64364598, timestamp=1789547210,
  hash=`0xe9b5bcb7d6eda401d6102e78b91d5da99aa96ea15e19fde654ea96c36b422a0b`.
- B=64364599, timestamp=1789547211,
  hash=`0x33539ef64fb8ac70ab5cd01fc5c20cbdfaefe0d524315e162071c8dc48654278`.
- B.number=E.number+1 and B.parentHash=E.hash. All four historical pool reads
  succeeded at E, including exact WETH orientation and 18-decimal normalization.

This demonstrates recent historical availability, **not an archive SLA**.
Production requires an independently monitored RPC archive window longer than
both capture graces plus margin.

## Shared lifecycle / LIVE

T0=bettingEndTime, T1=T0+raceDuration. For either endpoint use the price from E,
the final block strictly before T; B only proves the boundary. Common E hash
is required across every active asset independently for P0 and P1.
Keeper collection queries only a race's requested frozen oracleIds, so failure
of an unrelated approved Meme pool cannot block a Stock endpoint capture.
SignedPoolRaceOracle and AssetRace are unchanged in this pass. A trusted
server-side signer attests canonical headers/pool state; relayers/keepers
cannot alter signed observations, but this is **not a trustless state proof**.
The existing signer-security assumption is unchanged.

Missing P0 during startGrace permits CANCELLED/refunds; missing P1 during
resolutionGrace permits VOID/refunds. First captured P1 cannot be overwritten,
and neither late finalization nor indefinite claim/refund reads current spot.

The same PoolPriceEngine supplies all approved Stocks and Memes to the existing
one-second backend heartbeat and one SSE endpoint. Every heartbeat reads one
common block, serves all viewers, and retains unchanged prices without invented
movement. Meme payloads carry priceQuote/quoteSymbol=WETH (not a USDG label);
Stock priceUsdG compatibility is retained. Frontend availability stays derived
from the central registry; no separate Meme UI list or displayAnchor was added.
Browser LIVE observations must match the race's frozen oracleId; a later registry
pool change cannot silently replace its market. Meme price labels use WETH only
when the onchain source matches the approved WETH source; local/mock dollar
labels and Stock labels remain unchanged.

## Remaining preparation

Provision secure signer/keeper separation and a monitored archive-capable RPC;
review spot-manipulation exposure and monitor depth/activity; confirm explorer
verified-source/implementation status when authoritative explorer access is
available. Six failed candidates stay disabled with explicit registry blockers.

Before a combined Stock + Meme deployment rehearsal, derive both approval arrays
from the registry and agree conservative exposure/timing settings. Run the local
Stock and three-Meme E2Es with the shared oracle first; do not assume production
pool addresses exist on testnet.


## Validation completed

- Registry: 23 catalog assets; 14 mainnet approvals (10 unchanged Stocks + 4 Memes).
- All Stock registry objects matched their pre-pass SHA256: `0903b9306c7c28a216f9a5f1a6984c30aa35bce3a2601922f93c4f8b87035ea6`.
- Focused engine/collector/keeper/live/SSE/display regression: **28 passed**.
- `forge build`: passed, no Solidity compiler warnings; existing Forge lint diagnostics remain.
- Full `forge test`: **147 passed**, 0 failed. Four grouped lifecycle/liability invariants: 256 runs / 128000 calls, 0 reverts; both fuzz checks passed.
- Frontend build passed (existing bundle-size warning); lint passed with 6 unrelated existing warnings.
- Script/shell syntax and scoped Solidity formatting checks passed; `git diff --check` passed.
- Read-only latest/historical runtime reads passed for all 4 approved Memes and all 10 unchanged approved Stocks.
- Local Meme E2E: AI/CASHCAT/CHUMP, quote WETH, bets USDG, common P0 E=47 and P1 E=53; boundary movement ignored, capture +60s, resolve +1 day, claim +60 days, CASHCAT winner, payout 29.60 USDG.
- Local Stock regression: NVDA/TSLA/MU, quote/bets USDG, same delays, TSLA winner, payout 29.60 USDG.
- First Meme E2E exposed a workstation wall-clock race in the fixture's two-second betting lead; pinning the creation block timestamp fixed it. No contract logic change was required.
- No packages installed, secrets read, external transactions, commits, pushes, or unrelated code changes. Generated output remains untracked/ignored.

## Files changed in this pass (24)

- `config/asset-race-assets.json`
- `contracts/script/ConfigureAssetRace.s.sol`
- `contracts/test/SignedPoolRaceOracle.t.sol`
- `package.json`
- `scripts/asset-race-pool-price-engine.mjs`
- `scripts/asset-race-pool-price-engine.test.mjs`
- `scripts/asset-race-pool-endpoints.mjs`
- `scripts/asset-race-pool-endpoints.test.mjs`
- `scripts/check-asset-race-stock-pools.mjs`
- `scripts/check-asset-race-meme-pools.mjs`
- `scripts/check-asset-race-registry.mjs`
- `scripts/asset-race-stock-e2e.mjs`
- `scripts/asset-race-live-server.mjs`
- `scripts/asset-race-live-prices.mjs`
- `scripts/asset-race-live-prices.test.mjs`
- `scripts/asset-race-live-display.test.mjs`
- `scripts/asset-race-keeper.test.mjs`
- `src/chain/assetRaceLiveDisplay.ts`
- `src/chain/assetRaceRegistry.ts`
- `src/chain/useAssetRace.ts`
- `src/components/AssetRaceLeaderboard.tsx`
- `docs/ASSET_RACE_MEME_POOL_REVIEW.md`
- `docs/ASSET_RACE_PRODUCTION_RUNBOOK.md`
- `docs/ASSET_RACE_LIVE_DISPLAY.md`
