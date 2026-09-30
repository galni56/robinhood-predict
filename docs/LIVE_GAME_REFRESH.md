# Live game refresh profile

Prophet uses a fast paid-RPC profile for user-visible game state. The objective
is to keep a visible page within one polling interval plus normal RPC/block
latency of the authoritative onchain state.

## Defaults

- Homepage and game list snapshots: `1000ms`, batched once per product.
- Open game detail lifecycle/accounting reads: `1000ms` while the tab is visible.
- Prediction Market and Price Arena keepers: `1000ms` when a transition is due.
- All lifecycle keepers: at most `5000ms` while idle, so newly created games are
  discovered promptly.
- Automatic event seeder: `5000ms`; it creates only when a configured open-game
  target has a free slot.

Seeder startup restores historical cursors in bounded 100-call multicalls rather
than issuing one sequential RPC request per old game. Automatic Race rotation is
derived from the newest onchain Race and excludes every combination already in
LOBBY, BETTING or RUNNING, so restarting the service cannot reset it to the same
active pair.

React Query pauses interval polling for hidden tabs. List reads remain multicalls
and stable snapshots retain the last valid complete row during a partial RPC
failure. Contract game counts are append-only, so the client also keeps a
session high-water mark and rejects lower counts returned by a temporarily stale
RPC node. This prevents valid cards from disappearing during route changes or
provider failover. Do not replace these protections with per-card reads.

Cold product pages and homepage columns reserve populated-card geometry while
their first complete batch is pending. They show skeleton cards rather than a
finished empty state, while route remounts immediately reuse the last complete
session snapshot. This is presentation stability only; the chain remains the
source of truth.

## Production overrides

Keep these values aligned in the external root-only service environment when a
release changes the defaults:

```text
EVENT_SEEDER_POLL_INTERVAL_MS=5000
PREDICTION_MARKET_POLL_INTERVAL_MS=1000
PREDICTION_MARKET_IDLE_POLL_INTERVAL_MS=5000
PRICE_ARENA_POLL_INTERVAL_MS=1000
PRICE_ARENA_IDLE_POLL_INTERVAL_MS=5000
POLL_INTERVAL_MS=1000
IDLE_POLL_INTERVAL_MS=5000
```

Lower values increase paid lifecycle RPC traffic. They do not change game
durations, create games above configured targets, or alter settlement rules.
Transaction confirmation and block production remain outside the UI polling
bound, so a one-second interval is not a promise of one-second finality.
