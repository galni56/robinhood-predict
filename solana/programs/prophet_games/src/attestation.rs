//! Adapts the shared `pool_attestation` crate to this program's error codes.

use anchor_lang::prelude::*;
pub use pool_attestation::{AttestationError, PoolAttestation, PriceEntry};

use crate::error::GameError;

pub fn game_err(error: AttestationError) -> anchor_lang::error::Error {
    match error {
        AttestationError::MissingSignatureInstruction => GameError::MissingSignatureInstruction,
        AttestationError::InvalidSignatureInstruction => GameError::InvalidSignatureInstruction,
        AttestationError::InvalidAttestationSigner => GameError::InvalidAttestationSigner,
        AttestationError::InvalidAttestation => GameError::InvalidAttestation,
        AttestationError::InvalidAttestationBoundary => GameError::InvalidAttestationBoundary,
        AttestationError::MissingAssetPrice => GameError::MissingAssetPrice,
        AttestationError::InvalidOracleDecimals => GameError::InvalidOracleDecimals,
        AttestationError::InvalidOraclePrice => GameError::InvalidOraclePrice,
    }
    .into()
}

/// Loads the attestation signed by `signer` for this program, verified by the
/// preceding Ed25519 precompile instruction.
pub fn load_verified_attestation(instructions_sysvar: &AccountInfo, signer: &Pubkey) -> Result<PoolAttestation> {
    pool_attestation::load_verified_attestation(instructions_sysvar, signer, &crate::ID).map_err(game_err)
}
