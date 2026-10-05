# Developer handoff — Prophet on Solana

State as of 2026-10-05, branch `solana-migration`. Git history and the code are the source of truth; this
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

- **`main` is the live EVM product with real user funds** (prophetmarkets.fun; the VPS builds that site and
  runs its keepers from `main`). Do not merge `solana-migration` into `main` until the owner has wound the
  EVM product down.
- Never handle or print private keys, seed phrases or API keys (see `CLAUDE.md`). Never commit them.
- The WSL dev key `D5Svp…L4R` is **exposed**: localnet/devnet only.
- Every mainnet transaction is owner-approved. The game server refuses mainnet without `ORACLE_PUBKEY`,
  `SIGNING_DOMAINS` and `COLD_WALLET`, and refuses an empty database next to a wallet that has history.

## Status

| Piece | State | Verified by |
|---|---|---|
| Game server (`scripts/solana/game-server/`) | Done: deposits by memo with idempotent ingest and automatic refunds of invalid stakes (dust < 0.001 SOL kept); Price Arena, Coin Duels (Asset Race code kept for old links); payout outbox paid only at finalized, never twice; sweep of earned fees only; signed actions bound to the site domain with a nonce; SQLite with hourly backups; PumpSwap auto-add every 15 min (≤30 coins); last-known data written for the site | 44 tests (`node --test scripts/solana/game-server/*.test.mjs`), localnet e2e for races, exact payouts |
| Coin Duels | Done (server + site): 10 empty lobbies always open, 2–6 racers with unique coins, same stake $1–$50, pay within 2 min, ready check (timer starts at the first READY, +15 s "preparing" once), kick tax 10%/20% (doubled after 10 kicks/week) split Prophet/remaining racers, spectator backing ≤$100, 30/70 split of the losing backers' pool, 2% fee on winnings, ties refund, free cheers | Server tests with exact payouts; pages rendered against a mock server. **Not yet run on a validator with real transfers** |
| Price service (`scripts/solana/price-service/`) | Done: Raydium AMM v4 / CPMM / CLMM, Orca Whirlpool, Meteora DLMM, PumpSwap decoders; chunked reads, ≤250 subscriptions; signed attestations | 9 tests, `check-prices.mjs` vs Jupiter (all within ~0.6%) |
| Asset catalog | 11 crypto (BTC, SOL, ETH, HYPE, ZEC, PUMP, NEAR, DOGE, BNB, SUI, XRP — the last four below the $500k floor by owner decision, `thinPoolsAccepted`), 10 memes, + PumpSwap coins. xStocks removed; ADA rejected (no real Cardano on Solana) | Scan + owner approval |
| Frontend | Races tab = Coin Duels; Price Arena (price or market cap, chosen by the creator); PumpSwap table; Launchpad; portfolio, leaderboard, archive from the game server; Prophet wallet (create, forced backup, top up, withdraw, export/import); hero race on the landing; works on phones | Screenshots (desktop and 390 px frame), `npm run build` |
| Launchpad | pump.fun `create_v2` (Token-2022) signed by the player; IPFS upload through the VPS (pump.fun blocks many browsers) | Simulation on the live pump.fun program. **Owner's first real launch pending** |
| GitHub Pages | https://galni56.github.io/robinhood-predict/ from `solana-migration`, services `off`: shows last known data | `.github/workflows/deploy.yml` |
| VPS services | Installed, **stopped and disabled** until the live test (see below) | Ran live for a check: prices, 30 PumpSwap coins, last-data serving |

## VPS (Solana side)

`ssh -i ~/.ssh/id_ed25519 -p 22022 root@104.207.90.56` (port 22022). The EVM product on the same host is
documented in `CLAUDE.md` on `main` — do not touch it.

| What | Where |
|---|---|
| Code (pulled from `solana-migration`) | `/opt/prophet-solana` |
| Node 24 | `/opt/node24` |
| Environment (RPC keys entered by the owner; never print it) | `/etc/prophet/prophet.env` |
| Keys (created on the VPS, never printed) | `/root/prophet-keys/game-wallet.json`, `oracle.json` |
| systemd | `prophet-price-service`, `prophet-game-server` (stopped, disabled) |
| nginx | `/etc/nginx/snippets/prophet-solana.conf`: `/api/solana/{game-server,price-service,rpc,ws,last,ipfs}`; keys in `prophet-solana-keys.conf` |
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

1. **Duel end-to-end on the local validator** with the Prophet wallet: join, pay, ready, finish, payouts and a
   kick, checked to the lamport. Then check the duel pages at phone width.
2. **Own domain for the site** (e.g. a subdomain of prophetmarkets.fun on the VPS). The Prophet wallet keeps
   keys in `localStorage`; on `galni56.github.io` every Pages site of that account shares the origin and could
   read them. Optional: encrypt the stored key with a player password.
3. **Live test (owner present):** start the two services, build the site for `mainnet-beta` with the VPS
   proxy paths, one $1 duel between two wallets, the owner's first launchpad token.
4. Remaining review items in `GAME_SERVER_REVIEW_BACKLOG.md` (most money items were fixed on
   `architecture-refactor`; re-check the list against the code before relying on it).
5. **EVM wind-down (owner):** stop new games on `main`, let open ones settle, keep claims reachable, then merge.
6. Ideas: launch races (pump.fun coins launched in a lobby, first to graduate to PumpSwap wins), "will it
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
