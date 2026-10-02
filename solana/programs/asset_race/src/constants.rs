use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

#[constant]
pub const TREASURY_SEED: &[u8] = b"treasury";

#[constant]
pub const ASSET_SEED: &[u8] = b"asset";

#[constant]
pub const RACE_SEED: &[u8] = b"race";

#[constant]
pub const POSITION_SEED: &[u8] = b"position";

#[constant]
pub const CREATOR_SEED: &[u8] = b"creator";

pub const BP_DENOMINATOR: u64 = 10_000;
/// Half of every fee goes to the race creator, half to Prophet.
pub const CREATOR_FEE_SHARE_BP: u64 = 5_000;
/// Hard ceiling on the losing-pool fee (10%), independent of admin settings.
pub const MAX_FEE_BP: u16 = 1_000;
pub const RETURN_SCALE: u128 = 1_000_000_000_000_000_000;

pub const MIN_ASSETS_PER_RACE: usize = 2;
pub const MAX_ASSETS_PER_RACE: usize = 6;
pub const MAX_TITLE_BYTES: usize = 64;
pub const MAX_DURATION_PRESETS: usize = 16;
pub const MAX_PRICE_DECIMALS: u8 = 18;
pub const NO_WINNER: u8 = u8::MAX;

/// Stake-mint sentinel meaning "native SOL held as lamports". Any other value
/// will name an SPL mint once token stakes are enabled.
pub const NATIVE_SOL: Pubkey = Pubkey::new_from_array([0u8; 32]);

pub use pool_attestation::{ATTESTATION_DOMAIN, ATTESTATION_VERSION};
