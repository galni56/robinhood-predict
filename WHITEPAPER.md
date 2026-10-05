# Prophet: Onchain Prediction Games on Solana

**Draft · Solana · not yet deployed to mainnet**

Prophet has not received an external security audit. This document is not legal, financial or investment
advice.

## 1. Overview

Prophet runs two independent games on Solana around the prices of stocks, memes and crypto assets:

- **Asset Race** compares the percentage performance of 2–6 assets over the same interval. Players back
  one asset; the highest percentage return wins.
- **Price Arena** asks up to ten players to predict one asset's price at a fixed deadline. The closest half
  of the field wins.

Both games are parimutuel: there is no bookmaker and no house odds. Winners recover their stake and share
the losing stakes after a 2% fee, split equally between the game's creator and Prophet.

## 2. Stakes and prices

- **Stakes** are in SOL. The programs also accept SPL and Token-2022 tokens that the admin approves as stake
  currencies, each with its own stake limits. Each game holds its stakes in its own account (or that
  account's token vault), isolated from every other game.
- **Prices** are in USD, read from reviewed DEX pools (Raydium, Orca, Meteora, PumpSwap) paired with USDC,
  or with SOL converted through SOL/USDC at the same slot. Each asset has one frozen pool and a minimum
  liquidity floor at review time.

## 3. Price attestations

The price service reads every relevant pool at the last block strictly before a boundary time T and signs
one Ed25519 message covering all of them, together with that block and its direct child. The programs
accept the price only if:

- the message is signed by the game's oracle key (snapshotted when the game was created);
- it is bound to this program's ID (it cannot be replayed into another program);
- the parent block is strictly before T, its child is at or after T and is already in the past;
- every required asset is present with the expected precision and a non-zero price.

The signature is verified by Solana's Ed25519 precompile in the same transaction. Anyone may submit a
valid attestation; nobody can change its contents. If no valid price arrives in time, the game is
cancelled or voided and every stake is refundable.

## 4. Asset Race

1. **Lobby** (community races only): each wallet may add one approved asset; at least two are needed.
2. **Betting**: back one asset; top-ups must stay on the same asset; per-wallet limits apply.
3. **Start**: P0 is the attested price before the betting cutoff. If fewer assets than required attracted
   bets, the race is cancelled.
4. **Finish**: P1 is the attested price before the race end. The highest percentage return wins, even if
   every return is negative. An exact tie at the top voids the race.
5. **Settlement**: winners receive stake + pro-rata share of the losing pools minus the 2% fee. Cancelled
   and voided races refund every stake in full.

## 5. Price Arena

1. **Lobby (10 minutes)**: submit a price prediction and a stake; change the prediction or add stake until
   the lobby closes. At most ten players.
2. **Round**: 1, 5, 15 or 60 minutes.
3. **Resolution**: the attested deadline price ranks players by absolute error. On equal error, the player
   whose prediction was made earlier ranks higher.
4. **Payout**: the closest half (rounded down) shares the losing half's stakes minus the 2% fee, weighted by
   stake × an accuracy multiplier from 3× (exact hit) down to 1× (the worst winning error).
5. **Cancellation**: fewer than two players, a deadline price older than 60 seconds, or no resolution within
   one hour after the deadline — every stake is refundable.

Predictions are public onchain data; the interface hides them during the lobby, but they are not
cryptographically secret.

## 6. Trust and administration

- One admin key can approve assets and stake currencies, set the oracle key for new games, pause new
  games and bets, and withdraw protocol fees. It cannot change a running game's oracle key, assets, fee or
  rules, cannot cancel an arena, and the fee is capped at 10% in the program code.
- Pausing never blocks starting, resolving, claims or refunds.
- Admin handover is two-step (propose, accept). Programs are upgradeable by the upgrade-authority key.
- Creators withdraw their fee share themselves; fees can only move into the protocol's and creator's own
  vaults.

## 7. Risks

- No external audit.
- Centralized admin and upgrade keys.
- Price manipulation of thin pools near a boundary; mitigated by liquidity floors, not eliminated.
- Oracle-key compromise would allow false prices for games bound to that key.
- Tokenized stocks trade around the clock on Solana while their underlying markets keep fixed hours.
