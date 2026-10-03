//! Stake movement shared by Prophet programs: native SOL held as lamports on a
//! game PDA, or an SPL / Token-2022 token held in that PDA's associated token
//! account ("vault").
//!
//! Only plain mints may be approved as stake mints (`Spl::require_plain_mint`):
//! Token-2022 extensions such as transfer fees, transfer hooks or a permanent
//! delegate would break stake accounting or let a third party move escrowed
//! tokens. Metadata and group extensions are allowed; they change neither.

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{self, get_associated_token_address_with_program_id},
    token_interface::{self, Mint, TokenInterface, TransferChecked},
};

/// Stake-mint sentinel meaning "native SOL held as lamports".
pub const NATIVE_SOL: Pubkey = Pubkey::new_from_array([0u8; 32]);

#[error_code(offset = 7000)]
pub enum FundsError {
    #[msg("Token stakes need the mint, token program, vault and token accounts")]
    MissingTokenAccounts,
    #[msg("Mint does not match the game's stake mint")]
    WrongMint,
    #[msg("Token program does not own the stake mint")]
    WrongTokenProgram,
    #[msg("Vault is not the expected associated token account")]
    WrongVault,
    #[msg("Escrow balance is too low")]
    InsufficientEscrow,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Stake mints must not carry Token-2022 extensions other than metadata")]
    UnsupportedMintExtension,
}

/// Length of a mint without extensions (SPL Token and Token-2022).
const BASE_MINT_LEN: usize = 82;
/// Token-2022 pads an extended mint to the token-account length, then stores
/// the account type and the extension TLV entries.
const ACCOUNT_TYPE_OFFSET: usize = 165;
const ACCOUNT_TYPE_MINT: u8 = 1;
/// Token-2022 `ExtensionType`s that touch neither balances nor transfers:
/// MetadataPointer, TokenMetadata, GroupPointer, TokenGroup,
/// GroupMemberPointer, TokenGroupMember.
const HARMLESS_MINT_EXTENSIONS: [u16; 6] = [18, 19, 20, 21, 22, 23];

/// Mint and token program for an SPL-denominated game.
pub struct Spl<'a, 'info> {
    pub mint: &'a InterfaceAccount<'info, Mint>,
    pub token_program: &'a Interface<'info, TokenInterface>,
}

/// `None` for native SOL; otherwise the validated mint and token program.
pub fn spl<'a, 'info>(
    stake_mint: &Pubkey,
    mint: &'a Option<InterfaceAccount<'info, Mint>>,
    token_program: &'a Option<Interface<'info, TokenInterface>>,
) -> Result<Option<Spl<'a, 'info>>> {
    if *stake_mint == NATIVE_SOL {
        return Ok(None);
    }
    let mint = mint.as_ref().ok_or(error!(FundsError::MissingTokenAccounts))?;
    let token_program = token_program
        .as_ref()
        .ok_or(error!(FundsError::MissingTokenAccounts))?;
    require_keys_eq!(mint.key(), *stake_mint, FundsError::WrongMint);
    require_keys_eq!(
        *mint.to_account_info().owner,
        token_program.key(),
        FundsError::WrongTokenProgram
    );
    Ok(Some(Spl { mint, token_program }))
}

/// Unwraps an optional account that token stakes require.
pub fn required<'a, T>(account: &'a Option<T>) -> Result<&'a T> {
    account.as_ref().ok_or(error!(FundsError::MissingTokenAccounts))
}

impl<'a, 'info> Spl<'a, 'info> {
    /// Rejects mints with any Token-2022 extension outside the metadata/group
    /// allowlist. Extensions are fixed when a mint is created, so checking at
    /// approval time covers the mint's whole life.
    pub fn require_plain_mint(&self) -> Result<()> {
        let info = self.mint.to_account_info();
        let data = info.try_borrow_data()?;
        if data.len() == BASE_MINT_LEN {
            return Ok(());
        }
        require!(
            data.len() > ACCOUNT_TYPE_OFFSET && data[ACCOUNT_TYPE_OFFSET] == ACCOUNT_TYPE_MINT,
            FundsError::UnsupportedMintExtension
        );
        let mut at = ACCOUNT_TYPE_OFFSET + 1;
        while at + 4 <= data.len() {
            let kind = u16::from_le_bytes([data[at], data[at + 1]]);
            if kind == 0 {
                break; // Uninitialized: the rest is unused space.
            }
            require!(HARMLESS_MINT_EXTENSIONS.contains(&kind), FundsError::UnsupportedMintExtension);
            at += 4 + u16::from_le_bytes([data[at + 2], data[at + 3]]) as usize;
        }
        Ok(())
    }

    pub fn vault_address(&self, authority: &Pubkey) -> Pubkey {
        get_associated_token_address_with_program_id(authority, &self.mint.key(), &self.token_program.key())
    }

    /// Requires `vault` to be `authority`'s associated token account.
    pub fn require_vault(&self, vault: &AccountInfo, authority: &Pubkey) -> Result<()> {
        require_keys_eq!(vault.key(), self.vault_address(authority), FundsError::WrongVault);
        Ok(())
    }

    /// Creates `authority`'s vault if it does not exist yet.
    pub fn create_vault(
        &self,
        payer: &AccountInfo<'info>,
        vault: &AccountInfo<'info>,
        authority: &AccountInfo<'info>,
        system_program: &AccountInfo<'info>,
        associated_token_program: &AccountInfo<'info>,
    ) -> Result<()> {
        self.require_vault(vault, authority.key)?;
        associated_token::create_idempotent(CpiContext::new(
            associated_token_program.key(),
            associated_token::Create {
                payer: payer.clone(),
                associated_token: vault.clone(),
                authority: authority.clone(),
                mint: self.mint.to_account_info(),
                system_program: system_program.clone(),
                token_program: self.token_program.to_account_info(),
            },
        ))
    }

    /// `transfer_checked`; the token program enforces that both accounts hold
    /// this mint and that `authority` owns `from`.
    pub fn transfer(
        &self,
        from: &AccountInfo<'info>,
        to: &AccountInfo<'info>,
        authority: &AccountInfo<'info>,
        amount: u64,
        signer_seeds: &[&[&[u8]]],
    ) -> Result<()> {
        if amount == 0 {
            return Ok(());
        }
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                self.token_program.key(),
                TransferChecked {
                    from: from.clone(),
                    mint: self.mint.to_account_info(),
                    to: to.clone(),
                    authority: authority.clone(),
                },
                signer_seeds,
            ),
            amount,
            self.mint.decimals,
        )
    }
}

/// Native SOL from a signer into a game PDA.
pub fn deposit_native<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    anchor_lang::system_program::transfer(
        CpiContext::new(
            anchor_lang::system_program::ID,
            anchor_lang::system_program::Transfer { from: from.clone(), to: to.clone() },
        ),
        amount,
    )
}

/// Moves lamports out of an account the calling program owns. The source must
/// stay rent-exempt, so an escrow can never be drained below its own rent.
pub fn transfer_program_lamports(from: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let rent_floor = Rent::get()?.minimum_balance(from.data_len());
    let from_after = from
        .lamports()
        .checked_sub(amount)
        .ok_or(error!(FundsError::InsufficientEscrow))?;
    require!(from_after >= rent_floor, FundsError::InsufficientEscrow);
    let to_after = to
        .lamports()
        .checked_add(amount)
        .ok_or(error!(FundsError::MathOverflow))?;

    **from.try_borrow_mut_lamports()? = from_after;
    **to.try_borrow_mut_lamports()? = to_after;
    Ok(())
}

/// Pays `amount` out of a program-owned PDA: lamports for native SOL, or a
/// `transfer_checked` from the PDA's vault signed with `signer_seeds`.
#[allow(clippy::too_many_arguments)]
pub fn pay_from_pda<'a, 'info>(
    spl: &Option<Spl<'a, 'info>>,
    pda: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
    vault: Option<&AccountInfo<'info>>,
    native_recipient: &AccountInfo<'info>,
    token_recipient: Option<&AccountInfo<'info>>,
    amount: u64,
) -> Result<()> {
    match spl {
        None => transfer_program_lamports(pda, native_recipient, amount),
        Some(spl) => {
            let vault = vault.ok_or(error!(FundsError::MissingTokenAccounts))?;
            let recipient = token_recipient.ok_or(error!(FundsError::MissingTokenAccounts))?;
            spl.require_vault(vault, pda.key)?;
            spl.transfer(vault, recipient, pda, amount, signer_seeds)
        }
    }
}
