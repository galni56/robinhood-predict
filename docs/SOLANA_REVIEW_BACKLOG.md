# Solana port review — remaining backlog

Senior review of branch `solana-migration` (2026-10-03, three parallel review passes:
frontend data layer, off-chain services, pages). The highest-risk findings were fixed
on `solana-review-fixes` (ten commits: attestation crash for USDC-quoted assets, quote
freshness, tx phases/unconfirmed handling, fail-closed unknown status, error states,
shared list hook, oracle hardening, keeper/indexer robustness, entry-chunk size,
portfolio missing-race fetch). This file is what remains, ordered by risk. Line
numbers are as of that review; re-grep before editing.

## Correctness / money

1. **Price service signs without proving it saw every update up to the boundary.**
   Eligibility rests on `maxSlotSeen` (one high-water mark); a lagging or silently
   dead subscription can get stale state signed and settled. Track a
   `verifiedThroughSlot` advanced only when a resync read matches reconstructed
   state, and refuse to sign beyond it (the keeper already retries).
   `scripts/solana/price-service/service.mjs`.
2. **No sanity check on the signed price itself.** A single-pool spot read at the
   boundary block can be pushed on thin meme/xStock pools and reversed next block.
   Before signing, compare against the median of the same pool over the previous k
   slots (already in `AccountHistory`) and refuse beyond a threshold - the game then
   voids by rule. Needs an owner decision on the threshold.
3. **Frozen stake quote is not re-checked right before send.** `quoteReceivedAt` is
   stored and never read; between freeze and the wallet prompt minutes can pass.
   Export an `assertQuoteUsable(frozen, now, maxAgeMs)` from
   `src/chain/stakeQuote.ts` and call it just before `send()`.
4. **The $1–$50 range is per transaction.** Race add-on bets and arena top-ups can
   push a wallet's cumulative stake past $50 (bounded only by the on-chain max).
   Confirm with the owner whether that is intended.
5. **Race settlement history depends on the indexer's capped activity feed** (500
   events): once a claim rolls off, the claimant sees neither position nor
   settlement. Publish per-wallet settlements in the snapshot. Also guard
   `BigInt(event.amount ?? '0')` in `src/chain/useAssetRace.ts` with a digits regex.

## Services robustness

6. **Price-service pruning is tied to resync**, so a failing RPC lets
   `AccountHistory` grow unboundedly; `known.equals(data[account])` throws on a null
   read and aborts the cycle; `setInterval(resync)` has no overlap guard and the
   fetches no timeout. Prune on its own timer; treat null as "differs"; add a
   `running` guard; after N consecutive failures set `ready = false`.
7. **Websocket stall watchdog.** `/health` now reports 503 when notifications stop,
   but nothing forces a reconnect; add a watchdog that re-subscribes or exits (so
   systemd restarts) when `getSlot()` advances with no notifications. Also register
   the socket `open` handler once instead of stacking one per close.
8. **Keeper and indexer load every game ever created with `getProgramAccounts`**
   every few seconds. Keeper: add a `memcmp` filter on the status byte for
   non-terminal games. Indexer: refresh only accounts touched by new transactions
   via `getMultipleAccountsInfo`.
9. **Indexer state and snapshot are unbounded.** `state.events` grows forever and is
   rewritten whole every cycle; `/history` re-stringifies every wallet and game per
   request. Move events to append-only JSONL/SQLite, cache the serialized snapshot
   with an ETag (and gzip), and split or paginate wallets/races.
10. **Cluster/identity checks in the CLIs.** `admin.mjs` guards mainnet by URL regex;
    `ORACLE_PUBKEY` silently defaults to the admin hot key off-localnet; the keeper
    silently defaults to localnet and `~/.config/solana/id.json`. Use a shared
    `clusterFromGenesis()` helper; require explicit env in production.
11. **Graceful shutdown and boot retry for the price service and keeper** (the
    indexer now saves on SIGTERM): close servers and listeners, retry transient RPC
    errors at boot with backoff, log `unhandledRejection`.
12. **Shared scripts lib.** Keypair/Connection/Program setup, `pda`, `assetId`,
    `u64`, `chainNow()` (three copies, hard-coded offset 32) and the 3600s grace
    mirror of `ARENA_RESOLUTION_GRACE` are copy-pasted across keeper, admin, e2e and
    indexer. Extract `scripts/solana/lib/`.

## Frontend quality

13. **Stake entry is copied between race and arena and the copies already differ**
    (quote derivation, unit-switch reset, freeze/guardrail/build/send, the
    "Wallet will send exactly…" hint). The race button also re-implements the
    min/max check inline and can disagree with the submit-time check. Extract
    `useStakeQuote()` + a `<StakeQuoteHint>`; pass the violation into
    `AssetRaceBettingView`; build the "$1–$50" copy from on-chain
    `minStake`/`maxStake` instead of five hard-coded strings.
14. **Countdowns:** `formatCountdown` returns `'resolved'` (prediction-market
    wording) and four pages guard it four different ways; settling detection is
    triplicated. One `gameClock(target, nowMs, expiredLabel)` helper or
    `<Countdown>` component.
15. **Claim/refund flows and refresh bundles are copied three times** (race page,
    arena page, portfolio - portfolio invalidates `['sol-balance']` while the others
    call `balance.refetch()`). Fold into one `useGameTx` hook with a shared
    invalidation list.
16. **Decode/category helpers are duplicated** across `assetRaces.ts`,
    `priceArena.ts`, `useGameConfig.ts`, `gameTx.ts`, `useApprovedRaceAssets.ts`
    (`variant`/`big`, three category mappings, two asset-id→symbol decoders with
    slightly different behavior, an inlined `positionFromAccount`). Extract
    `src/chain/anchorDecode.ts` and `src/chain/category.ts`; use
    `symbolFromAssetId` everywhere.
17. **Live-price plumbing:** the race page calls `useLivePrices()` unconditionally so
    the 3s poll keeps running on resolved races; the arena page re-implements the
    "price usable at this precision" rule from `useAssetRace`. Share a
    `usableLivePrice(live, symbol, decimals)` helper and pass `enabled` through.
    The position query should also adopt the race query's terminal-aware 30s
    interval.
18. **Polling budget per visitor is high** (race page: 6 concurrent intervals plus a
    1s clock re-render) and `/history` is downloaded whole every 5s per tab. After
    the indexer gets ETag support, switch `useHistory` to `If-None-Match`.
19. **UI consistency:** hand-written red/amber notice boxes instead of `InfoBanner`
    (add a `danger` tone); EVM-era copy saying "contract" in three places;
    `GameListLoadingGrid` rebuilt by hand on the landing page (with a dead
    `'purple'` accent branch); plain-text loading states on detail pages;
    `tone='market'` defaults in `WalletOptionsList`/`FilterChips` for a retired
    product; `formatStakeRaw(...) + " SOL"` vs `formatCompactSol`;
    `tokenDecimals`/`tokenLabel` threaded through SOL-only pages; `hexToBytes` in
    the race page vs `assetIdFromSymbol` in create pages; `?mode=` parsing and the
    meme/crypto/stock ternary copied across six files (`useGameMode()`,
    `modeNoun()`, `<CardLink>`, one `parseGameId`).
20. **Arena predictions are public on-chain while the UI hides them during the
    lobby** (known gotcha in the handoff; worth a line in the whitepaper/UI).
