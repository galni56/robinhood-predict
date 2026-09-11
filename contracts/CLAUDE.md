## Status right now (2026-09-11)

**Live on Robinhood Chain mainnet, real money, no audit.** `forge build`
and `forge test` are green across two contracts:

- `PredictionMarket`: `0xd95ed19edBCd330498CADe7BA8569ac940A4182f`
  (redeployed 2026-09-10), **36/36 tests passing**. `createMarket` is
  permissionless — gated by an owner-maintained price-feed allowlist
  (`allowedPriceFeeds` / `setPriceFeedAllowed`), **not** a flat dollar cap
  (the old `MAX_TARGET_PRICE_USD` was removed — it didn't scale per ticker
  and blocked markets on pricier names like SPY/QQQ). Instead `targetPrice`
  must sit within a duration-scaled deviation band of the feed's live
  price: `MIN_TARGET_DEVIATION_BP` (2% floor, all durations) up to
  `SHORT_MAX_DEVIATION_BP`/`MEDIUM_MAX_DEVIATION_BP`/`LONG_MAX_DEVIATION_BP`
  (4%/15%/20%, by whether the market's duration is ≤2h / ≤24h / longer).
  Also enforces `MIN_MARKET_DURATION` (30 min) and `MAX_STAKE_PER_SIDE_USD`
  ($50 per wallet per side) — both confirmed live via `cast call`, not just
  present in source (a prior deploy had these in source but not actually
  live; always verify with `cast call <addr> "CONSTANT_NAME()"` after a
  deploy, don't assume the ABI matches). `voidMarket` is still `onlyOwner`.
- `NicknameRegistry`: `0x1Ddc13e9D4895a5E6671079478007C7371b76E75`
  (deployed 2026-09-11), **8/8 tests passing**. Standalone contract, no
  relationship to `PredictionMarket` other than both being read by the
  same frontend — `mapping(address => string) nicknameOf`, `setNickname`
  only ever writes `msg.sender`'s own entry.

Bet token is **real USDG** at `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`
— 6 decimals (the old testnet `MockERC20` was 18; this mismatch has bitten
the frontend before, double-check before assuming either way). 27
Chainlink feeds are allowlisted — full list in `../src/chain/contracts.ts`
(`ALLOWLISTED_FEEDS`), each verified via `decimals()`/`description()`/
`latestRoundData()` before allowlisting via `script/AllowlistFeed.s.sol`
(run once per ticker, individually — the auto-mode classifier blocks
looping multiple `--broadcast` calls in one Bash invocation).

**Redeploying either contract means starting the allowlist over** — it's a
mapping on the new address, nothing carries over automatically.

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


**Mainnet deploy flow actually used (2026-09-10/11), for reference if
redeploying again:**
```bash
export PATH="$PATH:$HOME/.foundry/bin"   # forge/cast not always on PATH
cd contracts
forge script script/Deploy.s.sol --rpc-url robinhood_mainnet --broadcast
# then, once per ticker (individually, never looped):
MARKET_ADDRESS=<new addr> PRICE_FEED_ADDRESS=<feed> \
  forge script script/AllowlistFeed.s.sol --rpc-url robinhood_mainnet --broadcast
# then update PREDICTION_MARKET_ADDRESS in ../src/chain/contracts.ts
# and redeploy the frontend (see root CLAUDE.md)
```
The old testnet addresses/mocks this section used to document
(`MockERC20`, `MockAggregator`, chain id 46630) are gone — this project no
longer runs on testnet at all, real Chainlink feeds and real USDG were
confirmed working on mainnet 2026-09-07 and everything moved there. If a
testnet deploy is ever needed again, `script/DeployMockToken.s.sol` and
`script/DeployMockFeed.s.sol` still exist for that.

### Building and testing

Foundry is installed directly on this machine at `~/.foundry/bin` (may
need `export PATH="$PATH:$HOME/.foundry/bin"` in a fresh shell):

```bash
cd contracts
forge build
forge test          # 44/44 as of 2026-09-11 (36 PredictionMarket + 8 NicknameRegistry)
```

If `lib/` is missing on a fresh checkout (it's gitignored):

```bash
forge install foundry-rs/forge-std --no-git --no-commit
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git --no-commit
```

(`--no-git` matters: this repo has no `.git` inside `contracts/` on
purpose, and plain `forge install` expects one for submodules. Pinning
OpenZeppelin to v5.1.0 rather than tracking master matters too — the
contract uses the v5 `Ownable(initialOwner)` constructor signature; a
future major version could break that silently.)

The Docker fallback from when this project was on a company-managed,
EDR-monitored workstation still works if a future machine turns out to be
work-managed again — see root `CLAUDE.md` rule 6:

```bash
docker run --rm -v "$PWD":/app -w /app --entrypoint sh \
  ghcr.io/foundry-rs/foundry:latest \
  -c "git config --global --add safe.directory '*' && forge test -vvv"
```

**What the tests cover** (`test/PredictionMarket.t.sol`,
`test/NicknameRegistry.t.sol`): permissionless market creation gated by
the feed allowlist and the duration/deviation guards, the allowlist and
`voidMarket` being owner-only, bet accounting, YES/NO payout math
(exact wei-precision fee math), house seed liquidity and its cap,
one-sided-market cancellation + full refund, stale-price rejection, the
time-weighted early-bet mechanic, and nickname set/overwrite/clear/length
limits. Add a test here first for any new feature.

**Known, accepted risks (from the 2026-09-06 self-review, still true):**
- `betToken` must be a standard ERC20 — no fee-on-transfer, no rebasing.
  `safeTransferFrom` is trusted to credit the contract exactly what it was
  told; a non-standard token would silently under-fund it relative to what
  it believes it owes bettors. Documented inline on the `betToken`
  declaration. USDG (what's actually in use) is a standard token, this is
  a latent risk only if the bet token is ever changed.
- `MAX_PRICE_STALENESS` (3 days) is a deliberately generous placeholder,
  not tuned to any specific feed's real heartbeat.
- `resolve()` is permissionless by design (anyone can trigger it once the
  deadline passes) — intentional, keeper-friendly, not a bug.
- Late large bets shift parimutuel odds right up to the deadline — inherent
  to how parimutuel pools work (same as horse-racing tote boards), not a
  bug, but worth being explicit about in user-facing copy.
- Solvency: summed over all winners, total payout for a resolved market =
  `winningPool + losingPool*(10000-feeBp)/10000`, always ≤ `totalPool`
  (fee only ever reduces payout, integer rounding always rounds down) — the
  contract can never owe more than it holds for a given market, modulo the
  `betToken` assumption above.
- **No external security audit.** Owner-centralized: one EOA controls the
  price-feed allowlist, protocol fee, and seed liquidity cap for
  `PredictionMarket`. Said explicitly in the product's own UI, not hidden.

### Redeploying to mainnet (both contracts are live there now — no testnet)

Chainlink Data Feeds (`AggregatorV3Interface`, what this contract reads via
`latestRoundData()`) only exist on **Robinhood Chain mainnet** (chain id
`4663`, RPC `https://rpc.mainnet.chain.robinhood.com`) — confirmed
2026-09-05, `data.chain.link`'s network filter for Robinhood lists only
"Robinhood Mainnet". This project ran on testnet (chain id `46630`) early
on with mock token/feed contracts (`script/DeployMockToken.s.sol`,
`script/DeployMockFeed.s.sol` still exist if that's ever needed again), but
moved fully to mainnet 2026-09-07 and hasn't looked back — every address
in this file and in `../src/chain/contracts.ts` is mainnet.

**Steps 0 and 1 below are for the user to run themselves, in their own
terminal, never through Claude** — a private key printed into a chat
transcript is a burned key forever, full stop. Everything else goes
through Foundry scripts that read `PRIVATE_KEY` via `vm.envUint` inside
Solidity, so the key never appears on the CLI or in anything Claude reads.

0. User: generate a fresh burner wallet (`cast wallet new`), fund it with
   real ETH for gas, fill `contracts/.env` themselves.
1. User: paste in `BET_TOKEN_ADDRESS` if it's changing (it usually isn't —
   USDG is reused across redeploys).
2. Deploy `PredictionMarket`:
   ```bash
   forge script script/Deploy.s.sol --rpc-url robinhood_mainnet --broadcast
   ```
3. **Verify the guardrails are actually live**, don't assume the deploy
   picked up everything in source:
   ```bash
   cast call <new addr> "MIN_TARGET_DEVIATION_BP()(uint256)" --rpc-url robinhood_mainnet
   cast call <new addr> "MIN_MARKET_DURATION()(uint256)" --rpc-url robinhood_mainnet
   cast call <new addr> "MAX_STAKE_PER_SIDE_USD()(uint256)" --rpc-url robinhood_mainnet
   ```
4. Re-allowlist every ticker from `../src/chain/contracts.ts`
   (`ALLOWLISTED_FEEDS`) on the new address — **one at a time**, the
   auto-mode classifier blocks looping multiple `--broadcast` calls in a
   single Bash invocation:
   ```bash
   MARKET_ADDRESS=<new addr> PRICE_FEED_ADDRESS=<feed> \
     forge script script/AllowlistFeed.s.sol --rpc-url robinhood_mainnet --broadcast
   ```
5. Update `PREDICTION_MARKET_ADDRESS` in `../src/chain/contracts.ts`,
   rebuild and redeploy the frontend (both GitHub Pages via push, and the
   VPS via SSH — see root `CLAUDE.md`).
6. Optionally recreate a starter market or two with
   `script/CreateMarket.s.sol` (`PRICE_FEED_ADDRESS`, `TARGET_PRICE`,
   `DEADLINE_UNIX` env vars) so the markets list isn't empty.

`NicknameRegistry` has no allowlist or per-market state to migrate — a
redeploy would just be `forge script script/DeployNicknameRegistry.s.sol
--rpc-url robinhood_mainnet --broadcast` and updating
`NICKNAME_REGISTRY_ADDRESS` in `../src/chain/nicknames.ts`, but every
existing nickname would be lost (they live on the old address's storage) —
there's no reason to redeploy this one unless the contract itself changes.

### Frontend wiring (done, for reference)

`../src/` has two parallel modes sharing one build — see root `CLAUDE.md`
for the split. The real-mode pieces relevant to contracts work:
- `src/chain/config.ts` — wagmi chain config, `injected()` connector with
  EIP-6963 multi-wallet discovery (surfaces MetaMask/Phantom by whatever
  the browser has installed, no per-wallet code). WalletConnect (for
  mobile, non-extension wallets) needs a free Project ID from
  cloud.walletconnect.com that only the project owner can obtain — not
  wired up yet.
- `src/chain/contracts.ts` — `PREDICTION_MARKET_ADDRESS`, `BET_TOKEN_ADDRESS`,
  `ALLOWLISTED_FEEDS`, the ABI, and client-side mirrors of the guardrail
  constants (kept in sync with the contract by hand — if the contract's
  constants change, update these too).
- `src/chain/nicknames.ts` — `NICKNAME_REGISTRY_ADDRESS`, ABI, `useNickname`.
- Reads: `getMarket(id)` for pool/status, `latestRoundData()` via the feed
  address for live price. Writes: `bet`/`claim`/`refund`/`resolve`/
  `createMarket`/`setNickname` all go through the connected wallet (it
  signs, no key ever held by the app). `bet` needs an ERC20 `approve`
  first — a separate signed transaction, surfaced as two explicit steps in
  the UI rather than made to look like one action.