# PredictX — project context for Claude

Read this first on a new machine/session. It's the map — deeper detail
lives in [`README.md`](./README.md) (frontend architecture),
[`contracts/CLAUDE.md`](./contracts/CLAUDE.md) (contract build/test/deploy),
and [`ROADMAP.md`](./ROADMAP.md) (phased plan + open decisions). This file
is the orientation + the operating rules learned the hard way — read those
rules before running anything.

## What this is

A prediction market where users bet YES/NO on whether a tokenized stock
(on Robinhood Chain — a real EVM L2 Robinhood launched for tokenized
equities) reaches a target price before a deadline. Two parts:

- **Frontend** (`src/`) — React/TS/Vite, fully mock, deployed and live
  right now: **https://galni56.github.io/robinhood-predict/**
- **Contracts** (`contracts/`) — Solidity, written and tested, **not
  deployed anywhere yet**

Repo: **https://github.com/galni56/robinhood-predict** (public, owner's
personal GitHub account, not a company account)

## Status snapshot

| Piece | Status |
|---|---|
| Frontend | Fully working, live on GitHub Pages, auto-deploys on push to `main` via `.github/workflows/deploy.yml` |
| Contracts | Compile clean, 28/28 Foundry tests pass (Foundry installed directly on this machine — see rule 2 below, this is not the original company-managed workstation). Includes parimutuel liquidity mechanics (2026-09-05: one-sided-market cancellation, owner house seed liquidity capped $50, protocol fee taken only from losing-pool winnings) and a time-weighted early-bet mechanic (2026-09-06: betting closes at 2/3 of a market's life, a winning bet's share of the losing pool decays from 2x to 0.5x the later it's placed — see `ROADMAP.md` §3.5, and §3.6 for the fuller AMM-based fix parked for later). Self-review pass done 2026-09-06 (added a missing `nonReentrant`, documented the `betToken`-must-be-standard-ERC20 assumption and the owner-centralization risk) — still **not** an external audit, see `contracts/CLAUDE.md` |
| Contract ↔ frontend | **First real connection landed 2026-09-05**, expanded 2026-09-06 to multiple routes: `/onchain` (list all markets), `/onchain/:id` (detail — was the only page before), `/onchain/create` (real `createMarket` tx). Wallet-connect + bet/claim/refund/resolve wired up (`wagmi` + `viem`), alongside the still-fully-intact mock app on every other route. Read paths verified live in a browser; **no wallet-signed transaction has been tried with a real MetaMask/Phantom session yet** — see `ROADMAP.md` §3 |
| Contract ↔ frontend parity | **Fixed.** `createMarket` is now permissionless with an on-chain $500 cap (`MAX_TARGET_PRICE_USD`) mirroring the frontend, plus an owner-maintained price-feed allowlist (`setPriceFeedAllowed`) so permissionless creation can't be used to rig a market with a fake feed |
| Testnet deploy | **Live**, redeployed 2026-09-06 to pick up the early-bet mechanic: `PredictionMarket` at `0xE1BA3CBD9D6e5B88af2a3d283D11d7c88e4eC4a7` (2% protocol fee), bet token at `0xBDc0F8045Baa2377F11A03d3c867E81dB263A93A` (reused, unchanged), one market open (TSLA reach $400, fresh 24h deadline). Price feed is a mock (`MockAggregator`, also reused), not real Chainlink — see `ROADMAP.md` §2 for why (Chainlink Data Feeds only exist on Robinhood Chain **mainnet**, confirmed 2026-09-05) |

## Critical operating rules (learned through actual friction — read before acting)

1. **Never handle a private key.** Not generate it, not read it, not put
   it in a message. If a command would print one (`cast wallet new`,
   anything reading `contracts/.env`), the user runs it themselves in
   their own terminal — never through a Claude tool call. Same for
   GitHub tokens: auth via `gh auth login` (browser device-code flow),
   never a pasted token.
2. **Confirm the state of the current machine before installing anything —
   don't assume either way.** The project was originally built on a
   company-managed, EDR-monitored workstation, where Foundry was
   deliberately kept Docker-only and installing anything new required
   asking first:
   ```bash
   docker run --rm -v "$PWD":/app -w /app --entrypoint sh \
     ghcr.io/foundry-rs/foundry:latest \
     -c "git config --global --add safe.directory '*' && forge test -vvv"
   ```
   As of the 2026-09-04 session, work moved to a machine the user
   confirmed is **not** company-managed, so Foundry was installed directly
   (`curl -L https://foundry.paradigm.xyz | bash && foundryup`, then
   `forge install foundry-rs/forge-std --no-git --no-commit` and
   `forge install OpenZeppelin/openzeppelin-contracts@v5.1.0 --no-git
   --no-commit` since `lib/` is gitignored and not vendored on a fresh
   checkout) — confirmed with the user first. The Docker path above still
   works and is the fallback if a future machine turns out to be
   work-managed again. Rule 1 (never handle private keys) and rule 4
   (ask before a new install/tool/server) are unaffected either way —
   those aren't about EDR policy, they hold regardless of machine.
3. **`git commit -m` breaks on apostrophes** in this shell setup (e.g.
   "authStore's" mid-sentence closes the quote early and corrupts the
   command). Write the message to a temp file and use `git commit -F
   <file>` for anything non-trivial, or just avoid contractions/apostrophes
   in `-m` strings.
4. **Ask before git init / npm install / dev servers** the first time in
   a session — the user has pushed back hard on unprompted execution of
   these before. Once a repo is already set up (like this one now), normal
   edits don't need re-confirmation each time, but a *new* install/tool/
   server does.
5. Everything client-side is mock and should say so in the UI — there's a
   disclaimer banner (`DisclaimerBanner.tsx`) and it should stay accurate
   as things change (e.g. once real chain calls exist, distinguish mock
   mode from real mode clearly, don't just delete the disclaimer).
6. This is genuinely a financial/prediction-market product concept —
   legal/regulatory review has been **deliberately parked**, not resolved
   ("without legal for now"). Don't let a fast MVP implicitly become a
   decision that legal was unnecessary — it'll need a real look before
   mainnet or real users.

## Blocking product decisions (updated 2026-09-04 — check with the user if this looks stale)

| Decision | Status |
|---|---|
| Wallet model | **Decided: external connect**, via `wagmi`'s `injected()` connector with EIP-6963 multi-provider discovery so the user picks between whichever of **MetaMask and Phantom** (both required) they have installed — no embedded/custodial wallet. Phantom added native Robinhood Chain support (mainnet + testnet) in July 2026, so both work without a manual "add custom network" step. Rationale: zero custodial risk for the app while the contract has had no external security review yet; matches the project's existing "never hold user keys" posture |
| Memecoin / pump.fun-linked tokens in scope? | **Out of scope for this MVP push** — focus is the core roadmap (parity → testnet deploy → wire frontend → security pass) |
| Early cash-out on an open position before resolution | **Out of scope for this MVP push** — revisit after core roadmap ships |
| Side-column layout on the market page (events + bet buttons) | **Out of scope for this MVP push** — still waiting on design references from a teammate (Vlad) whenever it does get picked up |

Market creation itself **is decided**: permissionless, any logged-in user
(not curator-only) — now matched on both frontend and contract (see
Status snapshot above).

## Roadmap

Full detail in [`ROADMAP.md`](./ROADMAP.md). Short version, in order:

1. ~~Fix contract/frontend parity~~ **done** (`onlyOwner` removed from
   `createMarket`, $500 cap added on-chain, rigged-feed risk mitigated via
   an owner-maintained price-feed allowlist)
2. ~~Deploy to Robinhood Chain testnet~~ **done 2026-09-05** — live at the
   addresses in the Status snapshot above. Price feed is a mock
   (`MockAggregator`) since real Chainlink Data Feeds don't exist on this
   testnet yet (mainnet-only); real Chainlink integration for tokenized
   equities is Data Streams there, a separate follow-up task
3. Wire the frontend to the real contract (wallet model decided: external,
   MetaMask + Phantom via `wagmi injected()`)
4. Security pass before any real (even testnet-public) usage

## Local dev

```bash
npm install
npm run dev        # frontend, http://localhost:5173
npm run build       # what CI runs — check this passes before pushing
```

Contracts: see `contracts/CLAUDE.md` for the full build/test/deploy flow.
Foundry is installed directly on this machine (confirmed non-work); the
Docker path there still works if that ever changes.
