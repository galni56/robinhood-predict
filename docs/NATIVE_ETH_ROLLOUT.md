# Native ETH production rollout

Status: the corrected PredictionMarket, AssetRace and PriceArena are deployed/
configured. Tiny-value canaries and public frontend/service binding remain
pending. The first native PredictionMarket deployment is superseded and unused.
Earlier USDG deployments contain only owner test activity; the owner waived
recovery and the release does not expose or automate those contracts. See
`NATIVE_ETH_MAINNET_DEPLOYMENT.md` for the complete transaction record.

## Current progress — 2026-09-25

- Current `origin/main` changes are merged into the feature branch, including
  Multicall3 batching and last-known Race/Arena cards on transient read errors.
- The AssetRace deployment script reuses and validates the existing
  `SignedPoolRaceOracle`; it cannot silently create a second oracle.
- A combined Foundry rehearsal deploys all three native products against one
  signed oracle and completes both resolve/claim and cancel/refund lifecycles.
- Full validation after release-role hardening passed: 185 Forge tests,
  128,000 invariant calls and 98 Node tests, plus registry/build/lint/diff gates.
- The public deployment manifest is generated directly from the validated
  registry and rejects malformed addresses, pool ids, mixed validation profiles,
  duplicate bindings and unexpected production asset counts.
- Broad fixed safety limits are approved: `0.0001 ETH` minimum where required
  and `0.1 ETH` maximum. Live `$1–$50` enforcement remains in the frontend.
- A no-broadcast fork simulation with those limits and the approved existing
  project owner passed at chain-4663 block `72035407`. See
  `NATIVE_ETH_SIMULATION_REPORT.md`.
- The exact human-run deployment sequence, public inputs, read-only
  postconditions and hard stop before canary/service switching are in
  `NATIVE_ETH_DEPLOYMENT_OPERATOR_PACKET.md`.
- Deployment/configuration broadcasts completed and all public postconditions
  passed. No canary, VPS/service/frontend change or `main` merge has occurred.

## Non-negotiable boundaries

- Wagers, payouts, refunds and fees use native ETH directly. No WETH and no swap.
- Stock settlement prices remain StockToken/USDG; Meme settlement sources remain
  their reviewed WETH/native-ETH pools. Oracle identities and endpoint rules do
  not change.
- New frontend bindings must never point at a USDG contract. Build-time and
  runtime denylisting enforce this for every known legacy address.
- Known USDG contract addresses remain denylisted, but no legacy route, ABI or
  keeper remains part of the supported product.
- Production web deploys come only from `main` through `/opt/robinhood-predict`.
  Do not point nginx at an ad-hoc `dist-*` directory.
- Private keys and credential-bearing RPC URLs stay outside the repository and
  outside agent-visible commands/output.

## Execution stages

1. **Release candidate.** Keep `dima/gonochki` synchronized with `main`; pass
   focused and full Forge, invariants, Node, registry, build, lint, diff and
   desktop/mobile visual gates. Reuse the deployed `SignedPoolRaceOracle`.
2. **Wei safety fuses.** Generate the approved fixed values with
   `node scripts/native-eth-deployment-caps.mjs`. The UI enforces the live
   equivalent of $1–$50 in either USD-input or ETH-input mode; the contract
   limits only reject dust and catastrophically large values. Generate and
   review the complete public configuration from the same registry with
   `node scripts/native-eth-deployment-manifest.mjs --owner-address <address> --oracle-address <address> --price-signer-address <address>`.
   The manifest rejects a missing/zero role and any owner/oracle/signer overlap.
   Pass the reviewed owner to every deploy/config dry-run as the public
   `EXPECTED_OWNER_ADDRESS`. The scripts derive the signing account from the
   operator key and stop before broadcast if it differs; configuration also
   checks the deployed contract's `owner()`. Oracle-consuming paths verify the
   reviewed oracle bytecode address and its onchain `TRUSTED_SIGNER`.
3. **Local lifecycle rehearsal.** Deploy all three replacements against one
   local signed-pool oracle and exercise PredictionMarket, AssetRace and
   PriceArena from entry through resolve/cancel and claim/refund. Confirm one
   payable wager transaction and no ERC-20 approval.
4. **No-broadcast chain-4663 simulation.** At an exact reviewed commit, simulate
   deploy/config calls and record bytecode, constructor args, public roles,
   oracle ids, gas estimates and expected postconditions. This is not authority
   to broadcast. Use `SimulateNativeEthDeployment.s.sol`; it contains no
   broadcast cheatcode and reads only public manifest values, never a private key.
5. **Mainnet deployment — complete.** The corrected PredictionMarket, AssetRace
   and PriceArena are deployed/configured and their public postconditions pass.
   See `NATIVE_ETH_MAINNET_DEPLOYMENT.md`. The public frontend remains unbound.
6. **Tiny-value canary.** With separate transaction approval, run complete real
   lifecycles for all three products, including keeper settlement and both
   claim/refund paths where applicable. Stop on any accounting/event mismatch.
7. **Service and frontend canary.** Update public contract bindings and keeper/
   share-preview addresses, preserve the single paid-Alchemy routing and shared
   ETH/USD cache, then validate the production-shaped build on desktop/mobile.
   Rebind the existing keepers to native contracts; do not run parallel USDG
   services or expose a legacy recovery route.
8. **Release to main.** After final review and explicit merge approval, merge the
   exact canary commit, deploy only from the canonical VPS checkout, verify the
   domain and GitHub Pages, and monitor the first real transactions. Roll back
   frontend/service bindings on anomalies.

## Guardrail policy (fixed ETH safety fuse)

The live ETH/USD rate is not fixed: the shared server cache continues to refresh
it and the UI recalculates the reciprocal USD/ETH value for every wallet request.
Users may enter either currency, but the wallet always sends the exact selected
native ETH amount. The contract cannot read the server quote, so its immutable
wei limits are deliberately broad safety fuses rather than dollar enforcement:

- Race/Arena minimum initial stake: `0.0001 ETH` (`100000000000000 wei`);
- every wager maximum: `0.1 ETH` (`100000000000000000 wei`);
- PredictionMarket total owner seed cap: `0.1 ETH`.

The full `$1–$50` UI range fits inside those fuses while ETH/USD is approximately
`$500–$10,000`; this is an operational illustration, not an onchain price rule.
Before opening the wallet, all three wager flows compare the exact wei amount
with the deployed contract's limits and stop locally with a clear error if it is
outside them. This deliberately does not add an onchain ETH/USD dependency.

## Stop conditions

Stop before broadcast or frontend switching if any address matches a legacy
USDG deployment, the existing signed oracle/signer identity differs, a registry
binding is incomplete, the shared ETH/USD quote is stale, any full validation
gate fails, or the native rollback path is not ready.
