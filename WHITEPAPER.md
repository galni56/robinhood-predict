# Prophet: Three Onchain Prediction Games for Tokenized Assets

**Version 2.0 · Robinhood Chain mainnet**

This document describes the native-ETH product implemented for the next deployments. The existing USDG deployments remain available only for legacy claims and refunds until their games are terminal. Prophet has not received an external security audit. This document is not legal, financial or investment advice. See the [Terms of Service](https://prophetmarkets.fun/#/terms).

## 1. Overview

Prophet offers three independent games built around prices on Robinhood Chain:

- **Prediction Markets** ask whether a tokenized stock will finish above or below a target. Players pick YES or NO, and earlier correct calls receive more payout weight.
- **Asset Races** compare the percentage performance of several assets over the same interval. Players back one of 2–6 assets, and the highest percentage return wins.
- **Price Arena** asks players to predict one asset's exact finishing price. The closest 50% of the field share the losing half's stakes.

Each mode has its own Solidity contract, lifecycle and accounting. Funds and game state are not shared between the three modes. A failure or cancellation in one game cannot change another game's result.

## 2. Shared Foundations

- **Network:** all real games run on Robinhood Chain mainnet.
- **Wager currency:** stakes, pools, payouts, refunds and protocol fees use native ETH. The interface accepts either USD or ETH input for the live $1–$50 range, shows the reciprocal equivalent and freezes the exact wei/ETH value before the wallet sends one payable transaction. There is no ERC-20 approval, WETH wrapping or ETH-to-USDG swap.
- **Reviewed assets:** Markets use 10 approved tokenized stocks. Races and Arena support those 10 Stocks plus 13 Memes; Stocks and Memes remain separate categories.
- **Non-custodial:** Prophet never receives a wallet's private key. Entries, claims and refunds are signed by the player in MetaMask.
- **Parimutuel economics:** players compete against one another rather than a bookmaker. The available payout comes from stakes already locked in that game.
- **Claims and refunds:** after an onchain result or cancellation, eligible players claim their payout or refund from the relevant contract.

## 3. Prediction Markets: YES or NO

A market asks: *Will this stock be at or above the target price at the deadline?*

A YES position wins when the final price is greater than or equal to the target; otherwise NO wins. Touching the target at any earlier moment does not count. The only price that determines the outcome is the scheduled deadline price.

### Lifecycle

1. Any wallet creates a market for one of the 10 approved StockToken/USDG pools, chooses a positive target and selects a deadline. The interface offers 30 minutes, 1 hour, 24 hours and 7 days. Thirty minutes is the onchain minimum.
2. Players enter $1–$50 in the interface and stake the displayed native ETH equivalent on YES or NO. A wallet may place one bet per side. It is possible to hold both a YES and a NO position, but neither position can be increased after its first bet.
3. Betting closes after the first two-thirds of the market's lifetime. The final third accepts no new bets and exists only for the price outcome to develop.
4. After the deadline, the keeper submits the historical pool observation for the last Robinhood block strictly before that deadline. Calling resolution later cannot substitute a newer price.
5. Winning wallets claim their payouts. A cancelled market lets every participant reclaim their original stake.

Creation is permissionless, but asset approval is not: a market can only use a pool identity reviewed and registered by the protocol. The target ranges shown during creation are interface guidance, not an onchain target-distance rule.

The owner may seed a new market up to the deployment-configured native ETH seed cap.

## 4. Market Weighting, Payouts and Cancellation

A winning bet earns its principal back plus a share of the losing pool. The share is based on **weighted stake**, which rewards taking risk earlier.

Weight falls linearly from **2.00×** when the market opens to **0.50×** immediately before betting closes. Weight changes only the distribution of profit; it never changes principal.

```text
payout = stake
       + (weighted stake / total weighted winning stake)
       × losing pool
       × 98%
```

The 2% protocol fee applies only to each winner's share of the losing pool. It is not charged on returned principal or refunds. Integer division can leave a small amount of rounding dust in the contract.

If either YES or NO has no stake at the deadline, the market is cancelled. There is no genuine opposing pool, so all existing positions are refundable in full. A stale or unusable deadline observation also cancels the market rather than allowing an arbitrary current price to decide it.

## 5. Asset Races: Highest Return Wins

A Race compares **2–6 assets from one category**:

- Stock races use StockToken/USDG prices.
- Meme races use MemeToken/ETH prices.

Players back one asset. The winner is the asset with the highest percentage return between the common start and end snapshots—not the asset with the highest absolute price.

### Community Race lifecycle

1. The creator chooses Stocks or Memes, a title and an approved race duration of 1, 5 or 15 minutes. The creator may add initial assets or leave the list open.
2. A 5-minute lobby opens. No betting occurs yet. Each wallet may add one approved asset of the chosen category, up to six candidates total. Fewer than two candidates at lobby close cancels the empty race.
3. Betting then opens for 5 minutes. A wallet enters $1–$50, sees the exact native ETH equivalent, and selects one asset. It may top up the same selection to the contract's cumulative wei cap. The selected asset cannot be changed for that race.
4. At betting close, only assets with a non-zero pool become active. At least two active contenders are required; otherwise the race cancels and all stakes are refundable.
5. The start snapshot `P0` is fixed at the betting cutoff. After the selected race duration, the end snapshot `P1` is fixed at the scheduled finish. The interface may show movement between them, but only the two onchain settlement snapshots decide the result.

```text
asset return = (P1 - P0) / P0
```

The highest return wins even when every contender fell in price—the least negative return is still the highest. Stocks and Memes never compete in the same race because they use different quote units.

## 6. Race Settlement, Payouts and Voids

Every player who backed the winning asset receives principal plus a stake-proportional share of the losing assets' combined pool. Race bets are not time-weighted.

```text
payout = stake
       + (stake / winning pool)
       × losing pool
       × 98%
```

The 2% fee comes only from the losing pool.

If two or more active assets finish with exactly the same top return, the race is void and every stake is refundable in full. No arbitrary tiebreaker selects an asset.

A race also becomes refundable if a valid start or end snapshot cannot be fixed within its onchain grace window.

Prophet can label platform-created races as **Featured**, while wallet-created races are **Community** races. Both settle with the same return calculation and payout rules.

## 7. Price Arena: Closest Prediction Wins

Price Arena is a fixed-field forecasting contest for one approved Stock or Meme. Instead of choosing a direction, every player enters the exact price they expect at the end of the game.

Available game durations are **1, 5, 15 and 60 minutes**.

### Lifecycle

1. Any wallet creates an Arena. Creation opens a fixed 10-minute lobby; the selected game duration begins only after that lobby ends.
2. Between 2 and 20 wallets may enter. The interface accepts a $1–$50 initial stake and sends the displayed native ETH equivalent.
3. During the lobby, a player may change the predicted price and add more native ETH up to the contract's cumulative wei cap, but cannot reduce the stake or withdraw.
4. The regular interface and contract getter hide predicted prices during the lobby while showing stakes. This is display privacy, **not cryptographic secrecy**: calldata and blockchain storage are public and can be inspected by advanced users.
5. Entry and edits close automatically when the lobby ends; no separate start transaction is required. Predictions then become visible and the game runs for the chosen duration.
6. The final price comes from the last Robinhood block strictly before the Arena deadline. The keeper's transaction time cannot move that boundary.

Stock Arenas predict a StockToken/USDG price in USDG. Meme Arenas predict a MemeToken/ETH price in ETH. Those are price quote units only; native ETH is the stake and payout currency in both categories.

## 8. Arena Ranking and Payout Mathematics

Every entry is ranked by absolute error:

```text
error = |predicted price - final price|
```

The winning count is **floor(player count / 2)**, so the closest half wins:

- 2 players produce 1 winner.
- 3 players produce 1 winner.
- 4 players produce 2 winners.
- 20 players produce 10 winners.

Equal error is broken first by the earlier most recent prediction update, then deterministically by wallet address. Adding stake without changing the prediction preserves the original tiebreak priority; changing the prediction resets it to the edit time.

Winners recover their principal and divide the losing half's pool according to both stake and accuracy. The least accurate winner at the cutoff receives a 1× accuracy multiplier; more accurate winners scale up toward 3×.

```text
score = stake
      × [1 + 2 × (cutoff error - player error) / cutoff error]
```

```text
payout = stake
       + (player score / total winner scores)
       × losing pool
       × 98%
```

If the cutoff error is zero, exact-price winners use a 1× multiplier and stake alone determines their shares.

The 2% fee applies only to the losing pool; integer rounding dust also remains protocol funds. Fewer than two players or a stale deadline price cancels the Arena and enables full refunds.

## 9. Live Prices, Deadline Settlement and Keepers

Prices visible in the interface come from reviewed Robinhood Chain liquidity pools. A shared live service polls those pools every two seconds and distributes one synchronized snapshot to the ticker, cards and game screens. These values are for display and do not themselves settle a game.

The same service caches one public ETH/USD quote for all stake forms, refreshing it no faster than every 15 seconds. Players may enter USD or ETH; reciprocal conversion and range checks use fixed-point integer arithmetic. The exact wei value and quote are frozen when a wallet request is built, and a missing or stale quote blocks the transaction. Onchain min/max values are broad fixed ETH safety fuses (`0.0001–0.1 ETH`), not dollar enforcement.

Markets, Races and Arena use the shared `SignedPoolRaceOracle` for settlement. A keeper watches scheduled boundaries and submits signed proofs containing two adjacent Robinhood blocks. The oracle verifies signatures, parent linkage and timestamps, then selects the last block strictly before the required boundary. The resulting price, timestamp and observation identifier are stored onchain.

This design separates **when the outcome is measured** from **when the resolve transaction is mined**. A delayed keeper can delay finalization, but it cannot choose a later price.

Keeper actions are permissionless at the contract level where applicable, while Prophet operates the production automation and pays its gas.

The three game contracts are non-upgradeable deployments with separate balances and accounting. The owner controls approved asset identities, protocol configuration and accumulated fee withdrawal. New activity can be paused where supported without blocking already-available claims and refunds.
