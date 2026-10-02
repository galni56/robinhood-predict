//! Adapts the shared `pool_attestation` crate to this program's error codes.

use anchor_lang::prelude::*;
pub use pool_attestation::{AttestationError, PoolAttestation, PriceEntry};

use crate::error::ArenaError;

pub fn arena_err(error: AttestationError) -> anchor_lang::error::Error {
    match error {
        AttestationError::MissingSignatureInstruction => ArenaError::MissingSignatureInstruction,
        AttestationError::InvalidSignatureInstruction => ArenaError::InvalidSignatureInstruction,
        AttestationError::InvalidAttestationSigner => ArenaError::InvalidAttestationSigner,
        AttestationError::InvalidAttestation => ArenaError::InvalidAttestation,
        AttestationError::InvalidAttestationBoundary => ArenaError::InvalidAttestationBoundary,
        AttestationError::MissingAssetPrice => ArenaError::MissingAssetPrice,
        AttestationError::InvalidOracleDecimals => ArenaError::InvalidOracleDecimals,
        AttestationError::InvalidOraclePrice => ArenaError::InvalidOraclePrice,
    }
    .into()
}

/// Loads the attestation signed by `signer` for this program, verified by the
/// preceding Ed25519 precompile instruction.
pub fn load_verified_attestation(instructions_sysvar: &AccountInfo, signer: &Pubkey) -> Result<PoolAttestation> {
    pool_attestation::load_verified_attestation(instructions_sysvar, signer, &crate::ID).map_err(arena_err)
}
