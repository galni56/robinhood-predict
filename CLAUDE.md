# Prophet (PredictX) — project context for Claude

Read this first on a new machine/session. It's the map — deeper detail
lives in [`README.md`](./README.md) (mock-side frontend architecture),
[`contracts/CLAUDE.md`](./contracts/CLAUDE.md) (contract build/test/deploy),
and [`ROADMAP.md`](./ROADMAP.md) (history + what's next). This file is the
orientation + the operating rules learned the hard way — read those rules
before running anything, especially anything that touches mainnet.

**Naming note:** the product is branded **Prophet** everywhere a user sees
it (domain, page titles, navbars, footer — renamed from "PredictX"
2026-09-11). The repo, npm package, and internal contract/file names still
say `robinhood-predict` / `PredictX` in places — that's just not renamed at
the code level, it's the same project. Don't be thrown by the mismatch.

## What this is

A **live, real-money** prediction market on Robinhood Chain (a real EVM L2
Robinhood launched for tokenized equities, chain id 4663). Users connect a
real wallet (MetaMask/Phantom) and bet real USDG on whether a tokenized
stock reaches a target price before a deadline — parimutuel payouts, no
bookmaker. This is **not a demo product** — it has real users, real money,
and no external security audit. Treat every contract interaction
accordingly: think before broadcasting, confirm with the user when unsure.

Two parts, both live:

- **Real mode** (`src/pages/Onchain*.tsx`, `src/chain/`) — reads/writes the
  actual mainnet contracts via `wagmi`/`viem`. This is the homepage (`/`)
  and everything under `/onchain/*`.
- **Mock demo** (everything else — `src/store/`, `src/market/`, the
  non-Onchain pages) — the original fully-client-side simulated version,
  now reachable via "Try the demo" / `/demo`. Still fully intact and
  useful as a no-wallet-needed walkthrough. See `README.md` for how it
  works (zustand stores, `ChainEngine`, simulated blocks/prices).

**Live URLs:**
- **https://prophetmarkets.fun** — the real product, self-hosted VPS,
  primary/canonical
- **https://galni56.github.io/robinhood-predict/** — GitHub Pages mirror,
  auto-deploys on push to `main`. Same code, same real mainnet contracts.

Repo: **https://github.com/galni56/robinhood-predict** (public, owner's
personal GitHub account). GitHub Pages silently stops serving if this repo
ever goes private again — it happened once (2026-09-11), see the "Ops
lessons" section below.

## Status snapshot (2026-09-11)

| Piece | Status |
|---|---|
| `PredictionMarket` contract | **Live on mainnet**, redeployed 2026-09-10 at `0xd95ed19edBCd330498CADe7BA8569ac940A4182f`. No flat dollar cap on target price — instead a duration-scaled deviation band (2% floor; 4%/15%/20% ceiling for short/medium/long durations) genuinely enforced on-chain, plus min market duration (30 min) and max stake per wallet per side ($50). 2% protocol fee, taken only from the losing pool's contribution to a winner's payout. 36/36 Foundry tests pass. |
| `NicknameRegistry` contract | **Live on mainnet** at `0x1Ddc13e9D4895a5E6671079478007C7371b76E75` (deployed 2026-09-11). Standalone from PredictionMarket on purpose. `setNickname(string)` — anyone can set their own, 24-char max, no admin override. 8/8 tests pass. `src/chain/nicknames.ts` + `src/components/AddressLabel.tsx` (the one place addresses should render through) wire it into the leaderboard, recent bets, and per-market bet lists. |
| Bet token | Real USDG at `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, **6 decimals** (not 18 — the old testnet mock token was 18, this has tripped up the frontend before, double-check before assuming). USDG only for now; ETH support is a known, explicitly-flagged gap (see Roadmap). |
| Price feeds | 27 real Chainlink feeds allowlisted (owner-only step, `setPriceFeedAllowed`) — full list with addresses in `src/chain/contracts.ts` (`ALLOWLISTED_FEEDS`). Each was verified on-chain (`decimals()`/`description()`/`latestRoundData()`) before allowlisting — always do this for a new one, never trust a pasted address blind. |
| Markets | 11 live as of this writing (TSLA + NVDA/AAPL/MSFT/GOOGL/AMZN/META/PLTR/SPY/QQQ seeded with 30-day deadlines so the site doesn't look empty, plus one real user-created market). `createMarket` is fully permissionless — anyone with an allowlisted feed can open one. |
| Frontend ↔ contract | Fully wired: connect, browse (no wallet needed), create market, bet (approve + bet), claim, refund, resolve, view a market's own bet history, leaderboard, nicknames. Verified working with real wallets and real transactions, not just simulated. |
| Hosting | VPS (`prophetmarkets.fun`) + GitHub Pages, both auto-serving real mainnet data. nginx on the VPS proxies Robinhood Chain's own read-only price/catalog REST API (`/api/robinhood/*`) with 15s server-side caching — see "Ops lessons" below for why that caching exists and a past outage it fixed. |
| Audit | **None.** Said explicitly in the UI disclaimer banner on every real-mode page. Owner-centralized (one EOA controls the price-feed allowlist, protocol fee, and seed liquidity) — a known, accepted risk for this stage. |

## Critical operating rules (learned through actual friction — read before acting)

1. **Never handle a private key.** Not generate it, not read it, not put it
   in a message. A command that would print one runs in the user's own
   terminal, never through a Claude tool call. Foundry scripts read
   `PRIVATE_KEY` via `vm.envUint` inside Solidity so it never touches the
   CLI or a chat transcript. Same for GitHub tokens: `gh auth login`
   (browser device-code flow), never a pasted token.
2. **Every contract interaction here is real mainnet money**, not a
   testnet dry run. Before a `--broadcast`, know what it costs and what it
   does. The auto-mode classifier blocks a private key appearing on the
   CLI outright, and also blocks *looping* multiple `--broadcast` calls in
   one Bash invocation — run each one as its own separate tool call
   instead (this has worked reliably every time it's been tried). If a
   deploy/broadcast gets blocked twice in a row, stop and ask the user
   rather than finding a workaround.
3. **VPS SSH uses a non-default port.** `ssh -i ~/.ssh/predictx_vps -p
   22022 root@104.207.90.56` — port `22022`, not `22`. Guessing the
   default port here just looks like the server is down and wastes real
   time (happened once). Full deploy command:
   ```bash
   ssh -i ~/.ssh/predictx_vps -p 22022 root@104.207.90.56 \
     "cd /opt/robinhood-predict && git pull origin main && VITE_BASE_PATH=/ VITE_RPC_URL=/api/rpc/ npm run build"
   ```
   Both env vars matter: `VITE_BASE_PATH=/` — the default `base` in
   `vite.config.ts` is `/robinhood-predict/` (for GitHub Pages), and the
   VPS serves from the domain root, so every asset 404s without the
   override. `VITE_RPC_URL=/api/rpc/` (trailing slash required) — points
   wagmi's RPC transport at the VPS's own nginx proxy instead of calling
   Robinhood's RPC directly from the browser; omitting it silently
   regresses to the direct URL, which is exposed to the CORS-masked-429
   failure mode in "Ops lessons" below.
4. **Screenshot structural/visual frontend changes before shipping them.**
   Use the `run-frontend` skill (Playwright against the local dev server)
   to verify a layout/component change actually renders correctly before
   pushing to prod — this project has a specific bad memory of shipping an
   unreviewed structural change that had to be reverted.
5. **`git commit -m` breaks on apostrophes** in this shell setup. Use
   `git commit -F <file>` (heredoc) for anything non-trivial.
6. **Confirm the machine before installing anything new** — don't assume
   either way. This machine has Foundry installed directly (confirmed
   non-work-managed); a Docker fallback pattern is in `contracts/CLAUDE.md`
   if a future machine turns out to be work-managed.
7. **Ask before git init / npm install / a new dev server or tool** the
   first time in a session. Once something is already set up, routine
   edits don't need re-confirmation, but a genuinely new install/service
   does.

## Ops lessons worth knowing before touching infra

- **nginx `proxy_pass` with a literal hostname resolves DNS once, at
  config-load time.** The `/api/robinhood/` proxy to `api.robinhood.com`
  used to be written that way; a transient DNS hiccup during a routine
  reload made nginx refuse to start *at all*, taking the whole site down
  for ~7 hours before anyone noticed. Fixed by deferring resolution to
  request time: `resolver 8.8.8.8 1.1.1.1 valid=300s;` + `set
  $robinhood_backend api.robinhood.com;` + `proxy_pass
  https://$robinhood_backend;` with the path rewritten explicitly via
  `rewrite ... break` (a variable in `proxy_pass` stops nginx from
  auto-stripping the location prefix, so you have to do it yourself).
  Apply this pattern to any *other* external proxy added later.
- **That same endpoint now has response caching** (`proxy_cache`, 15s TTL,
  matching Robinhood's own server-side cache window) because each
  connected browser tab independently polls ~30 tickers every 15s
  (`useCorePrices()` in `src/chain/robinhoodApi.ts`) — without server-side
  caching, request volume to Robinhood's API scales with concurrent
  *users*, not distinct tickers, and blows past their 60 req/s limit at
  realistic traffic. `useCorePrices()`'s dedup only solves the
  *within-one-tab* version of this problem; the nginx cache is what
  solves it across users.
- **Direct browser calls to Robinhood's RPC (`rpc.mainnet.chain.robinhood.com`)
  hit the same CORS-masks-429 problem, separately from the price API.** A
  429 (rate limit) response has no CORS headers, so the browser reports it
  as a CORS failure with no usable HTTP status for wagmi/viem's retry logic
  — every market read fails at once when this happens. Fixed the same way:
  `/api/rpc/` on the VPS's nginx, same lazy-DNS pattern, cached by
  `proxy_cache_key "$request_body"` (2s TTL) with `proxy_cache_use_stale`
  covering `http_429` specifically, so a rate-limited call degrades to the
  last good answer instead of erroring. Requires `VITE_RPC_URL=/api/rpc/`
  at VPS build time (see rule 3 above) — GitHub Pages has no proxy
  available and is unaffected/unfixed either way.
- **A private GitHub repo silently kills GitHub Pages.** Free-tier Pages
  doesn't serve from a private repo, and flipping the repo back to public
  doesn't auto-resume it — it needs Settings → Pages reconfigured once
  manually. Also breaks the VPS's `git pull` if it's using anonymous
  HTTPS (which it is).

## Roadmap / what's next

Full history in [`ROADMAP.md`](./ROADMAP.md). Known, explicitly-flagged
gaps as of this writing:

- **ETH as a second bet currency** — discussed, not started. The clean
  path is a second, parallel `PredictionMarket` deployment with WETH as
  `betToken` (the contract already supports any ERC20, no code change
  needed) rather than a same-contract multi-currency rewrite — keeps the
  well-tested pool/fee/claim logic untouched, at the cost of ETH markets
  and USDG markets being separate liquidity pools.
- **WalletConnect** for mobile Safari / non-extension wallets — needs a
  free Project ID from cloud.walletconnect.com that only the project
  owner can obtain, not started.
- **Chainlink price history** — `latestRoundData()` has no backfill, so
  the market-card sparkline only shows real polled data since the page
  was opened, not a market's full lifetime.
- No external security audit yet — said explicitly in-product, not hidden.

## Local dev

```bash
npm install
npm run dev        # frontend, http://localhost:5173
npm run build      # what CI runs — check this passes before pushing
```

Contracts: see `contracts/CLAUDE.md` for the full build/test/deploy flow.
Foundry is installed directly on this machine at `~/.foundry/bin` (not
always on `PATH` in a fresh shell — `export PATH="$PATH:$HOME/.foundry/bin"`
if `forge`/`cast` aren't found).
