# PredictionMarket contracts — instructions for Claude (or whoever picks this up)

## Status right now

`forge build` and `forge test -vvv` have been run (via the official
`ghcr.io/foundry-rs/foundry` Docker image, **not** installed on the host —
see "Building via Docker" below for why and how). Result: clean compile,
**8/8 tests passing**. `lib/forge-std` and `lib/openzeppelin-contracts@v5.1.0`
are already fetched and sitting in `contracts/lib/` (gitignored).

Still true regardless of the green tests: this has had **no external
security review**. Green tests mean the logic does what the tests say, not
that it's safe against a determined attacker. Don't put real value behind
it before a review — see the checklist at the bottom of this file.

## 0. One-time setup on this machine

Foundry itself was **not** installed on the host on purpose (company-managed
workstation, EDR/security-monitored). Everything was run through Docker
instead — no new binary on the host. Repeat that pattern unless you've
explicitly cleared installing Foundry directly with whoever owns security
policy for this machine.

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

Already green as of this session (8/8 passing, via the Docker commands
above). If you've since changed `src/` or `test/`, rerun them — bare `forge
build` / `forge test -vvv` if Foundry is on your PATH, otherwise wrap in the
same `docker run ... -c "forge test -vvv"` pattern from section 0.

The test file (`test/PredictionMarket.t.sol`) covers: owner-only market
creation, bet accounting, YES win / NO win payout math, the "nobody backed
the winning side → void + refund" edge case, and stale-price rejection. If
you add features, add tests for them here first.

Worth a second look before deploying anywhere real:
- `MAX_PRICE_STALENESS` in `PredictionMarket.sol` is a placeholder (1 hour).
  Check the actual heartbeat of the specific Chainlink feed you'll use
  (https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood) and
  size this against it.
- `resolve()` is permissionless by design (anyone can trigger it once the
  deadline passes) — that's intentional (keeper-friendly), not a bug.
- `createMarket` / `voidMarket` are owner-only. Decide who holds that key
  before mainnet — a single EOA is fine for a testnet MVP, not for real funds.
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
5. Look up the current Chainlink feed address for the stock token you want
   (link above), pick a target price (scaled to the feed's `decimals()`,
   usually 8 — e.g. $100.00 → `10000000000`) and a deadline, fill those into
   `.env` (`PRICE_FEED_ADDRESS`, `TARGET_PRICE`, `DEADLINE_UNIX`), then:
   ```bash
   docker run --rm -v "$PWD":/app -w /app --env-file .env --entrypoint sh \
     ghcr.io/foundry-rs/foundry:latest \
     -c "forge script script/CreateMarket.s.sol --rpc-url robinhood_testnet --broadcast"
   ```
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

Rough shape for the real-chain mode:
- `wagmi` + `viem`, chain config for id `46630` / `4663` pointed at the RPCs
  above.
- WalletConnect for the connect flow — needs a free Project ID from
  https://cloud.walletconnect.com (ask the project owner for it, don't
  generate one yourself).
- Read `getMarket(id)` for pool/status, `latestRoundData()` via the feed
  address for live price, write `bet` / `claim` / `refund` through the
  connected wallet (the wallet signs, never a key held by the app).

## 4. Don't do without checking with the project owner first

- Don't deploy to **mainnet** (chain id `4663`) — testnet only until there's
  been a real review.
- Don't put anything but testnet-faucet funds behind this contract.
- Don't reuse a wallet that holds real assets as the deployer/owner key.
