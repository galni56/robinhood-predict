// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAssetRaceOracle} from "./interfaces/IAssetRaceOracle.sol";

/// @title PriceArena
/// @notice A fixed-time contest in which players predict the final price of one
/// approved StockToken/USDG or MemeToken/USDG pool. The closest half of the
/// field shares the losing half's stakes, weighted by stake and accuracy.
///
/// Predictions are hidden by the normal read API during the lobby, but they are
/// NOT cryptographically secret: calldata and contract storage are public. A
/// future commit/reveal revision is required for adversarial privacy.
contract PriceArena is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Category {
        STOCK,
        MEME
    }

    enum Status {
        OPEN,
        RESOLVED,
        CANCELLED
    }

    enum Phase {
        LOBBY,
        RUNNING,
        RESOLVED,
        CANCELLED
    }

    struct AssetConfig {
        address oracle;
        bytes32 oracleId;
        uint8 decimals;
        Category category;
        bool enabled;
    }

    struct Arena {
        bytes32 assetId;
        bytes32 oracleId;
        address oracle;
        address creator;
        uint8 priceDecimals;
        Category category;
        Status status;
        uint64 createdAt;
        uint64 startsAt;
        uint64 deadline;
        uint64 resolvedAt;
        uint32 duration;
        uint16 participantCount;
        uint16 winnerCount;
        uint16 feeBp;
        uint256 totalPool;
        uint256 finalPrice;
        uint256 finalUpdatedAt;
        bytes32 observationId;
        uint256 protocolFee;
        uint256 remainingLiability;
        string title;
    }

    struct Entry {
        uint256 prediction;
        uint256 stake;
        uint256 predictionUpdatedAt;
        uint256 payout;
        uint32 rank;
        uint32 accuracyMultiplierBp;
        bool exists;
        bool settled;
    }

    struct PublicEntry {
        uint256 prediction;
        uint256 stake;
        uint256 predictionUpdatedAt;
        uint256 payout;
        uint32 rank;
        uint32 accuracyMultiplierBp;
        bool exists;
        bool settled;
    }

    uint256 public constant BP_DENOMINATOR = 10_000;
    uint256 public constant FEE_BP = 200;
    uint256 public constant LOBBY_DURATION = 10 minutes;
    uint256 public constant MIN_PARTICIPANTS = 2;
    uint256 public constant MAX_PARTICIPANTS = 20;
    uint256 public constant MIN_STAKE = 1e6;
    uint256 public constant MAX_STAKE = 50e6;
    uint256 public constant MAX_PRICE_STALENESS = 60 seconds;
    uint256 public constant MAX_TITLE_BYTES = 64;
    uint256 public constant MIN_ACCURACY_MULTIPLIER_BP = 10_000;
    uint256 public constant MAX_ACCURACY_MULTIPLIER_BP = 30_000;

    IERC20 public immutable betToken;
    bool public newActivityPaused;
    uint256 public arenaCount;
    uint256 public accumulatedFees;
    uint256 public totalUserLiability;

    mapping(bytes32 => AssetConfig) public approvedAssets;
    mapping(uint256 => Arena) private arenas;
    mapping(uint256 => address[]) private participants;
    mapping(uint256 => mapping(address => Entry)) private entries;

    event AssetConfigured(
        bytes32 indexed assetId,
        address indexed oracle,
        bytes32 indexed oracleId,
        uint8 decimals,
        Category category,
        bool enabled
    );
    event ArenaCreated(
        uint256 indexed arenaId,
        address indexed creator,
        bytes32 indexed assetId,
        Category category,
        uint256 startsAt,
        uint256 deadline,
        uint256 duration,
        string title
    );
    /// @dev Deliberately omits prediction. It remains visible in calldata/storage.
    event EntryChanged(
        uint256 indexed arenaId,
        address indexed player,
        uint256 totalStake,
        uint256 predictionUpdatedAt,
        bool predictionChanged
    );
    event ArenaResolved(
        uint256 indexed arenaId,
        uint256 finalPrice,
        uint256 winnerCount,
        uint256 protocolFee,
        bytes32 observationId
    );
    event ArenaCancelled(uint256 indexed arenaId, string reason);
    event Claimed(uint256 indexed arenaId, address indexed player, uint256 payout);
    event Refunded(uint256 indexed arenaId, address indexed player, uint256 amount);
    event NewActivityPaused(bool paused);
    event FeesWithdrawn(address indexed to, uint256 amount);

    constructor(address _betToken) Ownable(msg.sender) {
        require(_betToken != address(0), "bet token = zero addr");
        require(IERC20Metadata(_betToken).decimals() == 6, "bet token must use 6 decimals");
        betToken = IERC20(_betToken);
    }

    function setAsset(
        bytes32 assetId,
        address oracle,
        bytes32 oracleId,
        uint8 decimals,
        Category category,
        bool enabled
    ) external onlyOwner {
        require(assetId != bytes32(0), "asset = zero id");
        require(oracle != address(0), "oracle = zero addr");
        require(oracleId != bytes32(0), "oracle = zero id");
        require(decimals > 0, "decimals = 0");
        approvedAssets[assetId] = AssetConfig({
            oracle: oracle,
            oracleId: oracleId,
            decimals: decimals,
            category: category,
            enabled: enabled
        });
        emit AssetConfigured(assetId, oracle, oracleId, decimals, category, enabled);
    }

    function setNewActivityPaused(bool paused) external onlyOwner {
        newActivityPaused = paused;
        emit NewActivityPaused(paused);
    }

    function isSupportedDuration(uint256 duration) public pure returns (bool) {
        return duration == 1 minutes || duration == 5 minutes || duration == 15 minutes || duration == 1 hours;
    }

    /// @notice Creates a ten-minute lobby. The arena duration begins after the
    /// lobby and is computed on-chain, so wallet confirmation delay cannot move
    /// either boundary relative to the mined creation transaction.
    function createArena(bytes32 assetId, Category category, uint256 duration, string calldata title)
        external
        returns (uint256 arenaId)
    {
        require(!newActivityPaused, "new activity paused");
        AssetConfig memory asset = approvedAssets[assetId];
        require(asset.enabled, "asset not enabled");
        require(asset.category == category, "wrong asset category");
        require(isSupportedDuration(duration), "unsupported duration");
        bytes memory titleBytes = bytes(title);
        require(titleBytes.length > 0 && titleBytes.length <= MAX_TITLE_BYTES, "invalid title length");

        arenaId = arenaCount++;
        uint256 startsAt = block.timestamp + LOBBY_DURATION;
        uint256 deadline = startsAt + duration;
        require(deadline <= type(uint64).max, "timestamp overflow");

        Arena storage arena = arenas[arenaId];
        arena.assetId = assetId;
        arena.oracleId = asset.oracleId;
        arena.oracle = asset.oracle;
        arena.creator = msg.sender;
        arena.priceDecimals = asset.decimals;
        arena.category = category;
        arena.status = Status.OPEN;
        arena.createdAt = uint64(block.timestamp);
        arena.startsAt = uint64(startsAt);
        arena.deadline = uint64(deadline);
        arena.duration = uint32(duration);
        arena.feeBp = uint16(FEE_BP);
        arena.title = title;

        emit ArenaCreated(arenaId, msg.sender, assetId, category, startsAt, deadline, duration, title);
    }

    function enter(uint256 arenaId, uint256 prediction, uint256 amount) external nonReentrant {
        require(!newActivityPaused, "new activity paused");
        Arena storage arena = _openLobby(arenaId);
        Entry storage entry = entries[arenaId][msg.sender];
        require(!entry.exists, "already entered");
        require(arena.participantCount < MAX_PARTICIPANTS, "arena is full");
        require(prediction > 0, "prediction = 0");
        require(amount >= MIN_STAKE && amount <= MAX_STAKE, "invalid initial stake");

        betToken.safeTransferFrom(msg.sender, address(this), amount);
        entry.prediction = prediction;
        entry.stake = amount;
        entry.predictionUpdatedAt = block.timestamp;
        entry.exists = true;
        participants[arenaId].push(msg.sender);
        arena.participantCount += 1;
        arena.totalPool += amount;
        totalUserLiability += amount;

        emit EntryChanged(arenaId, msg.sender, amount, block.timestamp, true);
    }

    /// @notice Changes the predicted price, adds stake, or does both while the
    /// lobby is open. Stake can only increase. A prediction change resets the
    /// player's tie priority; a pure top-up keeps the original priority.
    function updateEntry(uint256 arenaId, uint256 newPrediction, uint256 additionalAmount) external nonReentrant {
        require(!newActivityPaused, "new activity paused");
        Arena storage arena = _openLobby(arenaId);
        Entry storage entry = entries[arenaId][msg.sender];
        require(entry.exists, "not entered");
        // `newPrediction == 0` means "keep the hidden prediction" and lets a
        // reloaded client top up without learning it through the public getter.
        bool predictionChanged = newPrediction > 0 && newPrediction != entry.prediction;
        require(predictionChanged || additionalAmount > 0, "nothing changed");
        require(entry.stake + additionalAmount <= MAX_STAKE, "stake exceeds max");

        if (additionalAmount > 0) {
            betToken.safeTransferFrom(msg.sender, address(this), additionalAmount);
            entry.stake += additionalAmount;
            arena.totalPool += additionalAmount;
            totalUserLiability += additionalAmount;
        }
        if (predictionChanged) {
            entry.prediction = newPrediction;
            entry.predictionUpdatedAt = block.timestamp;
        }

        emit EntryChanged(
            arenaId, msg.sender, entry.stake, entry.predictionUpdatedAt, predictionChanged
        );
    }

    function cancelIfInsufficient(uint256 arenaId) external {
        Arena storage arena = arenas[arenaId];
        require(arena.status == Status.OPEN, "arena not open");
        require(block.timestamp >= arena.startsAt, "lobby still open");
        require(arena.participantCount < MIN_PARTICIPANTS, "enough participants");
        _cancel(arenaId, arena, "fewer than two participants");
    }

    /// @notice Resolves from the last Robinhood block strictly before the
    /// scheduled deadline. Calling later cannot change the selected price.
    function resolve(uint256 arenaId, bytes calldata endpointProof) external nonReentrant {
        Arena storage arena = arenas[arenaId];
        require(arena.status == Status.OPEN, "arena not open");
        require(block.timestamp >= arena.deadline, "too early");

        if (arena.participantCount < MIN_PARTICIPANTS) {
            _cancel(arenaId, arena, "fewer than two participants");
            return;
        }

        IAssetRaceOracle.Observation memory observation = IAssetRaceOracle(arena.oracle).endpointObservation(
            arena.oracleId, arena.deadline, MAX_PRICE_STALENESS, endpointProof
        );
        require(observation.price > 0, "invalid final price");
        require(observation.decimals == arena.priceDecimals, "price decimals changed");
        require(observation.updatedAt > 0 && observation.updatedAt < arena.deadline, "invalid endpoint timestamp");

        if (arena.deadline - observation.updatedAt > MAX_PRICE_STALENESS) {
            _cancel(arenaId, arena, "stale deadline price");
            return;
        }

        address[] memory ranking = participants[arenaId];
        _sortByResult(arenaId, ranking, observation.price);
        uint256 winnerCount = ranking.length / 2;
        uint256 losingPool;
        for (uint256 i = winnerCount; i < ranking.length; ++i) {
            losingPool += entries[arenaId][ranking[i]].stake;
        }

        uint256 statedFee = Math.mulDiv(losingPool, FEE_BP, BP_DENOMINATOR);
        uint256 distributable = losingPool - statedFee;
        uint256 cutoffError = _absoluteError(entries[arenaId][ranking[winnerCount - 1]].prediction, observation.price);
        uint256[] memory scores = new uint256[](winnerCount);
        uint256 scoreTotal;

        for (uint256 i; i < winnerCount; ++i) {
            Entry storage entry = entries[arenaId][ranking[i]];
            uint256 error = _absoluteError(entry.prediction, observation.price);
            uint256 multiplier = MIN_ACCURACY_MULTIPLIER_BP;
            if (cutoffError > 0) {
                multiplier += Math.mulDiv(
                    MAX_ACCURACY_MULTIPLIER_BP - MIN_ACCURACY_MULTIPLIER_BP,
                    cutoffError - error,
                    cutoffError
                );
            }
            uint256 score = entry.stake * multiplier;
            entry.rank = uint32(i + 1);
            entry.accuracyMultiplierBp = uint32(multiplier);
            scores[i] = score;
            scoreTotal += score;
        }

        uint256 payoutTotal;
        for (uint256 i; i < winnerCount; ++i) {
            Entry storage entry = entries[arenaId][ranking[i]];
            uint256 winnings = Math.mulDiv(distributable, scores[i], scoreTotal);
            entry.payout = entry.stake + winnings;
            payoutTotal += entry.payout;
        }
        for (uint256 i = winnerCount; i < ranking.length; ++i) {
            entries[arenaId][ranking[i]].rank = uint32(i + 1);
        }

        // Includes the stated 2% plus harmless integer-division dust.
        uint256 protocolTake = arena.totalPool - payoutTotal;
        arena.status = Status.RESOLVED;
        arena.resolvedAt = uint64(block.timestamp);
        arena.winnerCount = uint16(winnerCount);
        arena.finalPrice = observation.price;
        arena.finalUpdatedAt = observation.updatedAt;
        arena.observationId = observation.observationId;
        arena.protocolFee = protocolTake;
        arena.remainingLiability = payoutTotal;
        accumulatedFees += protocolTake;
        totalUserLiability -= protocolTake;

        emit ArenaResolved(arenaId, observation.price, winnerCount, protocolTake, observation.observationId);
    }

    function claim(uint256 arenaId) external nonReentrant {
        Arena storage arena = arenas[arenaId];
        require(arena.status == Status.RESOLVED, "arena not resolved");
        Entry storage entry = entries[arenaId][msg.sender];
        require(entry.payout > 0, "no winning payout");
        require(!entry.settled, "already claimed");

        uint256 payout = entry.payout;
        entry.settled = true;
        arena.remainingLiability -= payout;
        totalUserLiability -= payout;
        betToken.safeTransfer(msg.sender, payout);
        emit Claimed(arenaId, msg.sender, payout);
    }

    function refund(uint256 arenaId) external nonReentrant {
        Arena storage arena = arenas[arenaId];
        require(arena.status == Status.CANCELLED, "arena not cancelled");
        Entry storage entry = entries[arenaId][msg.sender];
        require(entry.exists && !entry.settled, "nothing to refund");

        uint256 amount = entry.stake;
        entry.settled = true;
        arena.remainingLiability -= amount;
        totalUserLiability -= amount;
        betToken.safeTransfer(msg.sender, amount);
        emit Refunded(arenaId, msg.sender, amount);
    }

    function voidArena(uint256 arenaId, string calldata reason) external onlyOwner {
        Arena storage arena = arenas[arenaId];
        require(arena.status == Status.OPEN, "arena not open");
        _cancel(arenaId, arena, reason);
    }

    function withdrawFees(address to) external onlyOwner nonReentrant {
        require(to != address(0), "to = zero addr");
        uint256 amount = accumulatedFees;
        accumulatedFees = 0;
        betToken.safeTransfer(to, amount);
        emit FeesWithdrawn(to, amount);
    }

    function phase(uint256 arenaId) public view returns (Phase) {
        Arena storage arena = arenas[arenaId];
        if (arena.status == Status.RESOLVED) return Phase.RESOLVED;
        if (arena.status == Status.CANCELLED) return Phase.CANCELLED;
        if (block.timestamp < arena.startsAt) return Phase.LOBBY;
        return Phase.RUNNING;
    }

    function getArena(uint256 arenaId) external view returns (Arena memory) {
        return arenas[arenaId];
    }

    function getParticipants(uint256 arenaId) external view returns (address[] memory) {
        return participants[arenaId];
    }

    /// @notice Returns zero for the prediction while the lobby is open. This is
    /// a UI privacy guard only; public blockchain data remains inspectable.
    function getEntry(uint256 arenaId, address player) external view returns (PublicEntry memory result) {
        Entry storage entry = entries[arenaId][player];
        result = PublicEntry({
            prediction: phase(arenaId) == Phase.LOBBY ? 0 : entry.prediction,
            stake: entry.stake,
            predictionUpdatedAt: entry.predictionUpdatedAt,
            payout: entry.payout,
            rank: entry.rank,
            accuracyMultiplierBp: entry.accuracyMultiplierBp,
            exists: entry.exists,
            settled: entry.settled
        });
    }

    function _openLobby(uint256 arenaId) private view returns (Arena storage arena) {
        arena = arenas[arenaId];
        require(arena.status == Status.OPEN, "arena not open");
        require(block.timestamp < arena.startsAt, "lobby closed");
    }

    function _cancel(uint256 arenaId, Arena storage arena, string memory reason) private {
        arena.status = Status.CANCELLED;
        arena.resolvedAt = uint64(block.timestamp);
        arena.remainingLiability = arena.totalPool;
        emit ArenaCancelled(arenaId, reason);
    }

    function _sortByResult(uint256 arenaId, address[] memory ranking, uint256 finalPrice) private view {
        for (uint256 i = 1; i < ranking.length; ++i) {
            address candidate = ranking[i];
            uint256 j = i;
            while (j > 0 && _ranksBefore(arenaId, candidate, ranking[j - 1], finalPrice)) {
                ranking[j] = ranking[j - 1];
                unchecked {
                    --j;
                }
            }
            ranking[j] = candidate;
        }
    }

    function _ranksBefore(uint256 arenaId, address a, address b, uint256 finalPrice) private view returns (bool) {
        Entry storage entryA = entries[arenaId][a];
        Entry storage entryB = entries[arenaId][b];
        uint256 errorA = _absoluteError(entryA.prediction, finalPrice);
        uint256 errorB = _absoluteError(entryB.prediction, finalPrice);
        if (errorA != errorB) return errorA < errorB;
        if (entryA.predictionUpdatedAt != entryB.predictionUpdatedAt) {
            return entryA.predictionUpdatedAt < entryB.predictionUpdatedAt;
        }
        return uint160(a) < uint160(b);
    }

    function _absoluteError(uint256 prediction, uint256 finalPrice) private pure returns (uint256) {
        return prediction >= finalPrice ? prediction - finalPrice : finalPrice - prediction;
    }
}
