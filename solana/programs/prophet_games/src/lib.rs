//! Prophet games on Solana: Asset Race and Price Arena in one program.
//!
//! Both games share one admin config, oracle signer, approved-asset registry,
//! stake-currency list, treasury per stake mint and creator earnings. Each race
//! or arena still escrows its own stakes in its own account.
//!
//! - Asset Race: pari-mutuel races in which the asset with the highest
//!   percentage return between two signed DEX-pool price snapshots wins.
//! - Price Arena: up to ten players predict an asset's final price; the
//!   closest half shares the losing half's stakes. Predictions are public
//!   account data, hidden only by clients during the lobby.
//!
//! Ports of AssetRace.sol and PriceArena.sol; see docs/SOLANA_MIGRATION.md.

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

declare_id!("G1xjFqQ976m5xsybUCjLxjJxRCcx3PCwpxBgj7VM6ME7");

#[program]
pub mod prophet_games {
    use super::*;

    // ------------------------------------------------------------- admin

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

    pub fn set_stake_mint(
        ctx: Context<SetStakeMint>,
        stake_mint: Pubkey,
        enabled: bool,
        min_stake: u64,
        max_stake: u64,
    ) -> Result<()> {
        admin::handle_set_stake_mint(ctx, stake_mint, enabled, min_stake, max_stake)
    }

    pub fn withdraw_fees(ctx: Context<WithdrawFees>, stake_mint: Pubkey, amount: u64) -> Result<()> {
        admin::handle_withdraw_fees(ctx, stake_mint, amount)
    }

    pub fn withdraw_creator_fees(ctx: Context<WithdrawCreatorFees>, stake_mint: Pubkey) -> Result<()> {
        admin::handle_withdraw_creator_fees(ctx, stake_mint)
    }

    // -------------------------------------------------------- Asset Race

    pub fn create_platform_race(
        ctx: Context<CreatePlatformRace>,
        title: String,
        input: PlatformRaceInput,
    ) -> Result<()> {
        race_create::handle_create_platform_race(ctx, title, input)
    }

    pub fn create_community_race(
        ctx: Context<CreateCommunityRace>,
        title: String,
        category: Category,
        race_duration: i64,
        stake_mint: Pubkey,
    ) -> Result<()> {
        race_create::handle_create_community_race(ctx, title, category, race_duration, stake_mint)
    }

    pub fn add_lobby_asset(ctx: Context<AddLobbyAsset>) -> Result<()> {
        race_create::handle_add_lobby_asset(ctx)
    }

    pub fn open_betting(ctx: Context<OpenBetting>) -> Result<()> {
        race_create::handle_open_betting(ctx)
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

    pub fn claim_race(ctx: Context<SettlePosition>) -> Result<()> {
        race::handle_claim_race(ctx)
    }

    pub fn refund_race(ctx: Context<SettlePosition>) -> Result<()> {
        race::handle_refund_race(ctx)
    }

    pub fn close_losing_position(ctx: Context<SettlePosition>) -> Result<()> {
        race::handle_close_losing_position(ctx)
    }

    // ------------------------------------------------------- Price Arena

    pub fn create_arena(ctx: Context<CreateArena>, title: String, duration: i64, stake_mint: Pubkey) -> Result<()> {
        arena::handle_create_arena(ctx, title, duration, stake_mint)
    }

    pub fn enter_arena(ctx: Context<PlayerEntry>, prediction: u64, amount: u64) -> Result<()> {
        arena::handle_enter(ctx, prediction, amount)
    }

    pub fn update_arena_entry(ctx: Context<PlayerEntry>, new_prediction: u64, additional_amount: u64) -> Result<()> {
        arena::handle_update_entry(ctx, new_prediction, additional_amount)
    }

    pub fn cancel_arena_if_insufficient(ctx: Context<ArenaTimeout>) -> Result<()> {
        arena::handle_cancel_if_insufficient(ctx)
    }

    pub fn cancel_expired_arena(ctx: Context<ArenaTimeout>) -> Result<()> {
        arena::handle_cancel_expired_arena(ctx)
    }

    pub fn resolve_arena(ctx: Context<ResolveArena>) -> Result<()> {
        arena::handle_resolve_arena(ctx)
    }

    pub fn claim_arena(ctx: Context<SettleEntry>) -> Result<()> {
        arena::handle_claim_arena(ctx)
    }

    pub fn refund_arena(ctx: Context<SettleEntry>) -> Result<()> {
        arena::handle_refund_arena(ctx)
    }
}
