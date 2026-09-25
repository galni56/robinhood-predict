// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NativeEthDeploymentSafety} from "../script/helpers/NativeEthDeploymentSafety.sol";
import {NativeEthDeploymentSafetyHarness} from "./helpers/NativeEthDeploymentSafetyHarness.sol";

contract NativeEthDeploymentSafetyTest is Test {
    address private constant OWNER = address(0xA11CE);
    address private constant OTHER = address(0xB0B);
    address private constant ORACLE = address(0xC011EC7);
    address private constant OTHER_ORACLE = address(0x0B0B);
    address private constant SIGNER = address(0x5151);
    address private constant OTHER_SIGNER = address(0x5252);

    NativeEthDeploymentSafetyHarness private harness;

    function setUp() public {
        harness = new NativeEthDeploymentSafetyHarness();
    }

    function test_SigningAccountMustBeTheReviewedNonzeroOwner() public {
        vm.expectRevert(NativeEthDeploymentSafety.ExpectedOwnerIsZero.selector);
        harness.validateSigningOwner(OWNER, address(0));
        vm.expectRevert(NativeEthDeploymentSafety.SigningAccountMismatch.selector);
        harness.validateSigningOwner(OTHER, OWNER);
        harness.validateSigningOwner(OWNER, OWNER);
    }

    function test_DeployedContractOwnerMustMatchTheReviewedOwner() public {
        vm.expectRevert(NativeEthDeploymentSafety.ExpectedOwnerIsZero.selector);
        harness.validateContractOwner(OWNER, address(0));
        vm.expectRevert(NativeEthDeploymentSafety.ContractOwnerMismatch.selector);
        harness.validateContractOwner(OTHER, OWNER);
        harness.validateContractOwner(OWNER, OWNER);
    }

    function test_OracleAndPriceSignerMustMatchTheReviewedRoles() public {
        vm.expectRevert(NativeEthDeploymentSafety.OracleAddressMismatch.selector);
        harness.validateOracle(OTHER_ORACLE, ORACLE, SIGNER, SIGNER);
        vm.expectRevert(NativeEthDeploymentSafety.PriceSignerMismatch.selector);
        harness.validateOracle(ORACLE, ORACLE, OTHER_SIGNER, SIGNER);
        harness.validateOracle(ORACLE, ORACLE, SIGNER, SIGNER);
    }

    function test_ReleaseRolesMustBeNonzeroAndDistinct() public {
        vm.expectRevert(NativeEthDeploymentSafety.ReleaseRoleOverlap.selector);
        harness.validateReleaseRoles(address(0), ORACLE, SIGNER);
        vm.expectRevert(NativeEthDeploymentSafety.ReleaseRoleOverlap.selector);
        harness.validateReleaseRoles(OWNER, OWNER, SIGNER);
        vm.expectRevert(NativeEthDeploymentSafety.ReleaseRoleOverlap.selector);
        harness.validateReleaseRoles(OWNER, ORACLE, OWNER);
        vm.expectRevert(NativeEthDeploymentSafety.ReleaseRoleOverlap.selector);
        harness.validateReleaseRoles(OWNER, ORACLE, ORACLE);
        harness.validateReleaseRoles(OWNER, ORACLE, SIGNER);
    }
}
