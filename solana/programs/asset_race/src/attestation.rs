//! Adapts the shared `pool_attestation` crate to this program's error codes.

use anchor_lang::prelude::*;
pub use pool_attestation::{AttestationError, PoolAttestation, PriceEntry};

use crate::error::RaceError;

pub fn race_err(error: AttestationError) -> anchor_lang::error::Error {
    match error {
        AttestationError::MissingSignatureInstruction => RaceError::MissingSignatureInstruction,
        AttestationError::InvalidSignatureInstruction => RaceError::InvalidSignatureInstruction,
        AttestationError::InvalidAttestationSigner => RaceError::InvalidAttestationSigner,
        AttestationError::InvalidAttestation => RaceError::InvalidAttestation,
        AttestationError::InvalidAttestationBoundary => RaceError::InvalidAttestationBoundary,
        AttestationError::MissingAssetPrice => RaceError::MissingAssetPrice,
        AttestationError::InvalidOracleDecimals => RaceError::InvalidOracleDecimals,
        AttestationError::InvalidOraclePrice => RaceError::InvalidOraclePrice,
    }
    .into()
}

/// Loads the attestation signed by `signer` for this program, verified by the
/// preceding Ed25519 precompile instruction.
pub fn load_verified_attestation(instructions_sysvar: &AccountInfo, signer: &Pubkey) -> Result<PoolAttestation> {
    pool_attestation::load_verified_attestation(instructions_sysvar, signer, &crate::ID).map_err(race_err)
}
