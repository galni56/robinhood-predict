# Solana migration plan

Status: programs, services and frontend built and tested on localnet, branch `solana-migration`. Nothing is
deployed to devnet or mainnet. Current status and next steps: [`HANDOFF.md`](./HANDOFF.md).

What has actually been built, and how it differs from the EVM version: [`SOLANA_CHANGELOG.md`](./SOLANA_CHANGELOG.md) (Russian).

## Decisions (owner, 2026-10-03)

| Topic | Decision |
|---|---|
| Scope | Full replacement of the Robinhood Chain (EVM) product. Solana becomes the only live chain. |
| Prediction Market | Removed from the product. Not ported. |
| Games kept | Asset Race, Price Arena, nicknames, buyback/burn (re-designed for SPL). |
| Price source | DEX pools on Solana (Raydium / Orca / Meteora), via a signed-observation oracle. |
| Stake currency | SOL now. Prophet SPL token later, as a second accepted mint. |
| Price quote | All pool prices are quoted in USD (pools paired with USDC; SOL-paired pools converted through SOL/USDC at the same slot). Changed from SOL on 2026-10-03. |
| Price Arena size | Max 10 participants per arena; resolution in a single transaction. |
| Mock demo | Removed (`/demo`, `src/store/`, `src/market/`, non-Onchain pages). |
| Prophet token liquidity | Launch on pump.fun; after the bonding curve it moves to PumpSwap. No Raydium pool and no liquidity of our own; buyback/burn goes through pump.fun / PumpSwap. Raydium, Orca and Meteora pools are only read for game asset prices. (owner, 2026-10-03) |
| Scheduled platform races | Off for now (owner, 2026-10-03): every race account costs ~0.009 SOL of unrefunded rent. `race-scheduler.mjs` exits unless `config/platform-races.json` has `"enabled": true`. |

## What changes and why

### 1. Contracts → Anchor programs (Rust)

Solidity does not port line-by-line: Solana state lives in accounts (PDAs),
not in contract storage, and every account a transaction touches must be
passed in. Asset Race and Price Arena were first ported as two programs, then merged into one,
`prophet_games`, to share config, assets, stake mints, treasury and creator earnings and to halve
deploy rent.

| EVM contract | Solana program | Notes |
|---|---|---|
| `AssetRace.sol` | `prophet_games` (race part) | `Race` PDA per race, `Position` PDA per (race, wallet). Max 6 assets per race fits in one account. |
| `PriceArena.sol` | `prophet_games` (arena part) | Hard cap of 10 participants; all entries are ranked and paid out in one `resolve` transaction (fits the compute budget comfortably). |
| `SignedPoolRaceOracle.sol` | crate `pool_attestation` | Keeper signs pool observations with an **ed25519** key; programs verify via the Ed25519 native program + instructions sysvar. Replaces EIP-712/ECDSA. "Block pair" boundary proof becomes a slot pair (`slot`, `slot + 1` timestamps). |
| `ChainlinkV3RaceOracle.sol` | dropped | Not needed with DEX-pool pricing. |
| `NicknameRegistry.sol` | `nickname_registry` | Separate program so a bug there cannot touch game funds. |
| `Prophet*BuybackBurnExecutor.sol` | `buyback_burn` | The Prophet token launches on **pump.fun** (bonding curve, no liquidity of our own). Buyback goes through the pump.fun curve before graduation and **PumpSwap** after, then SPL `burn`. Built when the token exists. |
| `PredictionMarket.sol` | — | Removed. |

**Stake mint.** Every race/arena stores `stake_mint: Option<Pubkey>`.
`None` = native SOL held in the game's vault PDA (lamports). `Some(mint)` =
SPL token held in an associated token account owned by the vault PDA. The
program enforces an owner-managed allowlist of accepted mints. SOL ships
first; adding the Prophet token later is a config call, not a migration.
Fees and creator revenue are tracked per mint.

**Admin.** Upgrade authority and config authority stay with one owner key
(owner decision 2026-10-03, no Squads multisig) — same accepted
centralization risk as the EVM version; say so in the UI disclaimer.

### 2. Price oracle from DEX pools

Reading pool state directly inside the settlement transaction is
manipulable (sandwich/flash within the same slot). Keep the existing model:

- Collector reads the pool's sqrt price / reserves at the last slot strictly
  before T and the first slot at/after T, signs both observations.
- Program verifies signer, consecutive slots, timestamps, and the frozen
  pool address registered for the asset.
- The asset registry must be re-reviewed from scratch: every asset needs a
  reviewed pool address, quote mint (USDC or SOL), decimals, and liquidity
  floor. Tokenized stocks on Solana (xStocks) have pools; memes are plentiful.

### 3. Frontend

- `wagmi` / `viem` → `@solana/web3.js` (or `@solana/kit`) + `@solana/wallet-adapter-react`
  (Phantom, Solflare, Backpack). Anchor IDL generates the TS client.
- Rewrite `src/chain/*` against the IDL. ~35 files; game UI components mostly survive.
- Delete Prediction Market: routes `/onchain`, `/onchain/create`, `/onchain/:id`,
  `/onchain/legacy*`; pages `OnchainMarket*`, `OnchainCreateMarketPage`,
  `OnchainLegacyMarketsPage`; hooks `usePredictionMarkets`,
  `predictionMarketAssets`, `predictionMarketSettlement`; PM sections of
  landing, portfolio, leaderboard, archive.
- Amount input: USD or SOL, using a cached SOL/USD quote (same fixed-point
  approach as the ETH version).
- Delete the mock demo: `/demo` and all non-Onchain routes, `src/store/`, `src/market/`.

### 4. Keepers / infra

- Rewrite `scripts/*-keeper.mjs` and the pool collector for Solana RPC.
- Paid RPC (Helius or Triton), same per-service env boundaries.
- nginx `/api/rpc/` proxy pattern still applies; Solana RPC is JSON-RPC too,
  but WebSocket subscriptions need a separate proxied location.
- Feed poller / Robinhood API proxy become unnecessary once EVM is gone.

## Wind-down of the EVM product (must happen, not automatable by Claude)

Real user funds sit in the live EVM contracts. Before the domain switches:

1. Stop keepers from creating new races/arenas/markets.
2. Let open games resolve or cancel; keep claim/refund reachable.
3. Keep a read-only legacy page (or `legacy.` subdomain) for claims until
   liabilities are zero. Announce a cutoff date.
4. Withdraw protocol/creator fees on EVM.

Every step is a mainnet transaction run by the owner.

## Phases

0. **Toolchain** — done 2026-10-03: WSL2 Ubuntu (user `dev`, static DNS in `/etc/resolv.conf`), Rust, Solana CLI 3.1, Anchor 1.1.2.
1. **Programs on localnet** — done: `prophet_games` (both games, SOL and SPL stakes) and `nickname_registry`, 38 LiteSVM tests. Build/test: see `solana/README.md`.
2. **Price Arena** — done: max 10 players, single-tx resolve (~33k CU), permissionless cancel after a 1h resolution grace.
3. **Frontend** — done: PM removed, Solana wallets, all game pages on the program; not yet clicked through on the local stand.
4. **Price service, keeper, indexer** — done and run end-to-end on localnet; pool registry reviewed and approved. Devnet next.
5. **Devnet end-to-end rehearsal**, then tiny-value mainnet canary (owner-run). **Before mainnet: generate a fresh owner key** — the current WSL dev keypair is for localnet/devnet only.
6. **SPL stake mint** support enabled when the Prophet token exists; buyback/burn.
7. **Cutover** — EVM wind-down, domain switch, docs update.

## Open questions for the owner

- External audit budget before mainnet?
