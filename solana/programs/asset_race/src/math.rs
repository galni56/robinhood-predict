use anchor_lang::prelude::*;

use crate::{constants::*, error::RaceError};

/// `a * b / denominator`, rounded down, with a 128-bit intermediate.
pub fn mul_div(a: u64, b: u64, denominator: u64) -> Result<u64> {
    require!(denominator > 0, RaceError::MathOverflow);
    let value = (a as u128) * (b as u128) / (denominator as u128);
    u64::try_from(value).map_err(|_| error!(RaceError::MathOverflow))
}

/// Percentage return from `start` to `end`, scaled by `RETURN_SCALE`.
/// With u64 prices the scaled delta stays below 2^124, so it cannot overflow.
pub fn calculate_return(start: u64, end: u64) -> Result<i128> {
    require!(start > 0 && end > 0, RaceError::InvalidOraclePrice);
    let start = start as u128;
    let end = end as u128;
    if end >= start {
        Ok(((end - start) * RETURN_SCALE / start) as i128)
    } else {
        Ok(-(((start - end) * RETURN_SCALE / start) as i128))
    }
}

pub fn add_time(a: i64, b: i64) -> Result<i64> {
    a.checked_add(b).ok_or(error!(RaceError::MathOverflow))
}

/// Moves lamports out of an account this program owns. The source must stay
/// rent-exempt, so an escrow can never be drained below its own rent.
pub fn transfer_program_lamports(from: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let rent_floor = Rent::get()?.minimum_balance(from.data_len());
    let from_balance = from.lamports();
    let from_after = from_balance
        .checked_sub(amount)
        .ok_or(error!(RaceError::InsufficientEscrow))?;
    require!(from_after >= rent_floor, RaceError::InsufficientEscrow);
    let to_after = to
        .lamports()
        .checked_add(amount)
        .ok_or(error!(RaceError::MathOverflow))?;

    **from.try_borrow_mut_lamports()? = from_after;
    **to.try_borrow_mut_lamports()? = to_after;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn return_is_symmetric_in_sign() {
        assert_eq!(calculate_return(100, 110).unwrap(), (RETURN_SCALE / 10) as i128);
        assert_eq!(calculate_return(100, 90).unwrap(), -((RETURN_SCALE / 10) as i128));
        assert_eq!(calculate_return(7, 7).unwrap(), 0);
    }

    #[test]
    fn return_handles_extreme_prices() {
        assert!(calculate_return(1, u64::MAX).is_ok());
        assert!(calculate_return(u64::MAX, 1).is_ok());
        assert!(calculate_return(0, 1).is_err());
    }

    #[test]
    fn mul_div_rounds_down() {
        assert_eq!(mul_div(10, 1, 3).unwrap(), 3);
        assert_eq!(mul_div(u64::MAX, u64::MAX, u64::MAX).unwrap(), u64::MAX);
        assert!(mul_div(u64::MAX, 2, 1).is_err());
    }
}
