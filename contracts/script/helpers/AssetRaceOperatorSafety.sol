// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library AssetRaceOperatorSafety {
    error PriceSignerRoleOverlap();
    error DeployerIsNotOwner();
    error NewActivityNotPaused();
    error OracleAddressUnchanged();

    function validateDeployment(address deployer, address priceSigner) internal pure {
        if (deployer == priceSigner) revert PriceSignerRoleOverlap();
    }

    function validateConfiguration(address deployer, address owner, address priceSigner) internal pure {
        if (priceSigner == owner) revert PriceSignerRoleOverlap();
        if (deployer != owner) revert DeployerIsNotOwner();
    }

    function validateRotation(
        address deployer,
        address owner,
        address priceSigner,
        bool newActivityPaused,
        address oldOracle,
        address newOracle
    ) internal pure {
        validateConfiguration(deployer, owner, priceSigner);
        if (!newActivityPaused) revert NewActivityNotPaused();
        if (oldOracle == newOracle) revert OracleAddressUnchanged();
    }
}
