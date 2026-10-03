use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenInterface};
use solana_sdk_ids::sysvar::instructions as instructions_sysvar;
use stake_funds::{deposit_native, pay_from_pda, required};

use crate::{
    attestation::{load_verified_attestation, game_err},
    constants::*,
    error::GameError,
    instructions::race_create::{RaceCancelReason, RaceCancelled},
    math::{add_time, calculate_return, mul_div},
    state::*,
};

fn as_info<'a, 'info>(account: &'a Option<UncheckedAccount<'info>>) -> Option<&'a AccountInfo<'info>> {
    account.as_ref().map(|a| a.as_ref())
}

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub race: Account<'info, Race>,
    #[account(
        init_if_needed,
        payer = bettor,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, race.key().as_ref(), bettor.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    pub token_mint: Option<InterfaceAccount<'info, Mint>>,
    /// CHECK: bettor's token account; the token program checks mint and owner.
    #[account(mut)]
    pub bettor_token: Option<UncheckedAccount<'info>>,
    /// CHECK: checked against the race's associated token account.
    #[account(mut)]
    pub race_vault: Option<UncheckedAccount<'info>>,
    pub token_program: Option<Interface<'info, TokenInterface>>,
    pub system_program: Program<'info, System>,
}

/// Backs one asset, or tops up the wallet's existing pick. The first pick can
/// never be changed for this race.
pub fn handle_bet(ctx: Context<PlaceBet>, asset_index: u8, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(!ctx.accounts.config.paused, GameError::ActivityPaused);
    let race = &ctx.accounts.race;
    require!(race.status == RaceStatus::Betting, GameError::InvalidRaceStatus);
    require!(
        now >= race.betting_start_time && now < race.betting_end_time,
        GameError::BettingNotOpen
    );
    require!((asset_index as usize) < race.assets.len(), GameError::InvalidCandidate);
    require!(amount > 0, GameError::AmountZero);

    let bettor = ctx.accounts.bettor.key();
    let race_key = race.key();
    let position = &mut ctx.accounts.position;
    if position.owner == Pubkey::default() {
        require!(amount >= race.min_stake, GameError::StakeBelowMinimum);
        position.race = race_key;
        position.owner = bettor;
        position.asset_index = asset_index;
        position.stake = 0;
        position.bump = ctx.bumps.position;
    } else {
        require!(position.asset_index == asset_index, GameError::WrongAsset);
    }
    let new_stake = position
        .stake
        .checked_add(amount)
        .ok_or(error!(GameError::MathOverflow))?;
    require!(new_stake <= race.max_stake_per_wallet, GameError::StakeExceedsMaximum);
    position.stake = new_stake;

    let race_info = ctx.accounts.race.to_account_info();
    let bettor_info = ctx.accounts.bettor.to_account_info();
    match stake_funds::spl(&ctx.accounts.race.stake_mint, &ctx.accounts.token_mint, &ctx.accounts.token_program)? {
        None => deposit_native(&bettor_info, &race_info, amount)?,
        Some(spl) => {
            let vault = required(&ctx.accounts.race_vault)?.to_account_info();
            spl.require_vault(&vault, &race_key)?;
            spl.transfer(&required(&ctx.accounts.bettor_token)?.to_account_info(), &vault, &bettor_info, amount, &[])?;
        }
    }

    let race = &mut ctx.accounts.race;
    let asset = &mut race.assets[asset_index as usize];
    asset.pool = asset.pool.checked_add(amount).ok_or(error!(GameError::MathOverflow))?;
    race.total_pool = race.total_pool.checked_add(amount).ok_or(error!(GameError::MathOverflow))?;
    race.remaining_liability = race
        .remaining_liability
        .checked_add(amount)
        .ok_or(error!(GameError::MathOverflow))?;

    emit!(BetPlaced { race: race_key, bettor, asset_index, amount, total_stake: new_stake });
    Ok(())
}

#[derive(Accounts)]
pub struct StartRace<'info> {
    #[account(mut)]
    pub race: Account<'info, Race>,
    /// CHECK: address-constrained to the instructions sysvar.
    #[account(address = instructions_sysvar::ID)]
    pub instructions: UncheckedAccount<'info>,
}

/// Freezes active contenders and their P0 at the betting cutoff. If too few
/// assets attracted bets the race is cancelled and no attestation is needed.
pub fn handle_start_race(ctx: Context<StartRace>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let race = &mut ctx.accounts.race;
    require!(race.status == RaceStatus::Betting, GameError::InvalidRaceStatus);
    require!(now >= race.betting_end_time, GameError::StartTooEarly);
    require!(
        now <= add_time(race.betting_end_time, race.start_grace)?,
        GameError::StartWindowExpired
    );

    let active_count = race.assets.iter().filter(|a| a.pool > 0).count() as u8;
    if active_count < race.min_active_contenders {
        race.status = RaceStatus::Cancelled;
        emit!(RaceCancelled { race: race.key(), reason: RaceCancelReason::InsufficientActiveContenders });
        return Ok(());
    }

    let attestation = load_verified_attestation(&ctx.accounts.instructions, &race.oracle_signer)?;
    attestation.validate_boundary(race.betting_end_time, now).map_err(game_err)?;
    for asset in race.assets.iter_mut() {
        if asset.pool == 0 {
            continue;
        }
        asset.start_price = attestation.price_for(&asset.price_source, asset.price_decimals).map_err(game_err)?;
        asset.active = true;
    }

    race.active_count = active_count;
    race.start_slot = attestation.prev_slot;
    race.start_price_time = attestation.prev_block_time;
    race.race_end_time = add_time(race.betting_end_time, race.race_duration)?;
    race.status = RaceStatus::Running;
    emit!(RaceStarted {
        race: race.key(),
        start_slot: race.start_slot,
        race_end_time: race.race_end_time,
        active_count,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct RaceTimeout<'info> {
    #[account(mut)]
    pub race: Account<'info, Race>,
}

/// Cancels a race that never got a valid P0 before its start grace expired.
pub fn handle_cancel_unstarted_race(ctx: Context<RaceTimeout>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let race = &mut ctx.accounts.race;
    require!(race.status == RaceStatus::Betting, GameError::InvalidRaceStatus);
    require!(
        now > add_time(race.betting_end_time, race.start_grace)?,
        GameError::StartWindowStillOpen
    );
    race.status = RaceStatus::Cancelled;
    emit!(RaceCancelled { race: race.key(), reason: RaceCancelReason::StartWindowExpired });
    Ok(())
}

/// Voids a running race that could not get a valid P1 before resolution grace expired.
pub fn handle_void_expired_race(ctx: Context<RaceTimeout>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let race = &mut ctx.accounts.race;
    require!(race.status == RaceStatus::Running, GameError::InvalidRaceStatus);
    require!(
        now > add_time(race.race_end_time, race.resolution_grace)?,
        GameError::ResolutionWindowStillOpen
    );
    race.status = RaceStatus::Void;
    race.resolved_at = now;
    emit!(RaceVoided { race: race.key(), reason: VoidReason::ResolutionWindowExpired });
    Ok(())
}

#[derive(Accounts)]
pub struct ResolveRace<'info> {
    #[account(mut)]
    pub race: Account<'info, Race>,
    #[account(mut, seeds = [TREASURY_SEED, race.stake_mint.as_ref()], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(
        mut,
        seeds = [CREATOR_SEED, race.stake_mint.as_ref(), race.creator.as_ref()],
        bump = creator_earnings.bump
    )]
    pub creator_earnings: Account<'info, CreatorEarnings>,
    /// CHECK: address-constrained to the instructions sysvar.
    #[account(address = instructions_sysvar::ID)]
    pub instructions: UncheckedAccount<'info>,
    pub token_mint: Option<InterfaceAccount<'info, Mint>>,
    /// CHECK: checked against the race's associated token account.
    #[account(mut)]
    pub race_vault: Option<UncheckedAccount<'info>>,
    /// CHECK: checked against the treasury's associated token account.
    #[account(mut)]
    pub treasury_vault: Option<UncheckedAccount<'info>>,
    /// CHECK: checked against the creator-earnings associated token account.
    #[account(mut)]
    pub creator_vault: Option<UncheckedAccount<'info>>,
    pub token_program: Option<Interface<'info, TokenInterface>>,
}

/// Freezes every active contender's P1 at the race end and settles: a unique
/// top return wins, a tie voids the race.
pub fn handle_resolve_race(ctx: Context<ResolveRace>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let race = &mut ctx.accounts.race;
    require!(race.status == RaceStatus::Running, GameError::InvalidRaceStatus);
    require!(now >= race.race_end_time, GameError::ResolutionTooEarly);
    require!(
        now <= add_time(race.race_end_time, race.resolution_grace)?,
        GameError::ResolutionWindowExpired
    );

    let attestation = load_verified_attestation(&ctx.accounts.instructions, &race.oracle_signer)?;
    attestation.validate_boundary(race.race_end_time, now).map_err(game_err)?;

    let mut leader: Option<(u8, i128)> = None;
    let mut top_tied = false;
    for (i, asset) in race.assets.iter_mut().enumerate() {
        if !asset.active {
            continue;
        }
        let end_price = attestation.price_for(&asset.price_source, asset.price_decimals).map_err(game_err)?;
        asset.end_price = end_price;
        asset.return_value = calculate_return(asset.start_price, end_price)?;
        match leader {
            Some((_, best)) if asset.return_value < best => {}
            Some((_, best)) if asset.return_value == best => top_tied = true,
            _ => {
                leader = Some((i as u8, asset.return_value));
                top_tied = false;
            }
        }
    }
    race.end_slot = attestation.prev_slot;
    race.end_price_time = attestation.prev_block_time;
    race.resolved_at = now;

    let (winner, winning_return) = leader.ok_or(error!(GameError::InvalidRaceStatus))?;
    if top_tied {
        race.status = RaceStatus::Void;
        emit!(RaceVoided { race: race.key(), reason: VoidReason::TopTie });
        return Ok(());
    }

    let winning_pool = race.assets[winner as usize].pool;
    let losing_pool = race.total_pool - winning_pool;
    let fee = mul_div(losing_pool, race.fee_bp as u64, BP_DENOMINATOR)?;
    let creator_fee = mul_div(fee, CREATOR_FEE_SHARE_BP, BP_DENOMINATOR)?;
    let protocol_fee = fee - creator_fee;

    race.winning_asset_index = winner;
    race.winning_pool = winning_pool;
    race.distributable_losing_pool = losing_pool - fee;
    race.protocol_fee = protocol_fee;
    race.creator_fee = creator_fee;
    race.remaining_liability -= fee;
    race.status = RaceStatus::Resolved;
    let race_key = race.key();
    let id = race.id.to_le_bytes();
    let bump = [race.bump];
    let seeds: &[&[u8]] = &[RACE_SEED, &id, &bump];

    let accounts = &ctx.accounts;
    let spl = stake_funds::spl(&accounts.race.stake_mint, &accounts.token_mint, &accounts.token_program)?;
    let treasury_info = accounts.treasury.to_account_info();
    let creator_info = accounts.creator_earnings.to_account_info();
    if let Some(spl) = &spl {
        // Fees may only land in the protocol's own vaults.
        spl.require_vault(required(&accounts.treasury_vault)?, &treasury_info.key())?;
        spl.require_vault(required(&accounts.creator_vault)?, &creator_info.key())?;
    }
    let race_info = accounts.race.to_account_info();
    let vault = as_info(&accounts.race_vault);
    pay_from_pda(&spl, &race_info, &[seeds], vault, &treasury_info, as_info(&accounts.treasury_vault), protocol_fee)?;
    pay_from_pda(&spl, &race_info, &[seeds], vault, &creator_info, as_info(&accounts.creator_vault), creator_fee)?;

    let treasury = &mut ctx.accounts.treasury;
    treasury.accumulated_fees = treasury
        .accumulated_fees
        .checked_add(protocol_fee)
        .ok_or(error!(GameError::MathOverflow))?;
    let earnings = &mut ctx.accounts.creator_earnings;
    earnings.amount = earnings.amount.checked_add(creator_fee).ok_or(error!(GameError::MathOverflow))?;
    earnings.total_earned = earnings
        .total_earned
        .checked_add(creator_fee)
        .ok_or(error!(GameError::MathOverflow))?;

    emit!(RaceResolved {
        race: race_key,
        winning_asset_index: winner,
        winning_return,
        winning_pool,
        protocol_fee,
        creator_fee,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SettlePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub race: Account<'info, Race>,
    #[account(
        mut,
        close = owner,
        seeds = [POSITION_SEED, race.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = owner @ GameError::Unauthorized,
        has_one = race @ GameError::Unauthorized
    )]
    pub position: Account<'info, Position>,
    pub token_mint: Option<InterfaceAccount<'info, Mint>>,
    /// CHECK: checked against the race's associated token account.
    #[account(mut)]
    pub race_vault: Option<UncheckedAccount<'info>>,
    /// CHECK: owner's token account; the token program checks the mint.
    #[account(mut)]
    pub owner_token: Option<UncheckedAccount<'info>>,
    pub token_program: Option<Interface<'info, TokenInterface>>,
}

fn pay_position(ctx: &Context<SettlePosition>, amount: u64) -> Result<()> {
    let accounts = &ctx.accounts;
    let race = &accounts.race;
    let id = race.id.to_le_bytes();
    let bump = [race.bump];
    let seeds: &[&[u8]] = &[RACE_SEED, &id, &bump];
    let spl = stake_funds::spl(&race.stake_mint, &accounts.token_mint, &accounts.token_program)?;
    pay_from_pda(
        &spl,
        &race.to_account_info(),
        &[seeds],
        as_info(&accounts.race_vault),
        &accounts.owner.to_account_info(),
        as_info(&accounts.owner_token),
        amount,
    )
}

/// Pays a winning position its stake plus its pro-rata share of the losing
/// pool, then closes the position (returning its rent).
pub fn handle_claim_race(ctx: Context<SettlePosition>) -> Result<()> {
    let race = &mut ctx.accounts.race;
    let position = &ctx.accounts.position;
    require!(race.status == RaceStatus::Resolved, GameError::InvalidRaceStatus);
    require!(
        position.asset_index == race.winning_asset_index && position.stake > 0,
        GameError::NoWinningPosition
    );
    let profit = mul_div(position.stake, race.distributable_losing_pool, race.winning_pool)?;
    let payout = position.stake.checked_add(profit).ok_or(error!(GameError::MathOverflow))?;
    race.remaining_liability = race
        .remaining_liability
        .checked_sub(payout)
        .ok_or(error!(GameError::InsufficientEscrow))?;
    let race_key = race.key();
    pay_position(&ctx, payout)?;
    emit!(RaceClaimed { race: race_key, owner: ctx.accounts.owner.key(), payout });
    Ok(())
}

/// Returns the full stake of a cancelled or voided race and closes the position.
pub fn handle_refund_race(ctx: Context<SettlePosition>) -> Result<()> {
    let race = &mut ctx.accounts.race;
    let amount = ctx.accounts.position.stake;
    require!(
        race.status == RaceStatus::Cancelled || race.status == RaceStatus::Void,
        GameError::InvalidRaceStatus
    );
    require!(amount > 0, GameError::AmountZero);
    race.remaining_liability = race
        .remaining_liability
        .checked_sub(amount)
        .ok_or(error!(GameError::InsufficientEscrow))?;
    let race_key = race.key();
    pay_position(&ctx, amount)?;
    emit!(RaceRefunded { race: race_key, owner: ctx.accounts.owner.key(), amount });
    Ok(())
}

/// Lets a losing bettor reclaim the position account's rent after resolution.
pub fn handle_close_losing_position(ctx: Context<SettlePosition>) -> Result<()> {
    let race = &ctx.accounts.race;
    require!(race.status == RaceStatus::Resolved, GameError::InvalidRaceStatus);
    require!(
        ctx.accounts.position.asset_index != race.winning_asset_index,
        GameError::NotLosingPosition
    );
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum VoidReason {
    TopTie,
    ResolutionWindowExpired,
}

#[event]
pub struct BetPlaced {
    pub race: Pubkey,
    pub bettor: Pubkey,
    pub asset_index: u8,
    pub amount: u64,
    pub total_stake: u64,
}

#[event]
pub struct RaceStarted {
    pub race: Pubkey,
    pub start_slot: u64,
    pub race_end_time: i64,
    pub active_count: u8,
}

#[event]
pub struct RaceResolved {
    pub race: Pubkey,
    pub winning_asset_index: u8,
    pub winning_return: i128,
    pub winning_pool: u64,
    pub protocol_fee: u64,
    pub creator_fee: u64,
}

#[event]
pub struct RaceVoided {
    pub race: Pubkey,
    pub reason: VoidReason,
}

#[event]
pub struct RaceClaimed {
    pub race: Pubkey,
    pub owner: Pubkey,
    pub payout: u64,
}

#[event]
pub struct RaceRefunded {
    pub race: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

