// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Pure pre-broadcast checks shared by the three native-ETH release scripts.
library NativeEthDeploymentSafety {
    error ExpectedOwnerIsZero();
    error SigningAccountMismatch();
    error ContractOwnerMismatch();
    error OracleAddressMismatch();
    error PriceSignerMismatch();
    error ReleaseRoleOverlap();

    function validateSigningOwner(address signingAccount, address expectedOwner) internal pure {
        if (expectedOwner == address(0)) revert ExpectedOwnerIsZero();
        if (signingAccount != expectedOwner) revert SigningAccountMismatch();
    }

    function validateContractOwner(address actualOwner, address expectedOwner) internal pure {
        if (expectedOwner == address(0)) revert ExpectedOwnerIsZero();
        if (actualOwner != expectedOwner) revert ContractOwnerMismatch();
    }

    function validateOracle(
        address actualOracle,
        address expectedOracle,
        address actualPriceSigner,
        address expectedPriceSigner
    ) internal pure {
        if (actualOracle != expectedOracle) revert OracleAddressMismatch();
        if (actualPriceSigner != expectedPriceSigner) revert PriceSignerMismatch();
    }

    function validateReleaseRoles(address owner, address oracle, address priceSigner) internal pure {
        if (
            owner == address(0) || oracle == address(0) || priceSigner == address(0) || owner == oracle
                || owner == priceSigner || oracle == priceSigner
        ) revert ReleaseRoleOverlap();
    }
}
