# Project Map

Prophet is being rebuilt on Solana (branch `solana-migration`): Coin Duels and Price Arena paid in SOL, a
pump.fun launchpad and an automatic PumpSwap coin list. There is no program of our own: players send SOL with
a `prophet:` memo to the game wallet, and the game server runs the games and pays out. Prices are USD spot
prices from reviewed Solana DEX pools, signed by the price service. The earlier Robinhood Chain (EVM) product
stays live from `main` until it is wound down. No external audit. Every mainnet action is real money.

Node services in `scripts/solana/`, React/TypeScript/Vite frontend in `src/`. The local validator lives in WSL
(Ubuntu, user `dev`).

Current code/Git are authoritative. Counts, pending work and validation belong in HANDOFF, not this map. Read
AGENTS for permissions and startup rules.

## Areas and entry points

| Area | Principal paths/files |
| --- | --- |
| Game server | `scripts/solana/game-server/server.mjs` (HTTP :8792, env checks), `engine.mjs` (games, signed actions), `deposits.mjs`, `payouts.mjs` |
| Game rules | `scripts/solana/game-server/rules.mjs` (races, arenas, memos), `duel.mjs` (duels) |
| Server support | `chain.mjs` (RPC), `db.mjs` (SQLite), `prices.mjs` (oracle-checked prices), `views.mjs` (history), `pumpswap.mjs` |
| Server tests / tools | `scripts/solana/game-server/*.test.mjs`, `e2e-localnet.mjs`, `admin.mjs` |
| Price service | `scripts/solana/price-service/service.mjs` (:8790), `pools.mjs` (decoders), `check-prices.mjs` |
| Frontend bootstrap/routes | `src/main.tsx`, `src/App.tsx` |
| Solana client layer | `src/solana/` (cluster config, service URLs, wallet provider, `prophetWallet.ts`) |
| Game data layer | `src/chain/` (`gameServer.ts`, `duels.ts`, `priceArena.ts`, `livePrices.ts`, `pumpLaunch.ts`, stake transfer hook) |
| Pages | `src/pages/Onchain*.tsx` (duels, arenas, PumpSwap, launch, portfolio, leaderboard, archive, landing) |
| Asset registry | `config/solana-assets.json` (generated); owner approval `config/solana-catalog-approved.json` |
| Catalog tooling | `scripts/solana-catalog-scan.mjs`, `solana-catalog-propose.mjs`, `solana-assets-config.mjs` |
| Local stand | `scripts/solana/localnet.sh` (plain validator) |
| Build configuration | `vite.config.ts`, `package.json`, `.github/workflows/deploy.yml` |

## Money and settlement pointers

A stake is a top-level System transfer to the game wallet with one `prophet:` memo; each transaction signature
is applied once; invalid stakes are refunded (dust kept). Every outgoing transfer goes through the payout
outbox: written, signed, stored with its blockhash expiry, then broadcast; done only at finalized; rebuilt only
once finalized history proves it never landed. Boundary prices come from the price service as Ed25519
attestations verified against `ORACLE_PUBKEY`. Only earned fees are swept to the cold wallet.

## Commands

```sh
npm run dev
npm run build                 # tsc -b followed by Vite build
npm run lint
node --test scripts/solana/game-server/*.test.mjs scripts/solana/price-service/*.test.mjs
bash scripts/solana/localnet.sh --background          # inside WSL
GAME_WALLET_KEYPAIR=ephemeral node scripts/solana/game-server/server.mjs
```

## Documentation instead of rediscovery

- `CLAUDE.md`: authoritative overview and operating cautions.
- `docs/HANDOFF.md`: status, VPS layout, local stand, next steps.
- `README.md`: layout, local run, environment variables.
- `docs/SOLANA_MIGRATION.md`: decisions and phases.
- `docs/GAME_SERVER_REVIEW_BACKLOG.md`: game server review.
- `docs/SOLANA_CHANGELOG.md`: what changed vs the EVM product and why (Russian).
- `docs/SOLANA_ASSET_CATALOG.md`: reviewed assets.

## Sensitive areas

Deposit ingest and refunds; payout outbox and its finality checks; liabilities, fees and sweep; signed-action
verification (domain, nonce, replay); oracle signature checks and price decimals; duel tax and split math; the
browser-held Prophet wallet key. Honor AGENTS authorization rules; preserve the actual dirty working tree.
