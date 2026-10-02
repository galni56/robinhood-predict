use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenInterface},
};
use stake_funds::required;

use crate::{constants::*, error::RaceError, math::add_time, state::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PlatformRaceInput {
    pub category: Category,
    /// `NATIVE_SOL` or an accepted SPL mint.
    pub stake_mint: Pubkey,
    pub betting_start_time: i64,
    pub betting_end_time: i64,
    pub race_duration: i64,
    pub start_grace: i64,
    pub resolution_grace: i64,
    pub fee_bp: u16,
    pub min_active_contenders: u8,
    pub min_stake: u64,
    pub max_stake_per_wallet: u64,
}

#[derive(Accounts)]
#[instruction(title: String, input: PlatformRaceInput)]
pub struct CreatePlatformRace<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ RaceError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(seeds = [STAKE_MINT_SEED, input.stake_mint.as_ref()], bump = stake_mint_config.bump)]
    pub stake_mint_config: Account<'info, StakeMintConfig>,
    #[account(
        init,
        payer = admin,
        space = 8 + Race::INIT_SPACE,
        seeds = [RACE_SEED, config.race_count.to_le_bytes().as_ref()],
        bump
    )]
    pub race: Account<'info, Race>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + CreatorEarnings::INIT_SPACE,
        seeds = [CREATOR_SEED, input.stake_mint.as_ref(), admin.key().as_ref()],
        bump
    )]
    pub creator_earnings: Account<'info, CreatorEarnings>,
    pub token_mint: Option<InterfaceAccount<'info, Mint>>,
    /// CHECK: must be the race's associated token account; created here.
    #[account(mut)]
    pub race_vault: Option<UncheckedAccount<'info>>,
    /// CHECK: must be the creator-earnings associated token account; created here.
    #[account(mut)]
    pub creator_vault: Option<UncheckedAccount<'info>>,
    pub token_program: Option<Interface<'info, TokenInterface>>,
    pub associated_token_program: Option<Program<'info, AssociatedToken>>,
    pub system_program: Program<'info, System>,
}

/// Creates a titled platform race. Approved-asset accounts are passed as
/// remaining accounts, in race order, and snapshotted into the race.
pub fn handle_create_platform_race(
    ctx: Context<CreatePlatformRace>,
    title: String,
    input: PlatformRaceInput,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(!ctx.accounts.config.paused, RaceError::ActivityPaused);
    require!(ctx.accounts.stake_mint_config.enabled, RaceError::UnsupportedStakeMint);
    validate_title(&title)?;
    let asset_count = ctx.remaining_accounts.len();
    require!(
        (MIN_ASSETS_PER_RACE..=MAX_ASSETS_PER_RACE).contains(&asset_count),
        RaceError::InvalidCandidateCount
    );
    require!(
        input.betting_start_time >= now
            && input.betting_end_time > input.betting_start_time
            && input.race_duration > 0
            && input.start_grace > 0
            && input.resolution_grace > 0
            && input.min_stake > 0
            && input.max_stake_per_wallet >= input.min_stake
            && (input.min_active_contenders as usize) >= MIN_ASSETS_PER_RACE
            && (input.min_active_contenders as usize) <= asset_count,
        RaceError::InvalidConfiguration
    );
    require!(input.fee_bp <= MAX_FEE_BP, RaceError::FeeExceedsMaximum);
    let race_end = add_time(input.betting_end_time, input.race_duration)?;
    add_time(input.betting_end_time, input.start_grace)?;
    add_time(race_end, input.resolution_grace)?;

    let creator = ctx.accounts.admin.key();
    create_vaults(
        &input.stake_mint,
        &ctx.accounts.admin.to_account_info(),
        &ctx.accounts.race.to_account_info(),
        &ctx.accounts.creator_earnings.to_account_info(),
        &ctx.accounts.token_mint,
        &ctx.accounts.race_vault,
        &ctx.accounts.creator_vault,
        &ctx.accounts.token_program,
        &ctx.accounts.associated_token_program,
        &ctx.accounts.system_program.to_account_info(),
    )?;
    init_creator_earnings(&mut ctx.accounts.creator_earnings, creator, input.stake_mint, ctx.bumps.creator_earnings);

    let config = &mut ctx.accounts.config;
    let race = &mut ctx.accounts.race;
    race.id = config.race_count;
    race.category = input.category;
    race.origin = Origin::Platform;
    race.status = RaceStatus::Betting;
    race.creator = creator;
    race.stake_mint = input.stake_mint;
    race.oracle_signer = config.oracle_signer;
    race.title = title;
    race.betting_start_time = input.betting_start_time;
    race.betting_end_time = input.betting_end_time;
    race.race_duration = input.race_duration;
    race.start_grace = input.start_grace;
    race.resolution_grace = input.resolution_grace;
    race.fee_bp = input.fee_bp;
    race.min_active_contenders = input.min_active_contenders;
    race.winning_asset_index = NO_WINNER;
    race.min_stake = input.min_stake;
    race.max_stake_per_wallet = input.max_stake_per_wallet;
    race.bump = ctx.bumps.race;
    for info in ctx.remaining_accounts.iter() {
        push_approved_asset(race, info)?;
    }
    config.race_count = config.race_count.checked_add(1).ok_or(error!(RaceError::MathOverflow))?;

    emit!(RaceCreated {
        race: race.key(),
        race_id: race.id,
        origin: race.origin,
        category: race.category,
        creator,
        stake_mint: race.stake_mint,
        asset_count: race.assets.len() as u8,
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(title: String, category: Category, race_duration: i64, stake_mint: Pubkey)]
pub struct CreateCommunityRace<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [STAKE_MINT_SEED, stake_mint.as_ref()], bump = stake_mint_config.bump)]
    pub stake_mint_config: Account<'info, StakeMintConfig>,
    #[account(
        init,
        payer = creator,
        space = 8 + Race::INIT_SPACE,
        seeds = [RACE_SEED, config.race_count.to_le_bytes().as_ref()],
        bump
    )]
    pub race: Account<'info, Race>,
    #[account(
        init_if_needed,
        payer = creator,
        space = 8 + CreatorEarnings::INIT_SPACE,
        seeds = [CREATOR_SEED, stake_mint.as_ref(), creator.key().as_ref()],
        bump
    )]
    pub creator_earnings: Account<'info, CreatorEarnings>,
    pub token_mint: Option<InterfaceAccount<'info, Mint>>,
    /// CHECK: must be the race's associated token account; created here.
    #[account(mut)]
    pub race_vault: Option<UncheckedAccount<'info>>,
    /// CHECK: must be the creator-earnings associated token account; created here.
    #[account(mut)]
    pub creator_vault: Option<UncheckedAccount<'info>>,
    pub token_program: Option<Interface<'info, TokenInterface>>,
    pub associated_token_program: Option<Program<'info, AssociatedToken>>,
    pub system_program: Program<'info, System>,
}

/// Creates a community race with protocol-controlled economics. The creator
/// picks only the title, category, an approved duration, the stake currency
/// and initial assets. Stake limits come from the stake currency's config.
pub fn handle_create_community_race(
    ctx: Context<CreateCommunityRace>,
    title: String,
    category: Category,
    race_duration: i64,
    stake_mint: Pubkey,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let config = &ctx.accounts.config;
    require!(!config.paused, RaceError::ActivityPaused);
    require!(config.community_policy_configured, RaceError::CommunityPolicyNotConfigured);
    require!(ctx.accounts.stake_mint_config.enabled, RaceError::UnsupportedStakeMint);
    validate_title(&title)?;
    require!(
        config.race_durations.contains(&race_duration),
        RaceError::DurationNotApproved
    );
    require!(
        ctx.remaining_accounts.len() <= MAX_ASSETS_PER_RACE,
        RaceError::InvalidCandidateCount
    );
    let policy = config.community_policy;
    let lobby_end = add_time(now, policy.lobby_duration)?;
    let (min_stake, max_stake) = (ctx.accounts.stake_mint_config.min_stake, ctx.accounts.stake_mint_config.max_stake);

    let creator = ctx.accounts.creator.key();
    create_vaults(
        &stake_mint,
        &ctx.accounts.creator.to_account_info(),
        &ctx.accounts.race.to_account_info(),
        &ctx.accounts.creator_earnings.to_account_info(),
        &ctx.accounts.token_mint,
        &ctx.accounts.race_vault,
        &ctx.accounts.creator_vault,
        &ctx.accounts.token_program,
        &ctx.accounts.associated_token_program,
        &ctx.accounts.system_program.to_account_info(),
    )?;
    init_creator_earnings(&mut ctx.accounts.creator_earnings, creator, stake_mint, ctx.bumps.creator_earnings);

    let config = &mut ctx.accounts.config;
    let race = &mut ctx.accounts.race;
    race.id = config.race_count;
    race.category = category;
    race.origin = Origin::Community;
    race.status = RaceStatus::Lobby;
    race.creator = creator;
    race.stake_mint = stake_mint;
    race.oracle_signer = config.oracle_signer;
    race.title = title;
    race.lobby_end_time = lobby_end;
    race.betting_window = policy.betting_duration;
    race.race_duration = race_duration;
    race.start_grace = policy.start_grace;
    race.resolution_grace = policy.resolution_grace;
    race.fee_bp = policy.fee_bp;
    race.min_active_contenders = policy.min_active_contenders;
    race.winning_asset_index = NO_WINNER;
    race.min_stake = min_stake;
    race.max_stake_per_wallet = max_stake;
    race.bump = ctx.bumps.race;
    for info in ctx.remaining_accounts.iter() {
        push_approved_asset(race, info)?;
    }
    config.race_count = config.race_count.checked_add(1).ok_or(error!(RaceError::MathOverflow))?;

    emit!(RaceCreated {
        race: race.key(),
        race_id: race.id,
        origin: race.origin,
        category: race.category,
        creator,
        stake_mint,
        asset_count: race.assets.len() as u8,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AddLobbyAsset<'info> {
    pub adder: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub race: Account<'info, Race>,
    pub approved_asset: Account<'info, ApprovedAsset>,
}

/// Each wallet may add one approved asset to a community lobby.
pub fn handle_add_lobby_asset(ctx: Context<AddLobbyAsset>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(!ctx.accounts.config.paused, RaceError::ActivityPaused);
    let adder = ctx.accounts.adder.key();
    let race = &mut ctx.accounts.race;
    require!(
        race.origin == Origin::Community && race.status == RaceStatus::Lobby,
        RaceError::InvalidRaceStatus
    );
    require!(now < race.lobby_end_time, RaceError::LobbyClosed);
    require!(!race.lobby_adders.contains(&adder), RaceError::LobbyAdditionAlreadyUsed);
    require!(race.assets.len() < MAX_ASSETS_PER_RACE, RaceError::InvalidCandidateCount);

    push_approved_asset(race, &ctx.accounts.approved_asset.to_account_info())?;
    race.lobby_adders.push(adder);
    emit!(LobbyAssetAdded {
        race: race.key(),
        asset_id: ctx.accounts.approved_asset.asset_id,
        added_by: adder,
        asset_index: (race.assets.len() - 1) as u8,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct OpenBetting<'info> {
    #[account(mut)]
    pub race: Account<'info, Race>,
}

/// Permissionless timer transition out of the lobby. A lobby with fewer than
/// two assets is cancelled; no bets exist yet, so nothing needs refunding.
pub fn handle_open_betting(ctx: Context<OpenBetting>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let race = &mut ctx.accounts.race;
    require!(
        race.origin == Origin::Community && race.status == RaceStatus::Lobby,
        RaceError::InvalidRaceStatus
    );
    require!(now >= race.lobby_end_time, RaceError::LobbyStillOpen);
    if race.assets.len() < MIN_ASSETS_PER_RACE {
        race.status = RaceStatus::Cancelled;
        emit!(RaceCancelled { race: race.key(), reason: CancelReason::InsufficientLobbyAssets });
        return Ok(());
    }
    let betting_end = add_time(now, race.betting_window)?;
    let race_end = add_time(betting_end, race.race_duration)?;
    add_time(betting_end, race.start_grace)?;
    add_time(race_end, race.resolution_grace)?;
    race.betting_start_time = now;
    race.betting_end_time = betting_end;
    race.status = RaceStatus::Betting;
    emit!(BettingOpened { race: race.key(), betting_start_time: now, betting_end_time: betting_end });
    Ok(())
}

/// For an SPL race, creates the race vault and (if missing) the creator's
/// earnings vault. Native-SOL races need neither.
#[allow(clippy::too_many_arguments)]
fn create_vaults<'info>(
    stake_mint: &Pubkey,
    payer: &AccountInfo<'info>,
    race: &AccountInfo<'info>,
    creator_earnings: &AccountInfo<'info>,
    token_mint: &Option<InterfaceAccount<'info, Mint>>,
    race_vault: &Option<UncheckedAccount<'info>>,
    creator_vault: &Option<UncheckedAccount<'info>>,
    token_program: &Option<Interface<'info, TokenInterface>>,
    associated_token_program: &Option<Program<'info, AssociatedToken>>,
    system_program: &AccountInfo<'info>,
) -> Result<()> {
    let Some(spl) = stake_funds::spl(stake_mint, token_mint, token_program)? else {
        return Ok(());
    };
    let ata_program = required(associated_token_program)?.to_account_info();
    spl.create_vault(payer, &required(race_vault)?.to_account_info(), race, system_program, &ata_program)?;
    spl.create_vault(
        payer,
        &required(creator_vault)?.to_account_info(),
        creator_earnings,
        system_program,
        &ata_program,
    )
}

fn init_creator_earnings(earnings: &mut Account<CreatorEarnings>, creator: Pubkey, stake_mint: Pubkey, bump: u8) {
    if earnings.creator == Pubkey::default() {
        earnings.creator = creator;
        earnings.stake_mint = stake_mint;
        earnings.amount = 0;
        earnings.total_earned = 0;
        earnings.bump = bump;
    }
}

fn validate_title(title: &str) -> Result<()> {
    let bytes = title.as_bytes();
    require!(
        !bytes.is_empty() && bytes.len() <= MAX_TITLE_BYTES && bytes.iter().any(|b| *b > 0x20),
        RaceError::InvalidTitle
    );
    Ok(())
}

/// Snapshots one approved asset into the race, rejecting duplicates by asset
/// id and by price source.
fn push_approved_asset(race: &mut Race, info: &AccountInfo) -> Result<()> {
    require_keys_eq!(*info.owner, crate::ID, RaceError::AssetNotApproved);
    let data = info.try_borrow_data()?;
    let approved = ApprovedAsset::try_deserialize(&mut &data[..])
        .map_err(|_| error!(RaceError::AssetNotApproved))?;
    require!(
        approved.enabled && approved.category == race.category,
        RaceError::AssetNotApproved
    );
    for existing in race.assets.iter() {
        require!(existing.asset_id != approved.asset_id, RaceError::DuplicateAsset);
        require!(
            existing.price_source != approved.price_source,
            RaceError::DuplicatePriceSource
        );
    }
    race.assets.push(RaceAsset {
        asset_id: approved.asset_id,
        price_source: approved.price_source,
        price_decimals: approved.price_decimals,
        active: false,
        pool: 0,
        start_price: 0,
        end_price: 0,
        return_value: 0,
    });
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum CancelReason {
    InsufficientActiveContenders,
    StartWindowExpired,
    InsufficientLobbyAssets,
}

#[event]
pub struct RaceCreated {
    pub race: Pubkey,
    pub race_id: u64,
    pub origin: Origin,
    pub category: Category,
    pub creator: Pubkey,
    pub stake_mint: Pubkey,
    pub asset_count: u8,
}

#[event]
pub struct LobbyAssetAdded {
    pub race: Pubkey,
    pub asset_id: [u8; 32],
    pub added_by: Pubkey,
    pub asset_index: u8,
}

#[event]
pub struct BettingOpened {
    pub race: Pubkey,
    pub betting_start_time: i64,
    pub betting_end_time: i64,
}

#[event]
pub struct RaceCancelled {
    pub race: Pubkey,
    pub reason: CancelReason,
}
