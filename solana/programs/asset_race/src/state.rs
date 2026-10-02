use anchor_lang::prelude::*;

use crate::constants::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Category {
    Stock,
    Meme,
    Crypto,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Origin {
    Platform,
    Community,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum RaceStatus {
    Lobby,
    Betting,
    Running,
    Resolved,
    Cancelled,
    Void,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default, InitSpace)]
pub struct CommunityPolicy {
    pub lobby_duration: i64,
    pub betting_duration: i64,
    pub start_grace: i64,
    pub resolution_grace: i64,
    pub fee_bp: u16,
    pub min_active_contenders: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    /// Two-step admin handover; `Pubkey::default()` when none is pending.
    pub pending_admin: Pubkey,
    /// Ed25519 key whose pool attestations new races will trust.
    pub oracle_signer: Pubkey,
    /// Pauses only creation and new bets. Lifecycle, claims and refunds stay open.
    pub paused: bool,
    pub race_count: u64,
    pub community_policy_configured: bool,
    pub community_policy: CommunityPolicy,
    #[max_len(MAX_DURATION_PRESETS)]
    pub race_durations: Vec<i64>,
    pub bump: u8,
}

/// An accepted stake currency: native SOL (`NATIVE_SOL`) or an SPL mint.
/// Community races take their stake limits from here.
#[account]
#[derive(InitSpace)]
pub struct StakeMintConfig {
    pub mint: Pubkey,
    pub enabled: bool,
    pub min_stake: u64,
    pub max_stake: u64,
    pub bump: u8,
}

/// Fee balance for one stake mint: lamports above rent for native SOL, or the
/// balance of its vault (associated token account) for an SPL mint.
#[account]
#[derive(InitSpace)]
pub struct Treasury {
    pub stake_mint: Pubkey,
    pub accumulated_fees: u64,
    pub bump: u8,
}

/// Creator revenue for one (stake mint, creator). Pull-based so a resolve can
/// never fail because a creator's wallet cannot receive funds.
#[account]
#[derive(InitSpace)]
pub struct CreatorEarnings {
    pub creator: Pubkey,
    pub stake_mint: Pubkey,
    pub amount: u64,
    pub total_earned: u64,
    pub bump: u8,
}

/// Protocol-reviewed asset. `price_source` identifies the frozen pool the
/// collector prices from; attestation entries are keyed by it.
#[account]
#[derive(InitSpace)]
pub struct ApprovedAsset {
    pub asset_id: [u8; 32],
    pub category: Category,
    pub enabled: bool,
    pub price_source: Pubkey,
    pub price_decimals: u8,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Debug, InitSpace)]
pub struct RaceAsset {
    pub asset_id: [u8; 32],
    pub price_source: Pubkey,
    pub price_decimals: u8,
    pub active: bool,
    pub pool: u64,
    pub start_price: u64,
    pub end_price: u64,
    /// Percentage return scaled by `RETURN_SCALE`.
    pub return_value: i128,
}

/// One race. The account itself escrows every native-SOL stake placed on it.
#[account]
#[derive(InitSpace)]
pub struct Race {
    pub id: u64,
    pub category: Category,
    pub origin: Origin,
    pub status: RaceStatus,
    pub creator: Pubkey,
    pub stake_mint: Pubkey,
    /// Snapshotted at creation so later signer rotation cannot affect this race.
    pub oracle_signer: Pubkey,
    #[max_len(MAX_TITLE_BYTES)]
    pub title: String,
    pub lobby_end_time: i64,
    pub betting_window: i64,
    pub betting_start_time: i64,
    pub betting_end_time: i64,
    pub race_duration: i64,
    pub race_end_time: i64,
    pub start_grace: i64,
    pub resolution_grace: i64,
    pub resolved_at: i64,
    pub fee_bp: u16,
    pub min_active_contenders: u8,
    pub active_count: u8,
    pub winning_asset_index: u8,
    pub min_stake: u64,
    pub max_stake_per_wallet: u64,
    pub total_pool: u64,
    pub winning_pool: u64,
    pub distributable_losing_pool: u64,
    pub protocol_fee: u64,
    pub creator_fee: u64,
    /// Stakes and winnings still owed to bettors from this escrow.
    pub remaining_liability: u64,
    pub start_slot: u64,
    pub start_price_time: i64,
    pub end_slot: u64,
    pub end_price_time: i64,
    #[max_len(MAX_ASSETS_PER_RACE)]
    pub assets: Vec<RaceAsset>,
    #[max_len(MAX_ASSETS_PER_RACE)]
    pub lobby_adders: Vec<Pubkey>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub race: Pubkey,
    pub owner: Pubkey,
    pub asset_index: u8,
    pub stake: u64,
    pub bump: u8,
}
