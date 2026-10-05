# Prophet — project context for Claude

Read this first on a new machine/session. It's the map — deeper detail lives in
[`docs/HANDOFF.md`](./docs/HANDOFF.md) (status, VPS layout, local stand, next steps),
[`README.md`](./README.md) (layout, local run, env vars),
[`docs/GAME_SERVER_REVIEW_BACKLOG.md`](./docs/GAME_SERVER_REVIEW_BACKLOG.md) (game server review),
[`docs/SOLANA_CHANGELOG.md`](./docs/SOLANA_CHANGELOG.md) (what changed vs the EVM product, in Russian — the
owner reads it) and [`ROADMAP.md`](./ROADMAP.md). `docs/SOLANA_MIGRATION.md` describes the earlier
on-chain-program plan and is history now. Read the operating rules below before running anything, especially
anything that touches mainnet.

**Naming note:** the product is branded **Prophet** everywhere a user sees it.
The repo and npm package still say `robinhood-predict`.

## What this is

Prediction games on **Solana**, paid in SOL, with **no program of our own**:

- **Coin Duels** (the "Races" tab) — 2–6 racers each bring a coin and the same stake ($1–$50); the biggest
  percentage gain wins. Spectators back racers (≤$100) and cheer for free.
- **Price Arena** — up to 10 players predict a final price or market cap; the closest half wins.
- **Launchpad** — create a pump.fun token from the site (player signs and pays).
- **PumpSwap** — up to 30 freshly graduated pump.fun coins added automatically every 15 minutes.

Players stake by sending SOL with a `prophet:` memo to the server's **game wallet**; the **game server**
(`scripts/solana/game-server/`) runs the games and pays out automatically (custodial while a game runs).
Prices are USD spot prices from reviewed Solana DEX pools, signed by the **price service**
(`scripts/solana/price-service/`) and verified against the pinned oracle key. Fee: 2% of winnings. Players use
the **Prophet wallet** — a keypair kept in their browser; we never see or store player keys (owner decision,
2026-10-05). The site is on GitHub Pages; the VPS serves the APIs.

This branch (`solana-migration`) **replaces** the earlier Robinhood Chain (EVM) product, which is **still
live with real money from `main`** at https://prophetmarkets.fun, run by keepers on the VPS. The earlier
Anchor programs of this branch were removed too (deploy cost); both remain in git history. Nothing from this
branch has handled real money yet. No external security audit.

## Status snapshot (2026-10-05)

| Piece | Status |
|---|---|
| Game server | Deposits, Price Arena, Coin Duels, payout outbox (done only at finalized, never twice), fee sweep to the cold wallet, domain-bound signed actions, backups, PumpSwap auto-add, last-known data for the site. 44 tests; race e2e on localnet exact to the lamport. |
| Price service | Raydium AMM v4 / CPMM / CLMM, Orca, Meteora DLMM, PumpSwap decoders; signed attestations. 9 tests. |
| Catalog | 11 crypto (BTC, SOL, ETH, HYPE, ZEC, PUMP, NEAR, DOGE, BNB, SUI, XRP; the last four below the $500k pool floor by owner decision), 10 memes, + PumpSwap. No stocks. |
| Frontend | Duels, arenas, PumpSwap table, launchpad, portfolio/leaderboard/archive, Prophet wallet, hero race; phone layout. Never show "devnet" wording. |
| VPS | Services installed at `/opt/prophet-solana`, **stopped and disabled** until the live test. |
| Not done | Duel e2e on a validator, own domain (browser-held keys must not live on `github.io`), live $1 test, owner's first launch, EVM wind-down. |

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
   generated key the user creates without screenshotting it. The mainnet
   game wallet and oracle keys were created on the VPS and never printed.
3. **Every mainnet interaction is real money.** Before a mainnet deploy or
   transaction, know what it costs and does, and confirm with the user. Run
   each broadcast as its own tool call; if one gets blocked twice in a row,
   stop and ask rather than finding a workaround. The game server pays real
   money automatically once it runs on mainnet: starting it is a mainnet action.
4. **Do not merge this branch into `main` before the EVM product is wound
   down.** The VPS builds the site and runs the live EVM keepers from `main`;
   this branch deletes those keepers, so a merge would strand real user funds
   mid-game. Wind-down (owner-run): stop new games, let open ones settle,
   keep claims/refunds reachable, then switch.
5. **VPS SSH uses a non-default port.** `ssh -i ~/.ssh/id_ed25519 -p 22022
   root@104.207.90.56` — port `22022`, not `22`. Solana services live in
   `/opt/prophet-solana` (see `docs/HANDOFF.md`); never touch the EVM side. The live EVM deploy command
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

Node 24 runs the services and the frontend (Windows or WSL). The local validator (Solana CLI 3.1, Agave)
lives in **WSL Ubuntu** (user `dev`). WSL DNS is pinned in `/etc/resolv.conf` (1.1.1.1, 8.8.8.8, immutable)
because the WSL resolver was broken. From Git Bash, run WSL work through a script file
(`wsl.exe -d Ubuntu -- bash <file>` with `MSYS_NO_PATHCONV=1`); inline quoting through PowerShell or
`bash -c` breaks.

```bash
# frontend
npm run dev        # http://localhost:5173/robinhood-predict/
npm run build      # what CI runs — check it passes before pushing

# tests
node --test scripts/solana/game-server/*.test.mjs scripts/solana/price-service/*.test.mjs

# local stand (validator in WSL, repo root)
bash scripts/solana/localnet.sh --background
node scripts/solana/price-service/service.mjs          # needs mainnet RPC env + ORACLE_KEYPAIR
GAME_WALLET_KEYPAIR=ephemeral node scripts/solana/game-server/server.mjs

# catalog: edit config/solana-catalog-approved.json (owner decisions only), then
node scripts/solana-catalog-scan.mjs && node scripts/solana-catalog-propose.mjs && node scripts/solana-assets-config.mjs
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
