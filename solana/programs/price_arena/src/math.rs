use anchor_lang::prelude::*;

use crate::{constants::*, error::ArenaError, state::Entry};

/// `a * b / denominator`, rounded down, with a 128-bit intermediate.
pub fn mul_div(a: u128, b: u128, denominator: u128) -> Result<u128> {
    require!(denominator > 0, ArenaError::MathOverflow);
    let product = a.checked_mul(b).ok_or(error!(ArenaError::MathOverflow))?;
    Ok(product / denominator)
}

pub fn to_u64(value: u128) -> Result<u64> {
    u64::try_from(value).map_err(|_| error!(ArenaError::MathOverflow))
}

pub fn absolute_error(prediction: u64, final_price: u64) -> u64 {
    prediction.abs_diff(final_price)
}

/// Result order: smaller error first, then the earlier prediction.
pub fn ranks_before(a: &Entry, b: &Entry, final_price: u64) -> bool {
    let error_a = absolute_error(a.prediction, final_price);
    let error_b = absolute_error(b.prediction, final_price);
    if error_a != error_b {
        return error_a < error_b;
    }
    a.prediction_seq < b.prediction_seq
}

/// Indices of `entries` sorted by result (insertion sort; at most ten).
pub fn ranking(entries: &[Entry], final_price: u64) -> Vec<usize> {
    let mut order: Vec<usize> = (0..entries.len()).collect();
    for i in 1..order.len() {
        let candidate = order[i];
        let mut j = i;
        while j > 0 && ranks_before(&entries[candidate], &entries[order[j - 1]], final_price) {
            order[j] = order[j - 1];
            j -= 1;
        }
        order[j] = candidate;
    }
    order
}

/// Accuracy multiplier in basis points: 3x for an exact hit, falling linearly
/// to 1x at the worst winning error (the cutoff).
pub fn accuracy_multiplier_bp(error: u64, cutoff_error: u64) -> Result<u64> {
    if cutoff_error == 0 {
        return Ok(MIN_ACCURACY_MULTIPLIER_BP);
    }
    let bonus = mul_div(
        (MAX_ACCURACY_MULTIPLIER_BP - MIN_ACCURACY_MULTIPLIER_BP) as u128,
        (cutoff_error - error) as u128,
        cutoff_error as u128,
    )?;
    Ok(MIN_ACCURACY_MULTIPLIER_BP + to_u64(bonus)?)
}

pub fn add_time(a: i64, b: i64) -> Result<i64> {
    a.checked_add(b).ok_or(error!(ArenaError::MathOverflow))
}

/// Moves lamports out of an account this program owns. The source must stay
/// rent-exempt, so an escrow can never be drained below its own rent.
pub fn transfer_program_lamports(from: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let rent_floor = Rent::get()?.minimum_balance(from.data_len());
    let from_after = from
        .lamports()
        .checked_sub(amount)
        .ok_or(error!(ArenaError::InsufficientEscrow))?;
    require!(from_after >= rent_floor, ArenaError::InsufficientEscrow);
    let to_after = to
        .lamports()
        .checked_add(amount)
        .ok_or(error!(ArenaError::MathOverflow))?;

    **from.try_borrow_mut_lamports()? = from_after;
    **to.try_borrow_mut_lamports()? = to_after;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(prediction: u64, seq: u32) -> Entry {
        Entry {
            player: Pubkey::new_unique(),
            prediction,
            stake: 1,
            prediction_updated_at: 0,
            prediction_seq: seq,
            payout: 0,
            rank: 0,
            accuracy_multiplier_bp: 0,
            settled: false,
        }
    }

    #[test]
    fn ranking_orders_by_error_then_seq() {
        let entries = vec![entry(1_100, 0), entry(990, 1), entry(1_010, 2), entry(1_000, 3), entry(900, 4)];
        // Final 1000: errors 100, 10, 10, 0, 100. Ties go to the lower seq.
        assert_eq!(ranking(&entries, 1_000), vec![3, 1, 2, 0, 4]);
    }

    #[test]
    fn multiplier_is_linear_between_one_and_three() {
        assert_eq!(accuracy_multiplier_bp(0, 10).unwrap(), 30_000);
        assert_eq!(accuracy_multiplier_bp(5, 10).unwrap(), 20_000);
        assert_eq!(accuracy_multiplier_bp(10, 10).unwrap(), 10_000);
        assert_eq!(accuracy_multiplier_bp(0, 0).unwrap(), 10_000);
    }
}
