# Prophet — project context for Claude

Read this first on a new machine/session. It's the map — deeper detail lives in
[`README.md`](./README.md) (layout, local run, env vars),
[`solana/README.md`](./solana/README.md) (program build/test, attestation
format), [`docs/SOLANA_MIGRATION.md`](./docs/SOLANA_MIGRATION.md) (decisions,
phases), [`docs/SOLANA_CHANGELOG.md`](./docs/SOLANA_CHANGELOG.md) (what changed
vs the EVM product, in Russian — the owner reads it) and
[`ROADMAP.md`](./ROADMAP.md). Read the operating rules below before running
anything, especially anything that touches mainnet.

**Naming note:** the product is branded **Prophet** everywhere a user sees it.
The repo and npm package still say `robinhood-predict`.

## What this is

Two parimutuel prediction games on **Solana**:

- **Asset Race** — back the asset with the highest percentage return.
- **Price Arena** — up to 10 players predict a final price; the closest half wins.

Stakes in SOL (and admin-approved SPL / Token-2022 tokens). Prices in USD from
reviewed DEX pools, signed by the price service as Ed25519 attestations that
the programs verify. 2% fee on the losing pool, split between creator and Prophet.

This branch (`solana-migration`) **replaces** the earlier Robinhood Chain (EVM)
product — Prediction Markets, Asset Races and Price Arena with native-ETH
stakes. That EVM product is **still live with real money from `main`** at
https://prophetmarkets.fun, run by keepers on the VPS. Its contracts, scripts
and ops docs were removed from this branch; they remain on `main` and in git
history. Nothing from this branch is on mainnet. No external security audit.

## Status snapshot (2026-10-03)

| Piece | Status |
|---|---|
| Programs (`solana/`) | `prophet_games` (Asset Race + Price Arena in one program, shared config/assets/stake mints/treasury/creator earnings) and `nickname_registry`, + crates `pool_attestation`, `stake_funds`. 38 LiteSVM tests pass. Built with `opt-level = "z"`: 644 KB + 155 KB ≈ 5.6 SOL deploy rent. Dev IDs: prophet_games `G1xjFqQ976m5xsybUCjLxjJxRCcx3PCwpxBgj7VM6ME7`, nickname_registry `9hbJLs2EGPdvVLcxQs2N2QqZUhh8r2J86PK8rYBRxJdt`. Not deployed to devnet or mainnet. |
| Asset catalog | Owner approved 26 assets (`config/solana-catalog-approved.json`): 3 crypto, 10 memes, 13 stocks. |
| Frontend | Prediction Market and mock demo removed. Phantom/Solflare wallets, Anchor clients, nicknames on Solana. Race and arena pages still read through the old EVM layer (`src/chain/`, wagmi/viem) until they move to Solana. Portfolio, leaderboard and archive are placeholders. |
| Local stand | `scripts/solana/localnet.sh` + `scripts/solana/admin.mjs setup|seed` work on a local validator in WSL. |
| Price service + keeper | `scripts/solana/price-service/` (accountSubscribe history, signed attestations) and `scripts/solana/keeper.mjs`. Full race and arena lifecycle passes on localnet with live mainnet prices (`scripts/solana/e2e-localnet.mjs --arena`). Needs a paid mainnet RPC; the public one returns 429. |
| Not started | Frontend race/arena pages on Solana, indexer, devnet deploy, VPS services for Solana. |

### Product color system

Orange (`#ED8F3A` / `#F2A65A`) for Asset Races and cornflower blue
(`#7A9FF0` / `#B7CEFF`) for Price Arena across navigation, primary actions,
cards and product labels. Purple (`#6A5AE0` / `#8B7CF7`) stays the brand
accent. Outcome, status, warning and category colors may keep their own
semantic meaning; do not use them to redefine a product's identity color.

## Critical operating rules (learned through actual friction — read before acting)

1. **Never handle a private key.** Not generate it, not read it, not put it in
   a message. That includes Solana keypair JSON files and seed phrases. A
   command that would print one runs in the user's own terminal. Scripts may
   load a keypair file internally to sign (as `scripts/solana/admin.mjs`
   does) but must never print it. Throwaway in-memory test wallets on
   localnet/LiteSVM are fine. Same for API keys and GitHub tokens
   (`gh auth login` device flow, never a pasted token).
2. **The WSL dev keypair (`~/.config/solana/id.json`, pubkey `D5Svp…L4R`) is
   exposed** — its seed phrase was shown in chat. Localnet/devnet only. Before
   any mainnet deploy or mainnet authority, stop and require a freshly
   generated owner key the user creates without screenshotting it, plus a
   separate oracle key per cluster.
3. **Every mainnet interaction is real money.** Before a mainnet deploy or
   transaction, know what it costs and does, and confirm with the user. Run
   each broadcast as its own tool call; if one gets blocked twice in a row,
   stop and ask rather than finding a workaround. `admin.mjs` refuses mainnet
   by design.
4. **Do not merge this branch into `main` before the EVM product is wound
   down.** The VPS builds the site and runs the live EVM keepers from `main`;
   this branch deletes those keepers, so a merge would strand real user funds
   mid-game. Wind-down (owner-run): stop new games, let open ones settle,
   keep claims/refunds reachable, then switch.
5. **VPS SSH uses a non-default port.** `ssh -i ~/.ssh/predictx_vps -p 22022
   root@104.207.90.56` — port `22022`, not `22`. The live EVM deploy command
   is documented in `CLAUDE.md` on `main`.
6. **Screenshot structural/visual frontend changes before shipping them.** Use
   the `run-frontend` skill (Playwright against the local dev server).
   HashRouter: routes live after `#`; the dev base path is `/robinhood-predict/`.
   In Git Bash prefix Playwright route arguments with `MSYS_NO_PATHCONV=1`.
7. **`git commit -m` breaks on apostrophes** in this shell setup. Use
   `git commit -F <file>` (heredoc) for anything non-trivial.
8. **Ask before a new install, git init, npm install or a new service** the
   first time in a session. Routine edits don't need re-confirmation.
9. **Record every meaningful step in `docs/SOLANA_CHANGELOG.md`** (Russian):
   what was done and how it differs from the EVM product.

## Toolchain and local dev

Rust 1.99, Solana CLI 3.1 (Agave), Anchor 1.1.2 and Node live in **WSL Ubuntu**
(user `dev`). WSL DNS is pinned in `/etc/resolv.conf` (1.1.1.1, 8.8.8.8,
immutable) because the WSL resolver was broken. Build artifacts and program
keypairs live in `$HOME/prophet-target` (outside the repo). From Git Bash,
run WSL work through a script file (`wsl.exe -d Ubuntu -- bash <file>` with
`MSYS_NO_PATHCONV=1`); inline quoting through PowerShell or `bash -c` breaks.

```bash
# frontend (Windows)
npm run dev        # http://localhost:5173/robinhood-predict/
npm run build      # what CI runs — check it passes before pushing

# programs (WSL, from solana/)
export CARGO_TARGET_DIR=$HOME/prophet-target
anchor build && cargo test --workspace
# copy $HOME/prophet-target/{idl,types}/*.{json,ts} to src/solana/idl/ after IDL changes

# local stand (WSL, repo root)
bash scripts/solana/localnet.sh --background
node scripts/solana/admin.mjs setup && node scripts/solana/admin.mjs seed
```

## Ops lessons worth knowing before touching infra

- **nginx `proxy_pass` with a literal hostname resolves DNS once, at config-load
  time** — a transient DNS hiccup once kept nginx from starting for ~7 hours.
  Use `resolver 8.8.8.8 1.1.1.1 valid=300s;` + a variable in `proxy_pass` +
  an explicit `rewrite ... break`. Apply to every external proxy, including the
  future Solana RPC proxy.
- **Browser calls straight to a rate-limited RPC fail as fake CORS errors** (a
  429 carries no CORS headers). Proxy RPC through the VPS with caching and
  `proxy_cache_use_stale` for `http_429`; set `VITE_SOLANA_RPC_URL` to the proxy
  path at VPS build time.
- **Per-visitor polling scales with users, not assets.** Pre-fetch shared data
  (prices, history) with one server-side poller and serve a snapshot.
- **Production deploy source is singular:** publish through `main` and build
  from `/opt/robinhood-predict`; never point nginx at ad-hoc build directories.
- **A private GitHub repo silently kills GitHub Pages** and the VPS's anonymous
  `git pull`. Flipping it back public needs Settings → Pages reconfigured once.
- **Paid RPC per service, keys never in the repo.** Keep per-service environment
  variable boundaries.
