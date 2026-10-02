//! Signed DEX-pool price attestations shared by Prophet programs.
//!
//! The off-chain collector reads every reviewed pool at the last block strictly
//! before a boundary time T and signs one message covering all of them, plus
//! the metadata of that block and its child. Programs never trust a price
//! passed as an argument: they read the message straight out of the Ed25519
//! precompile instruction placed immediately before the calling instruction,
//! so the runtime has already verified the signature over exactly these bytes.
//!
//! This mirrors `SignedPoolRaceOracle.sol`: the price is P(T-) from the parent
//! block, and the child block only proves where T falls.

use anchor_lang::prelude::*;
use solana_instructions_sysvar::{load_current_index_checked, load_instruction_at_checked};
use solana_sdk_ids::ed25519_program;

pub const ATTESTATION_DOMAIN: [u8; 8] = *b"PRPHPOOL";
pub const ATTESTATION_VERSION: u8 = 1;
pub const MAX_ATTESTATION_ENTRIES: usize = 12;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AttestationError {
    MissingSignatureInstruction,
    InvalidSignatureInstruction,
    InvalidAttestationSigner,
    InvalidAttestation,
    InvalidAttestationBoundary,
    MissingAssetPrice,
    InvalidOracleDecimals,
    InvalidOraclePrice,
}

pub type AttestationResult<T> = core::result::Result<T, AttestationError>;

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
    /// Binds the message to one program so it cannot be replayed elsewhere.
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

fn read_u16(data: &[u8], at: usize) -> AttestationResult<u16> {
    let bytes = data
        .get(at..at + 2)
        .ok_or(AttestationError::InvalidSignatureInstruction)?;
    Ok(u16::from_le_bytes([bytes[0], bytes[1]]))
}

/// Returns the attestation for `program_id` signed by `expected_signer` in the
/// Ed25519 instruction directly preceding the current one.
pub fn load_verified_attestation(
    instructions_sysvar: &AccountInfo,
    expected_signer: &Pubkey,
    program_id: &Pubkey,
) -> AttestationResult<PoolAttestation> {
    use AttestationError::*;

    let current = load_current_index_checked(instructions_sysvar).map_err(|_| MissingSignatureInstruction)?;
    if current == 0 {
        return Err(MissingSignatureInstruction);
    }
    let ix = load_instruction_at_checked((current - 1) as usize, instructions_sysvar)
        .map_err(|_| MissingSignatureInstruction)?;
    if ix.program_id != ed25519_program::ID {
        return Err(MissingSignatureInstruction);
    }

    let data = &ix.data;
    if data.len() < ED25519_OFFSETS_START + ED25519_OFFSETS_LEN || data[0] != 1 {
        return Err(InvalidSignatureInstruction);
    }
    let o = ED25519_OFFSETS_START;
    let signature_ix = read_u16(data, o + 2)?;
    let pubkey_offset = read_u16(data, o + 4)? as usize;
    let pubkey_ix = read_u16(data, o + 6)?;
    let message_offset = read_u16(data, o + 8)? as usize;
    let message_len = read_u16(data, o + 10)? as usize;
    let message_ix = read_u16(data, o + 12)?;

    // Every piece must live inside the precompile instruction itself; otherwise
    // the verified bytes could differ from the bytes read here.
    if signature_ix != CURRENT_INSTRUCTION || pubkey_ix != CURRENT_INSTRUCTION || message_ix != CURRENT_INSTRUCTION {
        return Err(InvalidSignatureInstruction);
    }

    let pubkey = data
        .get(pubkey_offset..pubkey_offset + 32)
        .ok_or(InvalidSignatureInstruction)?;
    if pubkey != expected_signer.as_ref() {
        return Err(InvalidAttestationSigner);
    }

    let message = data
        .get(message_offset..message_offset + message_len)
        .ok_or(InvalidSignatureInstruction)?;
    let attestation = PoolAttestation::try_from_slice(message).map_err(|_| InvalidAttestation)?;

    if attestation.domain != ATTESTATION_DOMAIN
        || attestation.version != ATTESTATION_VERSION
        || attestation.program_id != *program_id
        || attestation.entries.is_empty()
        || attestation.entries.len() > MAX_ATTESTATION_ENTRIES
    {
        return Err(InvalidAttestation);
    }
    for (i, entry) in attestation.entries.iter().enumerate() {
        if attestation.entries[..i]
            .iter()
            .any(|previous| previous.price_source == entry.price_source)
        {
            return Err(InvalidAttestation);
        }
    }
    Ok(attestation)
}

impl PoolAttestation {
    /// Checks the block pair straddles `target`: the parent block is strictly
    /// before it, its direct child is at or after it, and both already happened.
    pub fn validate_boundary(&self, target: i64, now: i64) -> AttestationResult<()> {
        let valid = self.target_timestamp == target
            && self.prev_blockhash != [0u8; 32]
            && self.prev_block_time < target
            && self.next_block_time >= target
            && self.next_block_time <= now
            && self.next_slot > self.prev_slot
            && self.next_parent_slot == self.prev_slot
            && self.next_parent_blockhash == self.prev_blockhash;
        if valid {
            Ok(())
        } else {
            Err(AttestationError::InvalidAttestationBoundary)
        }
    }

    pub fn price_for(&self, price_source: &Pubkey, decimals: u8) -> AttestationResult<u64> {
        let entry = self
            .entries
            .iter()
            .find(|entry| entry.price_source == *price_source)
            .ok_or(AttestationError::MissingAssetPrice)?;
        if entry.decimals != decimals {
            return Err(AttestationError::InvalidOracleDecimals);
        }
        if entry.price == 0 {
            return Err(AttestationError::InvalidOraclePrice);
        }
        Ok(entry.price)
    }
}
