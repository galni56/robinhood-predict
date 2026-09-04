# Roadmap to Real MVP

Target: PredictionMarket contract live on **Robinhood Chain testnet**, frontend
wired to it via a real wallet, people placing real (testnet) on-chain bets —
not the in-browser simulation. This doc is the shared source of truth for
what's decided, what's blocking, and what's next (Build&Launch team + Claude).

## 0. Blocking product decisions

Nothing in "Engineering" below that touches these can really start until
they're settled — either they get answered, or we explicitly build the
mock-only version and revisit later.

| Decision | Status | Why it blocks |
|---|---|---|
| Wallet model: external connect (MetaMask) vs embedded (platform-generated, exportable key) | **On hold** | Determines the entire frontend chain-integration approach (Phase 3) and whether we need an embedded-wallet SDK (Privy/Dynamic/Turnkey) |
| Memecoin / pump.fun-linked tokens in scope? | **Undecided** | Changes the token catalog and possibly the contract (would need a second market type) |
| Early cash-out mechanic (sell an open position before resolution) | **Needs design** | New pricing formula + new contract function; not started |
| Side-column layout on market page | **Waiting on design refs** | Pure UI, not blocking the chain work |

## 1. Contract ↔ mock parity (do first, cheap, no deploy yet)

The frontend already allows permissionless market creation and a $500
target cap. The contract does not — it still has `onlyOwner` on
`createMarket` and no cap. Deploying as-is would behave differently from
the product people have already seen. Fix before anything else:

- [ ] Remove `onlyOwner` from `createMarket` — anyone can create a market
- [ ] Add the $500 target cap on-chain (mirror `MAX_TARGET_PRICE`)
- [ ] **New risk from permissionless creation:** nothing stops
      `createMarket(fakeFeed, ...)` with an attacker-controlled price feed
      that reports whatever price they want — a rigged market. Needs a
      mitigation before this goes anywhere real:
      - simplest: allowlist of known-good Chainlink feed addresses in the
        contract (owner-maintained list, but market creation itself stays
        permissionless)
      - or: accept the risk for testnet-only, decide before mainnet
- [ ] Update/add Foundry tests for the above (permissionless creation, cap
      enforcement, rigged-feed scenario)
- [ ] Re-run full suite via Docker (see `contracts/CLAUDE.md`)

## 2. Real testnet deploy

Checklist already written in `contracts/CLAUDE.md` — execution paused
pending the wallet decision above, but the deploy itself doesn't actually
depend on that decision (a burner wallet for *deploying the contract* is
separate from *how end users connect*). Can run in parallel:

- [ ] You: burner wallet (`cast wallet new`, run yourself, never through Claude)
- [ ] You: fund it from a testnet faucet
- [ ] You: `contracts/.env` filled in yourself
- [ ] Claude: `DeployMockToken.s.sol` → `Deploy.s.sol` → `CreateMarket.s.sol`
      via Docker (`--env-file`, secrets never pass through Claude's context)
- [ ] Verify contract source on the Blockscout explorer

## 3. Wire the frontend to the real chain

Depends on the wallet-model decision. Rough shape either way:

- `wagmi` + `viem`, Robinhood Chain testnet (`46630`) configured as a
  custom chain
- Read path: `getMarket(id)` for pool/status, Chainlink `latestRoundData()`
  for live price — replaces the mock `marketStore`/`chainStore` reads
- Write path: `bet` / `claim` / `refund` as real signed transactions
- Keep the mock mode reachable (e.g. a toggle or a separate route) so
  there's always a working demo even if the testnet contract has issues —
  don't delete the simulation, add the real mode alongside it
- If external-wallet: `injected()` connector covers MetaMask with zero
  external accounts/keys needed; WalletConnect (for mobile wallets) needs a
  free Project ID from a real account holder, add later if needed
- If embedded: needs an SDK decision (Privy/Dynamic/Turnkey) — do not
  hand-roll key generation/storage for other people's funds

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
