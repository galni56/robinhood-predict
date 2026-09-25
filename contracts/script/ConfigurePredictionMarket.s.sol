// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

/// @notice Configures the reviewed StockToken/USDG pool identities on a fresh
/// PredictionMarket deployment. Run without `--broadcast` first.
///
/// Environment:
///   PRIVATE_KEY          - owner key, read only by Foundry
///   MARKET_ADDRESS       - fresh PredictionMarket address
///   ASSET_SYMBOLS         - comma-separated symbols (the 10 production Stocks)
///   ASSET_ORACLE_IDS      - comma-separated signed-pool oracle ids in the same order
contract ConfigurePredictionMarket is Script {
    function run() external {
        uint256 ownerKey = vm.envUint("PRIVATE_KEY");
        address marketAddress = vm.envAddress("MARKET_ADDRESS");
        string[] memory symbols = vm.envString("ASSET_SYMBOLS", ",");
        bytes32[] memory oracleIds = vm.envBytes32("ASSET_ORACLE_IDS", ",");
        require(symbols.length > 0 && symbols.length == oracleIds.length, "asset config length mismatch");

        PredictionMarket market = PredictionMarket(payable(marketAddress));

        vm.startBroadcast(ownerKey);
        for (uint256 i = 0; i < symbols.length; i++) {
            bytes memory symbol = bytes(symbols[i]);
            require(symbol.length > 0 && symbol.length <= 32, "invalid asset symbol");
            bytes32 assetId;
            assembly ("memory-safe") {
                assetId := mload(add(symbol, 32))
            }
            require(oracleIds[i] != bytes32(0), "oracle = zero id");
            market.setAssetAllowed(assetId, oracleIds[i], 18, true);
        }
        vm.stopBroadcast();

        console.log("PredictionMarket:", marketAddress);
        console.log("Configured StockToken/USDG assets:", symbols.length);
    }
}
