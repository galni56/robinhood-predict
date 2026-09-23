# contracts/

Solidity side of the prediction market — a parimutuel YES/NO market
(`PredictionMarket.sol`) that settles from the deterministic StockToken/USDG
pool state immediately before its deadline on Robinhood Chain.

The replacement is locally tested but not deployed or security-reviewed. See
[`CLAUDE.md`](./CLAUDE.md) and
[`../docs/PREDICTION_MARKET_DEADLINE_SETTLEMENT.md`](../docs/PREDICTION_MARKET_DEADLINE_SETTLEMENT.md).

The frontend in `../src` contains both the real mainnet mode and a separate
client-side demo.
