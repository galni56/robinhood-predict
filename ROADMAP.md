# Roadmap

This used to track a phased plan toward a testnet MVP. That plan is done
and superseded — the product has been live on **Robinhood Chain mainnet**
with real money since 2026-09-07. See root [`CLAUDE.md`](./CLAUDE.md) for
the current status snapshot and [`contracts/CLAUDE.md`](./contracts/CLAUDE.md)
for contract detail. This file is now a short history of how it got here,
plus what's actually still open.

## Shipped, in order

1. **Contract/frontend parity** — `createMarket` made permissionless,
   gated by an owner-maintained price-feed allowlist instead of a flat
   dollar cap on target price (the original cap was removed entirely
   2026-09-10 — it didn't scale per ticker).
2. **Parimutuel liquidity mechanics** — ineligible-market cancellation
   (full refund, no fee, unless both sides and two distinct participant
   addresses are present),
   owner house seed liquidity (capped), protocol fee taken only from the
   losing pool's contribution to a winner's payout.
3. **Time-weighted early-bet mechanic** — betting closes at 2/3 of a
   market's life; a winning bet's share of the losing pool decays from 2x
   (bet placed the instant betting opens) to 0.5x (right before betting
   closes). See "AMM-style continuous pricing" below for the fuller fix
   this only partially solves.
4. **Testnet deploy, then mainnet deploy** (2026-09-07) — real Chainlink
   price feeds and real USDG confirmed working; the project moved fully to
   mainnet and hasn't touched testnet since.
5. **Original USDG frontend wired to the real chain** — wallet connect,
   browse, create market, approve + bet, claim, refund and resolve were verified
   with real wallets and transactions. This is historical behavior; the local
   native-ETH successor removes approval.
6. **Anti-griefing guardrails made genuinely live** (2026-09-10 redeploy) —
   min market duration, a duration-scaled target-price deviation band
   (replacing the flat cap from #1), max stake per wallet per side.
7. **Real hosting** — domain (prophetmarkets.fun) + VPS, alongside the
   existing GitHub Pages mirror. Robinhood Chain's own read-only price/
   catalog API proxied server-side (CORS + rate-limit reasons, see
   `contracts/CLAUDE.md` "Ops lessons" in root `CLAUDE.md`).
8. **Nicknames** (2026-09-11) — a standalone on-chain registry so
   addresses can show a human-readable name anywhere they're displayed,
   without a backend.
9. **Rebrand to "Prophet"** (2026-09-11) — user-facing name changed from
   PredictX to match the actual domain; repo/package names unchanged.
10. **Deadline-bound USDG PredictionMarket deployed** (2026-09-23) — the
    contract at `0x1a62098AcEd3F7F8C41fff1bc1395A541678b0F1` uses the same signed
    StockToken/USDG pool block-pair proof as Asset Race. Its live keeper has
    submitted real resolutions. The subsequent native-ETH revision remains local;
    see `docs/PREDICTION_MARKET_DEADLINE_SETTLEMENT.md`.
11. **Native-ETH wager migration implemented locally** (2026-09-25) —
    Prediction Markets, Asset Races and Price Arena now accept exact payable
    native ETH and return ETH for payouts/refunds/fees. The UI accepts USD or
    ETH input for the live $1–$50 range using one cached ETH/USD quote and sends one transaction
    without approval. StockToken/USDG and MemeToken/ETH settlement prices are
    unchanged. The owner waived recovery for earlier USDG mainnet tests, so the
    release exposes no legacy UI or automation. Deployment and production
    switching are not part of this milestone.

## Existing USDG generation and native successor (updated 2026-09-25)

The deterministic USDG Asset Race contracts are deployed and configured on Robinhood
Chain mainnet, and the operator reports its keeper/LIVE services active. The deployed
`SignedPoolRaceOracle` is `0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7`
and `AssetRace` is `0x63E582bb395527CED97F2F94662eA93A7EDf65Ff`.
All 10 approved Stocks and 13 approved Memes are registered; deployment state,
tests and operational evidence are recorded in
[`docs/ASSET_RACE_PREDEPLOY_CHECKLIST.md`](./docs/ASSET_RACE_PREDEPLOY_CHECKLIST.md).

These USDG addresses are unsupported historical test deployments and remain only
in a denylist. Native successors are now deployed/configured at PredictionMarket
`0x4bfd0efc15C3198fe3AFf4741FF121AB2F38060e`, AssetRace
`0x02F030Bd9D9DC86d713CDF0772ae4d1E3b81f235` and PriceArena
`0x383840a8Ca00dcB4b6cAc17e746c793426fE2f05`. GitHub Pages deliberately leaves
them unset until controlled tiny-value rehearsals and an explicit frontend/
service switch pass. See
[`docs/NATIVE_ETH_MAINNET_DEPLOYMENT.md`](./docs/NATIVE_ETH_MAINNET_DEPLOYMENT.md).

## Open / explicitly deferred

- **Native ETH production rollout.** Code and local validation replace USDG
  wagering rather than adding WETH or a second liquidity currency. Onchain
  caps are broad fixed ETH safety fuses (`0.0001–0.1 ETH`); live dollar-range
  enforcement stays in the frontend. New
  deployments/configuration and all three tiny-value lifecycle rehearsals are
  complete; keeper/service changes and the frontend address switch still require
  explicit production approval. Follow the
  canonical [`native ETH operator packet`](./docs/NATIVE_ETH_DEPLOYMENT_OPERATOR_PACKET.md)
  in strict PredictionMarket → AssetRace → PriceArena order.
- **WalletConnect**, for mobile Safari / non-extension wallets. Needs a
  free Project ID from cloud.walletconnect.com that only the project
  owner can obtain — blocked on that, not on anything technical.
- **AMM-style continuous pricing** (constant-product or LMSR instead of
  two static pools) — the industry-standard fix for what the time-weighted
  mechanic in #3 only partially solves: price would naturally rise as one
  side gets bought, so betting after a trend is obvious costs more
  automatically, no hand-tuned decay curve needed. This is a ground-up
  replacement of the market mechanic, not an incremental change:
  - New share-token model (ERC1155 or per-market ERC20 pair) instead of a
    `stakes` mapping — shares mint on buy, burn on redeem
  - Constant-product curve or LMSR (LMSR needs a fixed-point `ln`/`exp`
    library — not native to Solidity)
  - An LP-liquidity subsystem (LP tokens, LP fees separate from protocol
    fee, withdrawal) replacing today's owner-only house seed liquidity
  - Slippage protection on buys/sells
  - Every mechanic tied to `stakes`/`poolYes`/`poolNo` needs rethinking:
    one-sided cancellation, one-bet-per-side, the early-bet weight — none
    map directly onto a share-token AMM
  - Full new Foundry test suite; full frontend rewrite (swap-with-slippage
    UX instead of "read the pool, place a bet")
  - Meaningfully higher security bar — AMM/bonding-curve math is where
    most real-world DeFi exploits happen (rounding errors, share-mint
    bugs, flash-loan price manipulation on thin single-market liquidity)

  Realistic scope: days, not hours — its own project phase with its own
  security review, not something to fit alongside other work.
- **External security audit.** Not done. Said explicitly in the product's
  own UI disclaimer, not hidden. Worth prioritizing before liquidity/usage
  grows much further, given the owner-centralization risk noted in
  `contracts/CLAUDE.md`.
- **Chainlink price history for charts.** `latestRoundData()` has no
  backfill endpoint, so the market-card sparkline only shows real data
  polled since the viewer's page was opened, not a market's full
  lifetime. A real fix would mean walking `getRoundData()` backwards
  (expensive, rate-limited) or standing up a lightweight indexer.
