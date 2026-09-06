# PredictionMarket contracts — instructions for Claude (or whoever picks this up)

## Status right now

`forge build` and `forge test -vvv` are green: clean compile, **28/28
tests passing** (8 original + 4 added 2026-09-04 for permissionless
creation / cap / feed-allowlist + 10 added 2026-09-05 for the liquidity
mechanics + 4 added 2026-09-06 for the time-weighted early-bet mechanic —
see below for both). `createMarket` is no longer `onlyOwner` — it's
permissionless, gated instead by an owner-maintained price-feed allowlist
(`allowedPriceFeeds` / `setPriceFeedAllowed`) and an on-chain $500 target
cap (`MAX_TARGET_PRICE_USD`) mirroring the frontend's `MAX_TARGET_PRICE`.
`voidMarket` is still `onlyOwner`.

**Liquidity mechanics added 2026-09-05:**
- **One-sided cancellation:** `resolve()` cancels the market (full refunds
  via `refund()`, no fee) if either `poolYes` or `poolNo` is still zero at
  the deadline — a market only ever settles as a genuine two-sided
  prediction.
- **House seed liquidity:** `createMarket`'s new `initialYesAmount`/
  `initialNoAmount` params let the owner seed both sides atomically at
  creation (e.g. to open at 50/50 odds) — owner-only when non-zero, capped
  combined at `MAX_SEED_LIQUIDITY_USD` ($50, in bet-token units).
- **Protocol fee:** `feeBp` (basis points, owner-settable via `setFeeBp`,
  capped at `MAX_FEE_BP` = 10%) is taken only from the losing pool's
  contribution to a winner's payout in `claim()` — principal always comes
  back in full. Snapshotted into `Market.feeBp` at creation, so a later fee
  change never retroactively affects an already-open market. Collected fees
  sit in `accumulatedFees` until the owner calls `withdrawFees(to)`.

**Time-weighted early-bet mechanic added 2026-09-06** (see `ROADMAP.md`
§3.5 for the product motivation and the AMM alternative parked in §3.6):
- **Betting window:** `bet()` now closes at `bettingWindowEnd(id)` —
  `createdAt + (deadline-createdAt) * BETTING_WINDOW_BP/10000` (6667 = 2/3)
  — earlier than `deadline`, which still only gates `resolve()`. A 15-minute
  market takes bets for 10 minutes, then just waits out the last 5.
- **Early-bet weight:** a winning bet's *share of the losing pool* (never
  its own principal) is scaled by `currentWeightBp(id)` at the moment it was
  placed — decays linearly from `MAX_WEIGHT_BP` (2x, betting just opened) to
  `MIN_WEIGHT_BP` (0.5x, betting about to close). Tracked via a parallel
  `weightedStakes` mapping and `Market.weightedPoolYes`/`weightedPoolNo`,
  alongside the existing raw `stakes`/`poolYes`/`poolNo` (which still drive
  principal repayment, refunds, and the one-sided-cancellation check
  unchanged). House/system seed liquidity lands at elapsed=0 and always gets
  `MAX_WEIGHT_BP`.
- All 24 pre-existing tests kept their exact expected values unchanged —
  every one of them has exactly one bettor per side, so weight cancels out
  of the share ratio (`userWeightedStake / weightedWinningPool == 1` when
  you're the sole winner) — confirmed by rerunning, not assumed.


**Deployed to Robinhood Chain testnet as of 2026-09-05** (see section 2
below for the full deploy flow that produced these):
- `PredictionMarket`: `0x9d17Ad54C755fd702DD7F99F8bE72fdf72F24Be9`
- `MockERC20` bet token ("mUSD"): `0xBDc0F8045Baa2377F11A03d3c867E81dB263A93A`
- `MockAggregator` stand-in TSLA feed: `0x3d8cC74a198ad948D77c65d88Ed24acFeE77Cd67`
  (mock, not real Chainlink — see section 2 for why)
- Market #0 open: "Does TSLA reach $400?", 24h deadline from creation

### Building via Docker (what was actually used, safe to repeat)

```bash
cd contracts
docker run --rm -v "$PWD":/app -w /app --entrypoint sh \
  ghcr.io/foundry-rs/foundry:latest \
  -c "git config --global --add safe.directory '*' && forge build"

docker run --rm -v "$PWD":/app -w /app --entrypoint sh \
  ghcr.io/foundry-rs/foundry:latest \
  -c "forge test -vvv"
```

Dependencies are already vendored in `lib/` from this session. If you ever
need to (re)fetch them:

```bash
docker run --rm -v "$PWD":/app -w /app --entrypoint sh \
  ghcr.io/foundry-rs/foundry:latest \
  -c "git config --global --add safe.directory '*' && \
      forge install foundry-rs/forge-std --no-git --no-commit && \
      forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git --no-commit"
```

(`--no-git` matters: this repo has no `.git` on purpose, and plain `forge
install` expects one for submodules. Pinning OpenZeppelin to `v5.1.0` rather
than tracking `master` matters too — the contract uses the v5
`Ownable(initialOwner)` constructor signature; a future major version could
break that silently.

## 1. Build & test (no network, no keys, safe to run freely)

Green as of 2026-09-06 (22/22 passing). If you've since changed `src/` or
`test/`, rerun them — bare `forge build` / `forge test -vvv` if Foundry is
on your PATH, otherwise wrap in the `docker run ... -c "forge test -vvv"`
pattern from section 0.

The test file (`test/PredictionMarket.t.sol`) covers: permissionless market
creation gated by the feed allowlist, the $500 target cap (at and over the
limit), the allowlist itself being owner-only, bet accounting, YES win / NO
win payout math (including exact wei-precision fee math), house seed
liquidity and its cap, one-sided-market cancellation + full refund, and
stale-price rejection. If you add features, add tests for them here first.

**Self-review pass, 2026-09-06** (Claude read through the contract against a
standard vulnerability checklist — this is a code-level sanity pass, *not* a
substitute for an independent external audit; treat it as a starting point
for whoever does that audit, not a replacement for it):
- Fixed: `createMarket` was missing `nonReentrant` while every other
  fund-moving function had it — inconsistent, even though the current risk
  was low (only exploitable via a malicious/hooked `betToken`, which is
  owner-controlled). Added for defense-in-depth.
- Verified solvent by construction: summed over all winners, total payout
  for a resolved market = `winningPool + losingPool*(10000-feeBp)/10000`,
  which is always `<= totalPool` (fee only ever reduces payout, integer
  rounding always rounds down) — the contract can never owe more than it
  holds for a given market, modulo the `betToken` assumption below.
- **`betToken` must be a standard ERC20** — no fee-on-transfer, no
  rebasing. The contract trusts that `safeTransferFrom` credits it with
  exactly the amount it was told; a non-standard token would silently
  under-fund the contract relative to what it believes it owes bettors.
  Documented inline on the `betToken` declaration. Vet whatever token you
  point this at before mainnet — the contract can't detect this on its own..
- `MAX_PRICE_STALENESS` in `PredictionMarket.sol` is a placeholder (1 hour).
  Check the actual heartbeat of the specific Chainlink feed you'll use
  (https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood) and
  size this against it.
- `resolve()` is permissionless by design (anyone can trigger it once the
  deadline passes) — that's intentional (keeper-friendly), not a bug.
- Late large bets shift parimutuel odds right up to the deadline — this is
  inherent to how parimutuel pools work (same as horse-racing tote boards),
  not a bug, but worth being explicit about in user-facing copy so it isn't
  "discovered" as a surprise.

## 2. Testnet deployment checklist

Robinhood Chain testnet facts (verified Sept 2026 — re-check
docs.robinhood.com/chain if it's been a while):

| | |
|---|---|
| Chain ID | `46630` |
| Public RPC | `https://rpc.testnet.chain.robinhood.com` (rate-limited; fine for this) |
| Explorer | `https://explorer.testnet.chain.robinhood.com` |
| Faucets | [Alchemy](https://www.alchemy.com/faucets/robinhood-testnet), [Chainlink](https://faucets.chain.link/robinhood-testnet), [QuickNode](https://faucet.quicknode.com/robinhood/testnet) |
| Chainlink feeds | https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood — **always read the current address from there, never hardcode/reuse an old one** |

Steps — **1 and 2 are for you to run yourself**, in your own terminal, never
through Claude: a private key printed into a chat transcript is a burned key
forever, full stop. Steps 3+ can go through Claude via the Docker pattern in
section 0 (`--env-file .env` passes the vars into the container without
Claude ever reading the file).

1. Generate a **fresh burner wallet** — don't reuse a personal or work
   wallet:
   ```bash
   docker run --rm ghcr.io/foundry-rs/foundry:latest cast wallet new
   ```
   Copy the printed address and private key somewhere safe (a password
   manager, not a chat).
2. `cp .env.example .env`, fill in `PRIVATE_KEY` with that key. Fund the
   address from a faucet above (need the testnet ETH before anything below
   will work — deploys cost gas even on testnet).
3. Deploy the mock bet token and mint yourself a testnet balance:
   ```bash
   docker run --rm -v "$PWD":/app -w /app --env-file .env --entrypoint sh \
     ghcr.io/foundry-rs/foundry:latest \
     -c "forge script script/DeployMockToken.s.sol --rpc-url robinhood_testnet --broadcast"
   ```
   Copy the printed token address into `.env` as `BET_TOKEN_ADDRESS`.
4. Deploy PredictionMarket:
   ```bash
   docker run --rm -v "$PWD":/app -w /app --env-file .env --entrypoint sh \
     ghcr.io/foundry-rs/foundry:latest \
     -c "forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast"
   ```
   Copy the printed address into `.env` as `MARKET_ADDRESS`.
5. **Pick a price feed.** Confirmed 2026-09-05: Chainlink Data Feeds
   (`AggregatorV3Interface`, what this contract reads via
   `latestRoundData()`) exist on Robinhood Chain **mainnet only** —
   `data.chain.link`'s network filter for Robinhood lists only "Robinhood
   Mainnet", and the reference example dapp
   [hummusonrails/robinhood-chain-dapp-example](https://github.com/hummusonrails/robinhood-chain-dapp-example)
   states this outright and deploys a mock feed for testnet for the same
   reason. (TSLA and friends do have Chainlink price data on Robinhood
   Chain via **Data Streams** — a pull-oracle product with a Feed ID and
   off-chain report verification, not a fixed on-chain address this
   contract's `AggregatorV3Interface` calls can hit. Wiring that up is a
   separate, materially bigger task — not done here.)
   - **On testnet:** deploy a stand-in feed with `script/DeployMockFeed.s.sol`
     (env vars `PRIVATE_KEY`, `FEED_DECIMALS` optional/default 8,
     `FEED_INITIAL_ANSWER` — price scaled to decimals, e.g. $353.90 at 8
     decimals → `35390000000`):
     ```bash
     docker run --rm -v "$PWD":/app -w /app --env-file .env --entrypoint sh \
       ghcr.io/foundry-rs/foundry:latest \
       -c "FEED_INITIAL_ANSWER=35390000000 forge script script/DeployMockFeed.s.sol --rpc-url robinhood_testnet --broadcast"
     ```
   - **On mainnet** look up the real feed
     address at the link above instead of deploying a mock.
   Either way, pick a target price (scaled to the feed's own `decimals()`,
   capped at `MAX_TARGET_PRICE_USD` = $500 in the same units) and a
   deadline, then create the market:
   ```bash
   docker run --rm -v "$PWD":/app -w /app --env-file .env --entrypoint sh \
     ghcr.io/foundry-rs/foundry:latest \
     -c "PRICE_FEED_ADDRESS=<feed> TARGET_PRICE=<price> DEADLINE_UNIX=<unix> forge script script/CreateMarket.s.sol --rpc-url robinhood_testnet --broadcast"
   ```
   `CreateMarket.s.sol` allowlists `PRICE_FEED_ADDRESS` (owner-only step)
   before creating the market, since `createMarket` itself now checks the
   feed against `allowedPriceFeeds` regardless of who calls it.
   `PRICE_FEED_ADDRESS`/`TARGET_PRICE`/`DEADLINE_UNIX` don't need to live in
   `.env` permanently — they're per-market, not per-deployment, so passing
   them inline per run (as above) is fine and keeps `.env` focused on the
   things that don't change between markets.
6. Verify on the explorer if you want source shown publicly:
   ```bash
   forge verify-contract <address> src/PredictionMarket.sol:PredictionMarket \
     --chain 46630 --constructor-args $(cast abi-encode "constructor(address)" <betToken>)
   ```
   (Blockscout verification endpoint/flags may need adjusting — check
   explorer.testnet.chain.robinhood.com's docs if this errors.)

## 3. Wiring the frontend to the real contract

The existing app in `../src` (the sibling of this `contracts/` folder) is a
**pure mock** — zustand stores simulate a chain in the browser, nothing here
talks to it. Keep that working as-is; wire up a real mode alongside it
rather than replacing it, so there's always a working demo even if the
testnet contract has an issue.

Rough shape for the real-chain mode (wallet model decided 2026-09-04:
external, not embedded — see root `CLAUDE.md`):
- `wagmi` + `viem`, chain config for id `46630` / `4663` pointed at the RPCs
  above.
- `wagmi`'s `injected()` connector with EIP-6963 multi-provider discovery
  for the connect flow — surfaces both MetaMask and Phantom (Phantom added
  native Robinhood Chain support, mainnet + testnet, in July 2026) for the
  user to pick between, no per-wallet code needed. WalletConnect (for
  mobile wallets) needs a free Project ID from
  https://cloud.walletconnect.com (ask the project owner for it, don't
  generate one yourself) — add later if needed, not required for desktop
  browser-extension wallets.
- Read `getMarket(id)` for pool/status, `latestRoundData()` via the feed
  address for live price, write `bet` / `claim` / `refund` through the
  connected wallet (the wallet signs, never a key held by the app). `bet`
  needs an ERC20 `approve` first — that's a separate signed transaction
  before the bet itself; surface both steps clearly in the UI rather than
  making it look like one action.
