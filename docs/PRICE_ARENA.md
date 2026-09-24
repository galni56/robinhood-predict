# Price Arena

Status: implemented and locally tested; not deployed. No independent security audit.

Price Arena is a fixed-time closest-price contest for the same reviewed
Robinhood Chain pools used by Asset Race. It has separate Stock and Meme
categories and settles in USDG.

## Lifecycle

1. Anyone creates an arena for one approved asset and selects a 1, 5, 15, or
   60 minute game duration.
2. The contract opens a fixed 10-minute lobby. `startsAt` and `deadline` are
   calculated in the mined creation transaction, so wallet confirmation delay
   cannot move the game boundaries.
3. During the lobby, 2–20 wallets can enter with 1–50 USDG. A player may change
   their prediction and increase their stake, but cannot reduce or withdraw it.
4. The normal contract getter and UI hide predictions during the lobby. This
   is display privacy only: calldata and EVM storage are public. It is not a
   substitute for commit/reveal and must not be marketed as cryptographic
   secrecy.
5. At `startsAt`, entry and updates close automatically by timestamp. No start
   transaction is required. Predictions become visible and the frontend ranks
   them against the live display price.
6. After `deadline`, the keeper submits a signed proof for the last Robinhood
   block strictly before the scheduled deadline. Delayed keeper execution
   cannot change the selected final price.
7. Fewer than two players, or a stale endpoint price, cancels the arena and
   enables full refunds.

## Ranking and payouts

- Error is `abs(prediction - finalPrice)` in the pool's 18-decimal quote unit.
- The winning count is `floor(playerCount / 2)`.
- Smaller error ranks first. Equal error is broken by the earlier most recent
  prediction update, then deterministically by wallet address.
- A stake-only top-up does not reset tie priority. Changing the prediction does.
- Every winner receives their principal plus a share of the losing pool.
- The protocol takes 2% only from the losing pool. Integer rounding dust also
  remains protocol funds.
- A winner's distribution score is:

  `stake * (1x + 2x * (cutoffError - playerError) / cutoffError)`

  The cutoff winner therefore receives a 1x accuracy multiplier and the closest
  prediction can receive up to 3x. If `cutoffError` is zero, all tied zero-error
  winners use 1x and stake alone determines their shares.

## Price units

- Stock arenas predict the StockToken/USDG pool price, quoted in USDG.
- Meme arenas predict the MemeToken/ETH pool price, quoted in ETH.
- Both use the existing `SignedPoolRaceOracle` and reviewed 23-asset registry.
- Live prices are display-only. Settlement uses the signed historical endpoint.

## Operations

- Deploy with `contracts/script/DeployPriceArena.s.sol`.
- Configure all reviewed assets with
  `contracts/script/ConfigurePriceArena.s.sol`.
- Run `scripts/price-arena-keeper.mjs` as a separate service. It may reuse the
  Prediction Market keeper transaction wallet, lifecycle RPC, archive pool RPC,
  and pool price signer, but must use its own service and endpoint cache file.
- Frontend builds require `VITE_PRICE_ARENA_ADDRESS`.

Never broadcast deployment/configuration transactions or enable the live keeper
without an explicit production confirmation and a clean dry-run first.
