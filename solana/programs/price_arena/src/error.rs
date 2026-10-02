use anchor_lang::prelude::*;

#[error_code]
pub enum ArenaError {
    #[msg("Signer is not allowed to perform this action")]
    Unauthorized,
    #[msg("New arenas and entries are paused")]
    ActivityPaused,
    #[msg("Invalid configuration")]
    InvalidConfiguration,
    #[msg("Title must be 1-64 bytes with at least one visible character")]
    InvalidTitle,
    #[msg("Invalid asset")]
    InvalidAsset,
    #[msg("Asset is not approved for this category")]
    AssetNotApproved,
    #[msg("Unsupported arena duration")]
    UnsupportedDuration,
    #[msg("Arena is not open")]
    ArenaNotOpen,
    #[msg("Lobby is closed")]
    LobbyClosed,
    #[msg("Lobby is still open")]
    LobbyStillOpen,
    #[msg("Arena is full")]
    ArenaFull,
    #[msg("Wallet already entered this arena")]
    AlreadyEntered,
    #[msg("Wallet has not entered this arena")]
    NotEntered,
    #[msg("Prediction must be greater than zero")]
    InvalidPrediction,
    #[msg("Stake is outside the arena limits")]
    InvalidStake,
    #[msg("Nothing changed")]
    NothingChanged,
    #[msg("Arena has enough participants")]
    EnoughParticipants,
    #[msg("Arena deadline has not passed")]
    TooEarly,
    #[msg("Resolution window has expired")]
    ResolutionWindowExpired,
    #[msg("Resolution window is still open")]
    ResolutionWindowStillOpen,
    #[msg("Stake mint is not supported yet")]
    UnsupportedStakeMint,
    #[msg("Expected an Ed25519 signature instruction immediately before this one")]
    MissingSignatureInstruction,
    #[msg("Malformed Ed25519 signature instruction")]
    InvalidSignatureInstruction,
    #[msg("Price attestation was not signed by the arena oracle signer")]
    InvalidAttestationSigner,
    #[msg("Malformed price attestation")]
    InvalidAttestation,
    #[msg("Price attestation does not prove the deadline boundary")]
    InvalidAttestationBoundary,
    #[msg("Price attestation is missing the arena asset")]
    MissingAssetPrice,
    #[msg("Oracle price decimals do not match the asset")]
    InvalidOracleDecimals,
    #[msg("Invalid oracle price")]
    InvalidOraclePrice,
    #[msg("No winning payout")]
    NoWinningPayout,
    #[msg("Already settled")]
    AlreadySettled,
    #[msg("Arena is not cancelled")]
    ArenaNotCancelled,
    #[msg("Arena is not resolved")]
    ArenaNotResolved,
    #[msg("Amount must be greater than zero")]
    AmountZero,
    #[msg("Fee balance is too low")]
    InsufficientFeeBalance,
    #[msg("Escrow balance is too low")]
    InsufficientEscrow,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("No pending admin")]
    NoPendingAdmin,
}
