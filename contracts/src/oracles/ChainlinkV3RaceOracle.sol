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
    error InvalidOracleId();

    function oracleIdFor(address feed) external pure returns (bytes32) {
        if (feed == address(0)) revert InvalidOracleId();
        return bytes32(uint256(uint160(feed)));
    }

    function latestObservation(bytes32 oracleId) external view returns (Observation memory observation) {
        address feed = address(uint160(uint256(oracleId)));
        if (feed == address(0) || bytes32(uint256(uint160(feed))) != oracleId) revert InvalidOracleId();

        (uint80 roundId, int256 answer,, uint256 updatedAt,) = AggregatorV3Interface(feed).latestRoundData();
        observation = Observation({
            price: answer > 0 ? uint256(answer) : 0,
            decimals: AggregatorV3Interface(feed).decimals(),
            updatedAt: updatedAt,
            observationId: bytes32(uint256(roundId))
        });
    }
}
