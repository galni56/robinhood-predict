use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

#[constant]
pub const TREASURY_SEED: &[u8] = b"treasury";

#[constant]
pub const ASSET_SEED: &[u8] = b"asset";

#[constant]
pub const ARENA_SEED: &[u8] = b"arena";

#[constant]
pub const CREATOR_SEED: &[u8] = b"creator";

pub const BP_DENOMINATOR: u64 = 10_000;
/// 2% of the losing half's stakes.
pub const FEE_BP: u16 = 200;
/// Half of every fee goes to the arena creator, half to Prophet.
pub const CREATOR_FEE_SHARE_BP: u64 = 5_000;

pub const LOBBY_DURATION: i64 = 10 * 60;
pub const SUPPORTED_DURATIONS: [i64; 4] = [60, 5 * 60, 15 * 60, 60 * 60];
/// After this long past the deadline without a resolve, anyone may cancel.
pub const RESOLUTION_GRACE: i64 = 60 * 60;
/// The deadline price must come from a block at most this old.
pub const MAX_PRICE_STALENESS: i64 = 60;

pub const MIN_PARTICIPANTS: usize = 2;
pub const MAX_PARTICIPANTS: usize = 10;
pub const MIN_ACCURACY_MULTIPLIER_BP: u64 = 10_000;
pub const MAX_ACCURACY_MULTIPLIER_BP: u64 = 30_000;

/// Upper bound on the configurable per-player stake. Keeps every payout
/// product (pool x score) far below 2^128.
pub const MAX_STAKE_CAP: u64 = 10_000 * 1_000_000_000;

pub const MAX_TITLE_BYTES: usize = 64;
pub const MAX_PRICE_DECIMALS: u8 = 18;
pub const NO_RANK: u8 = 0;

/// Stake-mint sentinel meaning "native SOL held as lamports".
pub const NATIVE_SOL: Pubkey = Pubkey::new_from_array([0u8; 32]);

pub use pool_attestation::{ATTESTATION_DOMAIN, ATTESTATION_VERSION};
