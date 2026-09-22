// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AssetRaceOperatorSafety} from "../../script/helpers/AssetRaceOperatorSafety.sol";

contract AssetRaceOperatorSafetyHarness {
    function validateDeployment(address deployer, address priceSigner) external pure {
        AssetRaceOperatorSafety.validateDeployment(deployer, priceSigner);
    }

    function validateConfiguration(address deployer, address owner, address priceSigner) external pure {
        AssetRaceOperatorSafety.validateConfiguration(deployer, owner, priceSigner);
    }

    function validateRotation(
        address deployer,
        address owner,
        address priceSigner,
        bool paused,
        address oldOracle,
        address newOracle
    ) external pure {
        AssetRaceOperatorSafety.validateRotation(deployer, owner, priceSigner, paused, oldOracle, newOracle);
    }
}
