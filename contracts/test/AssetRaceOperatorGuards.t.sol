// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AssetRaceOperatorSafety} from "../script/helpers/AssetRaceOperatorSafety.sol";
import {AssetRaceOperatorSafetyHarness} from "./helpers/AssetRaceOperatorSafetyHarness.sol";

contract AssetRaceOperatorGuardsTest is Test {
    address private constant OWNER = address(0xA11CE);
    address private constant KEEPER = address(0xB0B);
    address private constant SIGNER = address(0x5151);
    address private constant OLD_ORACLE = address(0x0D1D);
    address private constant NEW_ORACLE = address(0x0E2E);

    AssetRaceOperatorSafetyHarness private harness;

    function setUp() public {
        harness = new AssetRaceOperatorSafetyHarness();
    }

    function test_DeploymentRejectsPriceSignerEqualToDeployerOwner() public {
        vm.expectRevert(AssetRaceOperatorSafety.PriceSignerRoleOverlap.selector);
        harness.validateDeployment(OWNER, OWNER);
        harness.validateDeployment(OWNER, SIGNER);
    }

    function test_ConfigurationRequiresDistinctSignerAndActualOwner() public {
        vm.expectRevert(AssetRaceOperatorSafety.PriceSignerRoleOverlap.selector);
        harness.validateConfiguration(OWNER, OWNER, OWNER);
        vm.expectRevert(AssetRaceOperatorSafety.DeployerIsNotOwner.selector);
        harness.validateConfiguration(KEEPER, OWNER, SIGNER);
        harness.validateConfiguration(OWNER, OWNER, SIGNER);
    }

    function test_RotationRequiresPauseAndDifferentOracle() public {
        vm.expectRevert(AssetRaceOperatorSafety.NewActivityNotPaused.selector);
        harness.validateRotation(OWNER, OWNER, SIGNER, false, OLD_ORACLE, NEW_ORACLE);
        vm.expectRevert(AssetRaceOperatorSafety.OracleAddressUnchanged.selector);
        harness.validateRotation(OWNER, OWNER, SIGNER, true, OLD_ORACLE, OLD_ORACLE);
        harness.validateRotation(OWNER, OWNER, SIGNER, true, OLD_ORACLE, NEW_ORACLE);
    }
}
