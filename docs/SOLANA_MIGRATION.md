# Solana migration

Status (2026-10-05): the product runs on a **game server with a server-held game wallet**, not on programs of
our own. Built and tested locally on branch `solana-migration`; VPS services installed but stopped; nothing has
handled real money yet. Current status and next steps: [`HANDOFF.md`](./HANDOFF.md). Step-by-step history and
how each piece differs from the EVM version: [`SOLANA_CHANGELOG.md`](./SOLANA_CHANGELOG.md) (Russian).

## How we got here

1. **Anchor programs (2026-10-03).** Asset Race and Price Arena were first ported to Solana as programs
   (`prophet_games`, `nickname_registry`, 44 LiteSVM tests), with a keeper and an indexer.
2. **Game server (2026-10-04).** Deploying the programs needed ~4.2 SOL of rent. The owner wants the product
   to run at zero cost, so the programs, keeper and indexer were removed (they remain in git history). Stakes
   became memo-tagged SOL transfers to a game wallet; one Node service runs the games and pays out.
3. **Product changes (2026-10-04/05).** Stocks removed; Asset Races replaced by Coin Duels; PumpSwap coins
   added automatically; pump.fun launchpad; market cap or price chosen by the creator; Prophet wallet in the
   browser (non-custodial for player balances).

## Decisions (owner)

| Topic | Decision |
|---|---|
| Scope | Full replacement of the Robinhood Chain (EVM) product. Solana becomes the only live chain. Prediction Markets not ported. |
| Cost | Zero: no program of our own, no deploy rent. A server-held game wallet takes stakes and pays automatically. |
| Games | Coin Duels (the "Races" tab), Price Arena. Old race links keep working. |
| Player wallet | Prophet wallet: keypair created and kept in the player's browser; we never store player keys. Phantom/Solflare optional (`VITE_EXTERNAL_WALLETS`). (2026-10-05) |
| Price source | Spot prices of reviewed Solana DEX pools (Raydium, Orca, Meteora, PumpSwap), in USD (SOL-paired pools converted through SOL/USDC at the same slot), signed by the price service. |
| Catalog | Crypto and memes only; liquidity floor $500k per pool, with owner exceptions (DOGE, BNB, SUI, XRP). PumpSwap coins added every 15 min, up to 30, minimal filter. |
| Stake | SOL, $1–$50 per racer; spectator backing up to $100. Fee 2% of winnings. |
| Duel rules | 10 empty lobbies always; 2–6 racers with unique coins; pay within 2 min; ready timer only after the first READY (1 min, +15 s once); kick tax 10% / 20% if backed, doubled after 10 kicks a week, split Prophet / remaining racers; losing backers' pool split 30% winner / 70% winner's backers; tie refunds. |
| RPC | Alchemy (paid) for HTTP; Helius only for websocket subscriptions. |
| Hosting | Site on GitHub Pages for now; APIs on the VPS. While services are off the site shows last known data. Never show "devnet" wording. |
| Prophet token | Launch on pump.fun; after the bonding curve it moves to PumpSwap. Buyback/burn through pump.fun / PumpSwap. |

## Wind-down of the EVM product (must happen, not automatable by Claude)

Real user funds sit in the live EVM contracts. Before the domain switches:

1. Stop keepers from creating new races/arenas/markets.
2. Let open games resolve or cancel; keep claim/refund reachable.
3. Keep a read-only legacy page (or `legacy.` subdomain) for claims until liabilities are zero. Announce a
   cutoff date.
4. Withdraw protocol/creator fees on EVM.

Every step is a mainnet transaction run by the owner.

## Phases

1. **Game server, price service, frontend** — done, tested locally (race e2e exact to the lamport).
2. **VPS** — done: services, nginx paths, keys created on the VPS; stopped until the live test.
3. **Duel e2e on a local validator** — next.
4. **Own domain** for the site (browser-held keys must not share the `github.io` origin).
5. **Live test** — one $1 duel between two wallets, the owner's first launchpad token (owner present).
6. **Cutover** — EVM wind-down, merge to `main`, domain switch.

## Open questions for the owner

- External audit before real volume?
- Legal: the game wallet holds players' stakes while games run (custodial during play).
