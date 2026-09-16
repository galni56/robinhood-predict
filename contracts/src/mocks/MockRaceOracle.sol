// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAssetRaceOracle} from "../interfaces/IAssetRaceOracle.sol";

/// @notice Controllable test-only oracle adapter for AssetRace tests.
contract MockRaceOracle is IAssetRaceOracle {
    mapping(bytes32 => Observation) private observations;
    mapping(bytes32 => bool) public shouldRevert;

    function endpointProofType() external pure returns (EndpointProofType) {
        return EndpointProofType.NONE;
    }

    function setObservation(bytes32 oracleId, uint256 price, uint8 decimals, uint256 updatedAt, bytes32 observationId)
        external
    {
        observations[oracleId] = Observation(price, decimals, updatedAt, observationId);
    }

    function setShouldRevert(bytes32 oracleId, bool value) external {
        shouldRevert[oracleId] = value;
    }

    function latestObservation(bytes32 oracleId) external view returns (Observation memory observation) {
        require(!shouldRevert[oracleId], "mock oracle failure");
        return observations[oracleId];
    }

    function endpointObservation(bytes32 oracleId, uint256, uint256, bytes calldata proof)
        external
        view
        returns (Observation memory observation)
    {
        require(proof.length == 0, "unexpected endpoint proof");
        require(!shouldRevert[oracleId], "mock oracle failure");
        return observations[oracleId];
    }
}
