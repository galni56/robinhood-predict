# PredictX — mock prediction market for tokenized stocks

**Live demo:** https://galni56.github.io/robinhood-predict/

A fully client-side **demo/prototype**: a game-style prediction market ("will
this tokenized stock reach $100 before the deadline — YES/NO?") wired to a
simulated blockchain ("RHChain testnet") so every price move, bet and payout
is visible as an on-chain transaction in a built-in block explorer.

**Everything here is mock.** There is no real backend, no real blockchain, no
real brokerage, no real funds, and no affiliation with Robinhood Markets,
Inc. Prices are a random walk generated in the browser; accounts, balances,
blocks and transactions all live in `localStorage` on your own machine.

## Stack

- React 19 + TypeScript, Vite
- Tailwind CSS v4 (`@tailwindcss/vite`)
- `react-router-dom` for the page flow (login → register → markets → market
  detail → explorer → tx/block/address detail → portfolio)
- `zustand` (+ `persist`) for state — three stores:
  - `authStore` — mock accounts (email/password kept in `localStorage` only,
    never sent anywhere)
  - `chainStore` — the simulated chain: blocks, mempool, transactions,
    address balances
  - `marketStore` — token prices, prediction markets (pools/odds/deadlines),
    user positions
- `recharts` for price charts

## Architecture

```
src/
  chain concepts live in store/chainStore.ts + lib/hash.ts (deterministic
  pseudo-hash — NOT cryptography, purely cosmetic for the demo)
  market/            token list, price random-walk engine
  store/             zustand stores (auth, chain, market)
  components/        ChainEngine (the ticking "node" that drives price ticks,
                      block production and market resolution), shared UI
  pages/             one file per route
```

`ChainEngine` is a headless component mounted once at the app root. It runs
three `setInterval` loops entirely in the browser tab: price ticks, block
production (bundles pending txs from the mempool), and prediction-market
resolution once a deadline passes. Nothing here talks to a network.

The prediction window is compressed to `PREDICTION_WINDOW_MS` (see
`store/marketStore.ts`, default 5 minutes) instead of a real week, so the
game is actually playable in one sitting — clearly surfaced in the UI as a
demo timeline. Each market also has a "finish now" dev button for instant
demoing.

## Running locally

```bash
npm install
npm run dev
```

No environment variables, no credentials, no external services required —
this is intentional.

## Deployment note

This project has no deploy script checked in on purpose. If/when this needs
to go anywhere (e.g. a static preview host), do **not** hardcode credentials
into a script (plaintext passwords piped through `expect` into a CLI login
prompt will get flagged by endpoint security, correctly). Prefer a
provider's token-based non-interactive login (env var or `~/.netrc`,
generated once interactively) so no secret ever sits in a file on disk in
this repo or in shell history.
