# Native ETH production rollout

Status: implementation is on `dima/gonochki`; no native replacement contract is
deployed. The existing USDG contracts and keepers remain live and must retain
claim/refund access throughout the rollout.

## Current progress — 2026-09-25

- Current `origin/main` changes are merged into the feature branch, including
  Multicall3 batching and last-known Race/Arena cards on transient read errors.
- The AssetRace deployment script reuses and validates the existing
  `SignedPoolRaceOracle`; it cannot silently create a second oracle.
- A combined Foundry rehearsal deploys all three native products against one
  signed oracle and completes both resolve/claim and cancel/refund lifecycles.
- Full validation currently passes: 180 Forge tests, 128,000 invariant calls and
  93 Node tests, plus registry/build/lint/diff gates.
- Production guardrail values are not approved yet. The ±25% policy is a
  recommendation for review, not a deployment input.
- No chain-4663 simulation, broadcast, VPS change or `main` merge has occurred.

## Non-negotiable boundaries

- Wagers, payouts, refunds and fees use native ETH directly. No WETH and no swap.
- Stock settlement prices remain StockToken/USDG; Meme settlement sources remain
  their reviewed WETH/native-ETH pools. Oracle identities and endpoint rules do
  not change.
- New frontend bindings must never point at a USDG contract. Build-time and
  runtime denylisting enforce this for every known legacy address.
- Never disable legacy keepers or `/onchain/legacy` until all old games are
  terminal and their indefinite claim/refund paths remain available.
- Production web deploys come only from `main` through `/opt/robinhood-predict`.
  Do not point nginx at an ad-hoc `dist-*` directory.
- Private keys and credential-bearing RPC URLs stay outside the repository and
  outside agent-visible commands/output.

## Execution stages

1. **Release candidate.** Keep `dima/gonochki` synchronized with `main`; pass
   focused and full Forge, invariants, Node, registry, build, lint, diff and
   desktop/mobile visual gates. Reuse the deployed `SignedPoolRaceOracle`.
2. **Wei guardrails.** Select a public ETH/USD reference price and an explicitly
   approved volatility corridor. Generate constructor/config values with
   `node scripts/native-eth-deployment-caps.mjs --eth-usd <price> --buffer-bps <bp>`.
   The UI still enforces exact $1–$50 stakes from the live cached quote; the
   onchain values are only approximate safety guardrails.
3. **Local lifecycle rehearsal.** Deploy all three replacements against one
   local signed-pool oracle and exercise PredictionMarket, AssetRace and
   PriceArena from entry through resolve/cancel and claim/refund. Confirm one
   payable wager transaction and no ERC-20 approval.
4. **No-broadcast chain-4663 simulation.** At an exact reviewed commit, simulate
   deploy/config calls and record bytecode, constructor args, public roles,
   oracle ids, gas estimates and expected postconditions. This is not authority
   to broadcast.
5. **Mainnet deployment.** With separate explicit approval, deploy and configure
   PredictionMarket, AssetRace, then PriceArena. After every transaction verify
   code, owner, caps, existing oracle/signer identity and complete asset bindings.
   Do not switch the public frontend yet.
6. **Tiny-value canary.** With separate transaction approval, run complete real
   lifecycles for all three products, including keeper settlement and both
   claim/refund paths where applicable. Stop on any accounting/event mismatch.
7. **Service and frontend canary.** Update public contract bindings and keeper/
   share-preview addresses, preserve the single paid-Alchemy routing and shared
   ETH/USD cache, then validate the production-shaped build on desktop/mobile.
   Keep USDG recovery visible and services available.
8. **Release to main.** After final review and explicit merge approval, merge the
   exact canary commit, deploy only from the canonical VPS checkout, verify the
   domain and GitHub Pages, and monitor the first real transactions. Roll back
   frontend/service bindings on anomalies; never hide legacy recovery.

## Guardrail policy

The recommended starting corridor is ±25% around the ETH/USD reference price.
For that corridor the calculator sets:

- the onchain minimum to the wei required for $1 at the upper price bound;
- every $50 maximum to the wei required for $50 at the lower price bound;
- the PredictionMarket total owner seed cap to the same buffered maximum.

This keeps every UI-valid $1–$50 amount admissible while ETH/USD remains inside
the approved corridor. It deliberately does not turn ETH/USD into an onchain
oracle dependency. The exact corridor and generated wei values are a production
risk decision and must be approved immediately before deployment.

## Stop conditions

Stop before broadcast or frontend switching if any address matches a legacy
USDG deployment, the existing signed oracle/signer identity differs, a registry
binding is incomplete, the reference quote is stale/outside its approved
corridor, any full validation gate fails, or legacy claim/refund access cannot be
demonstrated.
