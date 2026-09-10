// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

/// @notice Owner-only: allowlists a Chainlink price feed on an already-deployed
/// PredictionMarket, without creating a market against it — lets the create-market
/// UI offer a ticker before anyone has actually opened a market for it. Env vars:
///   PRIVATE_KEY        - must be the contract owner's key
///   MARKET_ADDRESS     - deployed PredictionMarket address
///   PRICE_FEED_ADDRESS - Chainlink feed to allowlist (verify on-chain first —
///                        decimals()/description()/latestRoundData() — before
///                        running this; the contract trusts the allowlist blindly)
contract AllowlistFeed is Script {
    function run() external {
        uint256 ownerKey = vm.envUint("PRIVATE_KEY");
        address marketAddr = vm.envAddress("MARKET_ADDRESS");
        address priceFeed = vm.envAddress("PRICE_FEED_ADDRESS");

        PredictionMarket market = PredictionMarket(marketAddr);

        vm.startBroadcast(ownerKey);
        if (!market.allowedPriceFeeds(priceFeed)) {
            market.setPriceFeedAllowed(priceFeed, true);
            console.log("Allowlisted:", priceFeed);
        } else {
            console.log("Already allowlisted:", priceFeed);
        }
        vm.stopBroadcast();
    }
}
