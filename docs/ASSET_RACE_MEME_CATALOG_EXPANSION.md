# Meme catalog expansion — 2026-09-16

Current configuration: **19 known candidates, 13 technically valid and explicitly
production-enabled in the central registry**. Catalog: 29 assets (13 unchanged
Stocks, 16 Memes); enabled local=29, testnet=0, mainnet=23 (10 Stocks + 13 Memes).
This configuration change does not register assets onchain or deploy anything.
Subsequent authorized local E2E passed for the full thirteen-asset catalog using
protocol-shaped fixtures; see "Local native-V4 E2E completion" at the end.
See "Current technical-only catalog proposal" below for the complete table and
preferred sources. Earlier strict-WETH/impact-based eligibility decisions are
historical, superseded by the user's technical-only catalog requirements.

## Outcome and limits

The following describes the earlier implementation pass, not the current proposal.

The central catalog now contains **28 assets: 13 unchanged Stocks and 15 Memes**.
Five additions (TENDIES, IF, JUGGERNAUT, MOO, FRONG) are enabled **locally only** through
MockRaceOracle. Production remains **AI, CASHCAT, CHUMP, PIPEDOG**: no new
production approval was justified. The approximate ten-Meme target was not forced.

All existing Stock objects and the complete four existing enabled Meme objects
matched their pre-pass hashes. No Solidity, pricing engine, oracle, keeper,
SSE/display implementation, race economics or MAX 6 constraint changed.
This adds catalog entries, not token deployments or new market infrastructure.
Primary candidates were evaluated first; backups were considered only after
those primary WETH markets failed depth review.

## Exact primary identities and candidate pools

These are **verified identity / candidate market records**, not new approvals.
All listed pools are Uniswap V3 at fee 10000 (1%). Normalized output is WETH
per one base token at 18 decimals, never a dollar or underlying-equity value.

| Symbol | Full RPC name | Canonical token | Candidate WETH pool | Base / quote decimals | Identity confidence |
|---|---|---|---|---|---|
| BONER | Boner Coin | `0x98096d17e191B3dA1d5f99a6D7b3584351b11E18` | `0xBd5cd6515ca6285941FbC177381dC8ED4844e6b8` | 18 / 18 | HIGH |
| TENDIES | TENDIES | `0x45242320DBB855EeA8Fd36804C6487E10E97FCF9` | `0x237609918F330ADD285b8bC5f8f2922283D1C4C5` | 18 / 18 | HIGH |
| IF | What If | `0x232CDFc415D10b673845D83Dc02ba2eaBe7e30d1` | `0x39A200271525E9641e799127bdAB299DAeF21953` | 18 / 18 | HIGH |
| JUGGERNAUT | The Juggernaut | `0xD7321801CAae694090694Ff55A9323139F043B88` | `0x588b0785f50063260003B7790C42f1eF74902746` | 18 / 18 | HIGH |
| MOO | Memory cow Moo | `0xD9dB30BB0D2b8d2eae3826A1372117E058791e18` | `0x9036A9406DAC1c252C364D037f489E5F0A752F54` | 18 / 18 | HIGH |
| FRONG | frong | `0x6245e67affA44a23077f0Ea7f981a8DC743a0c47` | `0x09a431261E3d0F1dc2f7e0b14718DBBBCBe19Ae4` | 18 / 18 | HIGH |

Exact contracts were found on [BONER](https://boneronlong.xyz/),
[TENDIES](https://www.tendies.now/), [What If](https://whatifonhood.com/),
[The Juggernaut](https://juggernautrh.com/), [Memory cow Moo's social](https://x.com/memorycowmoo)
and [frong](https://frong.io/), then independently read through Robinhood
Chain 4663 RPC: deployed code, name, symbol, decimals and positive supply.
Project-linked DEX profiles and actual pool pair identity corroborate these
addresses; ticker-only copycats were excluded. HIGH denotes identity confidence,
**not audited token safety**. Blockscout address API requests for all five
additions returned HTTP 403; verified-source/creator metadata was not established.

Metadata/active-L sample at block 64464069; supply is raw units (divide by 10^18).
L is raw concentrated liquidity, **not USD TVL**.

| Symbol | Total supply raw | Active liquidity raw |
|---|---|---|
| BONER | `999946321609311065068912732` | `52244417482426471546207` |
| TENDIES | `1000000000000000000000000000` | `118310272943142895642533` |
| IF | `1000000000000000000000000000` | `73954203727313031540035` |
| JUGGERNAUT | `1000000000000000000000000000` | `99833711615028185480175` |
| MOO | `988897250548292090208930449` | `56023619846731817842654` |
| FRONG | `1000000000000000000000000000` | `45340808951736895686135` |

## Common WETH and protocol provenance

The sole Meme quote remains `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`,
WETH, 18 decimals, chain 4663. All primary candidate pairs passed the existing
PoolPriceEngine's onchain ERC20 decimal, token0/token1 ordering, pool.factory(),
fee and official factory getPool checks. Latest and recent historical reads
succeeded together at explicit source blocks; no DEX API price enters an endpoint.

No USDG-quoted, native-ETH-quoted, V2, multi-hop, or other-DEX market was substituted.
V4 WETH alternatives found for JUGGERNAUT (~$201 TVL) and FRONG (~$1,031)
are dust markets and were not selected or approved; no speculative V4 config was added.

### Fresh BONER and alternate-market review

The official V3 factory was queried at fees 100/500/3000/10000. Fees 100 and
500 returned the zero address. The newly found 3000 pool
`0x369dBE2D3F904ca25C0b4Bf809FD290e191dd455` is the correct BONER/WETH pair,
but active L was **zero**. It is unusable, even though slot0 remains readable.
The established 10000 pool still moved spot 4.10% buy / 4.00% sell at ~$10k.
The old blocker was reassessed and refreshed, not blindly retained.

TENDIES also has V3 3000 pool
`0x67A39cec2DE6E9FAD91D815Dbc24D1928049A668`.
It had ~$56,343 TVL, ~$284,620 daily volume, 1841 daily transactions and 32
in the preceding hour, ~59.9 days old, active L 24450278009386193188817.
Its lower fee does not compensate for weaker depth: $10k moved spot
16.47% / 19.40%. Larger sampled trades exhausted the measured price range.
The deeper official 10000 pool is the recorded candidate, but remains disabled.

## Candidate market quality

Public exact-token DEX Screener snapshots are discovery/analytics only. Transaction
counts are not unique traders; volume is not proof of organic activity. Search /
token-pair results are bounded by provider indexing, not a guarantee of exhaustive
market discovery. Pool ages are computed at the read-only depth sample timestamp.
Meaningful non-WETH markets were compared and rejected for quote incompatibility.

| Candidate | Pool TVL | Volume 24h | Transactions 24h / 1h | Pool age |
|---|---:|---:|---:|---:|
| BONER | $223,378 | $433,754 | 955 / 28 | 16.4d |
| TENDIES | $651,665 | $456,525 | 1301 / 14 | 89.5d |
| IF | $539,325 | $1,106,499 | 3109 / 53 | 67.3d |
| JUGGERNAUT | $486,753 | $555,414 | 1616 / 74 | 87.5d |
| MOO | $194,049 | $593,250 | 1537 / 26 | 15.4d |
| FRONG | $108,315 | $122,775 | 891 / 18 | 47.6d |
| UBIK backup | $7,706 | $58,828 | 1044 / 37 | 3.7d |
| ZZZ backup | $136,559 | $501,480 | 1915 / 83 | 11.1d |
| SHROOM backup | $54,063 | $200,749 | 1578 / 122 | 11.9d |

## Executable two-way depth

Official QuoterV2 `0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7` was used
only via eth_call at block **64464746** for primary pools / TENDIES alternative,
and **64465737** for backups. Both directions cross actual initialized ticks.
Dollar notionals use explicitly approximate **WETH/USD=2406** solely as an
analytics label. This rate is not used in LIVE, P0, P1, returns or settlement.
Each cell is average execution-price impact **buy / sell**, including LP fee.
Sell input is the base quantity corresponding to the same pre-trade spot notional.
Numbers truncate to 0.01%; they are estimates, not live execution guarantees.
Extreme depleted-range results (especially UBIK and the TENDIES alternative)
are rejection evidence, not guaranteed full-fill execution costs. Quoter
output alone does not prove full input consumption or arbitrary token-transfer
behavior; no actual trade was executed to test either.

| Candidate | $100 | $500 | $1,000 | $5,000 | $10,000 |
|---|---:|---:|---:|---:|---:|
| BONER | 1.03% / 1.01% | 1.11% / 1.09% | 1.21% / 1.19% | 2.03% / 1.99% | 3.06% / 2.99% |
| TENDIES | 1.02% / 1.01% | 1.09% / 1.08% | 1.17% / 1.16% | 1.83% / 1.80% | 2.65% / 2.60% |
| TENDIES-alternate | 0.38% / 0.37% | 0.69% / 0.69% | 1.09% / 1.08% | 4.27% / 4.09% | 8.24% / 8.63% |
| IF | 1.03% / 1.02% | 1.12% / 1.11% | 1.23% / 1.22% | 2.15% / 2.10% | 3.35% / 3.13% |
| JUGGERNAUT | 1.03% / 1.02% | 1.14% / 1.13% | 1.28% / 1.26% | 2.35% / 2.29% | 3.66% / 3.58% |
| MOO | 1.03% / 1.02% | 1.15% / 1.14% | 1.29% / 1.28% | 2.37% / 2.41% | 3.69% / 3.75% |
| FRONG | 1.06% / 1.05% | 1.30% / 1.29% | 1.59% / 1.58% | 3.91% / 3.88% | 6.78% / 6.72% |
| UBIK | 1.80% / 1.81% | 4.89% / 5.53% | 8.68% / 12.09% | 37.82% / 75.88% | 76.60% / 87.93% |
| ZZZ | 1.01% / 1.00% | 1.02% / 1.00% | 1.03% / 1.01% | 1.11% / 1.09% | 1.21% / 1.19% |
| SHROOM | 1.11% / 1.09% | 1.51% / 1.48% | 2.01% / 1.97% | 6.03% / 5.64% | 11.39% / 9.79% |

Spot movement is distinct from fee-inclusive execution impact:

| Candidate | $10k spot move buy / sell | Production decision |
|---|---:|---|
| BONER | 4.10% / 4.00% | Disabled; alternate pool L=0 |
| TENDIES | 3.27% / 3.22% | Disabled; alternate is still shallower |
| IF | 4.86% / 4.16% | Disabled |
| JUGGERNAUT | 5.27% / 5.22% | Disabled; WETH V4 is dust |
| MOO | 5.30% / 5.46% | Disabled |
| FRONG | 11.71% / 11.43% | Disabled; WETH V4 is dust |
| UBIK | 5318.26% / 99.99% | Disabled; tiny/new WETH market, identity still insufficient |
| ZZZ | 0.39% / 0.39% | Disabled; identity not authoritative and sell-depth cliff |
| SHROOM | 22.51% / 16.87% | Disabled; young/shallow market and incomplete project identity |

Primary rejection is a conservative review relative to the already approved
markets, not a newly invented automated threshold. No stake limits or economics
were added. A snapshot of volume or TVL cannot cure weak endpoint depth.

### Approximate capital to move spot

Adjacent sampled notional brackets straddling 50/100/200bp spot movement:
**buy / sell**. A > bound means that target was not reached at the largest
successful sample; $0–$100 is only a coarse upper-bound bracket.

| Candidate | Move 0.5% | Move 1% | Move 2% |
|---|---:|---:|---:|
| BONER | $1,000–$5,000 / $1,000–$5,000 | $1,000–$5,000 / $1,000–$5,000 | $1,000–$5,000 / $1,000–$5,000 |
| TENDIES | $1,000–$5,000 / $1,000–$5,000 | $1,000–$5,000 / $1,000–$5,000 | $5,000–$10,000 / $5,000–$10,000 |
| TENDIES-alternate | $100–$500 / $100–$500 | $500–$1,000 / $500–$1,000 | $1,000–$5,000 / $1,000–$5,000 |
| IF | $1,000–$5,000 / $1,000–$5,000 | $1,000–$5,000 / $1,000–$5,000 | $1,000–$5,000 / $1,000–$5,000 |
| JUGGERNAUT | $500–$1,000 / $500–$1,000 | $1,000–$5,000 / $1,000–$5,000 | $1,000–$5,000 / $1,000–$5,000 |
| MOO | $500–$1,000 / $500–$1,000 | $1,000–$5,000 / $1,000–$5,000 | $1,000–$5,000 / $1,000–$5,000 |
| FRONG | $100–$500 / $100–$500 | $500–$1,000 / $500–$1,000 | $1,000–$5,000 / $1,000–$5,000 |
| UBIK | $0–$100 / $0–$100 | $0–$100 / $0–$100 | $100–$500 / $100–$500 |
| ZZZ | $10,000–$25,000 / $10,000–$25,000 | >$25,000 / $10,000–$25,000 | >$25,000 / $10,000–$25,000 |
| SHROOM | $100–$500 / $100–$500 | $500–$1,000 / $500–$1,000 | $1,000–$5,000 / $1,000–$5,000 |

These brackets are **not the net cost of manipulation**. They exclude gas,
flash liquidity, arbitrage, hedging, reversals and LP withdrawal. ZZZ's apparent
depth at $10k does not extend across its entire curve: at $25k, buy spot moved
0.99% but sell spot moved **20.17%**. Upper buy targets were not measured beyond
$25k. No stronger depth is inferred from headline TVL.

## Backup identity / market blockers

- **UBIK:** existing candidate token `0x812486EAea648819853F8E372dc9f1516C7868Bd`;
  WETH V3 10000 `0xBea39772E5c5c2730e56C014b2Ef16185CC02d32`.
  ERC20 metadata and factory/pair identity are readable, but authoritative project
  confirmation remains insufficient. At ~$100 spot moved 1.57% / 1.65%.
- **ZZZ:** RPC candidate `0x7dbf38976f6D3b9c529e7D9484A71898B409eE6a`;
  WETH V3 10000 `0xDD3c8aa6551bF5049310399C124cbB699b7d1c5C`;
  decimals 18, name/symbol ZZZ, raw supply 840000000000000000000000000.
  Factory/pair verification and latest reads succeeded; historical verification
  was blocked by the public RPC's HTTP 403. However, its DEX-linked
  [Andrew Curran post](https://x.com/AndrewCurran_/status/2095990287709737314)
  was retrieved through official X oEmbed and is a wiki/AI news reference,
  **not a token contract publication**. [Bitrue's explainer](https://www.bitrue.com/blog/is-zzz-crypto-legit)
  repeats a market-data contract and a GMX creator narrative; it is not independent
  creator/deployment proof. Identity confidence stays MEDIUM, not a canonical
  production approval. Sell-side cliff is an additional exposure concern.
- **SHROOM:** RPC candidate `0xab093dEF657F15dF31b33922A95e047aDd645B29`;
  WETH V3 10000 `0xC641a0DC848E7aadd7c69d800BAE2FEA9b258610`;
  name MUSHROOM, symbol SHROOM, decimals 18, raw supply 10^27.
  Readable factory/pair metadata, but linked project social did not yield an
  authoritative contract reference. Exchange listings are corroboration only.
  Pool age ~11.9d does not compensate for severe depth weakness.
- **ASTRO:** intended astronaut identity is not authoritatively verified. Current
  exact-name tracker candidate `0xdE1a4B8927769f8b6Ed07e5d5F49E7f649EbCbbd`
  showed only an SPCX-quoted market, no returned WETH V3/V4 pool, and its website
  returned 404. Established ASTRO/WETH discovery is V2-heavy (unsupported).
  NVIDIA ROBODOG / AstroMax ticker collisions were excluded. No production token
  or pool address was invented.

ZZZ, SHROOM and ASTRO are reviewed backups, **not additions to the canonical
catalog**; their addresses above are expressly candidates. Existing UBIK remains
disabled. Backups' readable ERC20/pool metadata does not prove canonical identity.

## Required final common-block runtime reads

All four currently approved Memes were verified together again through the
unchanged engine and the read-only checker (chain 4663):

- Latest block **64467332**, timestamp **1789557557**,
  hash `0xd1b07789966035aaba6cb62c65cbe9bfbefa6a955da12f3ce0383a3ff7a70147`.
- T=**1789557497**; E=**64466733**, timestamp **1789557496**,
  hash `0xa31ed8972630f89ffba191e057251f80920c37f094ad3c7f8b502450534d598a`.
- B=**64466734**, timestamp **1789557497**,
  hash `0xbc6b9748f66a57a9f144bec0a18493adaea6b32c9ea8b0859301ea9eab7db650`;
  B.parentHash exactly E.hash. Latest and both historical blocks were readable.

| Approved Meme | Latest WETH/token | Historical E WETH/token | $10k spot move buy / sell |
|---|---:|---:|---:|
| AI | 0.000113164925340408 | 0.000113164925340408 | 0.22% / 0.22% |
| CASHCAT | 0.000065779613946971 | 0.000065779613946971 | 0.41% / 0.41% |
| CHUMP | 0.000011121962917317 | 0.000011121962917317 | 1.16% / 0.87% |
| PIPEDOG | 0.000000951665755074 | 0.000000950242409259 | 0.36% / 0.36% |

CHUMP depth changed since the previous pass. No proven configuration error was
found and its frozen approved source was not replaced. Existing approvals are
technical configuration, not evidence of unlimited safe aggregate race exposure.

Primary candidates also passed common latest/historical engine reads before
rejection: latest 64464069, E 64463465, B 64463466, with correct consecutive
lineage. No external transaction, account, approval or swap was used in research.

An extra UBIK/ZZZ/SHROOM historical lookup failed with a Cloudflare HTTP 403
after factory verification and latest reads. One bounded retry at the known
recent E/B blocks also returned 403. Backup historical coverage is therefore
**incomplete**, not passed. This does not negate the earlier successful common
latest/historical reads of all four enabled Memes, but confirms that this public
RPC endpoint alone is not an evidenced production archive/SLA solution.

## Unchanged endpoint/lifecycle and validation

T0=bettingEndTime, T1=T0+duration. Price is the last E state with E.timestamp<T,
witnessed by its immediate child B at/after T. All active assets share E.hash
independently for P0 and P1. LIVE uses the same frozen approved source identities
and generic engine. Capture grace governs snapshot availability; captured P1 is
permanent. Resolution/claim can occur later; pull-based claim/refund has no expiry.
No endpoint, winner-selection or payout code changed.

Validation completed once at end:

- Registry configuration: 28 local-enabled, 0 testnet, 14 mainnet-enabled =
  10 unchanged Stocks + 4 Memes. These are configured entries, not a deployment.
- Engine / collector / keeper / SSE / display: **29 JS tests passed** (one new
  regression proves all five new entries stay Mock-local and out of production).
- `forge build --skip-lint`: passed, cache current / compilation skipped.
  No Solidity compiler warning; sandbox signature-cache write warning remains.
- Full `forge test`: **147 passed**, 0 failed; SignedPoolRaceOracle **12/12**;
  four grouped invariants, 256 runs / 128000 calls / 0 reverts; both fuzz tests passed.
- `npm run build` and `npm run lint`: passed; existing bundle-size warning and
  6 unrelated lint warnings were not changed.
- Script `node --check`, local shell `bash -n`, `git diff --check`: passed.
- Local Meme regression: **AI/CASHCAT/CHUMP/PIPEDOG**, one four-contender race,
  WETH prices / USDG bets, common P0 E=36 / P1 E=43, boundary movement ignored,
  capture +60s, resolve +1d, claim +60d, CASHCAT winner, payout **39.40 USDG**.
- Stock regression run once: **NVDA/TSLA/MU**, common P0 E=79 / P1 E=85,
  same delays, TSLA winner, payout **29.60 USDG**.
- **Requested two-old + two-newly-production-enabled E2E NOT completed:**
  there are zero newly approved markets. Local mock approvals were not falsely
  presented as new production approval. Four-existing-Meme regression above
  is not a substitute for that acceptance criterion.
- Disposable Anvil used unlocked local accounts; no key/env access, packages,
  commits, pushes or external broadcasts.

## Changed files (this pass only)

1. `config/asset-race-assets.json`: five local-only additions, refreshed BONER blocker.
2. `scripts/check-asset-race-registry.mjs`: validates expanded reviewed catalog.
3. `scripts/check-asset-race-meme-pools.mjs`: focused --assets filter, individual
   reads to avoid observed incomplete public-RPC JSON batch responses.
4. `scripts/asset-race-pool-price-engine.test.mjs`: local-only / production-exclusion regression.
5. `scripts/asset-race-stock-e2e.mjs`: 3–6 selected approved contenders, dynamic
   local bettors/expected payout, unchanged default Stock regression.
6. `docs/ASSET_RACE_MEME_CATALOG_EXPANSION.md`: this evidence and validation report.

## Remaining blockers / exact next step

Production expansion is blocked by primary-market endpoint manipulation depth
and backup identity/protocol/depth deficiencies, not an implementation package
or token-count limit. Depth is time-varying; secure signing-service operations,
reliable archive RPC/SLA and exposure/alert review remain existing launch prerequisites.
The public RPC's observed HTTP 403 also blocks completion of backup historical
verification until an appropriately accessible archive endpoint is available.

Before a combined final rehearsal that claims expanded Meme coverage:
obtain and verify **at least two qualifying canonical direct-WETH V3/V4 markets**
(stronger primary pools or authoritatively confirmed, sufficiently deep backups),
then register only evidenced sources and run the required >=4-contender race with
**two existing + two newly approved Memes** through LIVE/P0/P1/late claim.
If proceeding with only the four approved Memes, explicitly reduce the rehearsal
scope; do not call the expansion acceptance criterion passed.

## Current technical-only catalog proposal — supersedes earlier eligibility decisions

The user clarified selection requirements: **no minimum liquidity, impact,
manipulation-cost, exposure-policy or $50 stake criterion**. Canonical identity,
exact supported source, working runtime/historical consumption, decimals,
orientation and quote compatibility decide eligibility. Relative pool quality
breaks ties; it is not an arbitrary rejection threshold. Earlier impact/exposure
rejections in these reviews are historical and do not govern this proposal.

**19 known symbol-level candidate records** = 16 registry Memes plus
ZZZ/SHROOM/ASTRO reviewed extras. Multiple possible AMC addresses remain
one unresolved identity, not extra qualified assets. Ticker-only ideas without a
reviewed token record are not counted. **13 technically valid assets**, including
the original enabled four. All thirteen are now registry-enabled by explicit
authorization. No further token discovery is necessary to reach ten.

### Complete known-candidate table

"enable" was the technical review recommendation, now applied by an explicitly
authorized registry change. All thirteen valid rows have positive supply, base/quote
decimals 18, initialized verified sources, working two-way quotes and common
historical endpoint reads. WETH=`0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`;
native ETH=`address(0)`. Unverified addresses are explicitly candidates, not
canonical approvals. Runtime/history marked "prior" were not refreshed for
unresolved identities in this pass.

| Symbol | Canonical token address / candidate | Protocol | Pool / PoolKey | Quote asset | Canonical identity status | Runtime quote status | Historical endpoint status | Special technical concerns | Relative pool quality | Production enabled now | Recommended catalog status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AI | `0x2E8c31162b855A2ffa90F6F8634643Ad6F111e18` | V3 1% | `0xc4a21f9d6485FC5893DD4A491B320a83DAF4Da1D` | WETH | Verified: primary publication + RPC | Pass: fresh buy/sell | Pass: both fresh endpoints | No technical incompatibility found | Established leading WETH pool; larger indexed liquidity than returned ETH alternatives | Yes | enable |
| CASHCAT | `0x020bfC650A365f8BB26819deAAbF3E21291018b4` | V3 0.3% | `0xd42A491087a15E5afd51FEb3606066Cc152d2b09` | WETH | Verified: primary publication + RPC | Pass: fresh buy/sell | Pass: both fresh endpoints | baseIsToken0=true; other selected sources false | More activity/lower fee than larger 1% WETH alternative; keep verified 0.3% source | Yes | enable |
| HOOD | `0xDAA8f3f54c66E9BE2c44C1B6b566cBD07229CED3` | V4 | `0xc40d3cac54f587debdcef3887912767656255c9b04f3914ffa70e01370e046f8` (K1) | Native ETH (K1) | Verified: primary publication + RPC | Pass: fresh buy/sell | Pass: both fresh endpoints | Native currency is address(0), not ERC20 | Only returned compatible pool; large indexed native market | Yes | enable |
| AMC | Unverified canonical; candidate `0x385F4f8ae47651ce5F58F5265395a669f8281e18` | Unverified | Not verified/documented | Unverified | Unresolved | Not verified | Not verified | AMC/MEME address/symbol collision; no canonical project confirmation | Not rankable without canonical identity/source | No | unresolved |
| BLORB | `0x4d14284aFe559B7c6B9e6FAd6ebAeaA0F6051818` | V4 | `0x75ef5a3400b9da7bb49e776836995739f1ab0bae029e2e71fe654e52efc56b08` (K2) | Native ETH (K2) | Verified: primary publication + RPC | Pass: fresh buy/sell | Pass: both fresh endpoints | Native; concentrated/directional depth is a quality note, not a blocker | Only returned compatible pool; largest indexed liquidity in proposed set, directional depth varies | Yes | enable |
| CHUMP | `0x0E0d2C89a5a019FE1cF762e5e33187631DACC21B` | V3 1% | `0x714442e9A611f8561A7dF108D6d925132937cFb8` | WETH | Verified: primary publication + RPC | Pass: fresh buy/sell | Pass: both fresh endpoints | No technical incompatibility found | Larger and more active than returned native alternatives | Yes | enable |
| DEGEN | Unverified canonical; candidate `0x0830a9dd26a04e959657ab6788d45f5725590c32` | Unverified | Not verified/documented | USDG observed; no ETH source | Unresolved | Not verified | Not verified | Robinhood bridge/canonical mapping unverified; only documented USDG source | Known USDG discovery cannot substitute for approved Meme ETH quote | No | unresolved |
| BONER | `0x98096d17e191B3dA1d5f99a6D7b3584351b11E18` | V3 1% | `0xBd5cd6515ca6285941FbC177381dC8ED4844e6b8` | WETH | Verified: primary publication + RPC | Pass: fresh buy/sell | Pass: both fresh endpoints | No pricing incompatibility; tiny deployed token code alone is not an eligibility veto | Leading WETH pool; native alternatives much smaller | Yes | enable |
| PIPEDOG | `0x5Cb6F181081301b44905F3ae15419112ecaBd8A6` | V3 1% | `0xB7f10f74B39291b9290b779978e19A7637C742D6` | WETH | Verified: primary publication + RPC | Pass: fresh buy/sell | Pass: both fresh endpoints | No technical incompatibility found | Dominant returned compatible pool; other WETH pool negligible by comparison | Yes | enable |
| UBIK | Unverified canonical; candidate `0x812486EAea648819853F8E372dc9f1516C7868Bd` | V3 1% | `0xBea39772E5c5c2730e56C014b2Ef16185CC02d32` | WETH | Unresolved | Pass: prior Quoter calls | Not passed: earlier RPC HTTP 403 | Authoritative project mapping unverified; old historical RPC lookup failed | Small/new WETH vs larger USDG; identity, not size, prevents inclusion | No | unresolved |
| TENDIES | `0x45242320DBB855EeA8Fd36804C6487E10E97FCF9` | V3 1% | `0x237609918F330ADD285b8bC5f8f2922283D1C4C5` | WETH | Verified: primary publication + RPC | Pass: fresh buy/sell | Pass: both fresh endpoints | No technical incompatibility found | Deeper/older than 0.3% WETH and returned native alternatives | Yes | enable |
| IF | `0x232CDFc415D10b673845D83Dc02ba2eaBe7e30d1` | V3 1% | `0x39A200271525E9641e799127bdAB299DAeF21953` | WETH | Verified: primary publication + RPC | Pass: fresh buy/sell | Pass: both fresh endpoints | No technical incompatibility found | Larger/older than returned native alternatives | Yes | enable |
| JUGGERNAUT | `0xD7321801CAae694090694Ff55A9323139F043B88` | V3 1% | `0x588b0785f50063260003B7790C42f1eF74902746` | WETH | Verified: primary publication + RPC | Pass: fresh buy/sell | Pass: both fresh endpoints | No technical incompatibility found | Larger/older than returned native alternatives | Yes | enable |
| MOO | `0xD9dB30BB0D2b8d2eae3826A1372117E058791e18` | V3 1% | `0x9036A9406DAC1c252C364D037f489E5F0A752F54` | WETH | Verified: primary publication + RPC | Pass: fresh buy/sell | Pass: both fresh endpoints | Identity publication from prior verified project social evidence | Larger/more active than returned native alternatives | Yes | enable |
| FRONG | `0x6245e67affA44a23077f0Ea7f981a8DC743a0c47` | V4 | `0xacea8920877840033f0275c37f9b61550b5326917e948bcf8339714d96f9521a` (K4) | Native ETH (K4) | Verified: primary publication + RPC | Pass: fresh buy/sell | Pass: both fresh endpoints | New preferred PoolId/oracleId; do not rewrite existing race snapshots | Native pool ~6.3x indexed liquidity and ~6.8x volume vs WETH; lower fee, slightly older | Yes | enable |
| DOGO | `0x77b0AA38451ccDC1b42587E2f80B9879A7f82356` | V4 | `0xbe05adff5cf9a0bfd2f1eeb69458d5dda27e7075d6f49b0458db4b4c1967b6b1` (K3) | Native ETH (K3) | Verified: primary publication + RPC | Pass: fresh buy/sell | Pass: both fresh endpoints | Native; prior impact is not an eligibility veto | Only returned compatible native pool; large indexed market | Yes | enable |
| ZZZ | Unverified canonical; candidate `0x7dbf38976f6D3b9c529e7D9484A71898B409eE6a` | V4 | `0x6538e2c223ed70228114983afecbe5e69fe627e2fafdf367bdd6bdeff2ad391f` (K5) | Native ETH (K5) | Unresolved | Pass: prior six-size two-way calls | Pass: 64658105/64658106 | afterSwap return-delta hook; current empty-hookData quotes work, source behavior not authoritative | Native indexed liquidity exceeds known WETH alternative; not eligible until identity resolved | No | unresolved |
| SHROOM | Unverified canonical; candidate `0xab093dEF657F15dF31b33922A95e047aDd645B29` | V3 1% | `0xC641a0DC848E7aadd7c69d800BAE2FEA9b258610` | WETH | Unresolved | Pass: prior Quoter calls | Not passed: earlier RPC HTTP 403 | No authoritative project publication; historical lookup not passed | Smaller compatible WETH market; identity unresolved, not excluded for size | No | unresolved |
| ASTRO | Unverified canonical; candidate `0xdE1a4B8927769f8b6Ed07e5d5F49E7f649EbCbbd` | Unverified; other colliding V2 markets | Not verified/documented | SPCX observed; no ETH source | Unresolved | Not verified | Not verified | Canonical identity unverified; observed SPCX quote/other V2 sources unsupported | No verified compatible direct ETH source; V2/colliding ASTRO markets not selected | No | unresolved |

### Exact native PoolKeys

Each key hashes to the full PoolId in the table. K1–K4 are initialized/runtime
verified; K5 is the previously verified ZZZ source, not a canonical token approval.

| Key / symbol | currency0 | currency1 | Fee pips | tickSpacing | hooks |
| --- | --- | --- | ---: | ---: | --- |
| K1 / HOOD | `0x0000000000000000000000000000000000000000` | `0xDAA8f3f54c66E9BE2c44C1B6b566cBD07229CED3` | 0 | 1 | `0x0000000000000000000000000000000000000000` |
| K2 / BLORB | `0x0000000000000000000000000000000000000000` | `0x4d14284aFe559B7c6B9e6FAd6ebAeaA0F6051818` | 0 | 1 | `0x0000000000000000000000000000000000000000` |
| K4 / FRONG | `0x0000000000000000000000000000000000000000` | `0x6245e67affA44a23077f0Ea7f981a8DC743a0c47` | 2500 | 60 | `0x0000000000000000000000000000000000000000` |
| K3 / DOGO | `0x0000000000000000000000000000000000000000` | `0x77b0AA38451ccDC1b42587E2f80B9879A7f82356` | 0 | 1 | `0x0000000000000000000000000000000000000000` |
| K5 / ZZZ | `0x0000000000000000000000000000000000000000` | `0x7dbf38976f6D3b9c529e7D9484A71898B409eE6a` | 0 | 200 | `0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044` |

All native bases are currency1 (baseIsToken0=false). V3 CASHCAT baseIsToken0=true;
the other selected V3 bases are token1. Sources retain exact quote address,
PoolId/PoolKey and oracleId; ETH_QUOTE normalization does not erase identity.

### Relative selection, not a liquidity cutoff

Public exact-token DexScreener pair lists were compared for supported direct
ETH/WETH Uniswap V3/V4 sources. Lists are indexed/bounded, not exhaustive.
The values below are analytics sampled near the runtime anchor, not guarantees
of executable depth or onchain TVL. Stability is not inferred from one snapshot;
pool age and prior/current read success provide only limited continuity evidence.

| Proposed source | Indexed liquidity USD | Indexed volume 24h USD | Trades 24h | Approx pool age days |
| --- | ---: | ---: | ---: | ---: |
| AI | 4430359.38 | 2955284.14 | 943 | 56.0 |
| CASHCAT | 2167055.25 | 3931171.62 | 8176 | 76.9 |
| HOOD | 7620645.89 | 4335670.79 | 214 | 33.1 |
| BLORB | 11262448.92 | 1813551.50 | 125 | 22.1 |
| CHUMP | 1063720.57 | 1988110.74 | 8498 | 47.7 |
| BONER | 229592.47 | 406630.49 | 776 | 16.7 |
| PIPEDOG | 8526445.71 | 1342672.49 | 915 | 49.9 |
| TENDIES | 646172.73 | 502442.13 | 1342 | 89.7 |
| IF | 508012.46 | 840668.59 | 2554 | 67.5 |
| JUGGERNAUT | 463505.69 | 531790.54 | 1586 | 87.7 |
| MOO | 198771.78 | 558164.44 | 1531 | 15.7 |
| FRONG | 633019.32 | 852530.66 | 2955 | 47.9 |
| DOGO | 1324170.99 | 1635844.26 | 93 | 37.2 |

FRONG's preferred native V4 pool has ~$633k indexed liquidity/$853k volume versus
~$100k/$126k for its verified WETH V3 source. It is slightly older, uses 0.25%
LP fee versus 1% V3 and has no hook. Runtime StateView also reports protocolFee
1638800 and lpFee 2500; do not mistake LP fee for total execution cost. The
preferred native source passed quotes and both historical reads, so this is a
relative source improvement, not a fabricated conversion or new adapter.
FRONG's old WETH source remains technically usable, but is not the preferred
proposal. Existing race snapshots must never be rewritten to the new source.

CASHCAT's selected 0.3% WETH pool has ~$2.17m indexed liquidity but substantially
more volume/activity than the ~$4.70m 1% alternative; headline TVL alone does not
overrule the established selection. Other selected WETH markets generally lead
their returned compatible alternatives on liquidity/age/activity. HOOD/BLORB/
DOGO use their only returned compatible markets; prior directional impact does
not invalidate their technical eligibility. No impact/manipulation study was run.

### Fresh technical evidence

Read-only chainId=4663. Anchor block **64688152**, timestamp **1789579776**, hash
`0x9d6b3b1815d1149339c2c5d1327f456e4fe3ec97062681d745b444042726c1e3`.

Existing generic engine verification checked decimal metadata, V3
token0/token1/fee/factory/getPool and V4 exact sorted key/hash/orientation/
initialization. No production registry object was changed; candidate sources
were assembled in memory for read-only verification. Project identity evidence
was reused from the previous verified reviews; GreenHood's full contract was
also confirmed again at [its project site](https://greenhood.club/).
[Juggernaut](https://juggernautrh.com/) and [frong](https://frong.io/) project
references corroborate the prior exact-token publication records (including
their linked launch/buy sources). Explorer audit/source verification is not a
generic new catalog requirement; ZZZ's identity gap remains specific.

All thirteen final preferred sources share each historical E:

- Endpoint A T=1789579716: E=64687561, timestamp 1789579715, hash
  `0x6732994507d86651cf824df916d21828e0ccb87b1178cedc119ab32d4fee94f4`;
  B=64687562, timestamp 1789579716, B.parentHash=E.hash.
- Endpoint B T=1789579656: E=64686972, timestamp 1789579655, hash
  `0xb270cdfad1402fb9306190bb0ff92978eef74f757dc9ce70be17db91eb8c5484`;
  B=64686973, timestamp 1789579656, B.parentHash=E.hash.
- The final thirteen-source set, including native FRONG, was explicitly read
  again at the current block and BOTH common E blocks. These historical probes
  demonstrate T0/T1 source compatibility, not a newly deployed onchain race.

Fresh official Quoter calls tested both directions with quote input **0.01 ETH**
and the corresponding pre-trade spot base notional. Native FRONG replaced V3 in
the final results below; its V3 fallback also passed. No USD rate, manipulation
threshold, private key, account, token approval or transaction was used.

| Proposed asset | Buy quote in raw | Buy base out raw | Sell base in raw | Sell quote out raw |
| --- | ---: | ---: | ---: | ---: |
| AI | 10000000000000000 | 85797702713415678053 | 86664564561571777146 | 9899975052948035 |
| CASHCAT | 10000000000000000 | 151136522833706582657 | 151592049727476705049 | 9969950475992065 |
| HOOD | 10000000000000000 | 471062515469407688856 | 471062986680330780980 | 9912029619787573 |
| BLORB | 10000000000000000 | 212731446901289481805 | 212731659678203703909 | 9999989997873107 |
| CHUMP | 10000000000000000 | 912192709567618120328 | 921412590210028096468 | 9899937544371957 |
| BONER | 10000000000000000 | 604716956622424857762 | 610854471013932260839 | 9899525751505156 |
| PIPEDOG | 10000000000000000 | 10188326814367829027472 | 10291290032177711893726 | 9899951106728541 |
| TENDIES | 10000000000000000 | 2147880423694238976070 | 2169661746790271047474 | 9899609590627794 |
| IF | 10000000000000000 | 1885648119509132797158 | 1904795399205211280293 | 9899478549226027 |
| JUGGERNAUT | 10000000000000000 | 4437759258815213714401 | 4482872462792970916948 | 9899365408338363 |
| MOO | 10000000000000000 | 1336105617042157583531 | 1349689116288031286289 | 9899358310876139 |
| FRONG | 10000000000000000 | 4788878252827060202885 | 4803142108175827612248 | 9970303074479165 |
| DOGO | 10000000000000000 | 1804111798141352984560 | 1804113605509452657252 | 9875044103503928 |

All raw values use 18 decimals. Exact-input simulations do not guarantee actual
token-transfer receipts or full-input consumption; this standard quote-interface
limitation is not a newly invented eligibility cutoff. All chosen sources are
hook-free, so no unsupported hook behavior remains in the proposed thirteen.
ZZZ's prior afterSwap/return-delta source quotes work, but absent canonical
primary confirmation means it is not included; hook behavior remains documented
rather than silently assumed inert.

### Proposed catalog and remaining unresolved records

**AI, CASHCAT, CHUMP, PIPEDOG, IF, TENDIES, BONER, JUGGERNAUT, MOO, FRONG,
HOOD, BLORB, DOGO** = 13. Target of at least ten is **reached**.

Unresolved: AMC (canonical address/symbol collision), DEGEN (Robinhood canonical/
bridge mapping and compatible ETH source absent), UBIK (primary project identity
not confirmed), ZZZ (primary canonical publication absent, active hook source
semantics not authoritative), SHROOM (primary identity and historical coverage
not established), ASTRO (canonical identity and supported ETH source unverified).
They are not rejected for low liquidity, impact or user stake size.

The technical-only review itself made no registry enablement, contracts, product/tooling/test changes, installs,
commits, pushes, deployments or broadcasts. Only reviews and local TASK/HANDOFF
were updated. No implementation suite was rerun for a read-only/documentation
pass; documentation/diff checks applied. Its production-enabled flags remained four.

Next discovery step is **not needed** for the target. Explicit approval has now
been received and the proposed sources/identifiers applied to the central registry,
including DOGO's new catalog entry and the four native source configs.
Optional future unresolved review starts with authoritative exact-contract
publication, not further liquidity/manipulation analysis.

## Authorized registry configuration — 2026-09-16

Enabled: AI, CASHCAT, CHUMP, PIPEDOG, IF, TENDIES, BONER, JUGGERNAUT, MOO,
FRONG, HOOD, BLORB, DOGO. Nine V3/WETH sources and four hook-free V4/native
sources use the existing ETH_QUOTE/18 signed-pool pipeline. DOGO is a new registry
entry; HOOD/BLORB receive their reviewed native sources. FRONG replaces its
disabled candidate V3 source with K4; existing onchain race snapshots are untouched.
AMC/DEGEN/UBIK stay disabled. ZZZ/SHROOM/ASTRO remain unconfigured/unresolved.
All Stocks, the original four Meme objects and non-asset configuration matched
pre-edit hashes. No Solidity, frontend logic, keeper or economic changes.
Frontend catalog and LIVE consumers derive the expanded set from central data;
the picker still requires matching enabled onchain registration and oracle config.

Validation: registry passed (29 local, 0 testnet, 23 mainnet); 26 collector/pricing/
endpoint/native tests, 10 LIVE/display/SSE tests and 5 keeper tests passed.
The first SSE attempt hit sandbox loopback EPERM; approved unsandboxed retry passed.
12 existing SignedPoolRaceOracle Solidity tests passed, including race creation,
delayed endpoint settlement/claim, final tie/late refund and all-negative winner.
Build/typecheck and lint passed with existing bundle/lint warnings; Forge emitted
only a signature-cache filesystem warning. Exact thirteen source configurations
matched the verified proposal. Registry script syntax and diff checks passed.
New actual-registry AI/IF/FRONG regression covers selection, mixed V3/native V4
T0/T1 reads, delayed immutable P1 and percentage-return/winner calculation.

Full local Anvil Meme E2E was NOT run: the existing script unconditionally deploys
fixtures and sends transactions, prohibited in this task. It also converts every
selected asset into a synthetic V3/WETH fixture, so it cannot establish actual
native-V4 FRONG transaction coverage. No broadcast/deployment was attempted.
Catalog configuration is ready for the next readiness step, NOT a claim of full
E2E or deployment readiness. Next: explicitly authorize local-only fixture setup/
transactions and native-V4 E2E coverage, then run AI/IF/FRONG through creation,
settlement and late claim/refund. No mainnet interaction is needed.

## Local native-V4 E2E completion — 2026-09-16

The earlier E2E restriction is superseded for this task only: local Anvil fixture
deployments and transactions were explicitly authorized. No public chain, fork,
real funds, package install, commit or push was used. Production registry,
AssetRace, SignedPoolRaceOracle and keeper matched pre-task hashes.

Test-only changes: StateView-shaped hook-free native-V4 fixture, four fixture
unit tests, and shared E2E protocol/source dispatch. Meme fixtures preserve exact
canonical addresses/pools/PoolKeys, fees, decimals and orientation from the central
catalog on chain 31337; their signed oracle identities use that local domain.
Copying code does not initialize V3 storage; explicit initial-price setup fixed
an initial harness-only failure. Production contracts required no modification.

All these local cases passed:

| Contenders | Outcome |
| --- | --- |
| AI / IF / FRONG | IF wins; late payout 29.6 USDG |
| IF / AI / FRONG | AI wins; late payout 29.6 USDG |
| AI / FRONG / IF | FRONG wins; late payout 29.6 USDG |
| AI / IF / FRONG (`--void`) | Exact tie VOID; all three late refunds of 10 USDG |
| CASHCAT / CHUMP / PIPEDOG / HOOD / BLORB / DOGO | CHUMP wins; late payout 59 USDG |
| TENDIES / BONER / JUGGERNAUT / MOO | BONER wins; late payout 39.4 USDG |
| NVDA / TSLA / MU | Unchanged Stock path; TSLA wins; late payout 29.6 USDG |

Every approved Meme participated in a complete local creation/betting/start/
endpoint/resolve/claim fixture flow, with at most six contenders per race.
AI, IF and FRONG each won and claimed in representative mixed-source races.
P0/P1 share their respective predecessor blocks; boundary/current movements do
not alter final prices or returns. Capture was delayed 60 seconds, finalization
one day, and claims/refunds 60 days. Contract return values equal integer
percentage-return calculations; terminal prices remain unchanged.

FRONG uses the exact K4 native PoolKey, positive historical StateView reads,
18/18 decimals, baseIsToken0=false and ETH_QUOTE normalization. All engine reads
are guarded against ERC20 calls at address zero; every case reported zero such
calls. Solidity and JS tests reject altered PoolKeys/orientation and unsupported
native quoting. These are protocol-shaped pricing fixtures, not actual Uniswap
PoolManager swap/hook or public-chain integration tests.

Validation passed: 41 relevant JS tests; 16 relevant Solidity tests (12 existing
signed-pool, four fixture); registry; forge build; frontend build/typecheck/lint;
fixture formatting; harness syntax; git diff --check. Existing lint/bundle/Forge
lint notes and signature-cache permission warnings remain unrelated.
Sandbox listener/connect EPERM was confirmed environmental and resolved by
approved execution outside the sandbox. No tests were skipped or weakened.

No remaining local blocker. On 2026-09-22 the operator-run Alchemy Robinhood
Mainnet probe passed current plus 60/300/600/3600-second common historical reads
for all thirteen production Memes, including native-V4 FRONG and consecutive
endpoint/boundary lineage. This is sampled capability evidence, not an archive
SLA. The next production-readiness step is operator signer/keeper/frontend
configuration using the production runbook. Public-chain rehearsal/deployment
needs separate explicit authorization.
