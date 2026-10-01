# Prophet owner-wallet buyback and burn release

## Active mainnet deployment

The replacement contracts were deployed successfully from the reviewed token
deployer on Robinhood Chain mainnet, chain ID `4663`, on 2026-10-01.

| Contract | Address | Deployment transaction | Block |
| --- | --- | --- | ---: |
| `ProphetOwnerBuybackBurnExecutor` | `0x7B71d233FFFD6c354A4eD83816Ef7b3Dffb88D4c` | `0x5fc8dbea4e6105099b32ee9525b484cea913cdb575e0c836705faa17f40882c4` | `77470793` |
| `ProphetV4BuybackExecutor` | `0x8BA56F49391470EF6729D5fDFfC02D6fa6ffDD85` | `0x5135a0d01815d947186fb8ad3b8083ef9845ed2713d6652e73c5f41a84fbf4d4` | `77470799` |

The V4 binding transaction is
`0x80c213c7ab4f4149f77d2068950f45840b5725ed011e786109696336fbffab7f`
at block `77470804`.

Post-deploy reads confirmed:

- owner and fee recipient:
  `0x821758584b2155c93713cE4991A7D9b447d0ccd8`;
- maximum buyback per call: `0.05 ETH`;
- buybacks paused: `true`;
- bound token: zero address;
- parent and V4 executor point to each other as expected.

## Prophet token launch

The live PONZ V2 launch was verified from public mainnet state on 2026-10-01:

| Field | Value |
| --- | --- |
| Token | `0x410f2bD350F3d88795cfC29b61cA664C30987Efd` |
| Name / symbol | `Prophet Markets` / `PROPHET` |
| Launch transaction | `0xb03b2deead7a97332c011f0678542bae8662a9a4a855c61f407c52bf66049843` |
| Launch block | `77555716` |
| Deployer and creator fee recipient | `0x821758584b2155c93713cE4991A7D9b447d0ccd8` |
| Curve | `0x4e520DAe47102c047e947BBec173026ecD01ef40` |
| Quote | Native ETH |
| Creator tax | `300` basis points |
| PONZ built-in buyback | Disabled |
| Current phase at verification | `PoolCreated` / graduated V4 pool |

The release pins both the token address and launch block. The keeper refuses a
different token, deployer, fee recipient, executor or accounting start block.
Read-only `bindToken` simulation and a live V4 quoter simulation both passed.
An explicit mainnet-fork test also bound the live token, bought it through the
current V4 pool and confirmed that the executor burned the complete output and
reduced token `totalSupply`. No transaction was broadcast by that test.

## Superseded mainnet deployment

These contracts were deployed on Robinhood Chain mainnet, chain ID `4663`, on
2026-10-01 using the website deployer. They are superseded because the required
fee recipient is now the separate token deployer. They remain paused and unbound
and must never be used for the token launch.

| Contract | Address | Deployment transaction | Block |
| --- | --- | --- | ---: |
| `ProphetOwnerBuybackBurnExecutor` | `0x075b9A6FbF54E5554Ab7b039b4E5029B9b9132DE` | `0xe43c692397aca803ec9aefe1662a0fc6de07b93a831b955a0fe532ee371add0d` | `77457125` |
| `ProphetV4BuybackExecutor` | `0x0c4a8b38574A7DdC56F15c47EC495A2adF246325` | `0xcd8a53f7457a4596614e3a3e6064749e7ee0bfc110304edff87bdc7df2d74a72` | `77457131` |

The V4 binding transaction is
`0x6d8e28e79ce63f0e5d5c6d2963e5029f3aea3e9abac6fbd0874a620e0f4f9e8a`
at block `77457137`.

Post-deploy reads confirmed the superseded deployment is inert:

- owner and fee recipient:
  `0x6d68157bEDa778346Dd27f8Ef4F917f69aD2Dc41`;
- maximum buyback per call: `0.05 ETH`;
- buybacks paused: `true`;
- bound token: zero address;
- parent and V4 executor point to each other as expected.

## Objective

Send all PONZ V2 creator commission to the dedicated token deployer EOA
`0x821758584b2155c93713cE4991A7D9b447d0ccd8` first. An automatic service claims
that revenue, spends exactly 15% of cumulative credited native commission buying
the Prophet token, and burns every token received.

This package does not deploy or change the Prophet game contracts.

## Fixed policy

- Chain: Robinhood Chain mainnet, chain id `4663`.
- Launch venue: PONZ V2.
- Quote asset: native ETH only.
- PONZ `creatorFeeRecipient`: token deployer
  `0x821758584b2155c93713cE4991A7D9b447d0ccd8`.
- Buyback share: `1500` basis points of cumulative native FeeEscrow credits.
- PONZ built-in `buybackEnabled`: `false` because it vests instead of burning.
- Burn method: call the PONZ token's `burn(uint256)` after each purchase.
- Small obligations: accumulate until the automation threshold is reached.
- Every write: fresh quote, slippage protection and complete call simulation.
- Maximum buy size: enforced onchain by `maxBuybackPerCall`.

## Money flow

```text
PONZ trading fees
       |
       v
PONZ FeeEscrow credit for deployer
       |
       v
deployer EOA receives 100% on claim
       |
       +---- 85% remains in the deployer wallet
       |
       +---- 15% sent by deployer automation
                    |
                    v
       ProphetOwnerBuybackBurnExecutor
                    |
                    v
              buy and burn
```

There is no separate burn wallet. The executor holds purchased tokens only for
the duration of the transaction and burns them before the transaction completes.

## Components

### `ProphetOwnerBuybackBurnExecutor`

- Accepts buyback ETH only from the immutable deployer fee-recipient address.
- Validates that the bound PONZ launch pays creator fees to that address.
- Validates native ETH quote and disabled PONZ built-in buyback.
- Buys directly from the curve before graduation.
- Uses the reviewed V4 executor after graduation.
- Burns the complete token output in the same transaction.
- Returns any partial-fill ETH refund to the deployer wallet.
- Records cumulative actual ETH spent and tokens burned onchain.
- Starts paused.

### `ProphetV4BuybackExecutor`

- Accepts calls only from the parent buyback executor.
- Reconstructs the exact graduated PONZ pool from the factory record.
- Routes native ETH through the official PONZ hook and selected Universal Router.
- Returns all output and refunds to the parent executor.

### Owner-wallet automation

The automation runs with a protected deployer signer because an EOA cannot grant
a smart contract permission to pull arbitrary native ETH. It performs two
separate transactions:

1. Call `claim()` on the PONZ FeeEscrow so 100% reaches the deployer wallet.
2. Send the pending 15% to `executeBuyback`, which buys and burns the token.

The two-transaction gap is restart safe. The automation reconstructs cumulative
commission from confirmed FeeEscrow `Credited` events and subtracts the executor's
onchain `totalNativeSpent`. A process restart or failed second transaction cannot
silently erase the outstanding burn obligation.

If the deployer spends the reserved amount before the second transaction, the
automation stops and reports insufficient balance. It never substitutes a smaller
percentage silently.

## Required user inputs

Before deployment:

1. `BUYBACK_TOKEN_DEPLOYER_PRIVATE_KEY`
   - Protected key for the token deployer. It must derive to
     `0x821758584b2155c93713cE4991A7D9b447d0ccd8`.
   - The existing `PRIVATE_KEY` name is also supported as a fallback. Address
     validation is mandatory regardless of the variable name.
   - Never copy it into chat, source control or deployment logs.
2. `BUYBACK_MAX_PER_CALL_WEI` is optional.
   - The default is `50000000000000000` or `0.05 ETH`.

For activation:

4. A paid Robinhood Chain RPC suitable for historical log reads.
5. Explicit approval for the one-time token binding transaction.
6. Explicit approval to unpause and start the production automation.

Never send a private key in chat, a command, the repository or a support ticket.
The token deployer signing key must exist only in the protected deployment and keeper
environment. The npm buyback commands load the ignored `contracts/.env` file
when it exists. An environment variable supplied by the production service takes
precedence over that file.

Verify access and signer identity without a network request or exposing the key:

```bash
npm run check:buyback-signer
```

The command must report `MATCH` and the reviewed token deployer address before any
deployment or live keeper run.

## Step 1: deploy before the token launch

Simulation first:

```bash
cd contracts
forge script script/DeployProphetBuybackBurn.s.sol:DeployProphetBuybackBurn \
  --rpc-url robinhood_mainnet -vvv
```

Broadcast only after separate explicit authorization:

```bash
forge script script/DeployProphetBuybackBurn.s.sol:DeployProphetBuybackBurn \
  --rpc-url robinhood_mainnet --broadcast -vvv
```

Record the parent buyback executor and V4 executor addresses. The parent remains
paused. If the final owner differs from the deployer, that owner must call
`acceptOwnership()` before binding the token.

## Step 2: launch the token on PONZ

The launch transaction must use:

```text
creatorFeeRecipient = 0x821758584b2155c93713cE4991A7D9b447d0ccd8
buybackEnabled      = false
pairToken           = 0x0000000000000000000000000000000000000000
```

Add the deployed `ProphetOwnerBuybackBurnExecutor` to the launch's
`snipeTaxExemptions`. The executor receives tokens during pre-graduation buybacks,
so this avoids applying the opening anti-snipe tax to protocol burns.

The PONZ creator tax is a separate launch choice. Every native amount credited to
the deployer in FeeEscrow from the configured starting block is included in the
cumulative 15% calculation.

## Step 3: bind the token

The release defaults to the pinned token and executor addresses. If
`PROPHET_TOKEN_ADDRESS` is set, it must equal the pinned token. Simulate:

```bash
cd contracts
forge script script/BindProphetBuybackToken.s.sol:BindProphetBuybackToken \
  --rpc-url robinhood_mainnet -vvv
```

The bind fails unless the launch exists, uses the expected deployer recipient,
uses native ETH and has PONZ buyback disabled. Broadcast only after separate
explicit authorization.

## Step 4: preflight and enable

The keeper pins `BUYBACK_CREDIT_START_BLOCK` to `77555716`. The variable may be
omitted; if supplied, any other value is rejected. This prevents earlier unrelated
FeeEscrow credits to the same deployer from entering the Prophet burn calculation.

```bash
npm run preflight:buyback-burn
RUN_ONCE=true DRY_RUN=true npm run keeper:buyback-burn
```

Confirm:

- owner and fee recipient are correct;
- the token and curve match the launch receipt;
- the executor was included in launch snipe-tax exemptions;
- PONZ reports native quote and disabled built-in buyback;
- cumulative credit reconstruction starts at the exact launch block;
- the deployer keeps enough ETH to cover pending burns and gas;
- quotes and full-call simulation succeed.

Only then simulate the reviewed activation script:

```bash
cd contracts
BUYBACK_PAUSED=false forge script \
  script/SetProphetBuybackPause.s.sol:SetProphetBuybackPause \
  --rpc-url robinhood_mainnet -vvv
```

Broadcast it only after separate explicit authorization. The same script with
`BUYBACK_PAUSED=true` is the emergency pause path.

## Step 5: automation environment

```text
BUYBACK_RPC_URL=<paid Robinhood Chain RPC>
BUYBACK_EXECUTOR_ADDRESS=0x7B71d233FFFD6c354A4eD83816Ef7b3Dffb88D4c # optional default
BUYBACK_FEE_RECIPIENT_ADDRESS=0x821758584b2155c93713cE4991A7D9b447d0ccd8 # optional
BUYBACK_CREDIT_START_BLOCK=77555716 # optional, exact value enforced
BUYBACK_MIN_EXECUTION_WEI=5000000000000000
BUYBACK_SLIPPAGE_BPS=300
BUYBACK_POLL_INTERVAL_MS=30000
BUYBACK_RPC_CONFIRMATIONS=2
BUYBACK_LOG_BLOCK_RANGE=25000
BUYBACK_ALLOW_LIVE=true
DRY_RUN=false
BUYBACK_TOKEN_DEPLOYER_PRIVATE_KEY=<protected token deployer signer>
# Or use PRIVATE_KEY=<protected token deployer signer>
```

Run the service under the same protected process manager used by the existing
Prophet keepers. The process should restart automatically and alert on every
failed claim, quote, simulation or burn.

## Operational security

This owner-wallet requirement makes the deployer a hot signing wallet. Compromise
of its automation environment compromises the complete deployer balance and any
other authority held by that key. Reduce the risk as follows:

- Keep only required operating funds on the deployer wallet.
- Move unrelated admin rights to a multisig where possible.
- Use a dedicated protected host and secret store.
- Restrict RPC and process access.
- Alert on unexpected outgoing transactions and executor pauses.
- Never reuse this key in browser extensions or general-purpose scripts.

The executor itself cannot withdraw from the deployer wallet and cannot spend
more than the ETH explicitly attached to a signed call.

## Fee availability

PONZ fees accrue first on the curve or graduated hook. They become visible in
FeeEscrow only after a PONZ sweep. Confirm that the PONZ sweep operator is active.
The automation claims as soon as a native escrow balance appears.

## Failure behavior

- No token bound: report `awaiting-token`, no transaction.
- Executor paused: FeeEscrow claims still go to deployer, but no buyback runs.
- FeeEscrow balance present: claim 100% to deployer, then retry immediately.
- Pending 15% below threshold: keep accumulating.
- Deployer balance insufficient: stop and alert without reducing the obligation.
- PONZ record changes recipient or enables built-in buyback: fail closed.
- PONZ phase is `Swept`: wait for pool creation.
- Quote or full-call simulation fails: no broadcast.
- Price exceeds slippage: transaction reverts.
- Curve partially fills: refund returns to deployer and the unspent obligation
  remains visible because only actual spend increments `totalNativeSpent`.

## Validation commands

```bash
cd contracts
forge test --match-contract 'Prophet(OwnerBuybackBurnExecutor|V4BuybackExecutor)Test'
forge test --match-contract ProphetBuybackMainnetForkTest \
  --fork-url https://rpc.mainnet.chain.robinhood.com -vv
forge test

cd ..
npm run test:buyback-burn
npm run lint
npm run build
git diff --check
```

## Security status

The implementation has automated tests but no independent audit. A mainnet
release should use conservative limits and threshold, a paid archive-capable RPC,
continuous monitoring and an external review before commission volume becomes
material.
