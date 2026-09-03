# contracts/

Solidity side of the prediction market — a parimutuel YES/NO market
(`PredictionMarket.sol`) that settles against a Chainlink price feed for a
tokenized stock on Robinhood Chain.

Builds clean and **8/8 tests pass** (run via the official Foundry Docker
image — Foundry itself was never installed on the host, deliberately, since
this was authored on a company-managed workstation). Not deployed anywhere,
and not security-reviewed. See [`CLAUDE.md`](./CLAUDE.md) for exact commands
(including the Docker-based build/test) and the deployment checklist.

The frontend in `../src` is a separate, self-contained mock — it doesn't
depend on anything here.
