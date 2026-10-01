// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ProphetOwnerBuybackBurnExecutor} from "../src/ProphetOwnerBuybackBurnExecutor.sol";

/// @notice One-time post-launch binding. Run without --broadcast first.
contract BindProphetBuybackToken is Script {
    address internal constant EXPECTED_TOKEN_DEPLOYER = 0x821758584b2155c93713cE4991A7D9b447d0ccd8;
    address internal constant EXPECTED_PROPHET_TOKEN = 0x410f2bD350F3d88795cfC29b61cA664C30987Efd;

    function run() external {
        require(block.chainid == 4_663, "wrong chain");
        uint256 ownerKey = vm.envExists("BUYBACK_TOKEN_DEPLOYER_PRIVATE_KEY")
            ? vm.envUint("BUYBACK_TOKEN_DEPLOYER_PRIVATE_KEY")
            : vm.envUint("PRIVATE_KEY");
        address expectedOwner = EXPECTED_TOKEN_DEPLOYER;
        ProphetOwnerBuybackBurnExecutor buybackExecutor =
            ProphetOwnerBuybackBurnExecutor(payable(vm.envAddress("BUYBACK_EXECUTOR_ADDRESS")));
        address token =
            vm.envExists("PROPHET_TOKEN_ADDRESS") ? vm.envAddress("PROPHET_TOKEN_ADDRESS") : EXPECTED_PROPHET_TOKEN;
        require(vm.addr(ownerKey) == expectedOwner, "signer must be owner");
        require(token == EXPECTED_PROPHET_TOKEN, "wrong Prophet token");
        require(buybackExecutor.owner() == expectedOwner, "wrong executor owner");
        require(address(buybackExecutor).code.length != 0 && token.code.length != 0, "code missing");

        vm.startBroadcast(ownerKey);
        buybackExecutor.bindToken(token);
        vm.stopBroadcast();

        require(buybackExecutor.token() == token, "binding failed");
        require(buybackExecutor.curve() != address(0), "curve missing");
        console.log("Buyback executor:", address(buybackExecutor));
        console.log("Prophet token:", token);
        console.log("PONZ curve:", buybackExecutor.curve());
        console.log("Buybacks remain paused until the launch checks pass");
    }
}
