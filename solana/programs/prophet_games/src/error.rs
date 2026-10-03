use anchor_lang::prelude::*;

#[error_code]
pub enum GameError {
    // ------------------------------------------------------------- shared
    #[msg("Signer is not allowed to perform this action")]
    Unauthorized,
    #[msg("New games and bets are paused")]
    ActivityPaused,
    #[msg("Invalid configuration")]
    InvalidConfiguration,
    #[msg("Title must be 1-64 bytes with at least one visible character")]
    InvalidTitle,
    #[msg("Invalid asset")]
    InvalidCandidate,
    #[msg("Asset is not approved for this category")]
    AssetNotApproved,
    #[msg("Stake mint is not supported")]
    UnsupportedStakeMint,
    #[msg("Amount must be greater than zero")]
    AmountZero,
    #[msg("Lobby is closed")]
    LobbyClosed,
    #[msg("Lobby is still open")]
    LobbyStillOpen,
    #[msg("Resolution window has expired")]
    ResolutionWindowExpired,
    #[msg("Resolution window is still open")]
    ResolutionWindowStillOpen,
    #[msg("Fee balance is too low")]
    InsufficientFeeBalance,
    #[msg("Escrow balance is too low")]
    InsufficientEscrow,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("No pending admin")]
    NoPendingAdmin,
    #[msg("Expected an Ed25519 signature instruction immediately before this one")]
    MissingSignatureInstruction,
    #[msg("Malformed Ed25519 signature instruction")]
    InvalidSignatureInstruction,
    #[msg("Price attestation was not signed by the game's oracle signer")]
    InvalidAttestationSigner,
    #[msg("Malformed price attestation")]
    InvalidAttestation,
    #[msg("Price attestation does not prove the target time boundary")]
    InvalidAttestationBoundary,
    #[msg("Price attestation is missing a required asset")]
    MissingAssetPrice,
    #[msg("Invalid oracle price")]
    InvalidOraclePrice,
    #[msg("Oracle price decimals do not match the asset")]
    InvalidOracleDecimals,

    // --------------------------------------------------------- Asset Race
    #[msg("Fee exceeds the maximum")]
    FeeExceedsMaximum,
    #[msg("A race needs 2-6 assets")]
    InvalidCandidateCount,
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
    #[msg("This wallet already added an asset to the lobby")]
    LobbyAdditionAlreadyUsed,
    #[msg("Betting is not open")]
    BettingNotOpen,
    #[msg("Stake is below the race minimum")]
    StakeBelowMinimum,
    #[msg("Stake exceeds the per-wallet maximum")]
    StakeExceedsMaximum,
    #[msg("A wallet can back only one asset per race")]
    WrongAsset,
    #[msg("Race cannot start before betting ends")]
    StartTooEarly,
    #[msg("Start window has expired")]
    StartWindowExpired,
    #[msg("Start window is still open")]
    StartWindowStillOpen,
    #[msg("Race has not ended yet")]
    ResolutionTooEarly,
    #[msg("No winning position")]
    NoWinningPosition,
    #[msg("Only a losing position can be closed this way")]
    NotLosingPosition,

    // -------------------------------------------------------- Price Arena
    #[msg("Unsupported arena duration")]
    UnsupportedDuration,
    #[msg("Arena is not open")]
    ArenaNotOpen,
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
    #[msg("No winning payout")]
    NoWinningPayout,
    #[msg("Already settled")]
    AlreadySettled,
    #[msg("Arena is not cancelled")]
    ArenaNotCancelled,
    #[msg("Arena is not resolved")]
    ArenaNotResolved,
}
