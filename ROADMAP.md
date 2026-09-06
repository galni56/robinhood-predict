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

**Source/deployed drift (2026-09-06):** the security self-review in
`contracts/CLAUDE.md` §1 added `nonReentrant` to `createMarket` *after*
this deploy — the live testnet contract above doesn't have that guard yet
(low real risk, doesn't change the ABI, purely internal). Redeploy again
before this is treated as the reference version if that matters for
whatever's being tested.

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

**Update 2026-09-06 — multi-market support added:** `/onchain` is now three
routes, not one hardcoded page:
- `/onchain` — `OnchainMarketsListPage.tsx`: reads `marketCount` then
  batch-reads every market via `useReadContracts` (not one `useReadContract`
  per market — avoids a hook-per-dynamic-item problem), plus each unique
  feed's `decimals()`/`latestRoundData()` for display. Shows the same
  "Awaiting Counter-Bets" / cancelled badges as the mock list.
- `/onchain/:id` — the original single-market page (`OnchainMarketPage.tsx`),
  now parameterized by route instead of a hardcoded `MARKET_ID = 0n`.
- `/onchain/create` — `OnchainCreateMarketPage.tsx`: real `createMarket` tx
  (target price + deadline preset). Price feed isn't user-choosable — there's
  no on-chain way to enumerate the owner's allowlist (it's a mapping, not a
  list), so the form uses the one feed known to be allowlisted
  (`DEFAULT_PRICE_FEED_ADDRESS` in `src/chain/contracts.ts`). Revisit if/when
  more feeds get allowlisted.

Verified in a browser (list renders market #0 with live price, detail page
navigates correctly, create page correctly gates on wallet connection) —
zero console errors. Still not done: an actual wallet-signed transaction
(connect/approve/bet/claim/create) has never been exercised with a real
MetaMask/Phantom session, only read paths are confirmed live. No mock/real
mode toggle beyond the separate route, as before.

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

## 3.5. Time-weighted early-bet mechanic — done (2026-09-06)

Motivation: plain parimutuel doesn't penalize waiting until a market's trend
is obvious before betting — an "informed late bettor" gets the same odds as
someone who took real risk early. Added on request:

- [x] Betting closes at `BETTING_WINDOW_BP` (6667 = 2/3) of a market's life —
      e.g. a 15-minute market takes bets for 10 minutes, then just waits 5
      minutes for resolution (proportional to any market's own duration, not
      a fixed number of minutes)
- [x] A winning bet's *share of the losing pool* (never its own principal)
      is weighted from `MAX_WEIGHT_BP` (2x, the instant betting opens) down
      to `MIN_WEIGHT_BP` (0.5x, right as betting closes) — linear decay
- [x] Applies uniformly to organic bets and house/system seed liquidity
      (seed lands at elapsed=0, always gets max weight)
- [x] Contract: 28/28 Foundry tests, including a live inequality check
      (two equal stakes, same side, different bet time → early one pays more)
- [x] Mock: mirrors the exact same math in JS (`marketStore.ts`), verified
      live in a browser across three separate mock accounts (early/late/
      funder) — early bettor's weight read ~1.98x right after betting,
      ~1.26x 30s into an 80s window, confirming the decay curve end to end
- [x] Both UIs (`/onchain` and mock `MarketDetailPage`) show a live "current
      bonus" readout before betting, and split the single deadline countdown
      into "betting closes in X" / "waiting for resolution in Y"
- [x] Redeployed the testnet contract to pick this up: `PredictionMarket`
      now at `0xE1BA3CBD9D6e5B88af2a3d283D11d7c88e4eC4a7` (bet token and
      price feed reused as-is), market #0 recreated, `/onchain` re-verified
      live against it with zero console errors

**Known limitation, accepted for now:** the weight is purely time-based, not
risk-based — it can't tell a genuine early risk-taker from someone who
rushes in at t=0 on a market whose outcome was already obvious at creation.
It nudges behavior in the right direction without fully solving the
problem — see the AMM alternative below for the fuller fix.

## 3.6. Future: AMM-style continuous pricing (not started)

The industry-standard fix for the same problem the mechanic above only
partially solves: give every market a moving price (constant-product or
LMSR market maker, like Polymarket/Augur/Kalshi) instead of two static
pools. Price naturally rises as one side gets bought, so betting after a
trend is obvious costs more automatically — no hand-tuned decay curve
needed.

This is a ground-up replacement of the market mechanic, not an incremental
change, and was deliberately deferred rather than done alongside 3.5:

- New share-token model (ERC1155 or per-market ERC20 pair) instead of a
  `stakes` mapping — shares mint on buy, burn on redeem
- Pricing via constant-product curve or LMSR (LMSR needs a fixed-point math
  library for `ln`/`exp` — not native to Solidity)
- LP-liquidity subsystem (LP tokens, LP fees separate from protocol fee,
  liquidity withdrawal) replacing today's "house seed liquidity"
- Slippage protection on buys/sells
- Every current mechanic tied to `stakes`/`poolYes`/`poolNo` needs
  rethinking or dropping: one-sided cancellation, one-bet-per-side, the
  early-bet weight above — none of these map directly onto a share-token AMM
- Full new Foundry test suite; full `/onchain` and mock frontend rewrite
  (swap-with-slippage UX instead of "read the pool, place a bet")
- Meaningfully higher security bar — AMM/bonding-curve math is where most
  real-world DeFi exploits happen (rounding errors, share-mint bugs,
  flash-loan price manipulation on thin single-market liquidity)

Realistic scope: days, not hours — treat as its own project phase with its
own security review, not something to fit alongside other work.

## Explicitly not in this phase

- Mainnet deployment
- Real (non-testnet) funds
- Legal/regulatory review — resurfaces once there's a real mainnet date,
  not before
