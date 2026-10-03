use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenInterface},
};
use stake_funds::{pay_from_pda, required};

use crate::{constants::*, error::GameError, state::*};

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
    /// Only the program's upgrade authority may initialize, so nobody can
    /// front-run the deploy and take the admin role.
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ GameError::Unauthorized)]
    pub program: Program<'info, crate::program::ProphetGames>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ GameError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(ctx: Context<Initialize>, oracle_signer: Pubkey) -> Result<()> {
    require!(oracle_signer != Pubkey::default(), GameError::InvalidConfiguration);
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.pending_admin = Pubkey::default();
    config.oracle_signer = oracle_signer;
    config.paused = false;
    config.race_count = 0;
    config.arena_count = 0;
    config.community_policy_configured = false;
    config.community_policy = CommunityPolicy::default();
    config.race_durations = Vec::new();
    config.bump = ctx.bumps.config;
    Ok(())
}

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ GameError::Unauthorized)]
    pub config: Account<'info, Config>,
}

pub fn handle_set_paused(ctx: Context<AdminConfig>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    emit!(ActivityPausedSet { paused });
    Ok(())
}

/// Affects only games created afterwards; existing games keep their snapshot.
pub fn handle_set_oracle_signer(ctx: Context<AdminConfig>, oracle_signer: Pubkey) -> Result<()> {
    require!(oracle_signer != Pubkey::default(), GameError::InvalidConfiguration);
    ctx.accounts.config.oracle_signer = oracle_signer;
    Ok(())
}

pub fn handle_set_community_policy(ctx: Context<AdminConfig>, policy: CommunityPolicy) -> Result<()> {
    require!(
        policy.lobby_duration > 0
            && policy.betting_duration > 0
            && policy.start_grace > 0
            && policy.resolution_grace > 0
            && (policy.min_active_contenders as usize) >= MIN_ASSETS_PER_RACE
            && (policy.min_active_contenders as usize) <= MAX_ASSETS_PER_RACE,
        GameError::InvalidConfiguration
    );
    require!(policy.fee_bp <= MAX_FEE_BP, GameError::FeeExceedsMaximum);
    let config = &mut ctx.accounts.config;
    config.community_policy = policy;
    config.community_policy_configured = true;
    Ok(())
}

pub fn handle_set_duration_preset(ctx: Context<AdminConfig>, duration: i64, enabled: bool) -> Result<()> {
    require!(duration > 0, GameError::InvalidConfiguration);
    let durations = &mut ctx.accounts.config.race_durations;
    let existing = durations.iter().position(|d| *d == duration);
    match (existing, enabled) {
        (None, true) => {
            require!(durations.len() < MAX_DURATION_PRESETS, GameError::TooManyDurationPresets);
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
    require!(config.pending_admin != Pubkey::default(), GameError::NoPendingAdmin);
    require_keys_eq!(config.pending_admin, ctx.accounts.new_admin.key(), GameError::Unauthorized);
    config.admin = config.pending_admin;
    config.pending_admin = Pubkey::default();
    Ok(())
}

#[derive(Accounts)]
#[instruction(stake_mint: Pubkey)]
pub struct SetStakeMint<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ GameError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + StakeMintConfig::INIT_SPACE,
        seeds = [STAKE_MINT_SEED, stake_mint.as_ref()],
        bump
    )]
    pub stake_mint_config: Account<'info, StakeMintConfig>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + Treasury::INIT_SPACE,
        seeds = [TREASURY_SEED, stake_mint.as_ref()],
        bump
    )]
    pub treasury: Account<'info, Treasury>,
    pub token_mint: Option<InterfaceAccount<'info, Mint>>,
    /// CHECK: must be the treasury's associated token account; created here.
    #[account(mut)]
    pub treasury_vault: Option<UncheckedAccount<'info>>,
    pub token_program: Option<Interface<'info, TokenInterface>>,
    pub associated_token_program: Option<Program<'info, AssociatedToken>>,
    pub system_program: Program<'info, System>,
}

/// Accepts (or updates, or disables) a stake currency: `NATIVE_SOL` or a
/// plain SPL mint. Creates its treasury and, for SPL, the treasury vault.
pub fn handle_set_stake_mint(
    ctx: Context<SetStakeMint>,
    stake_mint: Pubkey,
    enabled: bool,
    min_stake: u64,
    max_stake: u64,
) -> Result<()> {
    require!(
        min_stake > 0 && max_stake >= min_stake && max_stake <= MAX_STAKE_CAP,
        GameError::InvalidConfiguration
    );
    if let Some(spl) = stake_funds::spl(&stake_mint, &ctx.accounts.token_mint, &ctx.accounts.token_program)? {
        spl.create_vault(
            &ctx.accounts.admin.to_account_info(),
            &required(&ctx.accounts.treasury_vault)?.to_account_info(),
            &ctx.accounts.treasury.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &required(&ctx.accounts.associated_token_program)?.to_account_info(),
        )?;
    }
    let config = &mut ctx.accounts.stake_mint_config;
    config.mint = stake_mint;
    config.enabled = enabled;
    config.min_stake = min_stake;
    config.max_stake = max_stake;
    config.bump = ctx.bumps.stake_mint_config;
    let treasury = &mut ctx.accounts.treasury;
    treasury.stake_mint = stake_mint;
    treasury.bump = ctx.bumps.treasury;
    Ok(())
}

#[derive(Accounts)]
#[instruction(asset_id: [u8; 32])]
pub struct SetApprovedAsset<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ GameError::Unauthorized)]
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
        GameError::InvalidCandidate
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
#[instruction(stake_mint: Pubkey)]
pub struct WithdrawFees<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ GameError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [TREASURY_SEED, stake_mint.as_ref()], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    /// CHECK: receives lamports for native SOL; unused for SPL.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
    pub token_mint: Option<InterfaceAccount<'info, Mint>>,
    /// CHECK: checked against the treasury's associated token account.
    #[account(mut)]
    pub treasury_vault: Option<UncheckedAccount<'info>>,
    /// CHECK: any token account of the stake mint; the token program checks the mint.
    #[account(mut)]
    pub recipient_token: Option<UncheckedAccount<'info>>,
    pub token_program: Option<Interface<'info, TokenInterface>>,
}

/// Withdraws only fees already removed from resolved-game liabilities.
pub fn handle_withdraw_fees(ctx: Context<WithdrawFees>, stake_mint: Pubkey, amount: u64) -> Result<()> {
    require!(amount > 0, GameError::AmountZero);
    let treasury = &mut ctx.accounts.treasury;
    require!(amount <= treasury.accumulated_fees, GameError::InsufficientFeeBalance);
    treasury.accumulated_fees -= amount;
    let bump = [treasury.bump];
    let seeds: &[&[u8]] = &[TREASURY_SEED, stake_mint.as_ref(), &bump];
    let spl = stake_funds::spl(&stake_mint, &ctx.accounts.token_mint, &ctx.accounts.token_program)?;
    pay_from_pda(
        &spl,
        &ctx.accounts.treasury.to_account_info(),
        &[seeds],
        ctx.accounts.treasury_vault.as_ref().map(|a| a.as_ref()),
        &ctx.accounts.recipient.to_account_info(),
        ctx.accounts.recipient_token.as_ref().map(|a| a.as_ref()),
        amount,
    )?;
    emit!(FeesWithdrawn { stake_mint, recipient: ctx.accounts.recipient.key(), amount });
    Ok(())
}

fn as_info<'a, 'info>(account: &'a Option<UncheckedAccount<'info>>) -> Option<&'a AccountInfo<'info>> {
    account.as_ref().map(|a| a.as_ref())
}

/// Withdraws all creator revenue accrued across a creator's races and arenas
/// in one stake currency.
#[derive(Accounts)]
#[instruction(stake_mint: Pubkey)]
pub struct WithdrawCreatorFees<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        mut,
        seeds = [CREATOR_SEED, stake_mint.as_ref(), creator.key().as_ref()],
        bump = creator_earnings.bump,
        has_one = creator @ GameError::Unauthorized
    )]
    pub creator_earnings: Account<'info, CreatorEarnings>,
    pub token_mint: Option<InterfaceAccount<'info, Mint>>,
    /// CHECK: checked against the creator-earnings associated token account.
    #[account(mut)]
    pub creator_vault: Option<UncheckedAccount<'info>>,
    /// CHECK: creator's token account; the token program checks the mint.
    #[account(mut)]
    pub creator_token: Option<UncheckedAccount<'info>>,
    pub token_program: Option<Interface<'info, TokenInterface>>,
}

pub fn handle_withdraw_creator_fees(ctx: Context<WithdrawCreatorFees>, stake_mint: Pubkey) -> Result<()> {
    let earnings = &mut ctx.accounts.creator_earnings;
    let amount = earnings.amount;
    require!(amount > 0, GameError::AmountZero);
    earnings.amount = 0;
    let creator = ctx.accounts.creator.key();
    let bump = [ctx.accounts.creator_earnings.bump];
    let seeds: &[&[u8]] = &[CREATOR_SEED, stake_mint.as_ref(), creator.as_ref(), &bump];
    let spl = stake_funds::spl(&stake_mint, &ctx.accounts.token_mint, &ctx.accounts.token_program)?;
    pay_from_pda(
        &spl,
        &ctx.accounts.creator_earnings.to_account_info(),
        &[seeds],
        as_info(&ctx.accounts.creator_vault),
        &ctx.accounts.creator.to_account_info(),
        as_info(&ctx.accounts.creator_token),
        amount,
    )?;
    emit!(CreatorFeesWithdrawn { creator, stake_mint, amount });
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
    pub stake_mint: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
}

#[event]
pub struct CreatorFeesWithdrawn {
    pub creator: Pubkey,
    pub stake_mint: Pubkey,
    pub amount: u64,
}
