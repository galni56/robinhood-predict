// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

/// @notice Legacy filename retained for operator compatibility. Owner-only:
/// configures one reviewed StockToken/USDG asset on PredictionMarket. Env vars:
///   PRIVATE_KEY        - must be the contract owner's key
///   MARKET_ADDRESS     - deployed PredictionMarket address
///   ASSET_ID            - bytes32 ticker
///   ASSET_ORACLE_ID     - reviewed pool oracle id
contract AllowlistFeed is Script {
    function run() external {
        uint256 ownerKey = vm.envUint("PRIVATE_KEY");
        address marketAddr = vm.envAddress("MARKET_ADDRESS");
        bytes32 assetId = vm.envBytes32("ASSET_ID");
        bytes32 oracleId = vm.envBytes32("ASSET_ORACLE_ID");

        PredictionMarket market = PredictionMarket(marketAddr);

        vm.startBroadcast(ownerKey);
        market.setAssetAllowed(assetId, oracleId, 18, true);
        vm.stopBroadcast();

        console.log("Configured asset:");
        console.logBytes32(assetId);
    }
}
