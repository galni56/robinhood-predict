//! Prophet Price Arena on Solana.
//!
//! Fixed-time contests in which up to ten players predict the final price of
//! one approved DEX pool. The closest half of the field shares the losing
//! half's stakes, weighted by stake and accuracy. Port of
//! `contracts/src/PriceArena.sol`; see `docs/SOLANA_MIGRATION.md`.
//!
//! Predictions are hidden only by clients during the lobby. Account data is
//! public; a commit/reveal revision would be needed for real secrecy.

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

declare_id!("GWdUNY9nzmMCSUfNSsvQCZFzwGNrqDKeh5TdHg79DaQU");

#[program]
pub mod price_arena {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, oracle_signer: Pubkey, min_stake: u64, max_stake: u64) -> Result<()> {
        admin::handle_initialize(ctx, oracle_signer, min_stake, max_stake)
    }

    pub fn set_paused(ctx: Context<AdminConfig>, paused: bool) -> Result<()> {
        admin::handle_set_paused(ctx, paused)
    }

    pub fn set_oracle_signer(ctx: Context<AdminConfig>, oracle_signer: Pubkey) -> Result<()> {
        admin::handle_set_oracle_signer(ctx, oracle_signer)
    }

    pub fn set_stake_limits(ctx: Context<AdminConfig>, min_stake: u64, max_stake: u64) -> Result<()> {
        admin::handle_set_stake_limits(ctx, min_stake, max_stake)
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

    pub fn withdraw_creator_fees(ctx: Context<WithdrawCreatorFees>) -> Result<()> {
        admin::handle_withdraw_creator_fees(ctx)
    }

    pub fn create_arena(ctx: Context<CreateArena>, title: String, duration: i64) -> Result<()> {
        arena::handle_create_arena(ctx, title, duration)
    }

    pub fn enter(ctx: Context<PlayerEntry>, prediction: u64, amount: u64) -> Result<()> {
        arena::handle_enter(ctx, prediction, amount)
    }

    pub fn update_entry(ctx: Context<PlayerEntry>, new_prediction: u64, additional_amount: u64) -> Result<()> {
        arena::handle_update_entry(ctx, new_prediction, additional_amount)
    }

    pub fn cancel_if_insufficient(ctx: Context<ArenaTimeout>) -> Result<()> {
        arena::handle_cancel_if_insufficient(ctx)
    }

    pub fn cancel_expired_arena(ctx: Context<ArenaTimeout>) -> Result<()> {
        arena::handle_cancel_expired_arena(ctx)
    }

    pub fn resolve(ctx: Context<ResolveArena>) -> Result<()> {
        arena::handle_resolve(ctx)
    }

    pub fn claim(ctx: Context<SettleEntry>) -> Result<()> {
        arena::handle_claim(ctx)
    }

    pub fn refund(ctx: Context<SettleEntry>) -> Result<()> {
        arena::handle_refund(ctx)
    }
}
