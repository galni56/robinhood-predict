# Roadmap to Real MVP

Target: PredictionMarket contract live on **Robinhood Chain testnet**, frontend
wired to it via a real wallet, people placing real (testnet) on-chain bets —
not the in-browser simulation. This doc is the shared source of truth for
what's decided, what's blocking, and what's next (Build&Launch team + Claude).

## 0. Blocking product decisions

Updated 2026-09-04 — all resolved for this MVP push:

| Decision | Status |
|---|---|
| Wallet model: external connect vs embedded | **Decided: external.** `wagmi` `injected()` with EIP-6963 discovery, supporting both MetaMask and Phantom (Phantom shipped native Robinhood Chain support in July 2026) — no embedded/custodial wallet |
| Memecoin / pump.fun-linked tokens in scope? | **Out of scope** for this push |
| Early cash-out mechanic | **Out of scope** for this push |
| Side-column layout on market page | **Out of scope** for this push — still waiting on design refs whenever it is picked up |

## 1. Contract ↔ mock parity — done

The frontend already allowed permissionless market creation and a $500
target cap; the contract has now been brought in line:

- [x] Remove `onlyOwner` from `createMarket` — anyone can create a market
- [x] Add the $500 target cap on-chain (`MAX_TARGET_PRICE_USD`, scaled to
      the feed's own `decimals()` since `targetPrice` is feed-scaled)
- [x] **Rigged-feed mitigation:** owner-maintained allowlist
      (`allowedPriceFeeds` / `setPriceFeedAllowed`) — `createMarket` stays
      permissionless but only accepts feeds the owner has allowlisted
- [x] Add Foundry tests (permissionless creation, non-allowlisted-feed
      revert, cap enforcement at and above the limit, allowlist is
      owner-only)
- [x] Re-run full suite — 12/12 passing (Foundry installed directly on
      this machine, see root `CLAUDE.md` rule 2)

## 1.5. Parimutuel liquidity mechanics — done (2026-09-05)

Added on request, beyond the original parity scope — full detail in
`contracts/CLAUDE.md`:

- [x] **One-sided cancellation:** `resolve()` cancels (full refund, no fee)
      if either pool is still zero at the deadline
- [x] **House seed liquidity:** owner-only `initialYesAmount`/
      `initialNoAmount` on `createMarket`, capped combined at
      `MAX_SEED_LIQUIDITY_USD` ($50)
- [x] **Protocol fee:** `feeBp` (owner-settable, capped 10%, snapshotted per
      market at creation) taken only from the losing pool's contribution to
      a winner's payout — principal always returned in full.
      `accumulatedFees` withdrawable via `withdrawFees(to)`
- [x] 10 new Foundry tests (22/22 total), including exact wei-precision fee
      math
- [x] Mock frontend updated to match (seed-liquidity field for admins,
      "Awaiting Counter-Bets" badge, fee-aware payout calculator) — the
      `/onchain` real-chain page was updated only for the redeployed
      address/ABI below, not given equivalent UI for seed/fee yet

## 2. Real testnet deploy — done (2026-09-05)

- [x] You: burner wallet (`cast wallet new`, run yourself, never through Claude)
- [x] You: funded it from the Chainlink testnet faucet (Alchemy's faucet
      gates on holding 0.001 ETH on Ethereum Mainnet — a dead end for a
      fresh burner wallet; Chainlink's didn't have that requirement)
- [x] You: `contracts/.env` filled in yourself
- [x] Claude: deployed, using Foundry directly (this machine, non-work) with
      `source .env` inline per command so the key only ever lives in the
      subprocess environment, never in anything Claude reads or writes:
      - `MockERC20` (bet token, "mUSD"): `0xBDc0F8045Baa2377F11A03d3c867E81dB263A93A`
      - `MockAggregator` (stand-in TSLA feed, $353.90 start, 8 decimals):
        `0x3d8cC74a198ad948D77c65d88Ed24acFeE77Cd67` — see note below on why
        this is mock, not a real Chainlink feed
      - `PredictionMarket`: `0x70E4630054F8EA42Efb32a77b1d672f5bCF0203f` —
        **redeployed same-day (2026-09-05)** to pick up the liquidity
        mechanics from §1.5 below (2% protocol fee); the original address
        (`0x9d17...F24Be9`) is stale, don't use it. Bet token and price feed
        were reused as-is (unaffected by the redeploy).
      - Market #0 created on the redeployed contract: "Does TSLA reach
        $400?", fresh 24h deadline
- [ ] Verify contract source on the Blockscout explorer

**Why the price feed is mock, not real Chainlink, even though the deploy
itself is real:** confirmed 2026-09-05 that Chainlink Data Feeds
(`AggregatorV3Interface`, what this contract reads) exist on **Robinhood
Chain mainnet only** — `data.chain.link`'s network filter for Robinhood
lists only "Robinhood Mainnet", and a reference Robinhood Chain example
dapp ([hummusonrails/robinhood-chain-dapp-example](https://github.com/hummusonrails/robinhood-chain-dapp-example))
states this explicitly and deploys the same kind of mock feed for the same
reason. TSLA does exist on Robinhood Chain via Chainlink **Data Streams**
instead (a pull-oracle product with a Feed ID and off-chain report
verification, not a simple on-chain address `latestRoundData()` can hit) —
integrating that is a materially bigger task, tracked as a follow-up, not
blocking this testnet milestone. `script/DeployMockFeed.s.sol` (new) is the
reusable way to stand up another mock feed for a different ticker/price.

## 3. Wire the frontend to the real chain — first slice done (2026-09-05)

Built and verified (headless-browser check, see below): `src/chain/config.ts`
(wagmi config + Robinhood Chain testnet definition), `src/chain/contracts.ts`
(ABIs + the deployed addresses from §2), and a new `/onchain` page
(`src/pages/OnchainMarketPage.tsx`) alongside the existing mock app —
nothing in the mock flow was touched or removed. The new page:
- Reads market #0 (question, target, current price via the feed, pools,
  countdown) with no wallet needed — confirmed working against the live
  testnet contract in a browser check
- Connect flow via `wagmi`'s `injected()` (lists MetaMask/Phantom/any
  EIP-6963 wallet found)
- Network-mismatch guard with a "switch network" button
- Bet flow (approve → bet, sequenced), claim, refund, and a manual
  "resolve now" button for demo use once the deadline passes
- Verified: page loads and reads real on-chain data correctly with zero
  console errors (checked via a Playwright script — no `chromium-cli` on
  this machine, installed Playwright via `npx` for this one-off browser
  check); the actual wallet-signed tx paths (connect, approve, bet, claim)
  are implemented but not yet exercised with a real wallet in this
  session — do that next with an actual MetaMask/Phantom browser session

Not done yet: this only covers market #0 (hardcoded), not market creation,
listing multiple markets, or a mock/real mode toggle beyond "different
route." Revisit scope once the above has been tried with a real wallet.

Wallet model decided: external, not embedded. Shape:

- `wagmi` + `viem`, Robinhood Chain testnet (`46630`) configured as a
  custom chain
- Read path: `getMarket(id)` for pool/status, Chainlink `latestRoundData()`
  for live price — replaces the mock `marketStore`/`chainStore` reads
- Write path: `bet` / `claim` / `refund` as real signed transactions
  (`bet` needs an ERC20 `approve` first — two separate signatures/txs per
  bet unless/until a max-allowance-once pattern is added)
- Keep the mock mode reachable (e.g. a toggle or a separate route) so
  there's always a working demo even if the testnet contract has issues —
  don't delete the simulation, add the real mode alongside it
- `wagmi`'s `injected()` connector with EIP-6963 multi-provider discovery,
  so the connect flow lists both MetaMask and Phantom (and any other
  detected EIP-1193 wallet) for the user to pick — no extra per-wallet code
  needed, Phantom exposes a standard EIP-1193 provider like MetaMask does.
  WalletConnect (for mobile wallets) needs a free Project ID from a real
  account holder, add later if needed

## 4. Security pass

- Review the contract again once permissionless creation + the feed-
  allowlist mitigation are in
- Even testnet-only, this is publicly deployed code people will interact
  with — a review before real usage, not after an incident
- Decide the mainnet bar separately — different, higher standard (audit,
  legal/compliance conversation we've deliberately parked so far)

## Explicitly not in this phase

- Mainnet deployment
- Real (non-testnet) funds
- Legal/regulatory review — resurfaces once there's a real mainnet date,
  not before
