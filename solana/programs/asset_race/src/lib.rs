//! Prophet Asset Race on Solana.
//!
//! Pari-mutuel races in which the active asset with the highest percentage
//! return between two signed DEX-pool price snapshots wins. Port of
//! `contracts/src/AssetRace.sol`; see `docs/SOLANA_MIGRATION.md`.

pub mod attestation;
pub mod constants;
pub mod error;
pub mod instructions;
pub mod math;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("H4fm2gjgc5bRcoXfAhnTXFpFJMijga43Czq5Z8yGXYKj");

#[program]
pub mod asset_race {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, oracle_signer: Pubkey) -> Result<()> {
        admin::handle_initialize(ctx, oracle_signer)
    }

    pub fn set_paused(ctx: Context<AdminConfig>, paused: bool) -> Result<()> {
        admin::handle_set_paused(ctx, paused)
    }

    pub fn set_oracle_signer(ctx: Context<AdminConfig>, oracle_signer: Pubkey) -> Result<()> {
        admin::handle_set_oracle_signer(ctx, oracle_signer)
    }

    pub fn set_community_policy(ctx: Context<AdminConfig>, policy: CommunityPolicy) -> Result<()> {
        admin::handle_set_community_policy(ctx, policy)
    }

    pub fn set_duration_preset(ctx: Context<AdminConfig>, duration: i64, enabled: bool) -> Result<()> {
        admin::handle_set_duration_preset(ctx, duration, enabled)
    }

    pub fn propose_admin(ctx: Context<AdminConfig>, new_admin: Pubkey) -> Result<()> {
        admin::handle_propose_admin(ctx, new_admin)
    }

    pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
        admin::handle_accept_admin(ctx)
    }

    pub fn set_approved_asset(
        ctx: Context<SetApprovedAsset>,
        asset_id: [u8; 32],
        category: Category,
        price_source: Pubkey,
        price_decimals: u8,
        enabled: bool,
    ) -> Result<()> {
        admin::handle_set_approved_asset(ctx, asset_id, category, price_source, price_decimals, enabled)
    }

    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
        admin::handle_withdraw_fees(ctx, amount)
    }

    pub fn create_platform_race(
        ctx: Context<CreatePlatformRace>,
        title: String,
        input: PlatformRaceInput,
    ) -> Result<()> {
        create::handle_create_platform_race(ctx, title, input)
    }

    pub fn create_community_race(
        ctx: Context<CreateCommunityRace>,
        title: String,
        category: Category,
        race_duration: i64,
    ) -> Result<()> {
        create::handle_create_community_race(ctx, title, category, race_duration)
    }

    pub fn add_lobby_asset(ctx: Context<AddLobbyAsset>) -> Result<()> {
        create::handle_add_lobby_asset(ctx)
    }

    pub fn open_betting(ctx: Context<OpenBetting>) -> Result<()> {
        create::handle_open_betting(ctx)
    }

    pub fn bet(ctx: Context<PlaceBet>, asset_index: u8, amount: u64) -> Result<()> {
        race::handle_bet(ctx, asset_index, amount)
    }

    pub fn start_race(ctx: Context<StartRace>) -> Result<()> {
        race::handle_start_race(ctx)
    }

    pub fn cancel_unstarted_race(ctx: Context<RaceTimeout>) -> Result<()> {
        race::handle_cancel_unstarted_race(ctx)
    }

    pub fn resolve_race(ctx: Context<ResolveRace>) -> Result<()> {
        race::handle_resolve_race(ctx)
    }

    pub fn void_expired_race(ctx: Context<RaceTimeout>) -> Result<()> {
        race::handle_void_expired_race(ctx)
    }

    pub fn claim(ctx: Context<SettlePosition>) -> Result<()> {
        race::handle_claim(ctx)
    }

    pub fn refund(ctx: Context<SettlePosition>) -> Result<()> {
        race::handle_refund(ctx)
    }

    pub fn close_losing_position(ctx: Context<SettlePosition>) -> Result<()> {
        race::handle_close_losing_position(ctx)
    }

    pub fn withdraw_creator_fees(ctx: Context<WithdrawCreatorFees>) -> Result<()> {
        race::handle_withdraw_creator_fees(ctx)
    }
}
