use anchor_lang::prelude::*;

use crate::{constants::*, error::ArenaError, math::transfer_program_lamports, state::*};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = admin,
        space = 8 + Treasury::INIT_SPACE,
        seeds = [TREASURY_SEED, NATIVE_SOL.as_ref()],
        bump
    )]
    pub treasury: Account<'info, Treasury>,
    /// Only the program's upgrade authority may initialize, so nobody can
    /// front-run the deploy and take the admin role.
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ ArenaError::Unauthorized)]
    pub program: Program<'info, crate::program::PriceArena>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ ArenaError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

fn validate_stake_limits(min_stake: u64, max_stake: u64) -> Result<()> {
    require!(
        min_stake > 0 && max_stake >= min_stake && max_stake <= MAX_STAKE_CAP,
        ArenaError::InvalidConfiguration
    );
    Ok(())
}

pub fn handle_initialize(ctx: Context<Initialize>, oracle_signer: Pubkey, min_stake: u64, max_stake: u64) -> Result<()> {
    require!(oracle_signer != Pubkey::default(), ArenaError::InvalidConfiguration);
    validate_stake_limits(min_stake, max_stake)?;
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.pending_admin = Pubkey::default();
    config.oracle_signer = oracle_signer;
    config.paused = false;
    config.arena_count = 0;
    config.min_stake = min_stake;
    config.max_stake = max_stake;
    config.bump = ctx.bumps.config;

    let treasury = &mut ctx.accounts.treasury;
    treasury.stake_mint = NATIVE_SOL;
    treasury.accumulated_fees = 0;
    treasury.bump = ctx.bumps.treasury;
    Ok(())
}

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ ArenaError::Unauthorized)]
    pub config: Account<'info, Config>,
}

pub fn handle_set_paused(ctx: Context<AdminConfig>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    Ok(())
}

/// Affects only arenas created afterwards; existing arenas keep their snapshot.
pub fn handle_set_oracle_signer(ctx: Context<AdminConfig>, oracle_signer: Pubkey) -> Result<()> {
    require!(oracle_signer != Pubkey::default(), ArenaError::InvalidConfiguration);
    ctx.accounts.config.oracle_signer = oracle_signer;
    Ok(())
}

/// Affects only arenas created afterwards. Lets the SOL range follow the
/// product's USD range as the SOL price moves.
pub fn handle_set_stake_limits(ctx: Context<AdminConfig>, min_stake: u64, max_stake: u64) -> Result<()> {
    validate_stake_limits(min_stake, max_stake)?;
    let config = &mut ctx.accounts.config;
    config.min_stake = min_stake;
    config.max_stake = max_stake;
    Ok(())
}

pub fn handle_propose_admin(ctx: Context<AdminConfig>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts.config.pending_admin = new_admin;
    Ok(())
}

#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    pub new_admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
}

pub fn handle_accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(config.pending_admin != Pubkey::default(), ArenaError::NoPendingAdmin);
    require_keys_eq!(config.pending_admin, ctx.accounts.new_admin.key(), ArenaError::Unauthorized);
    config.admin = config.pending_admin;
    config.pending_admin = Pubkey::default();
    Ok(())
}

#[derive(Accounts)]
#[instruction(asset_id: [u8; 32])]
pub struct SetApprovedAsset<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ ArenaError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + ApprovedAsset::INIT_SPACE,
        seeds = [ASSET_SEED, asset_id.as_ref()],
        bump
    )]
    pub approved_asset: Account<'info, ApprovedAsset>,
    pub system_program: Program<'info, System>,
}

pub fn handle_set_approved_asset(
    ctx: Context<SetApprovedAsset>,
    asset_id: [u8; 32],
    category: Category,
    price_source: Pubkey,
    price_decimals: u8,
    enabled: bool,
) -> Result<()> {
    require!(
        asset_id != [0u8; 32] && price_source != Pubkey::default() && price_decimals <= MAX_PRICE_DECIMALS,
        ArenaError::InvalidAsset
    );
    let asset = &mut ctx.accounts.approved_asset;
    asset.asset_id = asset_id;
    asset.category = category;
    asset.enabled = enabled;
    asset.price_source = price_source;
    asset.price_decimals = price_decimals;
    asset.bump = ctx.bumps.approved_asset;
    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ ArenaError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [TREASURY_SEED, NATIVE_SOL.as_ref()], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(mut)]
    pub recipient: SystemAccount<'info>,
}

pub fn handle_withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
    require!(amount > 0, ArenaError::AmountZero);
    let treasury = &mut ctx.accounts.treasury;
    require!(amount <= treasury.accumulated_fees, ArenaError::InsufficientFeeBalance);
    treasury.accumulated_fees -= amount;
    transfer_program_lamports(&treasury.to_account_info(), &ctx.accounts.recipient.to_account_info(), amount)
}

#[derive(Accounts)]
pub struct WithdrawCreatorFees<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        mut,
        seeds = [CREATOR_SEED, NATIVE_SOL.as_ref(), creator.key().as_ref()],
        bump = creator_earnings.bump,
        has_one = creator @ ArenaError::Unauthorized
    )]
    pub creator_earnings: Account<'info, CreatorEarnings>,
}

pub fn handle_withdraw_creator_fees(ctx: Context<WithdrawCreatorFees>) -> Result<()> {
    let earnings = &mut ctx.accounts.creator_earnings;
    let amount = earnings.amount;
    require!(amount > 0, ArenaError::AmountZero);
    earnings.amount = 0;
    transfer_program_lamports(&earnings.to_account_info(), &ctx.accounts.creator.to_account_info(), amount)
}
