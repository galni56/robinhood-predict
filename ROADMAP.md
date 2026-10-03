# Roadmap

Prophet is moving from Robinhood Chain (EVM) to Solana. The EVM product (Prediction Markets, Asset Races,
Price Arena with native-ETH stakes) remains live from `main` until it is wound down; its history is in git.
This file tracks the Solana build. Detailed decisions: [`docs/SOLANA_MIGRATION.md`](./docs/SOLANA_MIGRATION.md).
Change log: [`docs/SOLANA_CHANGELOG.md`](./docs/SOLANA_CHANGELOG.md).

## Done

1. **Programs** — `asset_race`, `price_arena` (max 10 players, single-transaction resolve),
   `nickname_registry`; Ed25519-signed DEX-pool price attestations; SOL and SPL/Token-2022 stakes;
   38 LiteSVM tests.
2. **Asset catalog** — 35 assets proposed from live Jupiter and DexScreener data, awaiting owner approval.
3. **Frontend F1–F2** — Prediction Market and the mock demo removed; Phantom and Solflare wallets;
   Anchor clients; nicknames on Solana.
4. **Local stand** — local validator with all programs, admin setup and seeded sample games.
5. **EVM cleanup (repo)** — Solidity contracts, EVM scripts and EVM docs removed.

## Next

1. **Frontend on Solana** (no redesign yet) — races and arenas read and write the programs; USD/SOL stake
   input; portfolio, leaderboard and archive.
2. **Price service** — read Raydium, Orca, Meteora and PumpSwap pools, price in USD, sign boundary attestations.
3. **Bots** — start, resolve and cancel games on schedule; create platform races.
4. **Indexer** — game history for portfolio, leaderboard and archive.
5. **Remove the remaining EVM read layer** — `src/chain/`, wagmi, viem, `config/asset-race-assets.json`.
6. **Devnet** — deploy and rehearse the full lifecycle.
7. **VPS** — Solana RPC proxy, services for price service, bots and indexer.

## Before mainnet (owner)

- Approve the asset catalog.
- Fresh admin key (the development key was exposed) and a separate mainnet oracle key.
- ~9 SOL for program rent; decision on an external audit.
- Wind down the EVM product, then merge to `main` (VPS keepers run from `main`).

## Later

- New frontend design.
- Prophet SPL token as a stake currency; buyback and burn.
- Commit/reveal for Price Arena predictions (today they are public onchain, hidden only in the UI).
