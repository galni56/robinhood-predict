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
2. **Parimutuel liquidity mechanics** — one-sided-market cancellation
   (full refund, no fee, if a market never gets bets on both sides),
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
5. **Frontend wired to the real chain** — wallet connect (external,
   `wagmi` `injected()` + EIP-6963, no embedded/custodial wallet), browse
   with no wallet needed, create market, bet (approve + bet), claim,
   refund, resolve — all verified with real wallets and real transactions.
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

## Open / explicitly deferred

- **ETH as a second bet currency.** Not started. `PredictionMarket`
  already supports any ERC20 as `betToken` — the clean path is a second,
  parallel deployment with WETH as the bet token rather than a
  same-contract multi-currency rewrite, at the cost of ETH and USDG
  markets being separate liquidity pools. A same-contract rewrite would
  also break `MAX_STAKE_PER_SIDE_USD`-style guardrails, which currently
  assume the bet token is ~$1 (true for USDG, false for ETH) — a
  per-market bet token would need its own price feed just to size that
  cap correctly.
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
