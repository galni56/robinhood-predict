# Developer handoff — Prophet on Solana

State as of 2026-10-05, branch `main` (`solana-migration` was merged into it on 2026-10-05). Git history and the code are the source of truth; this
file is the starting point. Step-by-step history (in Russian), including how each piece differs from the EVM
product: [`SOLANA_CHANGELOG.md`](./SOLANA_CHANGELOG.md).

## Read first

1. [`CLAUDE.md`](../CLAUDE.md): project map and **operating rules** (keys, mainnet, branches).
2. This file: status, how to run everything, what is next.
3. [`README.md`](../README.md): layout, local run, environment.
4. [`GAME_SERVER_REVIEW_BACKLOG.md`](./GAME_SERVER_REVIEW_BACKLOG.md): architecture review of the game server.

## The model in one paragraph

No program of our own (the earlier Anchor programs were removed: deploying them cost ~4.2 SOL and the owner
wants the product to run at zero cost). Players stake by sending SOL to the **game wallet** with a `prophet:`
memo. The **game server** reads those transfers, applies them to games, runs the timers, takes boundary prices
from the **price service** (Ed25519-signed, verified against `ORACLE_PUBKEY`) and pays winners, refunds and
creator fees from the game wallet through a payout outbox. Prophet's fees are swept to the owner's **cold
wallet**. Players hold their own keys in the **Prophet wallet** (a keypair kept in the browser).

```
mainnet DEX pools ──subscribe──> price service ──signed boundary prices──> game server ──payouts──> players
                                     │ display prices, SOL/USD                 ▲   │ /state, /games, /history
                                     ▼                                         │   ▼
                                  frontend ──── memo SOL transfer to the game wallet (Prophet wallet signs)
```

## Rules that protect real money

- **The site is https://hastefun.xyz** (HasteFun, formerly Prophet). The VPS serves it from `/var/www/hastefun`
  with the APIs on the same origin; it rebuilds itself within about two minutes of a push to `main` (`hastefun-site.timer` runs `scripts/solana/site-autodeploy.sh`; by hand: `bash /opt/prophet-solana/scripts/solana/build-site.sh`). Services are not restarted by it.
  The old EVM product and its domain are switched off.
- Never handle or print private keys, seed phrases or API keys (see `CLAUDE.md`). Never commit them.
- The WSL dev key `D5Svp…L4R` is **exposed**: localnet/devnet only.
- Every mainnet transaction is owner-approved. The game server refuses mainnet without `ORACLE_PUBKEY`,
  `SIGNING_DOMAINS` and `COLD_WALLET`, and refuses an empty database next to a wallet that has history.

## Status

| Piece | State | Verified by |
|---|---|---|
| Game server (`scripts/solana/game-server/`) | Done: deposits by memo with idempotent ingest and automatic refunds of invalid stakes (dust < 0.001 SOL kept); Price Arena, Coin Duels (Asset Race code kept for old links); payout outbox paid only at finalized, never twice; sweep of earned fees only; signed actions bound to the site domain with a nonce; SQLite with hourly backups; PumpSwap auto-add every 15 min (≤30 coins); last-known data written for the site | 44 tests (`node --test scripts/solana/game-server/*.test.mjs`), localnet e2e for races, exact payouts |
| Coin Duels | Done (server + site): 10 empty lobbies always open, 2–6 racers with unique coins, same stake $1–$50, pay within 2 min, ready check (timer starts at the first READY, +15 s "preparing" once), kick tax 10%/20% (doubled after 10 kicks/week) split Prophet/remaining racers, spectator backing ≤$100, 30/70 split of the losing backers' pool, 2% fee on winnings, ties refund, free cheers | Server tests with exact payouts; `e2e-duel-localnet.mjs` on a local validator with live prices (kick, tax, self-back refund, 30/70 split, every wallet exact to the lamport); pages checked at 390 px |
| Price service (`scripts/solana/price-service/`) | Done: Raydium AMM v4 / CPMM / CLMM, Orca Whirlpool, Meteora DLMM, PumpSwap decoders; chunked reads, ≤250 subscriptions; signed attestations | 9 tests, `check-prices.mjs` vs Jupiter (all within ~0.6%) |
| Asset catalog | 11 crypto (BTC, SOL, ETH, HYPE, ZEC, PUMP, NEAR, DOGE, BNB, SUI, XRP — the last four below the $500k floor by owner decision, `thinPoolsAccepted`), 10 memes, + PumpSwap coins. xStocks removed; ADA rejected (no real Cardano on Solana) | Scan + owner approval |
| Frontend | Races tab = Coin Duels; Price Arena (price or market cap, chosen by the creator); PumpSwap table; Launchpad; portfolio, leaderboard, archive from the game server; Prophet wallet (password-encrypted key in the browser, create, unlock per visit, forced backup, top up, withdraw, restore); hero race on the landing; works on phones | Screenshots (desktop and 390 px frame), `npm run build` |
| Launchpad | pump.fun `create_v2` (Token-2022) signed by the player; IPFS upload through the VPS (pump.fun blocks many browsers) | Simulation on the live pump.fun program. **Owner's first real launch pending** |
| GitHub Pages | https://galni56.github.io/robinhood-predict/ built from `main` on every push; preview (services off) unless the repo variable `SOLANA_LIVE` is `true` | `.github/workflows/deploy.yml` |
| VPS services | Installed, **stopped and disabled** until the live test (see below) | Ran live for a check: prices, 30 PumpSwap coins, last-data serving |

## VPS (Solana side)

`ssh -i ~/.ssh/id_ed25519 -p 22022 root@104.207.90.56` (port 22022). The EVM product on the same host is
documented in `CLAUDE.md` on `main` — do not touch it.

| What | Where |
|---|---|
| Code (pulled from `main`) | `/opt/prophet-solana` |
| Node 24 | `/opt/node24` |
| Environment (RPC keys entered by the owner; never print it) | `/etc/prophet/prophet.env` |
| Keys (created on the VPS, never printed) | `/root/prophet-keys/game-wallet.json`, `oracle.json` |
| systemd | `prophet-price-service` (port 8793; 8790 belongs to the EVM share-preview), `prophet-game-server` (8792); stopped, disabled |
| nginx | `/etc/nginx/snippets/prophet-solana.conf`: `/api/solana/{game-server,price-service,rpc,ws,last,ipfs}`; keys in `prophet-solana-keys.conf`; per-visitor limits (RPC 20 req/s, 5 websockets) in `conf.d/prophet-solana-limits.conf` |
| Last-known data for the site | `/var/www/prophet-last` |

RPC: Alchemy (paid) for HTTP; Helius for websocket subscriptions only (Alchemy has no `accountSubscribe`).

## Code map

| Path | What |
|---|---|
| `game-server/server.mjs` | HTTP API, config/env checks, PumpSwap refresh, backups, last-data writer |
| `game-server/engine.mjs` | Game state machines and signed actions; `deposits.mjs` (scan, apply, refund), `payouts.mjs` (outbox, solvency, sweep) |
| `game-server/rules.mjs`, `duel.mjs` | Pure game rules: races, arenas, memos; duels |
| `game-server/chain.mjs`, `db.mjs`, `prices.mjs`, `views.mjs`, `pumpswap.mjs` | RPC, SQLite, oracle-checked prices, history/leaderboards, PumpSwap selection |
| `game-server/admin.mjs`, `e2e-localnet.mjs` | Owner tools (payout queue, retry); race lifecycle check |
| `price-service/service.mjs`, `pools.mjs` | Collector and signer; pool decoders |
| `src/chain/gameServer.ts`, `duels.ts`, `priceArena.ts`, `livePrices.ts`, `pumpLaunch.ts` | Data layer |
| `src/solana/prophetWallet.ts`, `components/WalletAccountModals.tsx` | Prophet wallet |
| `src/pages/OnchainDuel*.tsx`, `OnchainArena*.tsx`, `OnchainLaunchPage.tsx`, `OnchainPumpSwapPage.tsx` | Pages |

## Run the local stand

```bash
bash scripts/solana/localnet.sh --background          # WSL: plain validator, :8899
SOLANA_MAINNET_RPC_URLS=<rpc> SOLANA_MAINNET_WS_URLS=<ws> ORACLE_KEYPAIR=<file> \
  node scripts/solana/price-service/service.mjs        # :8790
GAME_WALLET_KEYPAIR=ephemeral node scripts/solana/game-server/server.mjs   # :8792
node scripts/solana/game-server/e2e-localnet.mjs        # optional: race lifecycle, exact payouts
```

Frontend: `VITE_SOLANA_CLUSTER=localnet` in `.env.local`, then `npm run dev` →
http://localhost:5173/robinhood-predict/ (HashRouter: routes after `#`). The dev server proxies
`/price-service` and `/game-server`.

## Next steps, in order

1. **Own domain: done** (hastefun.xyz, 2026-10-07; `SIGNING_DOMAINS` lists it).
2. **Live test (owner present):**
   1. `systemctl start prophet-price-service prophet-game-server` on the VPS; check
      `https://hastefun.xyz/api/solana/game-server/health`.
   2. GitHub → Settings → Secrets and variables → Actions → Variables: `SOLANA_LIVE` = `true`, then
      Actions → Deploy to GitHub Pages → Run workflow. The build then uses mainnet and the VPS paths.
   3. One $1 duel between two wallets; the owner's first launchpad token.
   4. To go back to the preview: `SOLANA_LIVE` = `false`, re-run the workflow, stop the services.
3. **Price sanity threshold (owner):** set `PRICE_MAX_DEVIATION_BP` in `/etc/prophet/prophet.env` (e.g. `500`
   = 5%) and restart the price service; until then the check is off.
4. **An X account** for the footer link (`src/lib/social.ts`, empty until it exists).
5. Ideas: launch races (pump.fun coins launched in a lobby, first to graduate to PumpSwap wins), "will it
   graduate in 24 h" bets.

## Known gotchas

- Solana now has version-1 transactions; web3.js 1.x cannot decode them. Our own transfers are legacy/v0.
- GeckoTerminal (PumpSwap list) allows ~30 requests/min; the refresher retries on 429.
- nginx needs large proxy buffers for the pump.fun IPFS upload ("upstream sent too big header").
- Behind nginx the game server takes the client IP from `X-Forwarded-For` only for loopback connections.
- WSL: DNS pinned in `/etc/resolv.conf`; run WSL work from script files when calling from Git Bash.
- Git Bash: `git commit -m` breaks on apostrophes; use `git commit -F <file>`.
- Headless Chrome will not render below ~500 px; check phones through an iframe page.
- `AGENTS.md` dates from the earlier EVM setup; the owner should review it before agents rely on it.
