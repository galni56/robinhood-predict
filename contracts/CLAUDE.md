# PredictionMarket contracts — instructions for Claude (or whoever picks this up)

## Status right now

`forge build` and `forge test -vvv` are green: clean compile, **22/22
tests passing** (8 original + 4 added 2026-09-04 for permissionless
creation / cap / feed-allowlist + 10 added 2026-09-05 for the liquidity
mechanics below). `createMarket` is no longer `onlyOwner` — it's
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

As of the 2026-09-04 session this ran on a machine the user confirmed is
**not** company-managed, so Foundry was installed directly (`curl -L
https://foundry.paradigm.xyz | bash && foundryup`), with
`lib/forge-std` and `lib/openzeppelin-contracts@v5.1.0` fetched via
`forge install ... --no-git --no-commit` (they're gitignored, so a fresh
checkout on any machine needs this step regardless of Docker vs. direct
install). The original session that authored this file ran everything via
the Docker image below on a company-managed, EDR-monitored workstation —
that path is kept as the fallback for whichever machine this next runs on.

Still true regardless of the green tests: this has had **no external
security review**. Green tests mean the logic does what the tests say, not
that it's safe against a determined attacker. Don't put real value behind
it before a review — see the checklist at the bottom of this file.

**Deployed to Robinhood Chain testnet as of 2026-09-05** (see section 2
below for the full deploy flow that produced these):
- `PredictionMarket`: `0x9d17Ad54C755fd702DD7F99F8bE72fdf72F24Be9`
- `MockERC20` bet token ("mUSD"): `0xBDc0F8045Baa2377F11A03d3c867E81dB263A93A`
- `MockAggregator` stand-in TSLA feed: `0x3d8cC74a198ad948D77c65d88Ed24acFeE77Cd67`
  (mock, not real Chainlink — see section 2 for why)
- Market #0 open: "Does TSLA reach $400?", 24h deadline from creation

## 0. One-time setup on this machine

Confirm whether the current machine is company-managed/EDR-monitored
before choosing a path — don't assume either way carries over from a past
session. On a work machine, keep Foundry Docker-only (no new binary on the
host) unless explicitly cleared with whoever owns security policy there.
On a confirmed non-work machine, installing Foundry directly is fine (see
"Installing Foundry directly" below) — that's what happened on
2026-09-04.

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
break that silently.)

### Installing Foundry directly on a machine where that's fine

Only do this on a machine where installing dev tools isn't a policy
question (e.g. your own personal laptop):

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

Then the same `forge install` commands as above, minus the `docker run`
wrapper.

(`remappings.txt` already points `@openzeppelin/contracts/` and `forge-std/`
at these — no extra config needed once they're installed.)

## 1. Build & test (no network, no keys, safe to run freely)

Green as of 2026-09-04 (12/12 passing). If you've since changed `src/` or
`test/`, rerun them — bare `forge build` / `forge test -vvv` if Foundry is
on your PATH, otherwise wrap in the `docker run ... -c "forge test -vvv"`
pattern from section 0.

The test file (`test/PredictionMarket.t.sol`) covers: permissionless market
creation gated by the feed allowlist, the $500 target cap (at and over the
limit), the allowlist itself being owner-only, bet accounting, YES win / NO
win payout math, the "nobody backed the winning side → void + refund" edge
case, and stale-price rejection. If you add features, add tests for them
here first.

Worth a second look before deploying anywhere real:
- `MAX_PRICE_STALENESS` in `PredictionMarket.sol` is a placeholder (1 hour).
  Check the actual heartbeat of the specific Chainlink feed you'll use
  (https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood) and
  size this against it.
- `resolve()` is permissionless by design (anyone can trigger it once the
  deadline passes) — that's intentional (keeper-friendly), not a bug.
- `createMarket` is permissionless but requires an owner-allowlisted price
  feed (`setPriceFeedAllowed`); `voidMarket` and the allowlist itself stay
  owner-only. Decide who holds that key before mainnet — a single EOA is
  fine for a testnet MVP, not for real funds.
- This has had no external security review. Don't put real (mainnet) value
  behind it until it's had one — a bug here means an irreversible loss of
  whatever's in the vault, this isn't a "redeploy and move on" situation.

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
   - **On mainnet (later, post security review):** look up the real feed
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

## 4. Don't do without checking with the project owner first

- Don't deploy to **mainnet** (chain id `4663`) — testnet only until there's
  been a real review.
- Don't put anything but testnet-faucet funds behind this contract.
- Don't reuse a wallet that holds real assets as the deployer/owner key.
