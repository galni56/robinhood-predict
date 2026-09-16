// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";
import {IAssetRaceOracle} from "../interfaces/IAssetRaceOracle.sol";

/// @notice Stateless adapter from Chainlink's V3 aggregator interface to the
/// AssetRace oracle boundary.
/// @dev Contains no production feed addresses or timing policy. A feed address
/// is encoded as `bytes32(uint256(uint160(feed)))`; AssetRace freezes that ID,
/// the adapter address, expected decimals, and freshness policy per race.
contract ChainlinkV3RaceOracle is IAssetRaceOracle {
    struct RoundData {
        int256 answer;
        uint256 updatedAt;
    }

    error InvalidOracleId();
    error InvalidRoundProof();
    error PhaseBoundaryUnsupported();

    function endpointProofType() external pure returns (EndpointProofType) {
        return EndpointProofType.CHAINLINK_ROUND_PAIR;
    }

    function oracleIdFor(address feed) external pure returns (bytes32) {
        if (feed == address(0)) revert InvalidOracleId();
        return bytes32(uint256(uint160(feed)));
    }

    function latestObservation(bytes32 oracleId) external view returns (Observation memory observation) {
        address feed = _feedFor(oracleId);

        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) =
            AggregatorV3Interface(feed).latestRoundData();
        observation = Observation({
            price: answer > 0 && answeredInRound >= roundId ? uint256(answer) : 0,
            decimals: AggregatorV3Interface(feed).decimals(),
            updatedAt: updatedAt,
            observationId: bytes32(uint256(roundId))
        });
    }

    /// @notice Verifies a pair of adjacent rounds in one proxy phase and
    /// returns the first report at or after the requested endpoint.
    /// @dev Phase transitions deliberately fail closed. Composite proxy round
    /// IDs are not assumed to be numerically adjacent across phase changes.
    function endpointObservation(
        bytes32 oracleId,
        uint256 targetTimestamp,
        uint256 maxEndpointLag,
        bytes calldata proof
    ) external view returns (Observation memory observation) {
        address feed = _feedFor(oracleId);
        (uint80 selectedRoundId, uint80 previousRoundId) = abi.decode(proof, (uint80, uint80));

        uint16 selectedPhase = uint16(selectedRoundId >> 64);
        uint16 previousPhase = uint16(previousRoundId >> 64);
        if (selectedPhase != previousPhase) revert PhaseBoundaryUnsupported();
        if (uint64(selectedRoundId) != uint64(previousRoundId) + 1) revert InvalidRoundProof();

        RoundData memory previous = _roundData(feed, previousRoundId);
        RoundData memory selected = _roundData(feed, selectedRoundId);
        if (
            previous.updatedAt >= targetTimestamp || selected.updatedAt < targetTimestamp
                || selected.updatedAt > targetTimestamp + maxEndpointLag
        ) revert InvalidRoundProof();

        observation = Observation({
            price: uint256(selected.answer),
            decimals: AggregatorV3Interface(feed).decimals(),
            updatedAt: selected.updatedAt,
            observationId: bytes32(uint256(selectedRoundId))
        });
    }

    function _roundData(address feed, uint80 requestedRoundId) private view returns (RoundData memory data) {
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) =
            AggregatorV3Interface(feed).getRoundData(requestedRoundId);
        if (roundId != requestedRoundId || answer <= 0 || updatedAt == 0 || answeredInRound < requestedRoundId) {
            revert InvalidRoundProof();
        }
        data = RoundData({answer: answer, updatedAt: updatedAt});
    }

    function _feedFor(bytes32 oracleId) private pure returns (address feed) {
        feed = address(uint160(uint256(oracleId)));
        if (feed == address(0) || bytes32(uint256(uint160(feed))) != oracleId) revert InvalidOracleId();
    }
}
