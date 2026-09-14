// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IAssetRaceOracle} from "./interfaces/IAssetRaceOracle.sol";

/// @title AssetRace
/// @notice Standalone pari-mutuel races in which the active asset with the
/// highest percentage return between atomic P0 and P1 snapshots wins.
/// @dev This contract deliberately shares no state or economics with
/// PredictionMarket. It assumes `betToken` is a standard, non-rebasing ERC20
/// whose transfers credit exactly the requested amount.
contract AssetRace is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BP_DENOMINATOR = 10_000;
    uint256 public constant RETURN_SCALE = 1e18;
    uint256 public constant MAX_FEE_BP = BP_DENOMINATOR;
    uint256 public constant MIN_ASSETS_PER_RACE = 2;
    uint256 public constant MAX_ASSETS_PER_RACE = 6;
    uint256 public constant MAX_TITLE_BYTES = 64;
    uint256 public constant MAX_ORACLE_PRICE = type(uint192).max;
    uint8 private constant NO_WINNER = type(uint8).max;

    enum RaceCategory {
        STOCK,
        MEME
    }

    enum RaceOrigin {
        PLATFORM,
        COMMUNITY
    }

    enum RaceStatus {
        BETTING,
        RUNNING,
        RESOLVED,
        CANCELLED,
        VOID,
        LOBBY
    }

    enum CancelReason {
        INSUFFICIENT_ACTIVE_CONTENDERS,
        START_WINDOW_EXPIRED,
        INSUFFICIENT_LOBBY_ASSETS
    }

    enum VoidReason {
        TOP_TIE,
        RESOLUTION_WINDOW_EXPIRED
    }

    struct RaceConfigInput {
        RaceCategory category;
        uint64 bettingStartTime;
        uint64 bettingEndTime;
        uint64 raceDuration;
        uint64 startGrace;
        uint64 resolutionGrace;
        uint64 maxOracleTimestampSkew;
        uint16 feeBp;
        uint8 minActiveContenders;
        uint256 minStake;
        uint256 maxStakePerWallet;
    }

    struct CandidateInput {
        RaceCategory category;
        bytes32 assetId;
        address oracle;
        bytes32 oracleId;
        uint8 expectedDecimals;
        uint64 maxPriceAge;
    }

    struct ApprovedAsset {
        bool registered;
        bool enabled;
        RaceCategory category;
        address oracle;
        bytes32 oracleId;
        uint8 expectedDecimals;
        uint64 maxPriceAge;
    }

    struct CommunityPolicyInput {
        uint64 lobbyDuration;
        uint64 bettingDuration;
        uint64 startGrace;
        uint64 resolutionGrace;
        uint64 maxOracleTimestampSkew;
        uint16 feeBp;
        uint8 minActiveContenders;
        uint256 minStake;
        uint256 maxStakePerWallet;
    }

    struct Race {
        RaceCategory category;
        RaceStatus status;
        uint64 bettingStartTime;
        uint64 bettingEndTime;
        uint64 actualStartTime;
        uint64 raceEndTime;
        uint64 resolvedAt;
        uint64 raceDuration;
        uint64 startGrace;
        uint64 resolutionGrace;
        uint64 maxOracleTimestampSkew;
        uint16 feeBp;
        uint8 minActiveContenders;
        uint8 candidateCount;
        uint8 activeCount;
        uint8 winningAssetIndex;
        uint256 minStake;
        uint256 maxStakePerWallet;
        uint256 totalPool;
        uint256 winningPool;
        uint256 distributableLosingPool;
        uint256 protocolFee;
        uint256 remainingLiability;
        RaceOrigin origin;
        address creator;
        string title;
        uint64 lobbyEndTime;
        uint64 bettingWindow;
    }

    struct RaceAsset {
        bytes32 assetId;
        address oracle;
        bytes32 oracleId;
        uint8 expectedDecimals;
        uint64 maxPriceAge;
        bool active;
        uint256 pool;
        uint256 startPrice;
        uint256 endPrice;
        uint256 startOracleUpdatedAt;
        uint256 endOracleUpdatedAt;
        bytes32 startObservationId;
        bytes32 endObservationId;
        int256 returnValue;
    }

    struct Position {
        uint256 stake;
        uint8 assetIndex;
        bool exists;
        bool settled;
    }

    error ActivityPaused();
    error AlreadySettled();
    error AlreadyStarted();
    error AmountZero();
    error BettingNotOpen();
    error DuplicateAsset();
    error DuplicateOracleFeed();
    error AssetNotApproved();
    error CommunityPolicyNotConfigured();
    error DurationNotApproved();
    error FeeExceedsMaximum();
    error InsufficientFeeBalance();
    error InvalidAddress();
    error InvalidCandidate();
    error InvalidCandidateCount();
    error InvalidConfiguration();
    error InvalidOracleDecimals();
    error InvalidOraclePrice();
    error InvalidOracleTimestamp();
    error InvalidRaceStatus();
    error InvalidReturnInput();
    error NoWinningPosition();
    error OraclePriceStale();
    error OracleTimestampSkew();
    error RaceNotFound();
    error InvalidTitle();
    error LobbyClosed();
    error LobbyStillOpen();
    error LobbyAdditionAlreadyUsed();
    error ResolutionTooEarly();
    error ResolutionWindowStillOpen();
    error ResolutionWindowExpired();
    error StakeBelowMinimum();
    error StakeExceedsMaximum();
    error StartTooEarly();
    error StartWindowStillOpen();
    error StartWindowExpired();
    error WrongAsset();

    IERC20 public immutable betToken;

    bool public newActivityPaused;
    bool public communityPolicyConfigured;
    uint256 public raceCount;
    uint256 public accumulatedFees;
    uint256 public totalUserLiability;

    mapping(uint256 => Race) private races;
    mapping(uint256 => RaceAsset[]) private raceAssets;
    mapping(uint256 => mapping(address => Position)) private positions;
    mapping(bytes32 => ApprovedAsset) public approvedAssets;
    bytes32[] private approvedAssetIds;
    mapping(uint64 => bool) public approvedRaceDurations;
    mapping(uint64 => bool) private raceDurationPresetRegistered;
    uint64[] private raceDurationPresets;
    CommunityPolicyInput public communityPolicy;
    mapping(uint256 => mapping(address => bool)) public lobbyAssetAddedByWallet;

    event NewActivityPaused(bool paused);
    event ApprovedAssetSet(
        bytes32 indexed assetId,
        RaceCategory indexed category,
        bool enabled,
        address oracle,
        bytes32 oracleId,
        uint8 expectedDecimals,
        uint64 maxPriceAge
    );
    event RaceDurationPresetSet(uint64 indexed duration, bool enabled);
    event CommunityPolicySet();
    event RaceCreated(
        uint256 indexed raceId,
        RaceCategory indexed category,
        uint64 bettingStartTime,
        uint64 bettingEndTime,
        uint64 raceDuration,
        uint16 feeBp
    );
    event RaceAssetConfigured(
        uint256 indexed raceId, uint8 indexed assetIndex, bytes32 indexed assetId, address oracle, bytes32 oracleId
    );
    event RaceMetadataSet(
        uint256 indexed raceId, RaceOrigin indexed origin, address indexed creator, string title, uint64 lobbyEndTime
    );
    event LobbyAssetAdded(uint256 indexed raceId, bytes32 indexed assetId, address indexed addedBy, uint8 assetIndex);
    event BettingOpened(uint256 indexed raceId, uint64 bettingStartTime, uint64 bettingEndTime);
    event RaceBetPlaced(
        uint256 indexed raceId, address indexed user, uint8 indexed assetIndex, uint256 amount, uint256 totalUserStake
    );
    event StartPriceSnapshotted(
        uint256 indexed raceId, uint8 indexed assetIndex, uint256 price, uint256 oracleUpdatedAt, bytes32 observationId
    );
    event RaceStarted(uint256 indexed raceId, uint64 actualStartTime, uint64 raceEndTime, uint8 activeCount);
    event EndPriceSnapshotted(
        uint256 indexed raceId,
        uint8 indexed assetIndex,
        uint256 price,
        uint256 oracleUpdatedAt,
        bytes32 observationId,
        int256 returnValue
    );
    event RaceResolved(
        uint256 indexed raceId,
        uint8 indexed winningAssetIndex,
        int256 winningReturn,
        uint256 winningPool,
        uint256 protocolFee
    );
    event RaceCancelled(uint256 indexed raceId, CancelReason reason);
    event RaceVoided(uint256 indexed raceId, VoidReason reason);
    event RaceClaimed(uint256 indexed raceId, address indexed user, uint256 payout);
    event RaceRefunded(uint256 indexed raceId, address indexed user, uint256 amount);
    event FeesWithdrawn(address indexed to, uint256 amount);

    constructor(address _betToken) Ownable(msg.sender) {
        if (_betToken == address(0)) revert InvalidAddress();
        betToken = IERC20(_betToken);
    }

    /// @notice Pauses only creation and new bets. Starting, resolving,
    /// timeout transitions, claims, and refunds remain available.
    function setNewActivityPaused(bool paused) external onlyOwner {
        newActivityPaused = paused;
        emit NewActivityPaused(paused);
    }

    /// @notice Adds, updates, enables, or disables a protocol-approved
    /// asset. Existing races retain their previously snapshotted configuration.
    function setApprovedAsset(CandidateInput calldata candidate, bool enabled) external onlyOwner {
        _validateCandidate(candidate);
        ApprovedAsset storage approved = approvedAssets[candidate.assetId];
        if (!approved.registered) {
            approved.registered = true;
            approvedAssetIds.push(candidate.assetId);
        }
        approved.enabled = enabled;
        approved.category = candidate.category;
        approved.oracle = candidate.oracle;
        approved.oracleId = candidate.oracleId;
        approved.expectedDecimals = candidate.expectedDecimals;
        approved.maxPriceAge = candidate.maxPriceAge;

        emit ApprovedAssetSet(
            candidate.assetId,
            candidate.category,
            enabled,
            candidate.oracle,
            candidate.oracleId,
            candidate.expectedDecimals,
            candidate.maxPriceAge
        );
    }

    function setCommunityPolicy(CommunityPolicyInput calldata policy) external onlyOwner {
        if (
            policy.lobbyDuration == 0 || policy.bettingDuration == 0 || policy.startGrace == 0
                || policy.resolutionGrace == 0 || policy.minStake == 0 || policy.maxStakePerWallet < policy.minStake
                || policy.minActiveContenders < MIN_ASSETS_PER_RACE || policy.minActiveContenders > MAX_ASSETS_PER_RACE
        ) revert InvalidConfiguration();
        if (policy.feeBp > MAX_FEE_BP) revert FeeExceedsMaximum();

        communityPolicy = policy;
        communityPolicyConfigured = true;
        emit CommunityPolicySet();
    }

    function setRaceDurationPreset(uint64 duration, bool enabled) external onlyOwner {
        if (duration == 0) revert InvalidConfiguration();
        if (!raceDurationPresetRegistered[duration]) {
            raceDurationPresetRegistered[duration] = true;
            raceDurationPresets.push(duration);
        }
        approvedRaceDurations[duration] = enabled;
        emit RaceDurationPresetSet(duration, enabled);
    }

    /// @notice Creates a protocol-configured race. Every supplied value and
    /// candidate oracle configuration is copied into race storage here and can
    /// never be changed for this race by later creation choices.
    function createRace(RaceConfigInput calldata config, CandidateInput[] calldata candidates)
        external
        onlyOwner
        returns (uint256 raceId)
    {
        if (newActivityPaused) revert ActivityPaused();
        _validateCreation(config, candidates);

        raceId = raceCount++;
        Race storage race = races[raceId];
        _configurePlatformRace(race, config, "");

        emit RaceCreated(
            raceId, config.category, config.bettingStartTime, config.bettingEndTime, config.raceDuration, config.feeBp
        );
        emit RaceMetadataSet(raceId, RaceOrigin.PLATFORM, msg.sender, "", 0);

        for (uint8 i = 0; i < candidates.length; ++i) {
            _pushCandidate(raceId, candidates[i]);
        }
    }

    /// @notice Creates a titled platform race using registry IDs only.
    function createPlatformRace(string calldata title, RaceConfigInput calldata config, bytes32[] calldata assetIds)
        external
        onlyOwner
        returns (uint256 raceId)
    {
        if (newActivityPaused) revert ActivityPaused();
        _validateTitle(title);
        if (assetIds.length < MIN_ASSETS_PER_RACE || assetIds.length > MAX_ASSETS_PER_RACE) {
            revert InvalidCandidateCount();
        }
        _validatePlatformConfig(config, assetIds.length);

        raceId = raceCount++;
        Race storage race = races[raceId];
        _configurePlatformRace(race, config, title);
        emit RaceCreated(
            raceId, config.category, config.bettingStartTime, config.bettingEndTime, config.raceDuration, config.feeBp
        );
        emit RaceMetadataSet(raceId, RaceOrigin.PLATFORM, msg.sender, title, 0);

        for (uint256 i = 0; i < assetIds.length; ++i) {
            _addApprovedAssetSnapshot(raceId, assetIds[i]);
        }
    }

    /// @notice Creates a category-specific race with protocol-controlled economics and
    /// timing. Only its title, approved duration, and initial registry assets
    /// are selected by the creator.
    function createCommunityRace(
        string calldata title,
        RaceCategory category,
        uint64 raceDuration,
        bytes32[] calldata initialAssetIds
    ) external returns (uint256 raceId) {
        if (newActivityPaused) revert ActivityPaused();
        if (!communityPolicyConfigured) revert CommunityPolicyNotConfigured();
        _validateTitle(title);
        if (!approvedRaceDurations[raceDuration]) revert DurationNotApproved();
        if (initialAssetIds.length > MAX_ASSETS_PER_RACE) revert InvalidCandidateCount();

        CommunityPolicyInput memory policy = communityPolicy;
        uint256 lobbyEnd = block.timestamp + policy.lobbyDuration;
        if (lobbyEnd > type(uint64).max) revert InvalidConfiguration();

        raceId = raceCount++;
        Race storage race = races[raceId];
        race.category = category;
        race.status = RaceStatus.LOBBY;
        race.raceDuration = raceDuration;
        race.startGrace = policy.startGrace;
        race.resolutionGrace = policy.resolutionGrace;
        race.maxOracleTimestampSkew = policy.maxOracleTimestampSkew;
        race.feeBp = policy.feeBp;
        race.minActiveContenders = policy.minActiveContenders;
        race.winningAssetIndex = NO_WINNER;
        race.minStake = policy.minStake;
        race.maxStakePerWallet = policy.maxStakePerWallet;
        race.origin = RaceOrigin.COMMUNITY;
        race.creator = msg.sender;
        race.title = title;
        race.lobbyEndTime = uint64(lobbyEnd);
        race.bettingWindow = policy.bettingDuration;

        emit RaceCreated(raceId, category, 0, 0, raceDuration, policy.feeBp);
        emit RaceMetadataSet(raceId, RaceOrigin.COMMUNITY, msg.sender, title, uint64(lobbyEnd));

        for (uint256 i = 0; i < initialAssetIds.length; ++i) {
            _addApprovedAssetSnapshot(raceId, initialAssetIds[i]);
        }
    }

    function addLobbyAsset(uint256 raceId, bytes32 assetId) external {
        if (newActivityPaused) revert ActivityPaused();
        Race storage race = _getRace(raceId);
        if (race.origin != RaceOrigin.COMMUNITY || race.status != RaceStatus.LOBBY) revert InvalidRaceStatus();
        if (block.timestamp >= race.lobbyEndTime) revert LobbyClosed();
        if (lobbyAssetAddedByWallet[raceId][msg.sender]) revert LobbyAdditionAlreadyUsed();
        if (race.candidateCount >= MAX_ASSETS_PER_RACE) revert InvalidCandidateCount();

        lobbyAssetAddedByWallet[raceId][msg.sender] = true;
        uint8 assetIndex = _addApprovedAssetSnapshot(raceId, assetId);
        emit LobbyAssetAdded(raceId, assetId, msg.sender, assetIndex);
    }

    /// @notice Permissionless timer transition. A short lobby is cancelled
    /// without refunds because the contract never accepts bets in LOBBY.
    function openBetting(uint256 raceId) external {
        Race storage race = _getRace(raceId);
        if (race.origin != RaceOrigin.COMMUNITY || race.status != RaceStatus.LOBBY) revert InvalidRaceStatus();
        if (block.timestamp < race.lobbyEndTime) revert LobbyStillOpen();
        if (race.candidateCount < MIN_ASSETS_PER_RACE) {
            race.status = RaceStatus.CANCELLED;
            emit RaceCancelled(raceId, CancelReason.INSUFFICIENT_LOBBY_ASSETS);
            return;
        }

        uint256 bettingEnd = block.timestamp + race.bettingWindow;
        if (bettingEnd + race.startGrace > type(uint64).max) revert InvalidConfiguration();
        race.bettingStartTime = uint64(block.timestamp);
        race.bettingEndTime = uint64(bettingEnd);
        race.status = RaceStatus.BETTING;
        emit BettingOpened(raceId, race.bettingStartTime, race.bettingEndTime);
    }

    /// @notice Selects one asset, or tops up the caller's existing selection.
    /// The first confirmed asset can never be changed for this race.
    function bet(uint256 raceId, uint8 assetIndex, uint256 amount) external nonReentrant {
        if (newActivityPaused) revert ActivityPaused();
        Race storage race = _getRace(raceId);
        if (race.status != RaceStatus.BETTING) revert InvalidRaceStatus();
        if (block.timestamp < race.bettingStartTime || block.timestamp >= race.bettingEndTime) {
            revert BettingNotOpen();
        }
        if (assetIndex >= race.candidateCount) revert InvalidCandidate();
        if (amount == 0) revert AmountZero();

        Position storage position = positions[raceId][msg.sender];
        if (!position.exists) {
            if (amount < race.minStake) revert StakeBelowMinimum();
            position.exists = true;
            position.assetIndex = assetIndex;
        } else if (position.assetIndex != assetIndex) {
            revert WrongAsset();
        }

        uint256 newStake = position.stake + amount;
        if (newStake > race.maxStakePerWallet) revert StakeExceedsMaximum();

        uint256 balanceBefore = betToken.balanceOf(address(this));
        betToken.safeTransferFrom(msg.sender, address(this), amount);
        if (betToken.balanceOf(address(this)) - balanceBefore != amount) revert InvalidConfiguration();

        position.stake = newStake;
        raceAssets[raceId][assetIndex].pool += amount;
        race.totalPool += amount;
        race.remainingLiability += amount;
        totalUserLiability += amount;

        emit RaceBetPlaced(raceId, msg.sender, assetIndex, amount, newStake);
    }

    /// @notice Atomically freezes active contenders and all P0 observations.
    /// The actual transaction timestamp is T0; the exact configured duration
    /// runs from this time, not from the earlier betting cutoff.
    function startRace(uint256 raceId) external nonReentrant {
        Race storage race = _getRace(raceId);
        if (race.status != RaceStatus.BETTING) revert AlreadyStarted();
        if (block.timestamp < race.bettingEndTime) revert StartTooEarly();
        if (block.timestamp > uint256(race.bettingEndTime) + race.startGrace) revert StartWindowExpired();

        RaceAsset[] storage assets = raceAssets[raceId];
        uint8 activeCount;
        for (uint8 i = 0; i < assets.length; ++i) {
            if (assets[i].pool > 0) ++activeCount;
        }

        if (activeCount < race.minActiveContenders) {
            race.status = RaceStatus.CANCELLED;
            emit RaceCancelled(raceId, CancelReason.INSUFFICIENT_ACTIVE_CONTENDERS);
            return;
        }

        uint256 minUpdatedAt = type(uint256).max;
        uint256 maxUpdatedAt;
        for (uint8 i = 0; i < assets.length; ++i) {
            RaceAsset storage asset = assets[i];
            if (asset.pool == 0) continue;

            IAssetRaceOracle.Observation memory observation =
                IAssetRaceOracle(asset.oracle).latestObservation(asset.oracleId);
            _validateObservation(asset, observation);

            asset.active = true;
            asset.startPrice = observation.price;
            asset.startOracleUpdatedAt = observation.updatedAt;
            asset.startObservationId = observation.observationId;
            if (observation.updatedAt < minUpdatedAt) minUpdatedAt = observation.updatedAt;
            if (observation.updatedAt > maxUpdatedAt) maxUpdatedAt = observation.updatedAt;

            emit StartPriceSnapshotted(raceId, i, observation.price, observation.updatedAt, observation.observationId);
        }
        if (maxUpdatedAt - minUpdatedAt > race.maxOracleTimestampSkew) revert OracleTimestampSkew();

        uint256 endTime = block.timestamp + race.raceDuration;
        if (endTime > type(uint64).max) revert InvalidConfiguration();
        race.activeCount = activeCount;
        race.actualStartTime = uint64(block.timestamp);
        race.raceEndTime = uint64(endTime);
        race.status = RaceStatus.RUNNING;

        emit RaceStarted(raceId, race.actualStartTime, race.raceEndTime, activeCount);
    }

    /// @notice Cancels a race that never obtained a valid P0 before its start
    /// grace expired. The timeout is objective and callable by anyone.
    function cancelUnstartedRace(uint256 raceId) external {
        Race storage race = _getRace(raceId);
        if (race.status != RaceStatus.BETTING) revert InvalidRaceStatus();
        if (block.timestamp <= uint256(race.bettingEndTime) + race.startGrace) revert StartWindowStillOpen();

        race.status = RaceStatus.CANCELLED;
        emit RaceCancelled(raceId, CancelReason.START_WINDOW_EXPIRED);
    }

    /// @notice Atomically freezes every active contender's P1, calculates
    /// signed fixed-point returns, and resolves a unique winner or voids a tie.
    function resolveRace(uint256 raceId) external nonReentrant {
        Race storage race = _getRace(raceId);
        if (race.status != RaceStatus.RUNNING) revert InvalidRaceStatus();
        if (block.timestamp < race.raceEndTime) revert ResolutionTooEarly();
        if (block.timestamp > uint256(race.raceEndTime) + race.resolutionGrace) {
            revert ResolutionWindowExpired();
        }

        RaceAsset[] storage assets = raceAssets[raceId];
        uint256 minUpdatedAt = type(uint256).max;
        uint256 maxUpdatedAt;
        bool leaderSet;
        bool topTied;
        uint8 leaderIndex;
        int256 bestReturn;

        for (uint8 i = 0; i < assets.length; ++i) {
            RaceAsset storage asset = assets[i];
            if (!asset.active) continue;

            IAssetRaceOracle.Observation memory observation =
                IAssetRaceOracle(asset.oracle).latestObservation(asset.oracleId);
            _validateObservation(asset, observation);

            int256 assetReturn = calculateReturn(asset.startPrice, observation.price);
            asset.endPrice = observation.price;
            asset.endOracleUpdatedAt = observation.updatedAt;
            asset.endObservationId = observation.observationId;
            asset.returnValue = assetReturn;
            if (observation.updatedAt < minUpdatedAt) minUpdatedAt = observation.updatedAt;
            if (observation.updatedAt > maxUpdatedAt) maxUpdatedAt = observation.updatedAt;

            if (!leaderSet || assetReturn > bestReturn) {
                leaderSet = true;
                topTied = false;
                leaderIndex = i;
                bestReturn = assetReturn;
            } else if (assetReturn == bestReturn) {
                topTied = true;
            }

            emit EndPriceSnapshotted(
                raceId, i, observation.price, observation.updatedAt, observation.observationId, assetReturn
            );
        }
        if (maxUpdatedAt - minUpdatedAt > race.maxOracleTimestampSkew) revert OracleTimestampSkew();

        race.resolvedAt = uint64(block.timestamp);
        if (topTied) {
            race.status = RaceStatus.VOID;
            emit RaceVoided(raceId, VoidReason.TOP_TIE);
            return;
        }

        uint256 winningPool = assets[leaderIndex].pool;
        uint256 losingPool = race.totalPool - winningPool;
        uint256 fee = Math.mulDiv(losingPool, race.feeBp, BP_DENOMINATOR);

        race.winningAssetIndex = leaderIndex;
        race.winningPool = winningPool;
        race.distributableLosingPool = losingPool - fee;
        race.protocolFee = fee;
        race.remainingLiability -= fee;
        totalUserLiability -= fee;
        accumulatedFees += fee;
        race.status = RaceStatus.RESOLVED;

        emit RaceResolved(raceId, leaderIndex, bestReturn, winningPool, fee);
    }

    /// @notice Voids a started race that could not obtain a valid P1 before
    /// the configured resolution grace expired.
    function voidExpiredRace(uint256 raceId) external {
        Race storage race = _getRace(raceId);
        if (race.status != RaceStatus.RUNNING) revert InvalidRaceStatus();
        if (block.timestamp <= uint256(race.raceEndTime) + race.resolutionGrace) {
            revert ResolutionWindowStillOpen();
        }

        race.resolvedAt = uint64(block.timestamp);
        race.status = RaceStatus.VOID;
        emit RaceVoided(raceId, VoidReason.RESOLUTION_WINDOW_EXPIRED);
    }

    function claim(uint256 raceId) external nonReentrant returns (uint256 payout) {
        Race storage race = _getRace(raceId);
        if (race.status != RaceStatus.RESOLVED) revert InvalidRaceStatus();

        Position storage position = positions[raceId][msg.sender];
        if (!position.exists || position.assetIndex != race.winningAssetIndex || position.stake == 0) {
            revert NoWinningPosition();
        }
        if (position.settled) revert AlreadySettled();

        uint256 profit = Math.mulDiv(position.stake, race.distributableLosingPool, race.winningPool);
        payout = position.stake + profit;

        position.settled = true;
        race.remainingLiability -= payout;
        totalUserLiability -= payout;
        betToken.safeTransfer(msg.sender, payout);

        emit RaceClaimed(raceId, msg.sender, payout);
    }

    function refund(uint256 raceId) external nonReentrant returns (uint256 amount) {
        Race storage race = _getRace(raceId);
        if (race.status != RaceStatus.CANCELLED && race.status != RaceStatus.VOID) revert InvalidRaceStatus();

        Position storage position = positions[raceId][msg.sender];
        if (!position.exists || position.stake == 0) revert AmountZero();
        if (position.settled) revert AlreadySettled();

        amount = position.stake;
        position.settled = true;
        race.remainingLiability -= amount;
        totalUserLiability -= amount;
        betToken.safeTransfer(msg.sender, amount);

        emit RaceRefunded(raceId, msg.sender, amount);
    }

    /// @notice Withdraws only fee amounts already removed from resolved-race
    /// user liabilities. Rounding dust is intentionally not counted as fees.
    function withdrawFees(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidAddress();
        if (amount > accumulatedFees) revert InsufficientFeeBalance();

        accumulatedFees -= amount;
        betToken.safeTransfer(to, amount);
        emit FeesWithdrawn(to, amount);
    }

    function calculateReturn(uint256 startPrice, uint256 endPrice) public pure returns (int256) {
        if (startPrice == 0 || startPrice > MAX_ORACLE_PRICE || endPrice == 0 || endPrice > MAX_ORACLE_PRICE) {
            revert InvalidReturnInput();
        }

        if (endPrice >= startPrice) {
            return int256(Math.mulDiv(endPrice - startPrice, RETURN_SCALE, startPrice));
        }
        return -int256(Math.mulDiv(startPrice - endPrice, RETURN_SCALE, startPrice));
    }

    function getRace(uint256 raceId) external view returns (Race memory) {
        return _getRace(raceId);
    }

    function getRaceAsset(uint256 raceId, uint8 assetIndex) external view returns (RaceAsset memory) {
        Race storage race = _getRace(raceId);
        if (assetIndex >= race.candidateCount) revert InvalidCandidate();
        return raceAssets[raceId][assetIndex];
    }

    function getRaceAssets(uint256 raceId) external view returns (RaceAsset[] memory) {
        _getRace(raceId);
        return raceAssets[raceId];
    }

    function getPosition(uint256 raceId, address user) external view returns (Position memory) {
        _getRace(raceId);
        return positions[raceId][user];
    }

    function getApprovedAssetIds() external view returns (bytes32[] memory) {
        return approvedAssetIds;
    }

    function getApprovedRaceDurations() external view returns (uint64[] memory enabledDurations) {
        uint256 count;
        for (uint256 i = 0; i < raceDurationPresets.length; ++i) {
            if (approvedRaceDurations[raceDurationPresets[i]]) ++count;
        }
        enabledDurations = new uint64[](count);
        uint256 outputIndex;
        for (uint256 i = 0; i < raceDurationPresets.length; ++i) {
            uint64 duration = raceDurationPresets[i];
            if (!approvedRaceDurations[duration]) continue;
            enabledDurations[outputIndex++] = duration;
        }
    }

    function _validateCreation(RaceConfigInput calldata config, CandidateInput[] calldata candidates) private view {
        if (candidates.length < MIN_ASSETS_PER_RACE || candidates.length > MAX_ASSETS_PER_RACE) {
            revert InvalidCandidateCount();
        }
        _validatePlatformConfig(config, candidates.length);

        for (uint256 i = 0; i < candidates.length; ++i) {
            CandidateInput calldata candidate = candidates[i];
            _validateCandidate(candidate);
            for (uint256 j = 0; j < i; ++j) {
                CandidateInput calldata previous = candidates[j];
                if (candidate.assetId == previous.assetId) revert DuplicateAsset();
                if (candidate.oracle == previous.oracle && candidate.oracleId == previous.oracleId) {
                    revert DuplicateOracleFeed();
                }
            }
            ApprovedAsset storage approved = approvedAssets[candidate.assetId];
            if (
                !approved.enabled || approved.category != config.category || candidate.category != config.category
                    || approved.oracle != candidate.oracle || approved.oracleId != candidate.oracleId
                    || approved.expectedDecimals != candidate.expectedDecimals
                    || approved.maxPriceAge != candidate.maxPriceAge
            ) revert AssetNotApproved();
        }
    }

    function _validatePlatformConfig(RaceConfigInput calldata config, uint256 candidateCount) private view {
        if (
            config.bettingStartTime < block.timestamp || config.bettingEndTime <= config.bettingStartTime
                || config.raceDuration == 0 || config.startGrace == 0 || config.resolutionGrace == 0
                || config.minStake == 0 || config.maxStakePerWallet < config.minStake
                || config.minActiveContenders < MIN_ASSETS_PER_RACE || config.minActiveContenders > candidateCount
        ) revert InvalidConfiguration();
        if (config.feeBp > MAX_FEE_BP) revert FeeExceedsMaximum();
        if (uint256(config.bettingEndTime) + config.startGrace > type(uint64).max) {
            revert InvalidConfiguration();
        }
    }

    function _validateCandidate(CandidateInput calldata candidate) private pure {
        if (
            candidate.assetId == bytes32(0) || candidate.oracle == address(0) || candidate.oracleId == bytes32(0)
                || candidate.expectedDecimals > 36 || candidate.maxPriceAge == 0
        ) revert InvalidCandidate();
    }

    function _validateTitle(string calldata title) private pure {
        bytes memory value = bytes(title);
        uint256 length = value.length;
        if (length == 0 || length > MAX_TITLE_BYTES) revert InvalidTitle();
        bool hasVisibleByte;
        for (uint256 i = 0; i < length; ++i) {
            if (uint8(value[i]) > 0x20) {
                hasVisibleByte = true;
                break;
            }
        }
        if (!hasVisibleByte) revert InvalidTitle();
    }

    function _configurePlatformRace(Race storage race, RaceConfigInput calldata config, string memory title) private {
        race.category = config.category;
        race.status = RaceStatus.BETTING;
        race.bettingStartTime = config.bettingStartTime;
        race.bettingEndTime = config.bettingEndTime;
        race.raceDuration = config.raceDuration;
        race.startGrace = config.startGrace;
        race.resolutionGrace = config.resolutionGrace;
        race.maxOracleTimestampSkew = config.maxOracleTimestampSkew;
        race.feeBp = config.feeBp;
        race.minActiveContenders = config.minActiveContenders;
        race.winningAssetIndex = NO_WINNER;
        race.minStake = config.minStake;
        race.maxStakePerWallet = config.maxStakePerWallet;
        race.origin = RaceOrigin.PLATFORM;
        race.creator = msg.sender;
        race.title = title;
    }

    function _addApprovedAssetSnapshot(uint256 raceId, bytes32 assetId) private returns (uint8 assetIndex) {
        ApprovedAsset storage approved = approvedAssets[assetId];
        if (!approved.enabled || approved.category != races[raceId].category) revert AssetNotApproved();
        CandidateInput memory candidate = CandidateInput({
            category: approved.category,
            assetId: assetId,
            oracle: approved.oracle,
            oracleId: approved.oracleId,
            expectedDecimals: approved.expectedDecimals,
            maxPriceAge: approved.maxPriceAge
        });

        RaceAsset[] storage assets = raceAssets[raceId];
        for (uint256 i = 0; i < assets.length; ++i) {
            if (assets[i].assetId == assetId) revert DuplicateAsset();
            if (assets[i].oracle == candidate.oracle && assets[i].oracleId == candidate.oracleId) {
                revert DuplicateOracleFeed();
            }
        }
        assetIndex = uint8(assets.length);
        _pushCandidateMemory(raceId, candidate);
    }

    function _pushCandidate(uint256 raceId, CandidateInput calldata candidate) private {
        _pushCandidateFields(
            raceId,
            candidate.assetId,
            candidate.oracle,
            candidate.oracleId,
            candidate.expectedDecimals,
            candidate.maxPriceAge
        );
    }

    function _pushCandidateMemory(uint256 raceId, CandidateInput memory candidate) private {
        _pushCandidateFields(
            raceId,
            candidate.assetId,
            candidate.oracle,
            candidate.oracleId,
            candidate.expectedDecimals,
            candidate.maxPriceAge
        );
    }

    function _pushCandidateFields(
        uint256 raceId,
        bytes32 assetId,
        address oracle,
        bytes32 oracleId,
        uint8 expectedDecimals,
        uint64 maxPriceAge
    ) private {
        RaceAsset[] storage assets = raceAssets[raceId];
        uint8 assetIndex = uint8(assets.length);
        assets.push(
            RaceAsset({
                assetId: assetId,
                oracle: oracle,
                oracleId: oracleId,
                expectedDecimals: expectedDecimals,
                maxPriceAge: maxPriceAge,
                active: false,
                pool: 0,
                startPrice: 0,
                endPrice: 0,
                startOracleUpdatedAt: 0,
                endOracleUpdatedAt: 0,
                startObservationId: bytes32(0),
                endObservationId: bytes32(0),
                returnValue: 0
            })
        );
        races[raceId].candidateCount = uint8(assets.length);
        emit RaceAssetConfigured(raceId, assetIndex, assetId, oracle, oracleId);
    }

    function _validateObservation(RaceAsset storage asset, IAssetRaceOracle.Observation memory observation)
        private
        view
    {
        if (observation.price == 0 || observation.price > MAX_ORACLE_PRICE) revert InvalidOraclePrice();
        if (observation.decimals != asset.expectedDecimals) revert InvalidOracleDecimals();
        if (observation.updatedAt == 0 || observation.updatedAt > block.timestamp) {
            revert InvalidOracleTimestamp();
        }
        if (block.timestamp - observation.updatedAt > asset.maxPriceAge) revert OraclePriceStale();
    }

    function _getRace(uint256 raceId) private view returns (Race storage race) {
        if (raceId >= raceCount) revert RaceNotFound();
        race = races[raceId];
    }
}
