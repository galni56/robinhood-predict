// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ProphetOwnerBuybackBurnExecutor} from "../src/ProphetOwnerBuybackBurnExecutor.sol";

/// @notice Enables or emergency-pauses only the reviewed Prophet buyback release.
contract SetProphetBuybackPause is Script {
    address internal constant EXPECTED_OWNER = 0x821758584b2155c93713cE4991A7D9b447d0ccd8;
    address internal constant EXPECTED_TOKEN = 0x410f2bD350F3d88795cfC29b61cA664C30987Efd;
    address internal constant EXPECTED_EXECUTOR = 0x7B71d233FFFD6c354A4eD83816Ef7b3Dffb88D4c;

    function run() external {
        require(block.chainid == 4_663, "wrong chain");
        uint256 ownerKey = vm.envExists("BUYBACK_TOKEN_DEPLOYER_PRIVATE_KEY")
            ? vm.envUint("BUYBACK_TOKEN_DEPLOYER_PRIVATE_KEY")
            : vm.envUint("PRIVATE_KEY");
        address configuredExecutor = vm.envOr("BUYBACK_EXECUTOR_ADDRESS", EXPECTED_EXECUTOR);
        bool paused = vm.envBool("BUYBACK_PAUSED");
        require(configuredExecutor == EXPECTED_EXECUTOR, "wrong Prophet executor");
        require(vm.addr(ownerKey) == EXPECTED_OWNER, "signer must be owner");

        ProphetOwnerBuybackBurnExecutor executor = ProphetOwnerBuybackBurnExecutor(payable(configuredExecutor));
        require(executor.owner() == EXPECTED_OWNER, "wrong executor owner");
        require(executor.feeRecipient() == EXPECTED_OWNER, "wrong fee recipient");
        require(executor.token() == EXPECTED_TOKEN, "Prophet token not bound");
        require(executor.curve() != address(0), "curve missing");

        vm.startBroadcast(ownerKey);
        executor.setBuybacksPaused(paused);
        vm.stopBroadcast();

        require(executor.buybacksPaused() == paused, "pause update failed");
        console.log("Prophet buyback executor:", configuredExecutor);
        console.log("Buybacks paused:", paused);
    }
}
