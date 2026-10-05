# Roadmap

Prophet is moving from Robinhood Chain (EVM) to Solana. The EVM product (Prediction Markets, Asset Races,
Price Arena with native-ETH stakes) remains live from `main` until it is wound down; its history is in git.
This file tracks the Solana build. Decisions: [`docs/SOLANA_MIGRATION.md`](./docs/SOLANA_MIGRATION.md).
Change log: [`docs/SOLANA_CHANGELOG.md`](./docs/SOLANA_CHANGELOG.md). Status and how to run everything:
[`docs/HANDOFF.md`](./docs/HANDOFF.md).

## Done

1. **Zero-cost model** — no program of our own: memo-tagged SOL stakes to a game wallet, one game server runs
   the games and pays out automatically (payout outbox, finalized-only, never twice; fee sweep to a cold
   wallet). The earlier Anchor programs, keeper and indexer were removed (deploy rent ~4.2 SOL).
2. **Price service** — subscription-based pool state from Raydium (AMM v4, CPMM, CLMM), Orca, Meteora and
   PumpSwap; Ed25519-signed boundary prices the game server verifies.
3. **Catalog** — 11 crypto coins and 10 memes approved by the owner; stocks removed; up to 30 PumpSwap coins
   added automatically every 15 minutes.
4. **Coin Duels** — the new races: lobbies, own coin per racer, ready check, kick tax, spectator backing,
   cheers. Full lifecycle passes on a local validator, every payout exact to the lamport.
5. **Price Arena** — price or market cap, chosen by the creator.
6. **Launchpad** — create a pump.fun token from the site.
7. **Prophet wallet** — account in the browser, password-encrypted key, forced backup, top up, withdraw,
   restore. Player keys never reach the server.
8. **VPS** — services, nginx paths (game server, price service, RPC and websocket proxies with per-visitor
   limits, IPFS, last-known data), keys created on the VPS. Services stopped until the live test.
9. **Site** — landing with the hero race, PumpSwap table, duels, arenas, launch; phone layout; GitHub Pages
   build switches to mainnet with one repository variable (`SOLANA_LIVE`).

## Next

1. **Own domain** for the site (browser-held keys should not share the `github.io` origin).
2. **Live test** — start the services, set `SOLANA_LIVE=true`, one $1 duel between two wallets; the owner's
   first launchpad token.
3. **Price sanity threshold** — the check is built; the owner picks the limit (`PRICE_MAX_DEVIATION_BP`).

## Before real volume (owner)

- Point prophetmarkets.fun at the Solana site (the EVM product is abandoned; the code is on `main`).
- Decide on an external audit and the legal side of holding stakes during games.

## Later

- Launch races: coins launched in one lobby, the first to graduate to PumpSwap wins; "will it graduate in
  24 h" bets.
- $PROPHET on pump.fun; buyback and burn through pump.fun / PumpSwap.
