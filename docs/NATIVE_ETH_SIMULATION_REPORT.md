# Native ETH no-broadcast simulation report

Status: **final release-candidate simulation evidence, not deployment approval**.

The authoritative simulation source is the commit containing this report. The
run used `SimulateNativeEthDeployment.s.sol`, which has no broadcast cheatcode
and reads no private key. All returned contract addresses are ephemeral local
fork addresses: they do not exist on Robinhood Chain and must never be used in
frontend, keeper or production configuration.

## Reproducibility anchor

- Date: 2026-09-25
- Fork chain ID: `4663`
- Fork block: `72035407`
- Registry: 10 enabled Stock assets and 13 enabled Meme assets
- Existing oracle: `0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7`
- Verified `TRUSTED_SIGNER`: `0x79F4991Ccc64Cbb8143fB61e4cBD49b8b64d3635`
- Approved existing project owner/deployer: `0x6d68157bEDa778346Dd27f8Ef4F917f69aD2Dc41`
- Existing keeper transaction account: `0xaF95287026339B51b1Ff45DC385b4D56F507634a`

The user approved reusing the existing project wallets. The owner above remains
the admin/deployer, the keeper remains a separate transaction account and the
price signer remains a separate signing role. No private key was read or used.

## Approved economic safety inputs

The run used the approved broad fixed native-ETH safety fuses. They are not
derived from a deployment-time ETH/USD quote:

- `MAX_SEED_LIQUIDITY_WEI=100000000000000000`
- `MAX_STAKE_PER_SIDE_WEI=100000000000000000`
- `ASSET_RACE_MIN_STAKE_WEI=100000000000000`
- `ASSET_RACE_MAX_STAKE_PER_WALLET_WEI=100000000000000000`
- `PRICE_ARENA_MIN_STAKE_WEI=100000000000000`
- `PRICE_ARENA_MAX_STAKE_WEI=100000000000000000`
- fee: `200` bp

The frontend independently enforces the live equivalent of `$1–$50` for both
USD and direct-ETH input. The contract values are only dust/catastrophic-value
safety fuses and do not make ETH/USD an onchain dependency.

## Verified postconditions

- all three simulated contracts are owned by the supplied owner;
- PredictionMarket points at the existing signed-pool oracle and has all 10
  Stock bindings with exact oracle IDs and 18 decimals;
- AssetRace has all 23 bindings with exact category, oracle, oracle ID,
  decimals, `maxPriceAge=60` and `maxEndpointLag=0`;
- AssetRace policy is `300/300/180/300`, timestamp skew `0`, fee `200` bp,
  minimum contenders `2`, with duration presets `60/300/900` seconds;
- PriceArena has the same 10 Stock and 13 Meme bindings and exact native-ETH
  stake caps;
- cross-product min/max caps are internally consistent;
- existing oracle bytecode and trusted signer were read from the fork;
- no transaction was signed, broadcast or submitted.

## Reproducibility hashes and simulation gas

| Item | Value |
|---|---:|
| Public configuration ABI hash | `0x38e4d088f8796536f071c69824cd7f1df92be590359273e230cf0f1f413dfd60` |
| Prediction creation code hash | `0x2d59126aa6888c6c951c4ba98e6e36fd0c36c86b62ca33d44e33778ff012e231` |
| Prediction runtime code hash | `0x89497de1953c2868c6f9a05bd08829dd18ca882b52db827469230dc24bc509c0` |
| Prediction deployment simulation gas | `1,896,183` |
| AssetRace creation code hash | `0xf6a3651252324598814ed3e879d08354119d43845fbcf495006d49c7ff376395` |
| AssetRace runtime code hash | `0x0d6f480489f52a24e95fd2f20b2277e4070df2a8f7cd81caa4258f2b5c3ef65d` |
| AssetRace deployment simulation gas | `4,649,758` |
| PriceArena creation code hash | `0x240bd0f979f8240862cf213e59237be49a0d2f612cc3ef2c149ae3cc9b2ee512` |
| PriceArena runtime code hash | `0xfba5ab1762124133301d4398231b60e543206eb7244a251d603c3f73d616f47a` |
| PriceArena deployment simulation gas | `2,616,639` |
| Combined configuration simulation gas | `6,252,330` |

Gas figures are fork-simulation measurements, not fee quotes. Re-estimate each
real transaction immediately before any separately approved broadcast.

## Remaining gate

Commit and review the exact release candidate containing this report. Deployment,
configuration and tiny-value lifecycle transactions still require a separate
explicit production approval; this simulation does not authorize them.
