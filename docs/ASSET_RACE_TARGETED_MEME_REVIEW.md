# Targeted Meme review — partial, not a production approval

Catalog eligibility update: the user's technical-only criteria supersede this
review's impact/exposure-based exclusions. The complete current proposal is in
ASSET_RACE_MEME_CATALOG_EXPANSION.md: 19 known candidates, 13 technically valid,
including HOOD and a preferred native FRONG source. The subsequent explicitly
authorized registry pass enabled all thirteen; see the current catalog review.
Keep the measurements below as evidence, not arbitrary eligibility thresholds.

Historical review snapshot (2026-09-16): the production set remained AI, CASHCAT, CHUMP and
PIPEDOG. No candidate was enabled in this pass. Existing Stock entries and the
four approved Meme token/pool/oracle bindings were preserved byte-for-byte.

Fresh resumed-review evidence and current classifications are recorded below in
"Resumed review". Earlier discovery/validation sections are historical snapshots.

## Implemented offline

- The shared engine accepts canonical WETH or V4 native ETH `address(0)` for
  Memes only, normalized to `ETH_QUOTE` with 18 quote decimals.
- Native currency is never queried as an ERC20. V4 validation binds the sorted
  currencies, orientation and complete PoolKey to its exact PoolId.
- Oracle identity retains the actual quote address; normalization does not
  replace native ETH with WETH or merge their cryptographic source identities.
- LIVE labels both representations ETH and does not label either as USDG.
- The read-only review helper uses the official V3/V4 Quoters at an explicit
  block for both directions. V4 returns amountOut/gas only; no post-swap state
  is fabricated. The checker includes $100/$500/$1k/$2.5k/$5k/$10k sizes.
- Each currently enabled Meme has `maxRecommendedRaceExposureUsd: null` and
  `raceExposureReviewStatus: PENDING_CURRENT_EXECUTABLE_DEPTH`. Null means an
  unmeasured recommendation, NOT unlimited safe exposure or an economic cap.

AssetRace, SignedPoolRaceOracle, keeper, payout economics, MAX 6 and settlement
semantics were not changed in this pass. For the existing signed-pool path,
T0 is bettingEnd and T1 = T0 + duration. Endpoint state is read at E where
E.timestamp < T <= B.timestamp, B.number = E.number + 1 and B.parentHash =
E.hash. Every active asset shares E at each endpoint. Claims/refunds retain
their existing indefinite availability.

## Candidate discovery (not completed runtime approval)

Read-only discovery anchor: chain 4663, block 64479664, timestamp 1789558800,
hash `0x71bab76e921f553efc587b203b2af278c2aa2d20e9b207a69a1f130e99d5966f`.
The following addresses are review inputs, not newly approved configuration.
Indexed liquidity/volume are discovery metrics, not executable depth or prices.

| Candidate | Token / candidate token | Leading pool / PoolId | Protocol / quote | Indexed liquidity USD | Indexed 24h volume USD |
| --- | --- | --- | --- | ---: | ---: |
| IF | `0x232CDFc415D10b673845D83Dc02ba2eaBe7e30d1` | `0x39A200271525E9641e799127bdAB299DAeF21953` | V3 / WETH | 537086.98 | 1104676.22 |
| TENDIES | `0x45242320DBB855EeA8Fd36804C6487E10E97FCF9` | `0x237609918F330ADD285b8bC5f8f2922283D1C4C5` | V3 / WETH | 651166.85 | 454924.02 |
| BONER | `0x98096d17e191B3dA1d5f99a6D7b3584351b11E18` | `0xBd5cd6515ca6285941FbC177381dC8ED4844e6b8` | V3 / WETH | 226878.60 | 440977.76 |
| DOGO | `0x77b0AA38451ccDC1b42587E2f80B9879A7f82356` | `0xbe05adff5cf9a0bfd2f1eeb69458d5dda27e7075d6f49b0458db4b4c1967b6b1` | V4 / native ETH | 1322126.34 | 44942.93 |
| ZZZ | `0x7dbf38976f6D3b9c529e7D9484A71898B409eE6a` | `0x6538e2c223ed70228114983afecbe5e69fe627e2fafdf367bdd6bdeff2ad391f` | V4 / native ETH | 392333.08 | 1228457.58 |
| BLORB | `0x4d14284aFe559B7c6B9e6FAd6ebAeaA0F6051818` | `0x75ef5a3400b9da7bb49e776836995739f1ab0bae029e2e71fe654e52efc56b08` | V4 / native ETH | 11301337.17 | 3305304.05 |

DOGO Initialize log: block 32769621, native/token currencies, fee 0,
tickSpacing 1, hooks zero. Indexed activity: 22 trades/24h, 4/latest hour.
ZZZ Initialize log: block 54672541, native/token currencies, fee 0,
tickSpacing 200, hooks `0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044`.
Indexed activity: 4348 trades/24h, 92/latest hour. Its hook behavior/fees are
unreviewed; PoolKey fee zero does not prove zero executable hook fees.
BLORB's PoolId matches a reconstructed native/token key with fee 0,
tickSpacing 1 and hooks zero, but its Initialize query failed. Hash matching
is not proof of current initialization or active liquidity. Indexed activity:
234 trades/24h, 2/latest hour.

DOGO/ZZZ canonical publication verification is still pending. All six require
refreshed metadata/factory or StateView verification, current/historical reads,
two-way executable quotes, movement/round-trip analysis, exposure recommendation
and local participation before approval. None is rejected merely for failing
an arbitrary $10k threshold. Backups were not researched because primary
candidate review was interrupted.

## Official interface references

- [Uniswap chain 4663 deployments](https://github.com/Uniswap/contracts/blob/main/deployments/4663.md)
  lists V4 Quoter `0x8dc178efb8111bb0973dd9d722ebeff267c98f94`.
- [IV4Quoter](https://github.com/Uniswap/v4-periphery/blob/main/src/interfaces/IV4Quoter.sol)
  defines exact PoolKey, direction, uint128 input and hookData, returning amountOut/gas.
- [Currency](https://github.com/Uniswap/v4-core/blob/main/src/types/Currency.sol)
  defines address zero as native currency.

## Validation and blockers

Passed: 39 offline JS tests (11 native-focused), registry validation (28 assets,
14 mainnet-enabled = 10 Stocks + 4 Memes), frontend build, lint (six existing
warnings), forge build and 147 Solidity tests including grouped invariants
(256 runs, 128000 calls, zero reverts). Build reports an existing large bundle;
Foundry could not flush its external signature cache in the sandbox.
Fixture mixed native/WETH LIVE and historical common-block tests passed, but
these are not mainnet runtime or local transaction E2E evidence.

The approval service refused the next read-only RPC command due to its usage
limit. No alternate execution route was used. Refreshed Quoter results,
0.5%/1%/2% movement estimates, round-trip losses and numerical exposure
recommendations therefore remain unavailable. Local Anvil startup independently
failed with `Operation not permitted`; mixed old/new E2E, fresh Stock transaction
regression and the socket-based SSE test could not run. Offline Stock engine,
keeper and live-display regressions passed; baseline Stock configuration and
contract/keeper hashes are unchanged.

At the earlier stopping point, runtime review required restored approval access;
local transaction E2E also required loopback permission. Do not enable candidates
based on discovery metrics, synthetic tests or stale prior-pass quotes.

## Resumed review — fresh runtime evidence and classifications

This section supersedes the earlier RPC-access blocker and pending runtime
identity/liquidity notes, not the earlier historical measurements. Production
configuration remains unchanged: AI/CASHCAT/CHUMP/PIPEDOG only. No contracts,
registry flags, pricing/economic logic or tooling changed during this review.

### Evidence anchor and method

Read-only chainId returned 4663. All six source snapshots and quotes below use
block **64658688**, timestamp **1789576798**, hash
`0x4d0810e70e903b237717dfa9575cacdbbbee48c721b22a8a7102d315e2b1e2e7`.
Registry entries were cloned only in memory for review; native candidate configs
were not written to the production registry. Existing PoolPriceEngine.verify
passed all six: ERC20 decimals, V3 tokens/orientation/fee/factory/getPool, and
V4 complete sorted PoolKey hash/orientation plus initialized StateView state.
All base tokens and both quote representations use 18 decimals; baseIsToken0
is false for these six selected markets.

The exact addresses/PoolIds are listed in the discovery table above. V3
IF/TENDIES/BONER use canonical WETH at fee 10000 (1%). V4 DOGO/BLORB use native
ETH, fee 0, tickSpacing 1, hooks zero. V4 ZZZ uses native ETH, fee 0,
tickSpacing 200, the exact nonzero hook listed above. Both official V4 Quoter
and StateView returned PoolManager `0x8366a39CC670B4001A1121B8F6A443A643e40951`
at this block. DOGO/BLORB slot0 protocolFee=4097 (packed 1 pip per direction),
lpFee=0; ZZZ protocolFee=0/lpFee=0. PoolKey fee zero is not total execution cost.

Six-size labels use approximate **ETH/USD=2391.387195**, sampled from the exact
IF pool's public DexScreener priceUsd/priceNative ratio during this review.
This is only a dollar-notional label. No API price enters engine snapshots,
historical endpoints, race scoring or settlement. Analytics were fetched near
the anchor, not read as onchain TVL at that block.

### Canonical identities

- **IF:** [project site](https://whatifonhood.com/) publishes the full exact
  contract; RPC reads What If / IF / 18 / positive supply.
- **TENDIES:** [project site](https://www.tendies.now/) returned HTTP 200 and the
  full exact contract; RPC reads TENDIES / TENDIES / 18 / positive supply.
- **BONER:** [project site](https://boneronlong.xyz/) returned HTTP 200 and the
  exact contract; RPC reads Boner Coin / BONER / 18 / positive supply. Its
  deployed token code is 44 bytes; implementation/token privilege safety is
  not established merely by metadata or identity verification.
- **DOGO:** [project site](https://dogbull.xyz/) returned HTTP 200 and published
  `0x77b0AA38451ccDC1b42587E2f80B9879A7f82356`, with project social links
  @dogbullxyz and t.me/dogbullonhood. RPC reads DogBull / DOGO / 18 /
  1010000000000000000000000000 raw supply. The previous missing canonical-site
  evidence is now obtained; this does not establish an audited safe market.
- **BLORB:** [project site](https://blorbmeme.xyz/) returned HTTP 200 and the
  full exact contract. RPC reads BLORB / BLORB / 18 / positive supply.
  Its hash-bound native PoolKey now passed initialized StateView/current-L
  verification, resolving the prior current-initialization evidence gap.
- **ZZZ:** RPC reads ZZZ / ZZZ / 18 /
  840000000000000000000000000 raw supply. Secondary listings corroborate the
  address, but the project-linked Andrew Curran post is not a contract
  publication. The alleged ExponentLabs_/GMX creator link was not independently
  established from an accessible primary publication/deployer record.
  Canonical identity remains **unresolved**, not upgraded from market listings.
  Explorer token creator and hook source endpoints both returned HTTP 403.

### Active state and discovery metrics

Raw concentrated L is not dollars or guaranteed executable depth. Transactions
are counts, not unique traders; volume alone does not prove organic activity.

| Candidate | Active L raw | Indexed liquidity USD | Indexed volume 24h USD | Trades 24h / 1h | Onchain ETH_QUOTE price raw (18 decimals) |
| --- | ---: | ---: | ---: | ---: | ---: |
| IF | 82183590637144719220234 | 509440.43 | 1007777.93 | 2877 / 86 | 5248515719324 |
| TENDIES | 116930355572830879074076 | 645451.62 | 499698.95 | 1331 / 93 | 4568180308880 |
| BONER | 51668528765482530823115 | 231662.73 | 411102.56 | 810 / 8 | 16540779922684 |
| DOGO | 115166490114251267253 | 1320738.11 | 1635832.30 | 92 / 72 | 5506420542541 |
| ZZZ | 29277438273119247379474 | 436718.78 | 1259952.88 | 4356 / 203 | 9721269297792 |
| BLORB | 6856892951132922403206889537 | 11262448.92 | 1813578.87 | 127 / 7 | 47007577598590 |

### Actual six-size two-way Quoter results

All 36 buy/sell pairs succeeded via eth_call, without wallet/account, transfers,
approvals or broadcasts. The helper used official QuoterV2 for V3 and V4 Quoter
for V4, frozen source parameters, explicit block and empty hookData.
Cells are average execution impact **buy / sell**, including protocol/LP/hook
effects; basis-point calculations truncate, so 0.00% does not mean zero fee,
zero movement or unlimited depth. Sell input is the base amount corresponding
to the same pre-trade spot notional, not buy output.

| Candidate | $100 | $500 | $1k | $2.5k | $5k | $10k |
| --- | --- | --- | --- | --- | --- | --- |
| IF | 1.03% / 1.02% | 1.12% / 1.10% | 1.23% / 1.21% | 1.56% / 1.54% | 2.12% / 2.09% | 3.23% / 3.15% |
| TENDIES | 1.02% / 1.01% | 1.09% / 1.08% | 1.17% / 1.16% | 1.42% / 1.41% | 1.84% / 1.82% | 2.68% / 2.64% |
| BONER | 1.03% / 1.01% | 1.10% / 1.09% | 1.20% / 1.19% | 1.50% / 1.48% | 2.00% / 1.96% | 3.01% / 2.92% |
| DOGO | 0.65% / 13.40% | 0.66% / 43.61% | 0.66% / 60.74% | 0.66% / 79.45% | 0.66% / 88.55% | 0.66% / 93.92% |
| ZZZ | 1.05% / 1.04% | 1.24% / 1.22% | 1.47% / 1.45% | 2.16% / 2.12% | 3.32% / 3.21% | 5.63% / 5.33% |
| BLORB | 0.00% / 0.00% | 0.00% / 5.82% | 0.00% / 21.36% | 0.00% / 49.03% | 0.00% / 68.07% | 0.00% / 81.75% |

Raw quote values below are 18-decimal input/output units: ETH/native/WETH on
quote legs, candidate token on base legs. These are simulation outputs, not
guaranteed actual swap receipts. Official exact-input Quoters do not expose
consumed-input delta here; a successful quote alone does not prove full input
consumption across a depleted range or account-specific transfer/hook behavior.

| Candidate | Approx USD | Buy quote in raw | Buy base out raw | Sell base in raw | Sell quote out raw |
| --- | ---: | ---: | ---: | ---: | ---: |
| IF | 100 | 41816733069861570 | 7885937151856806684213 | 7967344541981765258079 | 41389465103126046 |
| IF | 500 | 209083665349307852 | 39395044948963702738924 | 39836722709908826671457 | 206765375645771551 |
| IF | 1000 | 418167330698615704 | 78703658873115797725572 | 79673445419817653342914 | 413070835211264069 |
| IF | 2500 | 1045418326746539261 | 196113749555662705881349 | 199183613549544133547816 | 1029223251842470336 |
| IF | 5000 | 2090836653493078522 | 390094490675500307288829 | 398367227099088267095632 | 2047023048137539614 |
| IF | 10000 | 4181673306986157045 | 771779187710246217289468 | 796734454198176534381794 | 4049669644493566675 |
| TENDIES | 100 | 41816733069861570 | 9060874677283681264432 | 9153914741188040913851 | 41391709281997367 |
| TENDIES | 500 | 209083665349307852 | 45274379898388708493729 | 45769573705940205007068 | 206821530748574938 |
| TENDIES | 1000 | 418167330698615704 | 90473887680017702507977 | 91539147411880410014136 | 413300887172580447 |
| TENDIES | 2500 | 1045418326746539261 | 225625031015335548703016 | 228847868529701025254247 | 1030656704666175776 |
| TENDIES | 5000 | 2090836653493078522 | 449396694709442174939655 | 457695737059402050508494 | 2052669800993943160 |
| TENDIES | 10000 | 4181673306986157045 | 891475431979111274116126 | 915391474118804101235894 | 4071113049592189349 |
| BONER | 100 | 41816733069861570 | 2502325267627395024076 | 2528099235061713562361 | 41390411546797082 |
| BONER | 500 | 209083665349307852 | 12501776538850548067800 | 12640496175308567932718 | 206789134371706004 |
| BONER | 1000 | 418167330698615704 | 24978972154381004435173 | 25280992350617135865437 | 413171681100477986 |
| BONER | 2500 | 1045418326746539261 | 62263796292327099842551 | 63202480876542839724050 | 1029891749463233551 |
| BONER | 5000 | 2090836653493078522 | 123917010728351306138550 | 126404961753085679448101 | 2049677630443723099 |
| BONER | 10000 | 4181673306986157045 | 245411216738809095264294 | 252809923506171358956660 | 4059465079812385816 |
| DOGO | 100 | 41816733069861570 | 7544738971585890670878 | 7594177151344994412365 | 36213232944780091 |
| DOGO | 500 | 209083665349307852 | 37721562311171557540687 | 37970885756724972425037 | 117881458499301744 |
| DOGO | 1000 | 418167330698615704 | 75442588924733060267722 | 75941771513449944850075 | 164157553699175402 |
| DOGO | 2500 | 1045418326746539261 | 188605651692616789781994 | 189854428783624862306795 | 214736278849367591 |
| DOGO | 5000 | 2090836653493078522 | 377210699396439725365733 | 379708857567249724613590 | 239314772338790895 |
| DOGO | 10000 | 4181673306986157045 | 754420581394293183838973 | 759417715134499449408787 | 253842020559478719 |
| ZZZ | 100 | 41816733069861570 | 4256605663281602484345 | 4301571306059738458616 | 41379609947273884 |
| ZZZ | 500 | 209083665349307852 | 21244118843237419270163 | 21507856530298692498817 | 206519800269442777 |
| ZZZ | 1000 | 418167330698615704 | 42391363220036521876461 | 43015713060597384997635 | 412097857762558531 |
| ZZZ | 2500 | 1045418326746539261 | 105258430836585370094121 | 107539282651493462596957 | 1023245552025629510 |
| ZZZ | 5000 | 2090836653493078522 | 208159928656418789246790 | 215078565302986925193914 | 2023578723478550342 |
| ZZZ | 10000 | 4181673306986157045 | 407201846816052380849198 | 430157130605973850490695 | 3958518811457735906 |
| BLORB | 100 | 41816733069861570 | 889573412461624840789 | 889574302827207793983 | 41816691215934068 |
| BLORB | 500 | 209083665349307852 | 4447867046482889931815 | 4447871514136039012461 | 196901881536836457 |
| BLORB | 1000 | 418167330698615704 | 8895734053402694414924 | 8895743028272078024923 | 328843771650153826 |
| BLORB | 2500 | 1045418326746539261 | 22239334836783600322979 | 22239357570680195083582 | 532750155763875506 |
| BLORB | 5000 | 2090836653493078522 | 44478668684490116682568 | 44478715141360390167165 | 667402778968785668 |
| BLORB | 10000 | 4181673306986157045 | 88957333412672161484707 | 88957430282720780355604 | 762961481289911648 |

### Spot movement and manipulation concerns

V3 Quoter returned post-trade sqrtPrice/ticks; shared integer pricing produced
these spot moves **buy / sell**, distinct from average execution impact:

| Candidate | $100 | $500 | $1k | $2.5k | $5k | $10k |
| --- | --- | --- | --- | --- | --- | --- |
| IF | 0.04% / 0.04% | 0.21% / 0.22% | 0.44% / 0.44% | 1.10% / 1.10% | 2.21% / 2.20% | 4.45% / 4.28% |
| TENDIES | 0.03% / 0.03% | 0.16% / 0.16% | 0.33% / 0.33% | 0.82% / 0.83% | 1.66% / 1.66% | 3.33% / 3.30% |
| BONER | 0.03% / 0.03% | 0.19% / 0.19% | 0.39% / 0.39% | 0.98% / 0.97% | 1.99% / 1.95% | 4.03% / 3.83% |

Sampled capital brackets for 0.5% / 1% / 2% movement, respectively:

- IF: $1k–$2.5k / $1k–$2.5k / $2.5k–$5k, in either direction.
- TENDIES: $1k–$2.5k / $2.5k–$5k / $5k–$10k, in either direction.
- BONER: $1k–$2.5k / $2.5k–$5k / $5k–$10k, in either direction.

These are sampled brackets, not precise thresholds or net manipulation cost.
V3 fee-inclusive impact must not be mistaken for pure price movement; flat LP
fee is known to be 1%. Gas, arbitrage, hedging and token privilege risks were
not costed. No exposure recommendation is inferred from TVL alone.

V4 Quoter does not expose post-swap sqrtPrice or consumed-input delta. Exact
0.5%/1%/2% V4 spot-movement thresholds therefore remain unmeasured, not invented.
DOGO already loses 13.40% average sell execution at ~$100; BLORB develops a
sell cliff between $100 and $500, with 21.36% average sell impact at $1k.
Both are severely asymmetric despite million-dollar indexed liquidity.

### Stateful V4 round-trip estimates

The official V4 Quoter's quoteExactInput supports two hops through the SAME
exact PoolKey in one PoolManager unlock. Pool state from the first simulated
hop is retained for the second; the whole eth_call reverts internally after
producing the quote. This is unlike multiplying independent pre-state quotes.
No helper/source change was required. Exact PathKeys used the frozen fee,
tickSpacing, hooks, intermediate currency and empty hookData.

Cells show requested-input-relative output loss **buy→sell / sell→buy**.
The first starts/ends in ETH quote; the second starts/ends in base tokens.
Do not treat these as guaranteed total net manipulation cost: actual consumed
input, real token settlement/transfer behavior, gas, arbitrage, funding and any
account-dependent hook rules are not established by this simulation.

| Candidate | $100 | $500 | $1k | $2.5k | $5k | $10k |
| --- | --- | --- | --- | --- | --- | --- |
| BLORB | 0.000200% / 0.000200% | 0.000200% / 0.000194% | 0.000200% / 0.000179% | 0.000200% / 0.000151% | 0.000200% / 0.000132% | 0.000200% / 0.000118% |
| DOGO | 0.000199% / 0.000187% | 0.000199% / 0.000156% | 0.000199% / 0.000139% | 0.000199% / 0.000121% | 0.000199% / 0.000111% | 0.000199% / 0.000106% |
| ZZZ | 1.989551% / 1.989551% | 1.987760% / 1.987760% | 1.985530% / 1.985530% | 1.978901% / 1.978901% | 1.968049% / 1.968049% | 1.947050% / 1.947050% |

Near-zero BLORB/DOGO simulated reversal loss strengthens, rather than cures,
the manipulation concern from one-sided depth. ZZZ's approximately 1.95–1.99%
round-trip loss is consistent with nonzero swap costs despite zero LP/protocol
fee fields; the exact hook fee formula/control surface is not source-verified.
A true stateful V3 round-trip was not measured: the existing single-pool helper
does not expose that operation. No fake round-trip was derived by multiplying
independent pre-state buy/sell quotes.

### ZZZ hook compatibility and unresolved controls

At the anchor, the hook had 15167 bytes of code. Its address permission mask
is `0x2044`. getHookPermissions returned only beforeInitialize, afterSwap and
afterSwapReturnDelta=true, matching the
[official Uniswap Hooks flags](https://github.com/Uniswap/v4-core/blob/main/src/libraries/Hooks.sol).
It is an active return-delta hook, not inert metadata, and can alter swap output.

All six two-way single quotes and both-direction stateful round trips worked
with the existing empty-hookData calls. Direct current/historical slot0 reads
also worked: **no observed interface incompatibility** with the present engine
or Quoter at this block. This does NOT prove arbitrary-user access, immutable
fees, pause/allowlist safety, upgrade/owner limits or future behavior.
Source/ABI/admin review is blocked by explorer HTTP 403; verified source or
authoritative hook documentation remains required before approval.
No speculative hook bypass, conversion or price semantics change was added.

### Endpoint compatibility

Existing engine endpointPair consumed all six sources together without code
changes at target **1789576738**:
- E=64658105, timestamp=1789576737,
  hash `0x4224b9d90d68c0cf151a54b265516f4d0374295cebbd5bdede6040858d414ec0`.
- B=64658106, timestamp=1789576738; B.parentHash equals E.hash.
- Each asset read at common E; the boundary child never replaces E as price.
- Historical ETH_QUOTE raw prices: IF 5207279773641, TENDIES 4568194662557,
  BONER 16540779922684, DOGO 5506420542541, ZZZ 9342120705974,
  BLORB 47007577598590.

This establishes direct-pool current/historical consumption and deterministic
common-block construction. It is not a new onchain signed-race transaction
E2E or proof independent of the configured signer. Corporate/Stock policies,
oracle verification, MAX 6, race economics and claims/refunds were not changed.

### Classification and next step

| Candidate | Status | Exact reason |
| --- | --- | --- |
| IF | keep disabled / demo-only | Credible identity/source and live/historical consumption, but ~$1k moves spot 0.44% and ~$2.5k moves it 1.10%; no approved exposure/manipulation budget or stateful net-cost evidence justifies production approval. |
| TENDIES | keep disabled / demo-only | Credible identity/source, but ~$1k moves spot 0.33% and ~$5k moves it 1.66%; exposure/manipulation budget remains unapproved. |
| BONER | keep disabled / demo-only | Credible identity/source, but ~$1k moves spot 0.39%, ~$5k nearly 2%; exposure budget and minimal-token implementation/privilege safety remain unestablished. |
| DOGO | keep disabled / demo-only | Canonical publication now verified; ~$100 sell impact 13.40%, severe sell-side cliff and near-zero simulated reversal cost. |
| BLORB | keep disabled / demo-only | Canonical/current source now verified; ~$500 sell impact 5.82%, ~$1k 21.36%, near-zero simulated reversal cost. |
| ZZZ | unresolved due to missing evidence | Source/quotes/endpoints work, but primary canonical identity and active return-delta hook source/admin/fee controls are not verified. |

**Production-qualified candidates: none.** Technical source compatibility is
separate from economic readiness. IF/TENDIES/BONER are not rejected merely for
a $10k sample or because native ETH was unsupported; the small-capital endpoint
movement and missing approved operational exposure are the unresolved safety
grounds. No consensus exposure cap or invented numerical recommendation was added.

RPC access recovered in this review. Remaining evidence access blocker:
explorer HTTP 403 for ZZZ token creator and hook source. The prior local Anvil
Operation not permitted and uncompleted transaction/SSE checks were not retried
in this read-only pass. No code/tooling change means no implementation test
suite was rerun; git diff --check is the documentation validation.

Exact next step: obtain an authoritative ZZZ full-contract publication and
verified hook source/control documentation; only then resolve its identity and
hook approval. IF/TENDIES/BONER need an explicitly approved measured operating
exposure/manipulation-risk policy and any required token-control evidence before
reclassification. Keep DOGO/BLORB disabled unless a different independently
verified executable market or materially changed depth removes the measured
cliffs; do not enable any of these sources from headline TVL or this partial review.
