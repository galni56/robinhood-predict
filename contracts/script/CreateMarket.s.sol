// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// STATUS: written but never run. See contracts/CLAUDE.md.

import {Script, console} from "forge-std/Script.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

/// @notice Creates one "does it reach $TARGET by DEADLINE" market on an
/// already-deployed PredictionMarket. Env vars:
///   PRIVATE_KEY        - must be the contract owner's key
///   MARKET_ADDRESS     - deployed PredictionMarket address
///   PRICE_FEED_ADDRESS - Chainlink feed for the stock token (look up current
///                        address at https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood
///                        — do not hardcode it, it's not guaranteed stable across networks)
///   TARGET_PRICE        - integer, scaled to the feed's own decimals (usually 8).
///                        e.g. for a $100.00 target on an 8-decimal feed: 10000000000
///   DEADLINE_UNIX       - unix timestamp when betting closes / resolution unlocks
contract CreateMarket is Script {
    function run() external returns (uint256 marketId) {
        uint256 ownerKey = vm.envUint("PRIVATE_KEY");
        address marketAddr = vm.envAddress("MARKET_ADDRESS");
        address priceFeed = vm.envAddress("PRICE_FEED_ADDRESS");
        int256 targetPrice = vm.envInt("TARGET_PRICE");
        uint256 deadline = vm.envUint("DEADLINE_UNIX");

        PredictionMarket market = PredictionMarket(marketAddr);

        vm.startBroadcast(ownerKey);
        marketId = market.createMarket(priceFeed, targetPrice, deadline);
        vm.stopBroadcast();

        console.log("Market created, id:", marketId);
    }
}
