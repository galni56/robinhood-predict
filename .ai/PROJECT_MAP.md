# Project Map

Prophet is being rebuilt on Solana (branch `solana-migration`): two parimutuel
games, Asset Race and Price Arena, with SOL (and approved SPL) stakes and
USD prices signed from reviewed DEX pools. The earlier Robinhood Chain (EVM)
product stays live from `main` until it is wound down; nothing on this branch is
on mainnet. No external audit. Every mainnet action is real money.

Rust/Anchor programs in `solana/`, React/TypeScript/Vite frontend in `src/`,
small Node scripts for tooling. Toolchain (Rust, Solana CLI, Anchor) lives in
WSL (Ubuntu, user `dev`); build artifacts in `$HOME/prophet-target`.

Current code/Git are authoritative. Counts, pending work and validation belong
in HANDOFF, not this map. Read AGENTS for permissions and startup rules.

## Areas and entry points

| Area | Principal paths/files |
| --- | --- |
| Programs | `solana/programs/asset_race`, `price_arena`, `nickname_registry` |
| Shared program crates | `solana/crates/pool_attestation` (signed prices), `stake_funds` (SOL/SPL movement, vault checks) |
| Program tests | `solana/programs/*/tests/` (LiteSVM), unit tests in `src/math.rs` |
| Frontend bootstrap/routes | `src/main.tsx`, `src/App.tsx` |
| Solana client layer | `src/solana/` (config, IDL clients, PDAs, wallet provider, tx helpers, nicknames) |
| Program IDL for the frontend | `src/solana/idl/` (copied from `$HOME/prophet-target/{idl,types}` after `anchor build`) |
| Game pages | `src/pages/Onchain*.tsx`; game UI in `src/components/AssetRace*.tsx` |
| Old EVM read layer (to be removed) | `src/chain/`, `config/asset-race-assets.json`, wagmi/viem |
| Asset registry | `config/solana-assets.json` (generated; owner approves per asset) |
| Catalog tooling | `scripts/solana-catalog-scan.mjs`, `solana-catalog-propose.mjs`, `solana-assets-config.mjs` |
| Local stand / admin | `scripts/solana/localnet.sh`, `scripts/solana/admin.mjs` |
| Build configuration | `vite.config.ts`, `package.json`, `solana/Anchor.toml`, `solana/Cargo.toml` |

## Pricing and settlement pointers

Each asset has one frozen pool (`price_source`) and a USD price precision. The
price service (not built yet) signs one Ed25519 attestation per boundary time
covering all needed pools at the last block before T plus its direct child.
Programs read the message from the Ed25519 precompile instruction immediately
before `start_race` / `resolve_race` / `resolve`, bound to their own program ID.
Economics and irreversible snapshots live in the programs.

## Commands

Frontend (repo root, Windows or WSL):

```sh
npm run dev
npm run build                 # tsc -b followed by Vite build
npm run lint
```

Programs (inside WSL, from `solana/`, `CARGO_TARGET_DIR=$HOME/prophet-target`):

```sh
anchor build
cargo test --workspace        # needs a prior anchor build (tests load the .so)
anchor keys sync              # after a new program keypair
```

Local stand (inside WSL): `bash scripts/solana/localnet.sh --background`, then
`node scripts/solana/admin.mjs setup` and `seed`. admin.mjs refuses mainnet.

## Documentation instead of rediscovery

- `CLAUDE.md`: authoritative overview and operating cautions.
- `README.md`: layout, local run, environment variables.
- `ROADMAP.md`: done / next / owner steps.
- `docs/SOLANA_MIGRATION.md`: decisions and phases.
- `docs/SOLANA_CHANGELOG.md`: what changed vs the EVM product and why (Russian).
- `docs/SOLANA_ASSET_CATALOG.md`: proposed assets awaiting approval.
- `solana/README.md`: program build/test and attestation format.

## Sensitive areas

Payout/liability/fee accounting; vault address checks; attestation parsing and
boundary rules; signer snapshotting; stake-mint handling; upgrade/admin
authority; asset/pool bindings and price decimals. Honor AGENTS authorization
rules; preserve the actual dirty working tree.
