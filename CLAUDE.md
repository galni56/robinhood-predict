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
real wallet (MetaMask/Phantom) and stake real funds on whether a tokenized
stock is at or above a target price at a deadline — parimutuel payouts, no
bookmaker. Earlier owner-operated mainnet tests used USDG; the supported contract
generation in this branch uses native ETH for all three modes. This is **not a demo product** — mainnet interactions use real money,
and there is no external security audit. Treat every contract interaction
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
  auto-deploys on push to `main` with the same reviewed native game contracts.

Repo: **https://github.com/galni56/robinhood-predict** (public, owner's
personal GitHub account). GitHub Pages silently stops serving if this repo
ever goes private again — it happened once (2026-09-11), see the "Ops
lessons" section below.

## Status snapshot (2026-10-01)

| Piece | Status |
|---|---|
| `PredictionMarket` contract | Creator-revenue V2 is live at `0xF62CF5Db594c4b706555584ccEC9Fb9a61541D4a`: the 2% losing-pool fee is split 1% to the immutable market creator and 1% to Prophet. Its two-market mainnet canary passed settlement/claim, cancellation/two-refund and exact creator/protocol accounting. V1 `0x4bfd0efc15C3198fe3AFf4741FF121AB2F38060e` is settlement-only and remains reachable for historical claims/refunds; no new V1 markets are created. |
| `NicknameRegistry` contract | **Live on mainnet** at `0x1Ddc13e9D4895a5E6671079478007C7371b76E75` (deployed 2026-09-11). Standalone from PredictionMarket on purpose. `setNickname(string)` — anyone can set their own, 24-char max, no admin override. 8/8 tests pass. `src/chain/nicknames.ts` + `src/components/AddressLabel.tsx` (the one place addresses should render through) wire it into the leaderboard, recent bets, and per-market bet lists. |
| Asset Race / Price Arena | Creator-revenue V2 contracts are live at `0x98f9af1756148c8995729E9ccEA770fd15124bC9` and `0x8c1c5544E00C2f8ea2C564B179CdEB38504805d5`. Their existing 2% losing-pool fee is split 1% to the immutable game creator and 1% to Prophet. V1 contracts remain settlement-only for historical claims/refunds. The shared oracle remains `0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7`. |
| Wager currency | New contracts account only in native ETH/wei and require exact payable value; there is no WETH or swap. The UI accepts USD or ETH input for the live $1–$50 range using one cached ETH/USD quote and fixed-point arithmetic. USDG remains only a Stock price quote. |
| Prediction price sources | The native replacement uses exactly 10 reviewed StockToken/USDG pools from `config/asset-race-assets.json`: NVDA, TSLA, AAPL, META, MSTR, AMZN, MSFT, GOOGL, MU, NFLX. |
| Markets | V2 `createMarket` is permissionless for the 10 configured pool assets. Canary market #0 resolved and paid its winner; #1 cancelled and refunded both positions. Automated production markets began at V2 IDs #2–#4. |
| Frontend ↔ contract | The native-ETH frontend sends one payable bet transaction with no approval. Release builds accept only the exact three canary-approved addresses and fail closed on missing/mismatched values. Old USDG contracts remain in a denylist and have no route or transaction ABI. At cutover the existing keepers are rebound to native addresses rather than duplicated. |
| Hosting | VPS (`prophetmarkets.fun`) is the canonical live site and is bound to V2 PredictionMarket plus the reviewed Race/Arena contracts. nginx proxies Robinhood Chain's read-only price/catalog REST API (`/api/robinhood/*`) with 15s server-side caching. |
| Audit | **None.** Said explicitly in the UI disclaimer banner on every real-mode page. Owner-centralized (one EOA controls the approved asset/pool registry, protocol fee, and seed liquidity) — a known, accepted risk for this stage. |

### Product color system

Use purple (`#6A5AE0` / `#8B7CF7`) for Prediction Markets, orange
(`#ED8F3A` / `#F2A65A`) for Asset Races, and cornflower blue (`#7A9FF0` /
`#B7CEFF`) for Price Arena across navigation, primary actions, cards, and
product labels.
Outcome, status, warning, and Stocks/Memes category colors may keep their own
semantic meaning; do not use them to redefine a product's identity color.

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
    "cd /opt/robinhood-predict && git pull origin main && VITE_NATIVE_ETH_RELEASE=true VITE_MARKET_ADDRESS=0xF62CF5Db594c4b706555584ccEC9Fb9a61541D4a VITE_DEPLOY_BLOCK=76951947 VITE_ASSET_RACE_NETWORK=robinhood-mainnet VITE_ASSET_RACE_ADDRESS=0xebA246E4B548b93079Bf4D85faA50fa8b7Ff9c6e VITE_ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS=0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7 VITE_PRICE_ARENA_ADDRESS=0x541be0c7c1011a63465Ff53408e9F76DA870b29f VITE_ALL_ASSET_TYPES_ENABLED=true VITE_ASSET_RACE_LIVE_ENABLED=true VITE_BASE_PATH=/ VITE_RPC_URL=/api/rpc/ npm run build"
   ```
   The exact public native bindings are release-locked by `vite.config.ts` when
   `VITE_NATIVE_ETH_RELEASE=true`; a missing or altered address fails the build.
   Both routing vars matter: `VITE_BASE_PATH=/` — the default `base` in
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
- **Current VPS RPC routing (operator report, 2026-09-25):** the site plus
  `prophet-asset-race-keeper`, `prophet-asset-race-live`,
  `prophet-prediction-market-keeper`, and `prophet-price-arena-keeper` all use
  one paid Alchemy account. Keep per-service environment variable boundaries,
  but do not regress any of them to public Robinhood or mixed free endpoints.
  Never record the key itself in repository documentation.
- **Production deploy source is singular:** publish through `main` and build
  from `/opt/robinhood-predict`. Do not point nginx at ad-hoc
  `/opt/robinhood-predict-asset-race/dist-*` directories; that caused the domain
  to alternate between unreviewed and rolled-back builds.
- **Feed prices are now pre-fetched by us, not read live per-visitor.**
  `predictx-feed-poller.service` (systemd) polls all 27 allowlisted
  Chainlink feeds on its own schedule and writes a snapshot nginx serves at
  `/api/feed-cache/prices.json`; the frontend (`useFeedSnapshot()` in
  `src/chain/feedCache.ts`) reads that instead of polling the chain itself
  in the 4 pages that show a feed's price. This is a step beyond the
  reactive caching above — request volume to the RPC for feed prices is
  now fixed (one poller, one schedule) regardless of how many people are
  on the site, instead of scaling with concurrent users. Keep
  `poll-feeds.mjs`'s `FEEDS` list in sync with `ALLOWLISTED_FEEDS` in
  `src/chain/contracts.ts` by hand. A second service,
  `predictx-cache-warmer.service`, does the equivalent for the Robinhood
  ticker-price API — proactively re-curling it every ~10s so the nginx
  cache above never goes cold waiting for a real visitor to refill it.
- **A private GitHub repo silently kills GitHub Pages.** Free-tier Pages
  doesn't serve from a private repo, and flipping the repo back to public
  doesn't auto-resume it — it needs Settings → Pages reconfigured once
  manually. Also breaks the VPS's `git pull` if it's using anonymous
  HTTPS (which it is).

## Roadmap / what's next

Full history in [`ROADMAP.md`](./ROADMAP.md). Known, explicitly-flagged
gaps as of this writing:

- **Native ETH rollout** — implementation deliberately replaces wager currency
  only; it does not change StockToken/USDG settlement prices. Deployment,
  configuration and all tiny-value lifecycle rehearsals are complete. Exact
  frontend bindings are prepared and validated on `dima/gonochki`; keeper/VPS
  switching and the `main` release remain separate approval gates. The
  canonical human-run sequence is
  [`docs/NATIVE_ETH_DEPLOYMENT_OPERATOR_PACKET.md`](./docs/NATIVE_ETH_DEPLOYMENT_OPERATOR_PACKET.md).
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
