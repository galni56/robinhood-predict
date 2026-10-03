# Prophet on Solana

Anchor workspace for the Solana port. Plan and decisions:
[`docs/SOLANA_MIGRATION.md`](../docs/SOLANA_MIGRATION.md).

| Program | Status |
|---|---|
| `prophet_games` | Asset Race + Price Arena in one program (shared admin, oracle key, asset registry, stake currencies, treasury, creator earnings). Implemented, localnet-tested. Not deployed. |
| `nickname_registry` | Implemented, localnet-tested. Not deployed. Kept separate on purpose: a bug there cannot touch game funds. |
| `pool_attestation` (crate) | Shared Ed25519 pool-price attestation verification. |
| `stake_funds` (crate) | Shared native-SOL / SPL / Token-2022 stake movement and vault checks. |

## Build and test (WSL)

The toolchain lives in WSL (Ubuntu, user `dev`). Build artifacts go to a
WSL-native target dir — much faster than `/mnt/c`, and it keeps the program
keypairs (`*-keypair.json`) out of the repository. Release builds use
`opt-level = "z"`: program bytes are paid for as rent.

```bash
wsl
cd /mnt/c/Users/Legion/robinhood-predict/solana
export CARGO_TARGET_DIR=$HOME/prophet-target
anchor build              # .so + IDL in $CARGO_TARGET_DIR/{deploy,idl}
cargo test --workspace    # LiteSVM integration tests (needs a prior anchor build)
```

## Asset Race in one paragraph

Port of `contracts/src/AssetRace.sol`. Each race is a PDA that also escrows
its native-SOL stakes. P0 and P1 come from one Ed25519-signed attestation per
boundary (all assets, same slot pair), verified by reading the Ed25519
precompile instruction placed immediately before `start_race` /
`resolve_race`. Fees: `fee_bp` of the losing pool (capped at 10%), split 50/50
between the race creator (pull-based `CreatorEarnings`) and the protocol
`Treasury`. Stakes are native SOL or any admin-accepted plain SPL / Token-2022 mint
(`set_stake_mint`); token stakes sit in the game PDA's associated token account.

### Attestation message (Borsh)

`domain: [u8;8] = "PRPHPOOL"`, `version: u8 = 1`, `program_id`,
`target_timestamp: i64`, `prev_slot`, `prev_blockhash`, `prev_block_time`,
`next_slot`, `next_parent_slot`, `next_parent_blockhash`, `next_block_time`,
`entries: Vec<{ price_source: Pubkey, price: u64, decimals: u8 }>`.
Prices are quoted in USD (pools paired with USDC). Use a different signer key per cluster so devnet
attestations can never be replayed on mainnet.
