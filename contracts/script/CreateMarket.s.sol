// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// STATUS: written but never run. See contracts/CLAUDE.md.

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

/// @notice Creates one "does it reach $TARGET by DEADLINE" market on an
/// already-deployed PredictionMarket. `createMarket` itself is permissionless,
/// but the price feed must be on the owner-maintained allowlist first — this
/// script allowlists it (owner-only step) before creating the market, so it
/// still needs the owner's key even though anyone else could call
/// `createMarket` directly once the feed is allowlisted. Env vars:
///   PRIVATE_KEY        - must be the contract owner's key (for the allowlist step)
///   MARKET_ADDRESS     - deployed PredictionMarket address
///   PRICE_FEED_ADDRESS - Chainlink feed for the stock token (look up current
///                        address at https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood
///                        — do not hardcode it, it's not guaranteed stable across networks)
///   TARGET_PRICE        - integer, scaled to the feed's own decimals (usually 8).
///                        e.g. for a $100.00 target on an 8-decimal feed: 10000000000
///   DEADLINE_UNIX       - unix timestamp when betting closes / resolution unlocks
///   SEED_YES_AMOUNT     - optional, house seed liquidity on YES, in bet-token
///                        units (e.g. 18-decimal mUSD: 25e18 for $25). Owner-only
///                        on-chain, and SEED_YES_AMOUNT + SEED_NO_AMOUNT is capped
///                        at MAX_SEED_LIQUIDITY_USD ($50). Defaults to 0.
///   SEED_NO_AMOUNT      - optional, same as above for NO. Defaults to 0.
contract CreateMarket is Script {
    function run() external returns (uint256 marketId) {
        uint256 ownerKey = vm.envUint("PRIVATE_KEY");
        address marketAddr = vm.envAddress("MARKET_ADDRESS");
        address priceFeed = vm.envAddress("PRICE_FEED_ADDRESS");
        int256 targetPrice = vm.envInt("TARGET_PRICE");
        uint256 deadline = vm.envUint("DEADLINE_UNIX");
        uint256 seedYes = vm.envOr("SEED_YES_AMOUNT", uint256(0));
        uint256 seedNo = vm.envOr("SEED_NO_AMOUNT", uint256(0));

        PredictionMarket market = PredictionMarket(marketAddr);

        vm.startBroadcast(ownerKey);
        if (!market.allowedPriceFeeds(priceFeed)) {
            market.setPriceFeedAllowed(priceFeed, true);
        }
        if (seedYes + seedNo > 0) {
            IERC20(market.betToken()).approve(marketAddr, seedYes + seedNo);
        }
        marketId = market.createMarket(priceFeed, targetPrice, deadline, seedYes, seedNo);
        vm.stopBroadcast();

        console.log("Market created, id:", marketId);
    }
}
