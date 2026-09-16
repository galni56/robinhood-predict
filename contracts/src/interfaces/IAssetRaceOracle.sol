// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal price-source boundary used by AssetRace.
/// @dev An oracle adapter determines how `oracleId` is interpreted. AssetRace
/// snapshots both the adapter address and identifier when a race is created;
/// callers cannot supply either one or provide a price.
interface IAssetRaceOracle {
    enum EndpointProofType {
        NONE,
        CHAINLINK_ROUND_PAIR,
        SIGNED_OBSERVATION_PAIR,
        SIGNED_POOL_BLOCK_PAIR
    }

    struct Observation {
        uint256 price;
        uint8 decimals;
        uint256 updatedAt;
        bytes32 observationId;
    }

    function latestObservation(bytes32 oracleId) external view returns (Observation memory observation);

    function endpointProofType() external pure returns (EndpointProofType);

    /// @notice Returns the source-specific deterministic endpoint observation.
    /// @dev `proof` may identify source-native observations, but the adapter
    /// must validate their values itself. Pool proofs use the last block strictly
    /// before the target; round proofs use the first valid observation after it.
    function endpointObservation(
        bytes32 oracleId,
        uint256 targetTimestamp,
        uint256 maxEndpointLag,
        bytes calldata proof
    ) external view returns (Observation memory observation);
}
