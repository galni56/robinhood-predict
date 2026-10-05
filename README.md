# Prophet on Solana

Prediction games on Solana, paid in SOL:

- **Coin Duels** (the "Races" tab) — 2–6 racers each bring their own coin and the same stake ($1–$50); the coin
  with the highest percentage return over 1 min–1 h wins the pot. Spectators back a racer (up to $100) and share
  in the win; free cheers.
- **Price Arena** — up to ten players predict an asset's final price (or market cap); the closest half wins.
- **Launchpad** — create a token on pump.fun (`create_v2`) from the site; the player's wallet signs and pays.

There is **no program of our own**. Players stake by sending SOL to the **game wallet** with a `prophet:` memo;
the game server applies stakes, runs every game and pays winners, refunds and fees automatically from that
wallet (custodial while a game runs). Prices are USD spot prices from reviewed Solana DEX pools, signed by the
price service (Ed25519) and verified by the game server against the pinned oracle key. Fee: 2% of the
winnings (the losing side's money), never of returned stakes; in arenas half of it goes to the creator.

Players sign in with the **Prophet wallet** — a Solana keypair created and kept in the player's browser
(non-custodial: the key never leaves the device and the server never sees it), with a forced key backup.
Phantom/Solflare can be turned back on with `VITE_EXTERNAL_WALLETS=true`.

> **Status:** branch `solana-migration`, not live with real money yet. No external security audit.
> `main` is still the earlier Robinhood Chain (EVM) product, live at prophetmarkets.fun — do not merge
> before it is wound down. New to the project: [`docs/HANDOFF.md`](./docs/HANDOFF.md). History (in Russian):
> [`docs/SOLANA_CHANGELOG.md`](./docs/SOLANA_CHANGELOG.md).

## Layout

| Path | What |
|---|---|
| `scripts/solana/game-server/` | Game server: deposits (memo transfers → stakes), games (race, arena, duel), payouts outbox, sweep, HTTP API, SQLite. |
| `scripts/solana/price-service/` | Reads every approved mainnet pool by account subscription, keeps slot-stamped prices, signs boundary attestations, serves display prices. |
| `scripts/solana/localnet.sh` | Plain local validator (WSL) for end-to-end runs. |
| `src/` | React 19 + TypeScript + Vite frontend (HashRouter). `src/chain/` is the data layer (game server client, duels, arenas, live prices, stake transfers, pump.fun launch); `src/solana/` holds cluster config, wallet (`prophetWallet.ts`), service URLs. |
| `config/solana-assets.json` | Asset registry (mints, pools, price precision), generated; owner approval in `config/solana-catalog-approved.json`. |
| `scripts/solana-catalog-*.mjs`, `scripts/solana-assets-config.mjs` | Catalog scan → proposal → registry. |
| `docs/` | Handoff, changelog, asset catalog, review backlogs. |

The catalog: 11 crypto coins (BTC, SOL, ETH, HYPE, ZEC, PUMP, NEAR, DOGE, BNB, SUI, XRP) and 10 memes, plus up
to 30 PumpSwap coins the game server adds automatically every 15 minutes. xStocks were removed.

## Running locally

Frontend (Windows or WSL):

```bash
npm install
npm run dev          # http://localhost:5173/robinhood-predict/  (proxies /price-service, /game-server)
npm run build        # what CI runs
```

Services (Node 24; the validator runs in WSL):

```bash
bash scripts/solana/localnet.sh --background                     # plain validator, :8899
SOLANA_MAINNET_RPC_URLS=<rpc> SOLANA_MAINNET_WS_URLS=<ws> \
  ORACLE_KEYPAIR=<file> node scripts/solana/price-service/service.mjs          # :8790
GAME_WALLET_KEYPAIR=ephemeral node scripts/solana/game-server/server.mjs      # :8792, localnet
node scripts/solana/game-server/e2e-localnet.mjs                  # full race lifecycle, checked to the lamport
node --test scripts/solana/game-server/*.test.mjs scripts/solana/price-service/*.test.mjs   # unit tests
node scripts/solana/price-service/check-prices.mjs                # decoded pool prices vs Jupiter, read-only
```

Prices always come from **mainnet** pools (read-only), whatever cluster the games run on. The public mainnet
RPC rate-limits; use a paid one (Alchemy for HTTP; Alchemy has no `accountSubscribe`, so websockets use Helius).

## Environment

Frontend (build time):

| Variable | Purpose |
|---|---|
| `VITE_SOLANA_CLUSTER` | `localnet`, `devnet` or `mainnet-beta` |
| `VITE_SOLANA_RPC_URL`, `VITE_SOLANA_WS_URL` | RPC endpoints; a relative path (VPS proxy) resolves against the page origin |
| `VITE_GAME_SERVER_URL`, `VITE_PRICE_SERVICE_URL` | Service base URLs; `off` = show last known data only |
| `VITE_LAST_DATA_URL` | Last-known data (PumpSwap list) shown while services are off |
| `VITE_LAUNCH_RPC_URL`, `VITE_LAUNCH_WS_URL`, `VITE_LAUNCH_IPFS_URL` | Launchpad: mainnet RPC and the pump.fun IPFS proxy |
| `VITE_EXTERNAL_WALLETS` | `true` shows Phantom/Solflare next to the Prophet wallet |
| `VITE_BASE_PATH` | `/robinhood-predict/` by default; `/` when served from a domain root |

Game server and price service: see the header comments of `scripts/solana/game-server/server.mjs` and
`scripts/solana/price-service/service.mjs`. On mainnet the game server refuses to start without
`ORACLE_PUBKEY`, `SIGNING_DOMAINS` and `COLD_WALLET`, and refuses an empty database next to a wallet that
already has history (unless `ADOPT_WALLET=1` on a genuinely first start).

Never commit keypairs or API keys.
