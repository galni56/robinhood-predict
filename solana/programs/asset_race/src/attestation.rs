//! Signed DEX-pool price attestations.
//!
//! The off-chain collector reads every reviewed pool at the last block strictly
//! before a boundary time T and signs one message covering all of them, plus
//! the metadata of that block and its child. The program never trusts a price
//! passed as an argument: it reads the message straight out of the Ed25519
//! precompile instruction placed immediately before the calling instruction,
//! so the runtime has already verified the signature over exactly these bytes.
//!
//! This mirrors `SignedPoolRaceOracle.sol`: the price is P(T-) from the parent
//! block, and the child block only proves where T falls.

use anchor_lang::prelude::*;
use solana_instructions_sysvar::{load_current_index_checked, load_instruction_at_checked};
use solana_sdk_ids::ed25519_program;

use crate::{constants::*, error::RaceError};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct PriceEntry {
    pub price_source: Pubkey,
    pub price: u64,
    pub decimals: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct PoolAttestation {
    pub domain: [u8; 8],
    pub version: u8,
    /// Binds the message to this program so it cannot be replayed elsewhere.
    pub program_id: Pubkey,
    pub target_timestamp: i64,
    pub prev_slot: u64,
    pub prev_blockhash: [u8; 32],
    pub prev_block_time: i64,
    pub next_slot: u64,
    pub next_parent_slot: u64,
    pub next_parent_blockhash: [u8; 32],
    pub next_block_time: i64,
    pub entries: Vec<PriceEntry>,
}

// Ed25519 precompile layout: u8 count, u8 padding, then per signature seven
// little-endian u16 fields (see solana-ed25519-program).
const ED25519_OFFSETS_START: usize = 2;
const ED25519_OFFSETS_LEN: usize = 14;
const CURRENT_INSTRUCTION: u16 = u16::MAX;

fn read_u16(data: &[u8], at: usize) -> Result<u16> {
    let bytes = data
        .get(at..at + 2)
        .ok_or(error!(RaceError::InvalidSignatureInstruction))?;
    Ok(u16::from_le_bytes([bytes[0], bytes[1]]))
}

/// Returns the attestation signed by `expected_signer` in the Ed25519
/// instruction directly preceding the current one.
pub fn load_verified_attestation(
    instructions_sysvar: &AccountInfo,
    expected_signer: &Pubkey,
) -> Result<PoolAttestation> {
    let current = load_current_index_checked(instructions_sysvar)
        .map_err(|_| error!(RaceError::MissingSignatureInstruction))?;
    require!(current > 0, RaceError::MissingSignatureInstruction);
    let ix = load_instruction_at_checked((current - 1) as usize, instructions_sysvar)
        .map_err(|_| error!(RaceError::MissingSignatureInstruction))?;
    require!(
        ix.program_id == ed25519_program::ID,
        RaceError::MissingSignatureInstruction
    );

    let data = &ix.data;
    require!(
        data.len() >= ED25519_OFFSETS_START + ED25519_OFFSETS_LEN && data[0] == 1,
        RaceError::InvalidSignatureInstruction
    );
    let o = ED25519_OFFSETS_START;
    let signature_ix = read_u16(data, o + 2)?;
    let pubkey_offset = read_u16(data, o + 4)? as usize;
    let pubkey_ix = read_u16(data, o + 6)?;
    let message_offset = read_u16(data, o + 8)? as usize;
    let message_len = read_u16(data, o + 10)? as usize;
    let message_ix = read_u16(data, o + 12)?;

    // Every piece must live inside the precompile instruction itself; otherwise
    // the verified bytes could differ from the bytes we read here.
    require!(
        signature_ix == CURRENT_INSTRUCTION
            && pubkey_ix == CURRENT_INSTRUCTION
            && message_ix == CURRENT_INSTRUCTION,
        RaceError::InvalidSignatureInstruction
    );

    let pubkey = data
        .get(pubkey_offset..pubkey_offset + 32)
        .ok_or(error!(RaceError::InvalidSignatureInstruction))?;
    require!(
        pubkey == expected_signer.as_ref(),
        RaceError::InvalidAttestationSigner
    );

    let message = data
        .get(message_offset..message_offset + message_len)
        .ok_or(error!(RaceError::InvalidSignatureInstruction))?;
    let attestation = PoolAttestation::try_from_slice(message)
        .map_err(|_| error!(RaceError::InvalidAttestation))?;

    require!(
        attestation.domain == ATTESTATION_DOMAIN
            && attestation.version == ATTESTATION_VERSION
            && attestation.program_id == crate::ID,
        RaceError::InvalidAttestation
    );
    require!(
        !attestation.entries.is_empty() && attestation.entries.len() <= MAX_ATTESTATION_ENTRIES,
        RaceError::InvalidAttestation
    );
    for (i, entry) in attestation.entries.iter().enumerate() {
        for previous in &attestation.entries[..i] {
            require!(
                previous.price_source != entry.price_source,
                RaceError::InvalidAttestation
            );
        }
    }
    Ok(attestation)
}

impl PoolAttestation {
    /// Checks the block pair straddles `target`: the parent block is strictly
    /// before it, its direct child is at or after it, and both already happened.
    pub fn validate_boundary(&self, target: i64, now: i64) -> Result<()> {
        require!(
            self.target_timestamp == target
                && self.prev_blockhash != [0u8; 32]
                && self.prev_block_time < target
                && self.next_block_time >= target
                && self.next_block_time <= now
                && self.next_slot > self.prev_slot
                && self.next_parent_slot == self.prev_slot
                && self.next_parent_blockhash == self.prev_blockhash,
            RaceError::InvalidAttestationBoundary
        );
        Ok(())
    }

    pub fn price_for(&self, price_source: &Pubkey, decimals: u8) -> Result<u64> {
        let entry = self
            .entries
            .iter()
            .find(|entry| entry.price_source == *price_source)
            .ok_or(error!(RaceError::MissingAssetPrice))?;
        require!(entry.decimals == decimals, RaceError::InvalidOracleDecimals);
        require!(entry.price > 0, RaceError::InvalidOraclePrice);
        Ok(entry.price)
    }
}
