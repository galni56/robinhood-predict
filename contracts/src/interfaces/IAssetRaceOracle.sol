// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal price-source boundary used by AssetRace.
/// @dev An oracle adapter determines how `oracleId` is interpreted. AssetRace
/// snapshots both the adapter address and identifier when a race is created;
/// callers of start/resolve cannot supply either one or provide a price.
interface IAssetRaceOracle {
    struct Observation {
        uint256 price;
        uint8 decimals;
        uint256 updatedAt;
        bytes32 observationId;
    }

    function latestObservation(bytes32 oracleId) external view returns (Observation memory observation);
}
