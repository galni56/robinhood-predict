# Native ETH no-broadcast simulation report

Status: **provisional release-candidate evidence, not deployment approval**.

The authoritative simulation source is the commit containing this report. The
run used `SimulateNativeEthDeployment.s.sol`, which has no broadcast cheatcode
and reads no private key. All returned contract addresses are ephemeral local
fork addresses: they do not exist on Robinhood Chain and must never be used in
frontend, keeper or production configuration.

## Reproducibility anchor

- Date: 2026-09-25
- Fork chain ID: `4663`
- Fork block: `71839974`
- Registry: 10 enabled Stock assets and 13 enabled Meme assets
- Existing oracle: `0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7`
- Verified `TRUSTED_SIGNER`: `0x79F4991Ccc64Cbb8143fB61e4cBD49b8b64d3635`
- Provisional simulation owner: `0x6d68157bEDa778346Dd27f8Ef4F917f69aD2Dc41`

The owner above is the public owner of the prior AssetRace deployment and was
used only to exercise owner postconditions. It is not an approval to reuse that
address for the native deployment.

## Provisional economic inputs

The run used an ETH/USD reference of `$2,691.90` and the recommended but not yet
approved `±25%` corridor:

- `MAX_SEED_LIQUIDITY_WEI=24765654989660339`
- `MAX_STAKE_PER_SIDE_WEI=24765654989660339`
- `ASSET_RACE_MIN_STAKE_WEI=297187859875924`
- `ASSET_RACE_MAX_STAKE_PER_WALLET_WEI=24765654989660339`
- `PRICE_ARENA_MIN_STAKE_WEI=297187859875924`
- `PRICE_ARENA_MAX_STAKE_WEI=24765654989660339`
- fee: `200` bp

These values prove that the configuration is executable. They must be replaced
with a fresh quote-derived manifest after the corridor and final owner are
explicitly approved.

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
| Public configuration ABI hash | `0xdfaac9c16af857d7702f738bc25afac5c9591b2945a99e32b3a1d177b7b4c86a` |
| Prediction creation code hash | `0x2d59126aa6888c6c951c4ba98e6e36fd0c36c86b62ca33d44e33778ff012e231` |
| Prediction runtime code hash | `0x05e42c045695df3a3d9b868e7f445b9f8c42f04b5ca3a8d18933b4376eb4857d` |
| Prediction deployment simulation gas | `1,896,207` |
| AssetRace creation code hash | `0xf6a3651252324598814ed3e879d08354119d43845fbcf495006d49c7ff376395` |
| AssetRace runtime code hash | `0x0d6f480489f52a24e95fd2f20b2277e4070df2a8f7cd81caa4258f2b5c3ef65d` |
| AssetRace deployment simulation gas | `4,649,758` |
| PriceArena creation code hash | `0x240bd0f979f8240862cf213e59237be49a0d2f612cc3ef2c149ae3cc9b2ee512` |
| PriceArena runtime code hash | `0x4089fea10f8553736370da06f391a83a51065d4dcc2b30b1aa86dd7b837e8873` |
| PriceArena deployment simulation gas | `2,616,675` |
| Combined configuration simulation gas | `6,252,366` |

Gas figures are fork-simulation measurements, not fee quotes. Re-estimate each
real transaction immediately before any separately approved broadcast.

## Remaining gate

Approve the guardrail corridor and final public owner, fetch a fresh ETH/USD
quote, regenerate the manifest, and repeat this simulation on a new fixed block.
Only a matching final report may proceed to the separate deployment approval.
