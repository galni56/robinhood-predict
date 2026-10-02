use anchor_lang::prelude::*;

use crate::constants::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Category {
    Stock,
    Meme,
    Crypto,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum ArenaStatus {
    Open,
    Resolved,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum CancelReason {
    None,
    InsufficientParticipants,
    StaleDeadlinePrice,
    ResolutionWindowExpired,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    /// Two-step admin handover; `Pubkey::default()` when none is pending.
    pub pending_admin: Pubkey,
    /// Ed25519 key whose pool attestations new arenas will trust.
    pub oracle_signer: Pubkey,
    /// Pauses only creation and new entries. Resolution, claims and refunds stay open.
    pub paused: bool,
    pub arena_count: u64,
    pub bump: u8,
}

/// An accepted stake currency: native SOL (`NATIVE_SOL`) or an SPL mint, with
/// the per-player stake bounds snapshotted into each new arena.
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

/// Creator revenue for one (stake mint, creator). Pull-based.
#[account]
#[derive(InitSpace)]
pub struct CreatorEarnings {
    pub creator: Pubkey,
    pub stake_mint: Pubkey,
    pub amount: u64,
    pub total_earned: u64,
    pub bump: u8,
}

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
pub struct Entry {
    pub player: Pubkey,
    /// Not secret: account data is public. Clients hide it during the lobby.
    pub prediction: u64,
    pub stake: u64,
    pub prediction_updated_at: i64,
    /// Arena-local order of the last prediction change; lower ranks first on
    /// equal error. A pure top-up keeps it.
    pub prediction_seq: u32,
    pub payout: u64,
    /// 1-based final rank, `NO_RANK` until resolved.
    pub rank: u8,
    pub accuracy_multiplier_bp: u32,
    pub settled: bool,
}

/// One arena. The account itself escrows every native-SOL stake placed on it,
/// and holds all (at most ten) entries so resolution fits in one transaction.
#[account]
#[derive(InitSpace)]
pub struct Arena {
    pub id: u64,
    pub asset_id: [u8; 32],
    pub price_source: Pubkey,
    pub price_decimals: u8,
    pub category: Category,
    pub creator: Pubkey,
    pub stake_mint: Pubkey,
    /// Snapshotted at creation so later signer rotation cannot affect this arena.
    pub oracle_signer: Pubkey,
    pub status: ArenaStatus,
    pub cancel_reason: CancelReason,
    #[max_len(MAX_TITLE_BYTES)]
    pub title: String,
    pub created_at: i64,
    pub starts_at: i64,
    pub deadline: i64,
    pub duration: i64,
    pub resolved_at: i64,
    pub fee_bp: u16,
    pub min_stake: u64,
    pub max_stake: u64,
    pub total_pool: u64,
    pub final_price: u64,
    pub final_slot: u64,
    pub final_price_time: i64,
    pub winner_count: u8,
    pub protocol_fee: u64,
    pub creator_fee: u64,
    /// Payouts or refunds still owed to players from this escrow.
    pub remaining_liability: u64,
    pub next_prediction_seq: u32,
    #[max_len(MAX_PARTICIPANTS)]
    pub entries: Vec<Entry>,
    pub bump: u8,
}

impl Arena {
    pub fn entry_index(&self, player: &Pubkey) -> Option<usize> {
        self.entries.iter().position(|entry| entry.player == *player)
    }
}
