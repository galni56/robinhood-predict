//! Prophet nickname registry on Solana. Port of `NicknameRegistry.sol`.
//!
//! Standalone from the game programs on purpose: a bug here cannot touch game
//! funds. A nickname is only what a wallet itself wrote on-chain. There is no
//! admin override and no uniqueness check; the address stays the identity.

use anchor_lang::prelude::*;

declare_id!("9hbJLs2EGPdvVLcxQs2N2QqZUhh8r2J86PK8rYBRxJdt");

#[constant]
pub const NICKNAME_SEED: &[u8] = b"nickname";
pub const MAX_NICKNAME_BYTES: usize = 24;

#[program]
pub mod nickname_registry {
    use super::*;

    /// Sets or replaces the signer's own nickname.
    pub fn set_nickname(ctx: Context<SetNickname>, nickname: String) -> Result<()> {
        require!(!nickname.is_empty(), NicknameError::EmptyNickname);
        require!(nickname.len() <= MAX_NICKNAME_BYTES, NicknameError::NicknameTooLong);
        let record = &mut ctx.accounts.nickname;
        record.owner = ctx.accounts.owner.key();
        record.nickname = nickname.clone();
        record.bump = ctx.bumps.nickname;
        emit!(NicknameSet { owner: record.owner, nickname });
        Ok(())
    }

    /// Clears the signer's nickname and returns the account rent.
    pub fn clear_nickname(ctx: Context<ClearNickname>) -> Result<()> {
        emit!(NicknameSet { owner: ctx.accounts.owner.key(), nickname: String::new() });
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct Nickname {
    pub owner: Pubkey,
    #[max_len(MAX_NICKNAME_BYTES)]
    pub nickname: String,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct SetNickname<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Nickname::INIT_SPACE,
        seeds = [NICKNAME_SEED, owner.key().as_ref()],
        bump
    )]
    pub nickname: Account<'info, Nickname>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClearNickname<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        close = owner,
        seeds = [NICKNAME_SEED, owner.key().as_ref()],
        bump = nickname.bump,
        has_one = owner @ NicknameError::Unauthorized
    )]
    pub nickname: Account<'info, Nickname>,
}

#[event]
pub struct NicknameSet {
    pub owner: Pubkey,
    pub nickname: String,
}

#[error_code]
pub enum NicknameError {
    #[msg("Nickname is longer than 24 bytes")]
    NicknameTooLong,
    #[msg("Use clear_nickname to remove a nickname")]
    EmptyNickname,
    #[msg("Signer does not own this nickname")]
    Unauthorized,
}
