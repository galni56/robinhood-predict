// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PriceArena} from "../src/PriceArena.sol";

/// @notice Deploys PriceArena without creating an arena or configuring assets.
/// Environment: PRIVATE_KEY, PRICE_ARENA_MIN_STAKE_WEI, PRICE_ARENA_MAX_STAKE_WEI.
contract DeployPriceArena is Script {
    function run() external returns (PriceArena priceArena) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        uint256 minStakeWei = vm.envUint("PRICE_ARENA_MIN_STAKE_WEI");
        uint256 maxStakeWei = vm.envUint("PRICE_ARENA_MAX_STAKE_WEI");

        vm.startBroadcast(deployerKey);
        priceArena = new PriceArena(minStakeWei, maxStakeWei);
        vm.stopBroadcast();

        console.log("PriceArena deployed at:", address(priceArena));
        console.log("Owner:", priceArena.owner());
        console.log("Min stake (wei):", priceArena.minStakeWei());
        console.log("Max stake (wei):", priceArena.maxStakeWei());
        console.log("Lobby duration:", priceArena.LOBBY_DURATION());
        console.log("Fee (bp):", priceArena.FEE_BP());
    }
}
