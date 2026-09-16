# Stock pool selection review — 2026-09-16

Catalog membership is not production approval. The catalog has 13 Stocks;
the existing eight retain their exact pools, MU/NFLX are newly enabled, and
AMD/COIN/TSM remain disabled. MAX 6 contenders and race economics are unchanged.

## Canonical identity and sources

Robinhood's [token-contract documentation](https://docs.robinhood.com/chain/contracts/)
identifies its live asset registry as authoritative. Records came from the
documented [asset API](https://api.robinhood.com/rhj/assets), through the existing
public project proxy because direct requests returned HTTP 403. All five records
were active on chain 4663 with 18 decimals; onchain `uid`, `symbol`, `name`,
`decimals`, and nonempty bytecode matched. Exact UIDs/ISINs are in the centralized
registry. TSM is the U.S.-traded depositary security (ISIN US8740391003).

| Stock | Canonical token | Selected candidate pool | Protocol |
|---|---|---|---|
| MU | `0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD` | `0xd057B1Bc54917855BBee58eAd58647f47caB35E5` | V3, 0.30% |
| AMD | `0x86923f96303D656E4aa86D9d42D1e57ad2023fdC` | `0xde9f85fdd9e05a943a52f2c69ffafe3064a3287df03d02c9b431bc92d4781274` | V4, 1.00%, tick spacing 200, no hooks |
| COIN | `0x6330D8C3178a418788dF01a47479c0ce7CCF450b` | `0x007a13fa152f6dc383cad20a8eaab4e1e2538b606936eae2a424f8aa47d6db31` | V4, 1.00%, tick spacing 200, no hooks |
| NFLX | `0xE0444EF8BF4eD74f74FD73686e2ddF4C1c5591E8` | `0x59895C0302F41aEaa129D2fa2442CEc01E7eF45E` | V3, 0.30% |
| TSM | `0x58FfE4a942d3885bAa22D7520691F611EF09e7AA` | `0x0ba5d53d2f6255f334b7c8ead4f56b6aef5af3402c5e4d11180afd38c6b85fb1` | V4, 0.75%, tick spacing 75, no hooks |

All quotes use canonical USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`
(6 decimals). V3 ordering/fee/factory were read directly. V4 PoolKeys were
recovered from PoolManager `Initialize` events and independently hashed to their
PoolIds; they are not contract addresses. Infrastructure and Quoter addresses
come from [Uniswap's chain-4663 deployment manifest](https://github.com/Uniswap/contracts/blob/main/deployments/4663.md).

## Market quality snapshot

Headline liquidity/activity is DEX Screener discovery/monitoring data, not
settlement data. Active liquidity is the pool's raw onchain L (not USD TVL).
Quoter results simulate both directions at explicit block 64338336 and include
LP/protocol fees. Each impact cell is the larger buy/sell impact in basis points.
The math is integer-only. No trades were executed.

| Stock | Headline liquidity | Volume/24h | Trades/24h | Trades/latest hour | Active L raw | $1k | $5k | $10k | $25k |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| MU | $1,681,815 | $1,129,778 | 1,967 | 22 | 570229392279691361 | 30 | 33 | 36 | 46 |
| AMD | $766,937 | $134,010 | 356 | 1 | 323845218338154442 | 112 | 117 | 124 | 145 |
| COIN | $476,004 | $327,416 | 1,155 | 0 | 212966696566904847 | 114 | 129 | 146 | 197 |
| NFLX | $256,254 | $293,879 | 1,963 | 9 | 666177495692193946 | 31 | 38 | 47 | 74 |
| TSM | $296,001 | $58,450 | 136 | 6 | 188488193442849215 | 88 | 98 | 111 | 150 |

MU/NFLX were selected for their combination of active depth, highest observed
volume/activity among their credible USDG pools, and sub-0.75% $25k quoted
impact. This is an MVP screening decision, not a manipulation-proof guarantee.
Single-block spot remains the accepted economic risk and requires conservative
exposure plus continuous liquidity/activity monitoring.

AMD is disabled: its V4 candidate is technically verified, but the lower-fee
V3 alternative has more recent activity and needs comparison. Auto-review
blocked that additional read-only request by interpreting an earlier no-mainnet
restriction; it was not retried. COIN/TSM are conservatively disabled because
their measured impact is materially larger and recent activity is sparse. Quiet
hours do not prove permanent inactivity; sustained monitoring may justify a
later explicit approval. These are not missing-token or missing-pool blockers.

## Discovery scope and alternatives

Discovery used `https://api.dexscreener.com/token-pairs/v1/robinhood/<canonical-token>`.
These are observed API results, not a guarantee that every unindexed pool was
enumerated. Ramses/other DEXes and non-USDG quotes were excluded. Credible
Uniswap alternatives were compared by headline metrics; only selected candidates
were fully verified onchain. Very small/no-liquidity duplicates were not approved.

- MU: V4 `0x6fa3ee0048e78bf0a513eb0ab56f482944a767c21db990fcf555605e69f05659`
  ($596k, $122k volume, 512 trades/day) versus selected V3 ($1.68m, $1.13m,
  1,967). Four other V4 results had $20/no reported liquidity or incoherent prices.
- AMD: V3 `0x48D284A2A4d3DC1b3Da08231Fe44317e7e7Aa51f` ($167k, $152k,
  514 trades/day, 10/hour); V3 `0xD6aF1dcB75cdAE4F2efc403A58eF023A51edC686`
  ($19k); V4 `0x529838496d45557bbe794413893c54787ac063b4505b31a722a69999cf741ab3`
  ($8k), `0xe1357593f2e955454fc59cbe378239ab067f840dd2a1527cb971ebf1f138fc7f`
  ($504), and `0xb603b7f7a4a8bc14e8d2fcadad39ddd46bf81d40e3369c28a3924ac0b099f43c`
  (no reported liquidity). Best-pool selection is deliberately not claimed complete.
- COIN: V4 `0x359ce3816696afc8f3c6990fd90888c6d8aee3bcd7530b5956910c77655feaee`
  ($2k), `0xb7c4fde4753648884d2f1210742c0ff6809b1424034b08e1aff0f19d16fb7765`
  ($725), and `0x3727edf4fd6cdabac1fd6abe99d9d2d50dbd000fdb7e6bb85c1193099689c709`
  (no reported liquidity) were much weaker than the selected $476k V4 candidate.
- NFLX: V4 `0xe4930a6215f21aa3b37c01adbded3362f56ae31b9a60066f5f9641e601d5111f`
  ($95k, $68k volume, 446 trades/day); V4 `0xc3ce6292ae631e73a6adc6faaad7d10e326a9d11517a6dfcd001345d20097df4`
  ($13k); V3 `0xeA75eA625d83aE276b9ae8B0A3dC205916EE65cF` ($13k, only
  $2.7k volume) and V4 `0x9418effa8b71d242b8908c8bee4545aeebde53f717cb757124fe3087ba94b9ab`
  (no reported liquidity) were weaker than the selected V3.
- TSM: V4 `0xd801072625f911a198b45ad51a7454d5d37ead5d6fc1e977b468f72cc024d39d`
  ($163k, $44k volume, 68 trades/day); V3 `0x07e8Ea83D4C1340774c8965125e26e12bf943bf1`
  ($140k, $12k volume, 49 trades/day); V4 `0x8055fe6b3c4079318536e2d1c13d32bffc82bc554e0a7619b9ed571cd3ba3eb1`
  ($9k), `0x78f4dd7dec56c8af7792cc288cca7b917ed9f759acc6dbd68394d24aa956e955`
  ($6k), `0x6933e062afeecc1c66ca0a9d7e269f9bfafb057bdb8f9d971426a977a2385a15`
  ($804), and `0x7a048023759fe387c1e311e29a2354f3cbdfbe51324aafa88eec495d3af798b1`
  ($334) were weaker by observed activity/depth.

## Endpoint and infrastructure evidence

All 13 pools returned positive normalized prices at common latest block
64338336 (`0x83b3648685e607540a3aeedec59475c875e8393f6f77e2c0e4c38b5fb910da3e`).
Historical endpoint block 64337735 timestamp 1789544508 had the same source
hash for every contender; boundary 64337736 timestamp 1789544509 was its
consecutive child. Historical calls failed closed on errors; no latest fallback.

Production still requires a monitored archive-capable RPC with a documented
retention window longer than maximum start/resolution capture grace plus margin.
Public RPC success for recent samples is not evidence of such a production SLA.
No monitored provider was supplied/verified in this pass. SignedPoolRaceOracle
also explicitly trusts its configured signer to attest canonical headers/state;
the signatures and lineage checks constrain relayers, not a compromised signer.

## Local reproduction

The repository enables Solidity IR compilation: AssetRace runtime is 21,605 bytes
versus 25,309 with the legacy generator, below the 24,576-byte EIP-170 limit.
The E2E checks this limit before deployment; it does not disable node limits.

After Forge build, start an isolated local node without printing keys:

```sh
/Users/dima/.foundry/bin/anvil --silent --chain-id 31337 --host 127.0.0.1 --port 18545
```

In another terminal:

```sh
npm run e2e:asset-race-stock
```

The tool rejects nonlocal URLs/non-31337 chains, uses only unlocked RPC accounts,
and deploys Anvil-only V3 protocol-shape fixtures plus the real oracle/AssetRace.
NVDA/TSLA/MU use common pre-T0/pre-T1 state. MU changes inside each boundary
block cannot replace either endpoint. Capture occurs a minute late, resolution a
day late, and claim 60 days late; payout economics remain 2% of the losing pool.

## Files changed in this pass

- `config/asset-race-assets.json`, `package.json`
- `contracts/foundry.toml`, `contracts/local-demo.sh`
- `contracts/script/ConfigureAssetRace.s.sol`, `contracts/script/LocalAssetRace.s.sol`
- `contracts/src/AssetRace.sol`, `contracts/src/interfaces/IAssetRaceOracle.sol`, `contracts/src/oracles/SignedPoolRaceOracle.sol`
- `contracts/test/SignedPoolRaceOracle.t.sol`, `contracts/test/helpers/StockPoolE2E.sol`
- `scripts/asset-race-pool-price-engine.mjs`, `scripts/asset-race-pool-price-engine.test.mjs`
- `scripts/asset-race-pool-endpoints.mjs`, `scripts/asset-race-pool-endpoints.test.mjs`
- `scripts/asset-race-keeper.mjs`, `scripts/asset-race-keeper.test.mjs`
- `scripts/asset-race-live-prices.test.mjs`, `scripts/asset-race-stock-e2e.mjs`
- `scripts/check-asset-race-registry.mjs`, `scripts/check-asset-race-stock-pools.mjs`
- `docs/ASSET_RACE_PRODUCTION_RUNBOOK.md`, `docs/ASSET_RACE_LIVE_DISPLAY.md`, `docs/ASSET_RACE_STOCK_POOL_REVIEW.md`

Unrelated changes already present in the working tree were preserved.
