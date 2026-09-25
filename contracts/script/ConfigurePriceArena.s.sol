// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PriceArena} from "../src/PriceArena.sol";

/// @notice Configures reviewed StockToken/USDG and MemeToken/ETH pool bindings.
/// Run without --broadcast first.
/// Environment:
///   PRIVATE_KEY, PRICE_ARENA_ADDRESS, SIGNED_POOL_ORACLE_ADDRESS
///   STOCK_SYMBOLS, STOCK_ORACLE_IDS, MEME_SYMBOLS, MEME_ORACLE_IDS
contract ConfigurePriceArena is Script {
    function run() external {
        uint256 ownerKey = vm.envUint("PRIVATE_KEY");
        PriceArena arena = PriceArena(payable(vm.envAddress("PRICE_ARENA_ADDRESS")));
        address oracle = vm.envAddress("SIGNED_POOL_ORACLE_ADDRESS");
        string[] memory stockSymbols = vm.envString("STOCK_SYMBOLS", ",");
        bytes32[] memory stockOracleIds = vm.envBytes32("STOCK_ORACLE_IDS", ",");
        string[] memory memeSymbols = vm.envString("MEME_SYMBOLS", ",");
        bytes32[] memory memeOracleIds = vm.envBytes32("MEME_ORACLE_IDS", ",");
        require(stockSymbols.length > 0 && stockSymbols.length == stockOracleIds.length, "stock config mismatch");
        require(memeSymbols.length > 0 && memeSymbols.length == memeOracleIds.length, "meme config mismatch");

        vm.startBroadcast(ownerKey);
        _configure(arena, oracle, stockSymbols, stockOracleIds, PriceArena.Category.STOCK);
        _configure(arena, oracle, memeSymbols, memeOracleIds, PriceArena.Category.MEME);
        vm.stopBroadcast();

        console.log("PriceArena:", address(arena));
        console.log("Configured Stock assets:", stockSymbols.length);
        console.log("Configured Meme assets:", memeSymbols.length);
    }

    function _configure(
        PriceArena arena,
        address oracle,
        string[] memory symbols,
        bytes32[] memory oracleIds,
        PriceArena.Category category
    ) private {
        for (uint256 i; i < symbols.length; ++i) {
            bytes memory symbol = bytes(symbols[i]);
            require(symbol.length > 0 && symbol.length <= 32, "invalid asset symbol");
            bytes32 assetId;
            assembly ("memory-safe") {
                assetId := mload(add(symbol, 32))
            }
            arena.setAsset(assetId, oracle, oracleIds[i], 18, category, true);
        }
    }
}
