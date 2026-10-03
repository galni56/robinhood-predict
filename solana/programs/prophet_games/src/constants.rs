use anchor_lang::prelude::*;

// ------------------------------------------------------------------ seeds

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

#[constant]
pub const TREASURY_SEED: &[u8] = b"treasury";

#[constant]
pub const STAKE_MINT_SEED: &[u8] = b"stake_mint";

#[constant]
pub const ASSET_SEED: &[u8] = b"asset";

#[constant]
pub const CREATOR_SEED: &[u8] = b"creator";

#[constant]
pub const RACE_SEED: &[u8] = b"race";

#[constant]
pub const POSITION_SEED: &[u8] = b"position";

#[constant]
pub const ARENA_SEED: &[u8] = b"arena";

// ----------------------------------------------------------------- shared

pub const BP_DENOMINATOR: u64 = 10_000;
/// Half of every fee goes to the game creator, half to Prophet.
pub const CREATOR_FEE_SHARE_BP: u64 = 5_000;
pub const MAX_TITLE_BYTES: usize = 64;
pub const MAX_PRICE_DECIMALS: u8 = 18;
/// Upper bound on any configured per-wallet stake, in base units of any
/// stake mint. Keeps every payout product far below 2^128.
pub const MAX_STAKE_CAP: u64 = 1_000_000_000_000_000;

/// Stake-mint sentinel meaning "native SOL held as lamports".
pub use stake_funds::NATIVE_SOL;

pub use pool_attestation::{ATTESTATION_DOMAIN, ATTESTATION_VERSION};

// ------------------------------------------------------------- Asset Race

/// Hard ceiling on a race's losing-pool fee (10%), independent of admin settings.
pub const MAX_FEE_BP: u16 = 1_000;
pub const RETURN_SCALE: u128 = 1_000_000_000_000_000_000;
pub const MIN_ASSETS_PER_RACE: usize = 2;
pub const MAX_ASSETS_PER_RACE: usize = 6;
pub const MAX_DURATION_PRESETS: usize = 16;
pub const NO_WINNER: u8 = u8::MAX;

// ------------------------------------------------------------ Price Arena

/// 2% of the losing half's stakes.
pub const ARENA_FEE_BP: u16 = 200;
pub const ARENA_LOBBY_DURATION: i64 = 10 * 60;
pub const ARENA_DURATIONS: [i64; 4] = [60, 5 * 60, 15 * 60, 60 * 60];
/// After this long past the deadline without a resolve, anyone may cancel.
pub const ARENA_RESOLUTION_GRACE: i64 = 60 * 60;
/// The deadline price must come from a block at most this old.
pub const ARENA_MAX_PRICE_STALENESS: i64 = 60;
pub const MIN_PARTICIPANTS: usize = 2;
pub const MAX_PARTICIPANTS: usize = 10;
pub const MIN_ACCURACY_MULTIPLIER_BP: u64 = 10_000;
pub const MAX_ACCURACY_MULTIPLIER_BP: u64 = 30_000;
pub const NO_RANK: u8 = 0;
