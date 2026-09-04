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
| Contracts | Compile clean, 8/8 Foundry tests pass (run via Docker — Foundry itself is **not** installed on any machine this was built on) | 
| Contract ↔ frontend | **Not connected at all.** Frontend is a pure in-browser simulation (zustand stores pretending to be a chain); contracts have never talked to it |
| Contract ↔ frontend parity | **Mismatched right now** — frontend allows any user to create a market with a $500 cap; the Solidity contract still has `createMarket` as `onlyOwner` with no cap. Fix this before deploying (see `ROADMAP.md` §1) |
| Testnet deploy | Prepared (scripts + checklist in `contracts/CLAUDE.md`), execution **paused** pending the wallet-model decision below |

## Critical operating rules (learned through actual friction — read before acting)

1. **Never handle a private key.** Not generate it, not read it, not put
   it in a message. If a command would print one (`cast wallet new`,
   anything reading `contracts/.env`), the user runs it themselves in
   their own terminal — never through a Claude tool call. Same for
   GitHub tokens: auth via `gh auth login` (browser device-code flow),
   never a pasted token.
2. **This runs on a company-managed, EDR-monitored workstation.** Ask
   before installing anything new (npm packages inside a project are
   fine; global tools like Foundry are not, by default). When a tool is
   needed but installing it isn't confirmed, use the official Docker
   image instead:
   ```bash
   docker run --rm -v "$PWD":/app -w /app --entrypoint sh \
     ghcr.io/foundry-rs/foundry:latest \
     -c "git config --global --add safe.directory '*' && forge test -vvv"
   ```
   (`gh` — the GitHub CLI — *was* explicitly approved and installed via
   brew on the original machine; Foundry was deliberately kept
   Docker-only. Confirm the state of the current machine rather than
   assuming either.)
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

## Blocking product decisions (as of last session — check with the user, may have moved)

| Decision | Status |
|---|---|
| Wallet model: external connect (MetaMask/`wagmi` `injected()`) vs embedded (platform-generated wallet + exportable private key, à la Privy/Dynamic/Turnkey) | **On hold** |
| Memecoin / pump.fun-linked tokens in scope? | **Undecided** |
| Early cash-out on an open position before resolution | **Needs mechanic design** — idea on the table: sell at current implied odds (e.g. price moved 60% toward your side → cash out at 1.6x instead of waiting for 2x) |
| Side-column layout on the market page (events + bet buttons) | **Waiting on design references** from a teammate (Vlad) |

Market creation itself **is decided**: permissionless, any logged-in user
(not curator-only — this was flipped from an earlier decision, frontend
already reflects it, contract does not yet).

## Roadmap

Full detail in [`ROADMAP.md`](./ROADMAP.md). Short version, in order:

1. Fix contract/frontend parity (remove `onlyOwner`, add the $500 cap
   on-chain, mitigate the new rigged-price-feed risk that permissionless
   creation opens up)
2. Actually deploy to Robinhood Chain testnet (checklist ready, needs the
   user's wallet + funding steps)
3. Wire the frontend to the real contract (depends on the wallet-model
   decision)
4. Security pass before any real (even testnet-public) usage

## Local dev

```bash
npm install
npm run dev        # frontend, http://localhost:5173
npm run build       # what CI runs — check this passes before pushing
```

Contracts: see `contracts/CLAUDE.md` for the full build/test/deploy flow
(Docker-based, no local Foundry install assumed).
