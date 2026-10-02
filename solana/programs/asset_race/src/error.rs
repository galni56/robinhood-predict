use anchor_lang::prelude::*;

#[error_code]
pub enum RaceError {
    #[msg("Signer is not allowed to perform this action")]
    Unauthorized,
    #[msg("New races and bets are paused")]
    ActivityPaused,
    #[msg("Invalid configuration")]
    InvalidConfiguration,
    #[msg("Fee exceeds the maximum")]
    FeeExceedsMaximum,
    #[msg("Title must be 1-64 bytes with at least one visible character")]
    InvalidTitle,
    #[msg("Invalid asset")]
    InvalidCandidate,
    #[msg("A race needs 2-6 assets")]
    InvalidCandidateCount,
    #[msg("Asset is not approved for this category")]
    AssetNotApproved,
    #[msg("Asset is already in this race")]
    DuplicateAsset,
    #[msg("Price source is already used by another asset in this race")]
    DuplicatePriceSource,
    #[msg("Race duration is not an approved preset")]
    DurationNotApproved,
    #[msg("Community races are not configured")]
    CommunityPolicyNotConfigured,
    #[msg("Too many race duration presets")]
    TooManyDurationPresets,
    #[msg("Race is not in the required status")]
    InvalidRaceStatus,
    #[msg("Lobby is closed")]
    LobbyClosed,
    #[msg("Lobby is still open")]
    LobbyStillOpen,
    #[msg("This wallet already added an asset to the lobby")]
    LobbyAdditionAlreadyUsed,
    #[msg("Betting is not open")]
    BettingNotOpen,
    #[msg("Amount must be greater than zero")]
    AmountZero,
    #[msg("Stake is below the race minimum")]
    StakeBelowMinimum,
    #[msg("Stake exceeds the per-wallet maximum")]
    StakeExceedsMaximum,
    #[msg("A wallet can back only one asset per race")]
    WrongAsset,
    #[msg("Stake mint is not supported yet")]
    UnsupportedStakeMint,
    #[msg("Race cannot start before betting ends")]
    StartTooEarly,
    #[msg("Start window has expired")]
    StartWindowExpired,
    #[msg("Start window is still open")]
    StartWindowStillOpen,
    #[msg("Race has not ended yet")]
    ResolutionTooEarly,
    #[msg("Resolution window has expired")]
    ResolutionWindowExpired,
    #[msg("Resolution window is still open")]
    ResolutionWindowStillOpen,
    #[msg("Expected an Ed25519 signature instruction immediately before this one")]
    MissingSignatureInstruction,
    #[msg("Malformed Ed25519 signature instruction")]
    InvalidSignatureInstruction,
    #[msg("Price attestation was not signed by the race oracle signer")]
    InvalidAttestationSigner,
    #[msg("Malformed price attestation")]
    InvalidAttestation,
    #[msg("Price attestation does not prove the target time boundary")]
    InvalidAttestationBoundary,
    #[msg("Price attestation is missing an active asset")]
    MissingAssetPrice,
    #[msg("Invalid oracle price")]
    InvalidOraclePrice,
    #[msg("Oracle price decimals do not match the asset")]
    InvalidOracleDecimals,
    #[msg("No winning position")]
    NoWinningPosition,
    #[msg("Only a losing position can be closed this way")]
    NotLosingPosition,
    #[msg("Fee balance is too low")]
    InsufficientFeeBalance,
    #[msg("Escrow balance is too low")]
    InsufficientEscrow,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("No pending admin")]
    NoPendingAdmin,
}
