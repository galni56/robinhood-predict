use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenInterface},
};
use solana_sdk_ids::sysvar::instructions as instructions_sysvar;
use stake_funds::{deposit_native, pay_from_pda, required};

use crate::{
    attestation::{arena_err, load_verified_attestation},
    constants::*,
    error::ArenaError,
    math::*,
    state::*,
};

fn as_info<'a, 'info>(account: &'a Option<UncheckedAccount<'info>>) -> Option<&'a AccountInfo<'info>> {
    account.as_ref().map(|a| a.as_ref())
}

#[derive(Accounts)]
#[instruction(title: String, duration: i64, stake_mint: Pubkey)]
pub struct CreateArena<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [STAKE_MINT_SEED, stake_mint.as_ref()], bump = stake_mint_config.bump)]
    pub stake_mint_config: Account<'info, StakeMintConfig>,
    pub approved_asset: Account<'info, ApprovedAsset>,
    #[account(
        init,
        payer = creator,
        space = 8 + Arena::INIT_SPACE,
        seeds = [ARENA_SEED, config.arena_count.to_le_bytes().as_ref()],
        bump
    )]
    pub arena: Account<'info, Arena>,
    #[account(
        init_if_needed,
        payer = creator,
        space = 8 + CreatorEarnings::INIT_SPACE,
        seeds = [CREATOR_SEED, stake_mint.as_ref(), creator.key().as_ref()],
        bump
    )]
    pub creator_earnings: Account<'info, CreatorEarnings>,
    pub token_mint: Option<InterfaceAccount<'info, Mint>>,
    /// CHECK: must be the arena's associated token account; created here.
    #[account(mut)]
    pub arena_vault: Option<UncheckedAccount<'info>>,
    /// CHECK: must be the creator-earnings associated token account; created here.
    #[account(mut)]
    pub creator_vault: Option<UncheckedAccount<'info>>,
    pub token_program: Option<Interface<'info, TokenInterface>>,
    pub associated_token_program: Option<Program<'info, AssociatedToken>>,
    pub system_program: Program<'info, System>,
}

/// Opens a ten-minute lobby on one approved asset. The contest runs for
/// `duration` after the lobby; both boundaries are fixed here, on-chain.
pub fn handle_create_arena(ctx: Context<CreateArena>, title: String, duration: i64, stake_mint: Pubkey) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let config = &ctx.accounts.config;
    let asset = &ctx.accounts.approved_asset;
    let stake = &ctx.accounts.stake_mint_config;
    require!(!config.paused, ArenaError::ActivityPaused);
    require!(stake.enabled, ArenaError::UnsupportedStakeMint);
    require!(asset.enabled, ArenaError::AssetNotApproved);
    require!(SUPPORTED_DURATIONS.contains(&duration), ArenaError::UnsupportedDuration);
    let bytes = title.as_bytes();
    require!(
        !bytes.is_empty() && bytes.len() <= MAX_TITLE_BYTES && bytes.iter().any(|b| *b > 0x20),
        ArenaError::InvalidTitle
    );
    let starts_at = add_time(now, LOBBY_DURATION)?;
    let deadline = add_time(starts_at, duration)?;
    add_time(deadline, RESOLUTION_GRACE)?;

    let (min_stake, max_stake) = (stake.min_stake, stake.max_stake);
    let creator = ctx.accounts.creator.key();
    if let Some(spl) = stake_funds::spl(&stake_mint, &ctx.accounts.token_mint, &ctx.accounts.token_program)? {
        let payer = ctx.accounts.creator.to_account_info();
        let system = ctx.accounts.system_program.to_account_info();
        let ata_program = required(&ctx.accounts.associated_token_program)?.to_account_info();
        let arena_vault = required(&ctx.accounts.arena_vault)?.to_account_info();
        let creator_vault = required(&ctx.accounts.creator_vault)?.to_account_info();
        spl.create_vault(&payer, &arena_vault, &ctx.accounts.arena.to_account_info(), &system, &ata_program)?;
        spl.create_vault(&payer, &creator_vault, &ctx.accounts.creator_earnings.to_account_info(), &system, &ata_program)?;
    }
    let earnings = &mut ctx.accounts.creator_earnings;
    if earnings.creator == Pubkey::default() {
        earnings.creator = creator;
        earnings.stake_mint = stake_mint;
        earnings.bump = ctx.bumps.creator_earnings;
    }

    let arena = &mut ctx.accounts.arena;
    arena.id = config.arena_count;
    arena.asset_id = asset.asset_id;
    arena.price_source = asset.price_source;
    arena.price_decimals = asset.price_decimals;
    arena.category = asset.category;
    arena.creator = creator;
    arena.stake_mint = stake_mint;
    arena.oracle_signer = config.oracle_signer;
    arena.status = ArenaStatus::Open;
    arena.cancel_reason = CancelReason::None;
    arena.title = title;
    arena.created_at = now;
    arena.starts_at = starts_at;
    arena.deadline = deadline;
    arena.duration = duration;
    arena.fee_bp = FEE_BP;
    arena.min_stake = min_stake;
    arena.max_stake = max_stake;
    arena.bump = ctx.bumps.arena;

    let config = &mut ctx.accounts.config;
    config.arena_count = config.arena_count.checked_add(1).ok_or(error!(ArenaError::MathOverflow))?;

    emit!(ArenaCreated {
        arena: arena.key(),
        arena_id: arena.id,
        creator,
        asset_id: arena.asset_id,
        starts_at,
        deadline,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct PlayerEntry<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub arena: Account<'info, Arena>,
    pub token_mint: Option<InterfaceAccount<'info, Mint>>,
    /// CHECK: player's token account; the token program checks mint and owner.
    #[account(mut)]
    pub player_token: Option<UncheckedAccount<'info>>,
    /// CHECK: checked against the arena's associated token account.
    #[account(mut)]
    pub arena_vault: Option<UncheckedAccount<'info>>,
    pub token_program: Option<Interface<'info, TokenInterface>>,
    pub system_program: Program<'info, System>,
}

fn require_open_lobby(arena: &Arena, now: i64) -> Result<()> {
    require!(arena.status == ArenaStatus::Open, ArenaError::ArenaNotOpen);
    require!(now < arena.starts_at, ArenaError::LobbyClosed);
    Ok(())
}

fn deposit(ctx: &Context<PlayerEntry>, amount: u64) -> Result<()> {
    let accounts = &ctx.accounts;
    let player = accounts.player.to_account_info();
    let arena = accounts.arena.to_account_info();
    match stake_funds::spl(&accounts.arena.stake_mint, &accounts.token_mint, &accounts.token_program)? {
        None => deposit_native(&player, &arena, amount),
        Some(spl) => {
            let vault = required(&accounts.arena_vault)?.to_account_info();
            spl.require_vault(&vault, arena.key)?;
            spl.transfer(&required(&accounts.player_token)?.to_account_info(), &vault, &player, amount, &[])
        }
    }
}

pub fn handle_enter(ctx: Context<PlayerEntry>, prediction: u64, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(!ctx.accounts.config.paused, ArenaError::ActivityPaused);
    let player = ctx.accounts.player.key();
    {
        let arena = &ctx.accounts.arena;
        require_open_lobby(arena, now)?;
        require!(arena.entry_index(&player).is_none(), ArenaError::AlreadyEntered);
        require!(arena.entries.len() < MAX_PARTICIPANTS, ArenaError::ArenaFull);
        require!(prediction > 0, ArenaError::InvalidPrediction);
        require!(
            amount >= arena.min_stake && amount <= arena.max_stake,
            ArenaError::InvalidStake
        );
    }
    deposit(&ctx, amount)?;

    let arena = &mut ctx.accounts.arena;
    let seq = arena.next_prediction_seq;
    arena.next_prediction_seq += 1;
    arena.entries.push(Entry {
        player,
        prediction,
        stake: amount,
        prediction_updated_at: now,
        prediction_seq: seq,
        payout: 0,
        rank: NO_RANK,
        accuracy_multiplier_bp: 0,
        settled: false,
    });
    arena.total_pool = arena.total_pool.checked_add(amount).ok_or(error!(ArenaError::MathOverflow))?;
    emit!(EntryChanged { arena: arena.key(), player, total_stake: amount, prediction_changed: true });
    Ok(())
}

/// Changes the prediction, adds stake, or both, while the lobby is open.
/// `new_prediction == 0` keeps the current one. A prediction change moves the
/// player behind everyone who predicted earlier; a pure top-up does not.
pub fn handle_update_entry(ctx: Context<PlayerEntry>, new_prediction: u64, additional_amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(!ctx.accounts.config.paused, ArenaError::ActivityPaused);
    let player = ctx.accounts.player.key();
    let (index, prediction_changed) = {
        let arena = &ctx.accounts.arena;
        require_open_lobby(arena, now)?;
        let index = arena.entry_index(&player).ok_or(error!(ArenaError::NotEntered))?;
        let entry = &arena.entries[index];
        let prediction_changed = new_prediction > 0 && new_prediction != entry.prediction;
        require!(prediction_changed || additional_amount > 0, ArenaError::NothingChanged);
        let new_stake = entry
            .stake
            .checked_add(additional_amount)
            .ok_or(error!(ArenaError::MathOverflow))?;
        require!(new_stake <= arena.max_stake, ArenaError::InvalidStake);
        (index, prediction_changed)
    };
    if additional_amount > 0 {
        deposit(&ctx, additional_amount)?;
    }

    let arena = &mut ctx.accounts.arena;
    arena.total_pool = arena
        .total_pool
        .checked_add(additional_amount)
        .ok_or(error!(ArenaError::MathOverflow))?;
    let seq = arena.next_prediction_seq;
    if prediction_changed {
        arena.next_prediction_seq += 1;
    }
    let entry = &mut arena.entries[index];
    entry.stake += additional_amount;
    if prediction_changed {
        entry.prediction = new_prediction;
        entry.prediction_updated_at = now;
        entry.prediction_seq = seq;
    }
    let total_stake = entry.stake;
    emit!(EntryChanged { arena: arena.key(), player, total_stake, prediction_changed });
    Ok(())
}

#[derive(Accounts)]
pub struct ArenaTimeout<'info> {
    #[account(mut)]
    pub arena: Account<'info, Arena>,
}

fn cancel(arena: &mut Arena, key: Pubkey, now: i64, reason: CancelReason) {
    arena.status = ArenaStatus::Cancelled;
    arena.cancel_reason = reason;
    arena.resolved_at = now;
    arena.remaining_liability = arena.total_pool;
    emit!(ArenaCancelled { arena: key, reason });
}

/// Cancels an arena whose lobby closed with fewer than two players.
pub fn handle_cancel_if_insufficient(ctx: Context<ArenaTimeout>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.arena.key();
    let arena = &mut ctx.accounts.arena;
    require!(arena.status == ArenaStatus::Open, ArenaError::ArenaNotOpen);
    require!(now >= arena.starts_at, ArenaError::LobbyStillOpen);
    require!(arena.entries.len() < MIN_PARTICIPANTS, ArenaError::EnoughParticipants);
    cancel(arena, key, now, CancelReason::InsufficientParticipants);
    Ok(())
}

/// Cancels an arena nobody resolved within the grace period. Replaces the EVM
/// owner-only `voidArena`: no one can cancel an arena whose result is known.
pub fn handle_cancel_expired_arena(ctx: Context<ArenaTimeout>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.arena.key();
    let arena = &mut ctx.accounts.arena;
    require!(arena.status == ArenaStatus::Open, ArenaError::ArenaNotOpen);
    require!(
        now > add_time(arena.deadline, RESOLUTION_GRACE)?,
        ArenaError::ResolutionWindowStillOpen
    );
    cancel(arena, key, now, CancelReason::ResolutionWindowExpired);
    Ok(())
}

#[derive(Accounts)]
pub struct ResolveArena<'info> {
    #[account(mut)]
    pub arena: Account<'info, Arena>,
    #[account(mut, seeds = [TREASURY_SEED, arena.stake_mint.as_ref()], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(
        mut,
        seeds = [CREATOR_SEED, arena.stake_mint.as_ref(), arena.creator.as_ref()],
        bump = creator_earnings.bump
    )]
    pub creator_earnings: Account<'info, CreatorEarnings>,
    /// CHECK: address-constrained to the instructions sysvar.
    #[account(address = instructions_sysvar::ID)]
    pub instructions: UncheckedAccount<'info>,
    pub token_mint: Option<InterfaceAccount<'info, Mint>>,
    /// CHECK: checked against the arena's associated token account.
    #[account(mut)]
    pub arena_vault: Option<UncheckedAccount<'info>>,
    /// CHECK: checked against the treasury's associated token account.
    #[account(mut)]
    pub treasury_vault: Option<UncheckedAccount<'info>>,
    /// CHECK: checked against the creator-earnings associated token account.
    #[account(mut)]
    pub creator_vault: Option<UncheckedAccount<'info>>,
    pub token_program: Option<Interface<'info, TokenInterface>>,
}

/// Settles from the last block strictly before the deadline. The closest half
/// of the field (rounded down) shares the losing half's stakes minus the fee,
/// weighted by stake x accuracy multiplier (1x-3x).
pub fn handle_resolve(ctx: Context<ResolveArena>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.arena.key();
    let arena = &mut ctx.accounts.arena;
    require!(arena.status == ArenaStatus::Open, ArenaError::ArenaNotOpen);
    require!(now >= arena.deadline, ArenaError::TooEarly);
    require!(
        now <= add_time(arena.deadline, RESOLUTION_GRACE)?,
        ArenaError::ResolutionWindowExpired
    );
    if arena.entries.len() < MIN_PARTICIPANTS {
        cancel(arena, key, now, CancelReason::InsufficientParticipants);
        return Ok(());
    }

    let attestation = load_verified_attestation(&ctx.accounts.instructions, &arena.oracle_signer)?;
    attestation.validate_boundary(arena.deadline, now).map_err(arena_err)?;
    let final_price = attestation
        .price_for(&arena.price_source, arena.price_decimals)
        .map_err(arena_err)?;
    if arena.deadline - attestation.prev_block_time > MAX_PRICE_STALENESS {
        cancel(arena, key, now, CancelReason::StaleDeadlinePrice);
        return Ok(());
    }

    let order = ranking(&arena.entries, final_price);
    let winner_count = order.len() / 2;
    let losing_pool: u64 = order[winner_count..].iter().map(|&i| arena.entries[i].stake).sum();
    let stated_fee = to_u64(mul_div(losing_pool as u128, arena.fee_bp as u128, BP_DENOMINATOR as u128)?)?;
    let distributable = losing_pool - stated_fee;
    let cutoff_error = absolute_error(arena.entries[order[winner_count - 1]].prediction, final_price);

    let mut scores = Vec::with_capacity(winner_count);
    let mut score_total: u128 = 0;
    for (position, &i) in order[..winner_count].iter().enumerate() {
        let entry = &mut arena.entries[i];
        let multiplier = accuracy_multiplier_bp(absolute_error(entry.prediction, final_price), cutoff_error)?;
        let score = (entry.stake as u128) * (multiplier as u128);
        entry.rank = (position + 1) as u8;
        entry.accuracy_multiplier_bp = multiplier as u32;
        scores.push(score);
        score_total += score;
    }

    let mut payout_total: u64 = 0;
    for (k, &i) in order[..winner_count].iter().enumerate() {
        let winnings = to_u64(mul_div(distributable as u128, scores[k], score_total)?)?;
        let entry = &mut arena.entries[i];
        entry.payout = entry.stake + winnings;
        payout_total += entry.payout;
    }
    for (position, &i) in order.iter().enumerate().skip(winner_count) {
        arena.entries[i].rank = (position + 1) as u8;
    }

    // The creator receives exactly half of the stated fee; Prophet keeps the
    // other half plus integer-division dust.
    let protocol_take = arena.total_pool - payout_total;
    let creator_fee = to_u64(mul_div(stated_fee as u128, CREATOR_FEE_SHARE_BP as u128, BP_DENOMINATOR as u128)?)?;
    let protocol_fee = protocol_take - creator_fee;

    arena.status = ArenaStatus::Resolved;
    arena.resolved_at = now;
    arena.winner_count = winner_count as u8;
    arena.final_price = final_price;
    arena.final_slot = attestation.prev_slot;
    arena.final_price_time = attestation.prev_block_time;
    arena.protocol_fee = protocol_fee;
    arena.creator_fee = creator_fee;
    arena.remaining_liability = payout_total;

    let id = arena.id.to_le_bytes();
    let bump = [arena.bump];
    let seeds: &[&[u8]] = &[ARENA_SEED, &id, &bump];
    let accounts = &ctx.accounts;
    let spl = stake_funds::spl(&accounts.arena.stake_mint, &accounts.token_mint, &accounts.token_program)?;
    let treasury_info = accounts.treasury.to_account_info();
    let creator_info = accounts.creator_earnings.to_account_info();
    if let Some(spl) = &spl {
        // Fees may only land in the protocol's own vaults.
        spl.require_vault(required(&accounts.treasury_vault)?, &treasury_info.key())?;
        spl.require_vault(required(&accounts.creator_vault)?, &creator_info.key())?;
    }
    let arena_info = accounts.arena.to_account_info();
    let vault = as_info(&accounts.arena_vault);
    pay_from_pda(&spl, &arena_info, &[seeds], vault, &treasury_info, as_info(&accounts.treasury_vault), protocol_fee)?;
    pay_from_pda(&spl, &arena_info, &[seeds], vault, &creator_info, as_info(&accounts.creator_vault), creator_fee)?;
    let treasury = &mut ctx.accounts.treasury;
    treasury.accumulated_fees = treasury
        .accumulated_fees
        .checked_add(protocol_fee)
        .ok_or(error!(ArenaError::MathOverflow))?;
    let earnings = &mut ctx.accounts.creator_earnings;
    earnings.amount = earnings.amount.checked_add(creator_fee).ok_or(error!(ArenaError::MathOverflow))?;
    earnings.total_earned = earnings
        .total_earned
        .checked_add(creator_fee)
        .ok_or(error!(ArenaError::MathOverflow))?;

    emit!(ArenaResolved {
        arena: key,
        final_price,
        winner_count: winner_count as u8,
        protocol_fee,
        creator_fee,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SettleEntry<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(mut)]
    pub arena: Account<'info, Arena>,
    pub token_mint: Option<InterfaceAccount<'info, Mint>>,
    /// CHECK: checked against the arena's associated token account.
    #[account(mut)]
    pub arena_vault: Option<UncheckedAccount<'info>>,
    /// CHECK: player's token account; the token program checks the mint.
    #[account(mut)]
    pub player_token: Option<UncheckedAccount<'info>>,
    pub token_program: Option<Interface<'info, TokenInterface>>,
}

fn pay_player(ctx: &Context<SettleEntry>, amount: u64) -> Result<()> {
    let accounts = &ctx.accounts;
    let arena = &accounts.arena;
    let id = arena.id.to_le_bytes();
    let bump = [arena.bump];
    let seeds: &[&[u8]] = &[ARENA_SEED, &id, &bump];
    let spl = stake_funds::spl(&arena.stake_mint, &accounts.token_mint, &accounts.token_program)?;
    pay_from_pda(
        &spl,
        &arena.to_account_info(),
        &[seeds],
        as_info(&accounts.arena_vault),
        &accounts.player.to_account_info(),
        as_info(&accounts.player_token),
        amount,
    )
}

pub fn handle_claim(ctx: Context<SettleEntry>) -> Result<()> {
    let player = ctx.accounts.player.key();
    let key = ctx.accounts.arena.key();
    let arena = &mut ctx.accounts.arena;
    require!(arena.status == ArenaStatus::Resolved, ArenaError::ArenaNotResolved);
    let index = arena.entry_index(&player).ok_or(error!(ArenaError::NoWinningPayout))?;
    let entry = &mut arena.entries[index];
    require!(entry.payout > 0, ArenaError::NoWinningPayout);
    require!(!entry.settled, ArenaError::AlreadySettled);
    let payout = entry.payout;
    entry.settled = true;
    arena.remaining_liability = arena
        .remaining_liability
        .checked_sub(payout)
        .ok_or(error!(ArenaError::InsufficientEscrow))?;
    pay_player(&ctx, payout)?;
    emit!(Claimed { arena: key, player, payout });
    Ok(())
}

pub fn handle_refund(ctx: Context<SettleEntry>) -> Result<()> {
    let player = ctx.accounts.player.key();
    let key = ctx.accounts.arena.key();
    let arena = &mut ctx.accounts.arena;
    require!(arena.status == ArenaStatus::Cancelled, ArenaError::ArenaNotCancelled);
    let index = arena.entry_index(&player).ok_or(error!(ArenaError::NotEntered))?;
    let entry = &mut arena.entries[index];
    require!(!entry.settled, ArenaError::AlreadySettled);
    let amount = entry.stake;
    entry.settled = true;
    arena.remaining_liability = arena
        .remaining_liability
        .checked_sub(amount)
        .ok_or(error!(ArenaError::InsufficientEscrow))?;
    pay_player(&ctx, amount)?;
    emit!(Refunded { arena: key, player, amount });
    Ok(())
}

#[event]
pub struct ArenaCreated {
    pub arena: Pubkey,
    pub arena_id: u64,
    pub creator: Pubkey,
    pub asset_id: [u8; 32],
    pub starts_at: i64,
    pub deadline: i64,
}

/// Deliberately omits the prediction (it is still public in account data).
#[event]
pub struct EntryChanged {
    pub arena: Pubkey,
    pub player: Pubkey,
    pub total_stake: u64,
    pub prediction_changed: bool,
}

#[event]
pub struct ArenaResolved {
    pub arena: Pubkey,
    pub final_price: u64,
    pub winner_count: u8,
    pub protocol_fee: u64,
    pub creator_fee: u64,
}

#[event]
pub struct ArenaCancelled {
    pub arena: Pubkey,
    pub reason: CancelReason,
}

#[event]
pub struct Claimed {
    pub arena: Pubkey,
    pub player: Pubkey,
    pub payout: u64,
}

#[event]
pub struct Refunded {
    pub arena: Pubkey,
    pub player: Pubkey,
    pub amount: u64,
}
