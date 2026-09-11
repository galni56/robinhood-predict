// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {NicknameRegistry} from "../src/NicknameRegistry.sol";

/// @notice Deploys NicknameRegistry. Env vars:
///   PRIVATE_KEY - deployer key (any address can deploy, it has no owner)
contract DeployNicknameRegistry is Script {
    function run() external returns (NicknameRegistry registry) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        registry = new NicknameRegistry();
        vm.stopBroadcast();

        console.log("NicknameRegistry deployed at:", address(registry));
    }
}
