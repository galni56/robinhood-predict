// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Chainlink Data Feeds (the AggregatorV3Interface this project reads) exist
// on Robinhood Chain mainnet only as of 2026-09 — confirmed against
// data.chain.link (no testnet network listed) and a reference Robinhood
// Chain example dapp, which deploys the same kind of mock feed for the same
// reason. This script fills that gap for testnet demos/dev only.
// Never deploy this near mainnet or treat its price as real.

import {Script, console} from "forge-std/Script.sol";
import {MockAggregator} from "../src/mocks/MockAggregator.sol";

/// @notice Deploys a MockAggregator standing in for a real Chainlink price
/// feed, for testnets where no real feed exists yet. Env vars:
///   PRIVATE_KEY      - burner wallet key, 0x-prefixed
///   FEED_DECIMALS    - optional, defaults to 8 (matches real Chainlink USD feeds)
///   FEED_INITIAL_ANSWER - required, price scaled to FEED_DECIMALS
///                        (e.g. $353.90 at 8 decimals -> 35390000000)
contract DeployMockFeed is Script {
    function run() external returns (MockAggregator feed) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        uint8 decimals = uint8(vm.envOr("FEED_DECIMALS", uint256(8)));
        int256 initialAnswer = vm.envInt("FEED_INITIAL_ANSWER");

        vm.startBroadcast(deployerKey);
        feed = new MockAggregator(decimals, initialAnswer);
        vm.stopBroadcast();

        console.log("MockAggregator deployed at:", address(feed));
        console.log("Decimals:", decimals);
        console.logInt(initialAnswer);
    }
}
