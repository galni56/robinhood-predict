// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PriceArena} from "../src/PriceArena.sol";

/// @notice Deploys PriceArena without creating an arena or configuring assets.
/// Environment: PRIVATE_KEY, BET_TOKEN_ADDRESS.
contract DeployPriceArena is Script {
    function run() external returns (PriceArena priceArena) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address betToken = vm.envAddress("BET_TOKEN_ADDRESS");

        vm.startBroadcast(deployerKey);
        priceArena = new PriceArena(betToken);
        vm.stopBroadcast();

        console.log("PriceArena deployed at:", address(priceArena));
        console.log("Owner:", priceArena.owner());
        console.log("Bet token:", address(priceArena.betToken()));
        console.log("Lobby duration:", priceArena.LOBBY_DURATION());
        console.log("Fee (bp):", priceArena.FEE_BP());
    }
}
