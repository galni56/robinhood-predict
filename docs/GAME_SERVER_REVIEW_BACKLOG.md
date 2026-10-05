# Game server era - review backlog

Architecture review of the custodial game-server version (2026-10-05). The
money-critical items were fixed on `architecture-refactor`: double payout on a
missed status lookup, unsafe first start / lost database, URL-guessed cluster,
unguarded sweep, scan errors blocking payouts, signed-message replay through
base64 re-spelling, duel USD backing without a fresh quote, PumpSwap lobby add,
dead code and CSS, contrast leftovers, broken "How it works" links. What
remains, by risk:

## Money / security (before real funds)
1. **Settlement prices are trusted without verifying the oracle signature**
   (`game-server/prices.mjs`, consumed in `engine.mjs` boundary handling). Pin
   `ORACLE_PUBKEY`, verify the ed25519 attestation and that program, target,
   sources and prices match; set `ALLOWED_PROGRAM_IDS` on the price service.
2. **Credits and payouts settle at `confirmed`.** Require finalized before a
   game settles and before a payout is marked done; raise `settleDelay`.
3. **Refund fee drain:** one tx with N small memo-less transfers costs us N
   refunds and N fees. Merge refunds per sender per tx, deduct the network fee,
   rate-limit per sender.
4. **Signed messages have no domain/nonce binding** - a phishing site can
   collect valid "Prophet" signatures. Add `domain` + random `nonce`.
5. **Rate limiting trusts the leftmost X-Forwarded-For**; buckets never expire;
   `/deposit` stores rows for transactions that never touched the wallet;
   `/cheer` rewrites money-bearing game docs; no global cap on open duels.
6. **Sweep from a fee ledger** (protocol fees + kept dust) instead of
   balance minus liabilities; require `COLD_WALLET` on mainnet.
7. **Scanner gaps:** a signature that never becomes readable stays pending
   forever (blocks settlement); timeout cancellations should bypass
   `settledPast`; replace the 20-page cap with a stored cursor.
8. **BigInt revival by field name** (`db.mjs`): a new amount field missing
   from the list reloads as a string. Use a tagged encoding + round-trip test.

## Ops
9. Separate intervals for payouts / scan / games; graceful SIGTERM shutdown;
   RPC failover; key file 0600 under its own user; alerts for stuck,
   insolvent and unmatched; price-service health in `/health`; scheduled
   SQLite backups (`VACUUM INTO`).

## Architecture
10. Split `engine.mjs` (deposits, payouts, actions, games/{race,arena,duel})
    behind one per-kind interface; unify final-status lists and tie/refund
    logic shared by rules and duels.
11. Frontend: one fetch client with refusal vs unavailable errors (502 shows
    as "Refused: HTTP502" today, and a failed deposit report is silent);
    validate server JSON in `queryFn` + an ErrorBoundary; one server-anchored
    clock instead of per-page 1s tickers and RPC clock calls; extract the
    triplicated stake-submit flow (race/arena/duel) into one hook; decide
    whether Asset Races stay (UI unreachable, code and /state payload ship).
