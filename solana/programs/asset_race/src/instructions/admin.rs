use anchor_lang::prelude::*;

use crate::{constants::*, error::RaceError, state::*};

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
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ RaceError::Unauthorized)]
    pub program: Program<'info, crate::program::AssetRace>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ RaceError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(ctx: Context<Initialize>, oracle_signer: Pubkey) -> Result<()> {
    require!(oracle_signer != Pubkey::default(), RaceError::InvalidConfiguration);
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.pending_admin = Pubkey::default();
    config.oracle_signer = oracle_signer;
    config.paused = false;
    config.race_count = 0;
    config.community_policy_configured = false;
    config.community_policy = CommunityPolicy::default();
    config.race_durations = Vec::new();
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
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ RaceError::Unauthorized)]
    pub config: Account<'info, Config>,
}

pub fn handle_set_paused(ctx: Context<AdminConfig>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    emit!(ActivityPausedSet { paused });
    Ok(())
}

/// Affects only races created afterwards; existing races keep their snapshot.
pub fn handle_set_oracle_signer(ctx: Context<AdminConfig>, oracle_signer: Pubkey) -> Result<()> {
    require!(oracle_signer != Pubkey::default(), RaceError::InvalidConfiguration);
    ctx.accounts.config.oracle_signer = oracle_signer;
    Ok(())
}

pub fn handle_set_community_policy(ctx: Context<AdminConfig>, policy: CommunityPolicy) -> Result<()> {
    require!(
        policy.lobby_duration > 0
            && policy.betting_duration > 0
            && policy.start_grace > 0
            && policy.resolution_grace > 0
            && policy.min_stake > 0
            && policy.max_stake_per_wallet >= policy.min_stake
            && (policy.min_active_contenders as usize) >= MIN_ASSETS_PER_RACE
            && (policy.min_active_contenders as usize) <= MAX_ASSETS_PER_RACE,
        RaceError::InvalidConfiguration
    );
    require!(policy.fee_bp <= MAX_FEE_BP, RaceError::FeeExceedsMaximum);
    let config = &mut ctx.accounts.config;
    config.community_policy = policy;
    config.community_policy_configured = true;
    Ok(())
}

pub fn handle_set_duration_preset(ctx: Context<AdminConfig>, duration: i64, enabled: bool) -> Result<()> {
    require!(duration > 0, RaceError::InvalidConfiguration);
    let durations = &mut ctx.accounts.config.race_durations;
    let existing = durations.iter().position(|d| *d == duration);
    match (existing, enabled) {
        (None, true) => {
            require!(durations.len() < MAX_DURATION_PRESETS, RaceError::TooManyDurationPresets);
            durations.push(duration);
        }
        (Some(index), false) => {
            durations.remove(index);
        }
        _ => {}
    }
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
    require!(config.pending_admin != Pubkey::default(), RaceError::NoPendingAdmin);
    require_keys_eq!(config.pending_admin, ctx.accounts.new_admin.key(), RaceError::Unauthorized);
    config.admin = config.pending_admin;
    config.pending_admin = Pubkey::default();
    Ok(())
}

#[derive(Accounts)]
#[instruction(asset_id: [u8; 32])]
pub struct SetApprovedAsset<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ RaceError::Unauthorized)]
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

/// Adds, updates, enables or disables an asset. Races already created keep
/// the configuration they snapshotted.
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
        RaceError::InvalidCandidate
    );
    let asset = &mut ctx.accounts.approved_asset;
    asset.asset_id = asset_id;
    asset.category = category;
    asset.enabled = enabled;
    asset.price_source = price_source;
    asset.price_decimals = price_decimals;
    asset.bump = ctx.bumps.approved_asset;
    emit!(ApprovedAssetSet { asset_id, category, enabled, price_source, price_decimals });
    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ RaceError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [TREASURY_SEED, NATIVE_SOL.as_ref()], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(mut)]
    pub recipient: SystemAccount<'info>,
}

/// Withdraws only fees already removed from resolved-race liabilities.
pub fn handle_withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
    require!(amount > 0, RaceError::AmountZero);
    let treasury = &mut ctx.accounts.treasury;
    require!(amount <= treasury.accumulated_fees, RaceError::InsufficientFeeBalance);
    treasury.accumulated_fees -= amount;
    crate::math::transfer_program_lamports(
        &treasury.to_account_info(),
        &ctx.accounts.recipient.to_account_info(),
        amount,
    )?;
    emit!(FeesWithdrawn { recipient: ctx.accounts.recipient.key(), amount });
    Ok(())
}

#[event]
pub struct ActivityPausedSet {
    pub paused: bool,
}

#[event]
pub struct ApprovedAssetSet {
    pub asset_id: [u8; 32],
    pub category: Category,
    pub enabled: bool,
    pub price_source: Pubkey,
    pub price_decimals: u8,
}

#[event]
pub struct FeesWithdrawn {
    pub recipient: Pubkey,
    pub amount: u64,
}
