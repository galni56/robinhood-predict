// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// STATUS: written but never run. See contracts/CLAUDE.md.

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

/// @notice Creates one "is it at or above $TARGET at DEADLINE" market on an
/// already-deployed PredictionMarket. `createMarket` itself is permissionless,
/// but the asset must already be owner-configured. Env vars:
///   PRIVATE_KEY        - creator key (owner required only for non-zero seed liquidity)
///   MARKET_ADDRESS     - deployed PredictionMarket address
///   ASSET_SYMBOL       - configured ticker, e.g. TSLA
///   TARGET_PRICE       - integer USDG price with 18 decimals (e.g. 100e18)
///   DEADLINE_UNIX      - endpoint uses last Robinhood block strictly before it
///   SEED_YES_AMOUNT     - optional, house seed liquidity on YES, in bet-token
///                        units (e.g. 18-decimal mUSD: 25e18 for $25). Owner-only
///                        on-chain, and SEED_YES_AMOUNT + SEED_NO_AMOUNT is capped
///                        at MAX_SEED_LIQUIDITY_USD ($50). Defaults to 0.
///   SEED_NO_AMOUNT      - optional, same as above for NO. Defaults to 0.
contract CreateMarket is Script {
    function run() external returns (uint256 marketId) {
        uint256 creatorKey = vm.envUint("PRIVATE_KEY");
        address marketAddr = vm.envAddress("MARKET_ADDRESS");
        string memory symbolValue = vm.envString("ASSET_SYMBOL");
        bytes memory symbol = bytes(symbolValue);
        require(symbol.length > 0 && symbol.length <= 32, "invalid asset symbol");
        bytes32 assetId;
        assembly ("memory-safe") {
            assetId := mload(add(symbol, 32))
        }
        int256 targetPrice = vm.envInt("TARGET_PRICE");
        uint256 deadline = vm.envUint("DEADLINE_UNIX");
        uint256 seedYes = vm.envOr("SEED_YES_AMOUNT", uint256(0));
        uint256 seedNo = vm.envOr("SEED_NO_AMOUNT", uint256(0));

        PredictionMarket market = PredictionMarket(marketAddr);

        vm.startBroadcast(creatorKey);
        if (seedYes + seedNo > 0) {
            IERC20(market.betToken()).approve(marketAddr, seedYes + seedNo);
        }
        marketId = market.createMarket(assetId, targetPrice, deadline, seedYes, seedNo);
        vm.stopBroadcast();

        console.log("Market created, id:", marketId);
    }
}
