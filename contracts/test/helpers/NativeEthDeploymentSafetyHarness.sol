// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NativeEthDeploymentSafety} from "../../script/helpers/NativeEthDeploymentSafety.sol";

contract NativeEthDeploymentSafetyHarness {
    function validateSigningOwner(address signingAccount, address expectedOwner) external pure {
        NativeEthDeploymentSafety.validateSigningOwner(signingAccount, expectedOwner);
    }

    function validateContractOwner(address actualOwner, address expectedOwner) external pure {
        NativeEthDeploymentSafety.validateContractOwner(actualOwner, expectedOwner);
    }

    function validateOracle(
        address actualOracle,
        address expectedOracle,
        address actualPriceSigner,
        address expectedPriceSigner
    ) external pure {
        NativeEthDeploymentSafety.validateOracle(actualOracle, expectedOracle, actualPriceSigner, expectedPriceSigner);
    }

    function validateReleaseRoles(address owner, address oracle, address priceSigner) external pure {
        NativeEthDeploymentSafety.validateReleaseRoles(owner, oracle, priceSigner);
    }
}
