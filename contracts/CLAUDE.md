## Status right now (2026-09-25)

**The legacy contract is live on Robinhood Chain mainnet with real money and
no audit. The deadline-settlement replacement is implemented and tested but is
not deployed.** `forge build` and `forge test` are green:

- Deployed USDG deadline `PredictionMarket`:
  `0x1a62098AcEd3F7F8C41fff1bc1395A541678b0F1`; its live keeper has submitted
  real resolutions. The older funded Chainlink contract is
  `0xd95ed19edBCd330498CADe7BA8569ac940A4182f` and remains a claim/refund
  compatibility target. The native-ETH replacement source has **43/43 focused tests
  passing** and settles from the same signed StockToken/USDG pool endpoint as
  Asset Race: the last Robinhood block strictly before the deadline. The
  price/timestamp/block hash are stored in `settlements(id)`; an endpoint over
  60 seconds old cancels with full refunds. `createMarket` is permissionless
  for owner-configured `assetId -> oracleId/decimals` bindings. The initial
  production set is exactly NVDA, TSLA, AAPL, META, MSTR, AMZN, MSFT, GOOGL,
  MU, and NFLX. It also enforces `MIN_MARKET_DURATION` (30 min) and
  deployment-configured `maxStakePerSideWei`. Target-range validation
  is UI guidance in this revision, not an onchain invariant. Deployment and
  migration details are in `../docs/PREDICTION_MARKET_DEADLINE_SETTLEMENT.md`.
- `NicknameRegistry`: `0x1Ddc13e9D4895a5E6671079478007C7371b76E75`
  (deployed 2026-09-11), **8/8 tests passing**. Standalone contract, no
  relationship to `PredictionMarket` other than both being read by the
  same frontend — `mapping(address => string) nicknameOf`, `setNickname`
  only ever writes `msg.sender`'s own entry.

New PredictionMarket, AssetRace and PriceArena source uses **native ETH only**
for stakes, pools, payouts, refunds and fees. Payable entry points require
`msg.value == amount`; there is no WETH, ERC-20 approval or swap. USDG remains
the 6-decimal Stock pool quote and the currency of old deployed positions. The
legacy deployments retain their existing configuration; replacements use the
reviewed pool configurations in `../config/asset-race-assets.json`.

**Redeploying either contract means configuring asset bindings again** — they
are mappings on the new address and nothing carries over automatically.

**Liquidity mechanics added 2026-09-05:**
- **One-sided cancellation:** `resolve()` cancels the market (full refunds
  via `refund()`, no fee) if either `poolYes` or `poolNo` is still zero at
  the deadline — a market only ever settles as a genuine two-sided
  prediction.
- **House seed liquidity:** `createMarket`'s new `initialYesAmount`/
  `initialNoAmount` params let the owner seed both sides atomically at
  creation (e.g. to open at 50/50 odds) — owner-only when non-zero, capped
  combined at the immutable `maxSeedLiquidityWei` deployment cap.
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


**Historical mainnet deploy flow (2026-09-10/11):** this describes the legacy
Chainlink deployment only. Do not reuse it for the pool-backed replacement; use
the dedicated settlement runbook instead.
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
forge test          # run the complete suite before any deployment review
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
approved asset bindings and minimum duration, asset configuration and
`voidMarket` being owner-only, bet accounting, YES/NO payout math
(exact wei-precision fee math), house seed liquidity and its cap,
one-sided-market cancellation + full refund, frozen pool identity/decimals,
delayed deterministic endpoint settlement, rejection of invalid endpoint
timestamps/decimals/prices, stale endpoint cancellation, early-bet weighting, and
nickname set/overwrite/clear/length limits. Add a test here first for any new
feature.

**Known, accepted risks:**
- Native ETH outbound calls can invoke recipient code. All three contracts use
  checks-effects-interactions plus `ReentrancyGuard`; failed receivers revert
  and restore accounting. Direct `receive`/`fallback` calls revert, while
  forced ETH is deliberately excluded from liability accounting.
- Pool spot prices can be manipulated in shallow liquidity; keep exposure
  bounded and review liquidity before approving more assets.
- Historical pool storage is not directly verifiable by the EVM. The separate
  EIP-712 price signer is a trusted data attester; a compromised signer could
  sign false price or block metadata even though an ordinary keeper/relayer
  cannot alter a valid proof.
- The UI target range is not enforced onchain. A user can bypass the UI and
  create a lopsided target for an approved asset.
- `resolve()` is permissionless by design (anyone can trigger it once the
  deadline passes) — intentional, keeper-friendly, not a bug.
- Late large bets shift parimutuel odds right up to the deadline — inherent
  to how parimutuel pools work (same as horse-racing tote boards), not a
  bug, but worth being explicit about in user-facing copy.
- Solvency: summed over all winners, total payout for a resolved market =
  `winningPool + losingPool*(10000-feeBp)/10000`, always ≤ `totalPool`
  (fee only ever reduces payout, integer rounding always rounds down) — the
  contract can never owe more than its accounted pool for a given market.
- **No external security audit.** Owner-centralized: one EOA controls the
  approved asset/pool bindings, protocol fee, and seed liquidity cap for
  `PredictionMarket`. Said explicitly in the product's own UI, not hidden.

### Deploying the replacement to mainnet

The replacement is designed for Robinhood Chain mainnet (chain id 4663), uses
native ETH, and reuses the deployed `SignedPoolRaceOracle`. It is not deployed.

**Steps 0 and 1 below are for the user to run themselves, in their own
terminal, never through Claude** — a private key printed into a chat
transcript is a burned key forever, full stop. Everything else goes
through Foundry scripts that read `PRIVATE_KEY` via `vm.envUint` inside
Solidity, so the key never appears on the CLI or in anything Claude reads.

0. User: generate a fresh burner wallet (`cast wallet new`), fund it with
   real ETH for gas, fill `contracts/.env` themselves.
1. User: set `SIGNED_POOL_ORACLE_ADDRESS`, `MAX_SEED_LIQUIDITY_WEI` and
   `MAX_STAKE_PER_SIDE_WEI` from the reviewed manifest. The wei values are broad
   fixed ETH safety fuses, not dollar enforcement.
2. Deploy `PredictionMarket`:
   ```bash
   forge script script/Deploy.s.sol --rpc-url robinhood_mainnet --broadcast
   ```
3. **Verify the guardrails are actually live**, don't assume the deploy
   picked up everything in source:
   ```bash
   cast call <new addr> "endpointOracle()(address)" --rpc-url robinhood_mainnet
   cast call <new addr> "MAX_PRICE_STALENESS()(uint256)" --rpc-url robinhood_mainnet
   cast call <new addr> "MIN_MARKET_DURATION()(uint256)" --rpc-url robinhood_mainnet
   cast call <new addr> "maxSeedLiquidityWei()(uint256)" --rpc-url robinhood_mainnet
   cast call <new addr> "maxStakePerSideWei()(uint256)" --rpc-url robinhood_mainnet
   ```
4. Generate the ten reviewed symbols/oracle IDs from the registry and simulate
   configuration before any broadcast:
   ```bash
   node ../scripts/check-asset-race-registry.mjs --deployment-symbols
   node ../scripts/check-asset-race-registry.mjs --deployment-oracle-ids
   forge script script/ConfigurePredictionMarket.s.sol:ConfigurePredictionMarket --rpc-url robinhood_mainnet -vvv
   ```
   The script reads comma-separated `ASSET_SYMBOLS` and `ASSET_ORACLE_IDS`.
5. Update `PREDICTION_MARKET_ADDRESS` in `../src/chain/contracts.ts`,
   rebuild and redeploy the frontend (both GitHub Pages via push, and the
   VPS via SSH — see root `CLAUDE.md`).
6. Optionally recreate a starter market or two with
   `script/CreateMarket.s.sol` (`ASSET_SYMBOL`, `TARGET_PRICE` with 18 decimals,
   `DEADLINE_UNIX` env vars) so the markets list isn't empty.
7. Install `scripts/prediction-market-keeper.mjs` as a separate restricted
   service. Start with `DRY_RUN=true`, `RUN_ONCE=true`, and
   `PREDICTION_MARKET_ALLOW_LIVE=false`; only enable persistent mainnet writes
   after its signer, chain ID, target contract, and dry-run output have been
   checked. See `../docs/PREDICTION_MARKET_DEADLINE_SETTLEMENT.md`.

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
- `src/chain/contracts.ts` — explicit new and legacy contract addresses,
  the replacement ABI, and client-side mirrors of betting constants and target
  guidance. `src/chain/predictionMarketAssets.ts` derives the ten pool-backed
  assets from `config/asset-race-assets.json`.
- `src/chain/nicknames.ts` — `NICKNAME_REGISTRY_ADDRESS`, ABI, `useNickname`.
- Reads: `getMarket(id)` for pool/status and the Asset Race LIVE service for
  display-only current pool prices. Writes: `bet`/`claim`/`refund`/`resolve`/
  `createMarket`/`setNickname` all go through the connected wallet (it
  signs, no key ever held by the app). `bet` attaches the exact frozen native
  ETH value and needs one wallet transaction with no approval.
