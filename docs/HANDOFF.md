# Developer handoff — Prophet on Solana

State as of 2026-10-03, branch `solana-migration`. Git history and the code are the source of truth;
this file is the starting point. Detailed step-by-step history (in Russian), including how each piece
differs from the EVM product: [`SOLANA_CHANGELOG.md`](./SOLANA_CHANGELOG.md).

## Read first

1. [`CLAUDE.md`](../CLAUDE.md): project map and **operating rules** (keys, mainnet, branches).
2. This file: status, how to run everything, what is next.
3. [`README.md`](../README.md) (layout, env vars), [`solana/README.md`](../solana/README.md) (programs,
   attestation format), [`SOLANA_MIGRATION.md`](./SOLANA_MIGRATION.md) (decisions).

## Rules that protect real money

- **`main` is the live EVM product with real user funds** (prophetmarkets.fun; the VPS builds the site
  and runs the EVM keepers from `main`). Do not merge `solana-migration` into `main` until the owner has
  wound the EVM product down.
- Never commit keypairs, seed phrases or API keys. Program keypairs live in `$HOME/prophet-target`
  (outside the repo).
- The WSL dev key `D5Svp…L4R` (`~/.config/solana/id.json`) is **exposed**: localnet/devnet only. Mainnet
  needs a fresh owner key and a separate oracle key per cluster.
- `scripts/solana/admin.mjs` refuses mainnet by design. Every mainnet transaction is owner-approved.

## Status

| Piece | State | Verified by |
|---|---|---|
| Programs: `prophet_games` (Asset Race + Price Arena), `nickname_registry`, crates `pool_attestation`, `stake_funds` | Done. SOL and SPL/Token-2022 stakes. No external audit. | 38 LiteSVM tests |
| Asset catalog | 26 assets approved by the owner (3 crypto, 10 memes, 13 xStocks), `config/solana-assets.json` | Scan + owner review |
| Price service (`scripts/solana/price-service/`) | Done: reads reviewed mainnet pools by account subscription, signs Ed25519 boundary attestations, serves display prices | Localnet end-to-end with live mainnet prices |
| Keeper (`scripts/solana/keeper.mjs`) | Done for timer transitions. Does **not** create scheduled platform races yet | Same end-to-end run |
| Indexer (`scripts/solana/indexer.mjs`) | Done: one `/history` snapshot (games with raw account data, activity, wallet stats, leaderboards) | Localnet run |
| Frontend | Fully on Solana (wagmi/viem removed): races, arenas, create pages, portfolio, leaderboard, archive | `tsc` + `npm run build` only. **Not clicked through on the local stand yet** |
| Devnet, VPS services, mainnet | Not started | — |
| Redesign, $PROPHET token (pump.fun), buyback/burn | Later | — |

## How the pieces fit

```
mainnet DEX pools ──read──> price service ──/attestation──> keeper ──start/resolve tx──> prophet_games
                                 │  /prices (display, SOL/USD)                         (game cluster)
                                 ▼                                                       ▲      │
                              frontend ───────────── wallet-signed player tx ────────────┘      │
                                 ▲                                                              │
                                 └──── /history snapshot ──── indexer <── program tx + accounts ┘
```

Settlement prices exist only as signed attestations verified on-chain (Ed25519 precompile instruction
right before `start_race` / `resolve_race` / `resolve_arena`, bound to the program ID). The frontend's
`/prices` numbers are display only.

## Code map

| Path | What |
|---|---|
| `solana/programs/prophet_games/src/lib.rs` | Every instruction, entry point |
| `…/instructions/{admin,race_create,race,arena}.rs`, `state.rs`, `constants.rs` | Logic, accounts, limits |
| `scripts/solana/localnet.sh`, `admin.mjs` | Local validator; `setup` (config, assets, SOL stake mint, policy) and `seed` (sample games) |
| `scripts/solana/keeper.mjs`, `indexer.mjs`, `e2e-localnet.mjs`, `price-service/` | Off-chain services and the lifecycle check |
| `src/solana/` | Cluster config and program IDs, Anchor clients, PDAs, tx sending, service URLs, nicknames, IDL |
| `src/chain/assetRaces.ts`, `priceArena.ts` | View models built from program accounts |
| `src/chain/use*.ts` | Read hooks (lists from the indexer with a direct-read fallback; detail pages read accounts) |
| `src/chain/gameTx.ts` | Every player instruction: bet, claim, refund, close position, lobby, create, arena entry, creator fees |
| `src/chain/livePrices.ts`, `stakeQuote.ts`, `history.ts` | Price service feed, USD↔SOL stake quote ($1–$50), indexer snapshot |

## Run the full local stand

Toolchain in WSL Ubuntu: Rust, Solana CLI 3.1, Anchor 1.1.2, Node. Run each service in its own WSL
terminal from the repo root (`/mnt/c/…/robinhood-predict`):

```bash
export CARGO_TARGET_DIR=$HOME/prophet-target
(cd solana && anchor build && cargo test --workspace)    # after program changes
bash scripts/solana/localnet.sh --background             # validator, programs deployed
node scripts/solana/admin.mjs setup                      # oracle = admin key on localnet
node scripts/solana/admin.mjs seed                       # optional sample races/arenas
ORACLE_KEYPAIR=~/.config/solana/id.json SOLANA_MAINNET_RPC_URL=<paid RPC> \
  node scripts/solana/price-service/service.mjs          # :8790
node scripts/solana/keeper.mjs
node scripts/solana/indexer.mjs                          # :8791
node scripts/solana/e2e-localnet.mjs --arena             # optional: full lifecycle self-check
```

Frontend: put `VITE_SOLANA_CLUSTER=localnet` in `.env.local`, then `npm install` and `npm run dev` →
http://localhost:5173/robinhood-predict/ (HashRouter: routes after `#`). The dev server proxies
`/price-service` and `/indexer` to the local services. On localnet the wallet list has a **Burner
Wallet** (throwaway in-memory key, new one per reload); its menu has **Get 2 test SOL**.

The public mainnet RPC rate-limits (429) the price service; use a paid RPC (Helius/Triton), key kept
in your environment, never in the repo.

## Next steps, in order

1. **Click through on the local stand** with the burner wallet: create a community race, bet, let the
   keeper start and resolve it, claim; same for an arena; check portfolio, leaderboard, archive. Fix
   what breaks; screenshot visual changes.
2. **Devnet.** `admin.mjs` and `keeper.mjs` take the program ID from the IDL; add a `GAMES_PROGRAM_ID`
   override like the indexer has if devnet uses other IDs. Deploy, use a separate devnet oracle key
   (`ORACLE_PUBKEY` for `admin.mjs setup`), run the services, owner checks with Phantom.
3. **VPS.** nginx locations for `/price-service`, `/indexer` and a cached Solana RPC proxy (HTTP and
   WebSocket); systemd units for the price service, keeper and indexer; a paid RPC key per service.
   Build with `VITE_SOLANA_CLUSTER`, `VITE_SOLANA_RPC_URL`, `VITE_GAMES_PROGRAM_ID`,
   `VITE_NICKNAME_PROGRAM_ID` (a mainnet build fails without them).
4. **Remove the localnet test wallet** before launch: `src/solana/SolanaProvider.tsx`,
   `src/components/LocalnetAirdropButton.tsx`, package `@solana/wallet-adapter-unsafe-burner`.
5. **Missing features:** keeper creating scheduled platform races; SPL-staked games in the UI (programs
   support them, pages show SOL games only); meme market cap (the EVM version read token supply; the
   price service could read mint supply); history beyond the indexer's last 500 activity rows.
6. **Mainnet (owner):** fresh owner key, separate oracle key, audit decision, ~4.1 SOL program rent,
   EVM wind-down, then merge to `main`.
7. Later: redesign; $PROPHET on pump.fun as a stake mint; buyback/burn via pump.fun / PumpSwap.

## Known gotchas

- Price Arena predictions are public on-chain; the UI only hides them during the lobby.
- Detail pages poll their account every 4 s per visitor; before real traffic, serve RPC through the
  caching VPS proxy or switch to account subscriptions.
- A claimed or refunded race position closes its account; the race page finds the past claim in the
  indexer activity feed.
- WSL: DNS is pinned in `/etc/resolv.conf`; run WSL work from script files when calling from Git Bash
  (`MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu -- bash <file>`); `wsl --shutdown` frees its RAM.
- Git Bash: `git commit -m` breaks on apostrophes; use `git commit -F <file>`.
- `AGENTS.md` dates from the earlier EVM setup (agent names, branch, invariants in EVM terms); the
  owner should review it before agents rely on it.
