# Prophet on Solana

Onchain prediction games on Solana:

- **Asset Race** — back the asset with the highest percentage return between two price snapshots.
- **Price Arena** — up to ten players predict an asset's final price; the closest half wins.

Stakes are in SOL (and, later, approved SPL tokens). Asset prices are in USD, read from reviewed DEX pools
and signed by the price service. Parimutuel payouts: players compete against players, with a 2% fee on the
losing pool split between the game's creator and Prophet.

> **Status:** migration from the earlier Robinhood Chain (EVM) product is in progress on branch
> `solana-migration`. Nothing here is deployed to mainnet. There is no external security audit.
> New to the project: start with [`docs/HANDOFF.md`](./docs/HANDOFF.md). Plan:
> [`docs/SOLANA_MIGRATION.md`](./docs/SOLANA_MIGRATION.md). What changed and why:
> [`docs/SOLANA_CHANGELOG.md`](./docs/SOLANA_CHANGELOG.md).

## Layout

| Path | What |
|---|---|
| `solana/` | Anchor workspace: programs `prophet_games` (Asset Race + Price Arena) and `nickname_registry`; shared crates `pool_attestation`, `stake_funds`. See [`solana/README.md`](./solana/README.md). |
| `src/` | React 19 + TypeScript + Vite frontend. `src/solana/` holds cluster config, IDL clients, PDAs, wallet and transaction helpers. |
| `config/solana-assets.json` | Asset registry (mints, pools, price precision) shared by frontend, admin scripts and price service. Owner approval required per asset. |
| `scripts/solana/` | Local validator and admin setup/seed scripts. |
| `scripts/solana-catalog-*.mjs`, `scripts/solana-assets-config.mjs` | Asset catalog scan, proposal and registry generation. |
| `docs/` | Migration plan, changelog, asset catalog for review. |

`src/chain/` is the game data layer: Solana account view models, read hooks, transaction builders
(`gameTx.ts`), live prices and the indexer snapshot.

## Running locally

Frontend:

```bash
npm install
npm run dev          # http://localhost:5173/robinhood-predict/
npm run build
```

Programs and a local validator run inside WSL (Ubuntu). From the repo inside WSL:

```bash
export CARGO_TARGET_DIR=$HOME/prophet-target
(cd solana && anchor build && cargo test --workspace)
bash scripts/solana/localnet.sh --background
node scripts/solana/admin.mjs setup
node scripts/solana/admin.mjs seed
```

Point the frontend at the local validator with `VITE_SOLANA_CLUSTER=localnet`.

### Price service and keeper

The price service (`scripts/solana/price-service/`) reads every approved pool on **mainnet** in one account
read per tick, keeps a rolling buffer of slot-stamped USD prices and signs boundary attestations. The keeper
(`scripts/solana/keeper.mjs`) watches games on the game cluster and calls the timer transitions with those
attestations. Both are read-only on mainnet; only the keeper sends transactions, on the game cluster.

```bash
node scripts/solana/price-service/check-prices.mjs        # decoded pool prices vs Jupiter, read-only
ORACLE_KEYPAIR=~/.config/solana/id.json node scripts/solana/price-service/service.mjs   # :8790
node scripts/solana/keeper.mjs                              # localnet by default
node scripts/solana/e2e-localnet.mjs [--arena]              # full lifecycle check on localnet
```

Set `SOLANA_MAINNET_RPC_URL` to a paid RPC: the public endpoint rate-limits (429) under the service's polling.
On localnet the oracle key is the admin key; devnet and mainnet need a separate oracle key per cluster.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `VITE_SOLANA_CLUSTER` | `devnet` | `localnet`, `devnet` or `mainnet-beta` |
| `VITE_SOLANA_RPC_URL` | cluster default | RPC endpoint; a relative path (VPS proxy) is resolved against the page origin |
| `VITE_GAMES_PROGRAM_ID`, `VITE_NICKNAME_PROGRAM_ID` | development IDs | Program addresses for the cluster (required for a mainnet build) |
| `VITE_PRICE_SERVICE_URL` | `/price-service` | Price service base URL (dev server proxies to `127.0.0.1:8790`) |
| `VITE_INDEXER_URL` | `/indexer` | History indexer base URL (dev server proxies to `127.0.0.1:8791`) |
| `VITE_BASE_PATH` | `/robinhood-predict/` | `/` when served from a domain root |

Never commit keypairs or API keys. Program keypairs live in the WSL target directory, outside the repo.
