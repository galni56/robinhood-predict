// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AssetRace} from "../src/AssetRace.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {PriceArena} from "../src/PriceArena.sol";
import {SignedPoolRaceOracle} from "../src/oracles/SignedPoolRaceOracle.sol";
import {SimulateNativeEthDeployment} from "../script/SimulateNativeEthDeployment.s.sol";

contract SimulateNativeEthDeploymentTest is Test {
    address private constant OWNER = address(0xB0B);
    address private constant PRICE_SIGNER = address(0xA11CE);

    function test_NoBroadcastSimulationDeploysAndVerifiesCompleteManifest() public {
        vm.chainId(4663);
        SignedPoolRaceOracle oracle = new SignedPoolRaceOracle(PRICE_SIGNER);
        _setEnvironment(oracle);

        SimulateNativeEthDeployment simulation = new SimulateNativeEthDeployment();
        (PredictionMarket market, AssetRace race, PriceArena arena) = simulation.run();

        assertEq(market.owner(), OWNER);
        assertEq(race.owner(), OWNER);
        assertEq(arena.owner(), OWNER);
        assertEq(address(market.endpointOracle()), address(oracle));
        assertEq(race.getApprovedAssetIds().length, 25);
        assertEq(race.getApprovedRaceDurations().length, 3);
        assertEq(market.maxSeedLiquidityWei(), 0.1 ether);
        assertEq(arena.minStakeWei(), 0.0001 ether);
        assertEq(arena.maxStakeWei(), 0.1 ether);

        _verifyAllCategoryEventCreation(market, race, arena);
    }

    function _verifyAllCategoryEventCreation(PredictionMarket market, AssetRace race, PriceArena arena) private {
        bytes32 stock0 = bytes32("S0");
        bytes32 stock1 = bytes32("S1");
        bytes32 meme0 = bytes32("M0");
        bytes32 meme1 = bytes32("M1");
        bytes32 btc = bytes32("BTC");
        bytes32 eth = bytes32("ETH");

        uint256 stockMarketId = market.createMarket(stock0, int256(100e18), block.timestamp + 30 minutes, 0, 0);
        PredictionMarket.Market memory createdStockMarket = market.getMarket(stockMarketId);
        assertEq(createdStockMarket.assetId, stock0);

        uint256 marketId = market.createMarket(btc, int256(85_000e18), block.timestamp + 30 minutes, 0, 0);
        PredictionMarket.Market memory createdMarket = market.getMarket(marketId);
        assertEq(createdMarket.assetId, btc);
        assertEq(createdMarket.oracleId, bytes32(uint256(201)));

        uint256 memeMarketId = market.createMarket(meme0, int256(60_000_000_000_000), block.timestamp + 30 minutes, 0, 0);
        PredictionMarket.Market memory createdMemeMarket = market.getMarket(memeMarketId);
        assertEq(createdMemeMarket.assetId, meme0);
        assertEq(createdMemeMarket.oracleId, bytes32(uint256(101)));

        bytes32[] memory stockRaceAssets = new bytes32[](2);
        stockRaceAssets[0] = stock0;
        stockRaceAssets[1] = stock1;
        uint256 stockRaceId = race.createCommunityRace("S0 vs S1", AssetRace.RaceCategory.STOCK, 60, stockRaceAssets);
        AssetRace.Race memory createdStockRace = race.getRace(stockRaceId);
        assertEq(uint256(createdStockRace.category), uint256(AssetRace.RaceCategory.STOCK));

        bytes32[] memory memeRaceAssets = new bytes32[](2);
        memeRaceAssets[0] = meme0;
        memeRaceAssets[1] = meme1;
        uint256 memeRaceId = race.createCommunityRace("M0 vs M1", AssetRace.RaceCategory.MEME, 60, memeRaceAssets);
        AssetRace.Race memory createdMemeRace = race.getRace(memeRaceId);
        assertEq(uint256(createdMemeRace.category), uint256(AssetRace.RaceCategory.MEME));

        bytes32[] memory raceAssets = new bytes32[](2);
        raceAssets[0] = btc;
        raceAssets[1] = eth;
        uint256 raceId = race.createCommunityRace("BTC vs ETH", AssetRace.RaceCategory.CRYPTO, 60, raceAssets);
        AssetRace.Race memory createdRace = race.getRace(raceId);
        AssetRace.RaceAsset[] memory createdRaceAssets = race.getRaceAssets(raceId);
        assertEq(uint256(createdRace.category), uint256(AssetRace.RaceCategory.CRYPTO));
        assertEq(createdRaceAssets.length, 2);
        assertEq(createdRaceAssets[0].assetId, btc);
        assertEq(createdRaceAssets[1].assetId, eth);

        uint256 stockArenaId = arena.createArena(stock0, PriceArena.Category.STOCK, 1 minutes, "S0 1m Arena");
        PriceArena.Arena memory createdStockArena = arena.getArena(stockArenaId);
        assertEq(uint256(createdStockArena.category), uint256(PriceArena.Category.STOCK));

        uint256 memeArenaId = arena.createArena(meme0, PriceArena.Category.MEME, 1 minutes, "M0 1m Arena");
        PriceArena.Arena memory createdMemeArena = arena.getArena(memeArenaId);
        assertEq(uint256(createdMemeArena.category), uint256(PriceArena.Category.MEME));

        uint256 arenaId = arena.createArena(btc, PriceArena.Category.CRYPTO, 1 minutes, "BTC 1m Arena");
        PriceArena.Arena memory createdArena = arena.getArena(arenaId);
        assertEq(createdArena.assetId, btc);
        assertEq(uint256(createdArena.category), uint256(PriceArena.Category.CRYPTO));
    }

    function _setEnvironment(SignedPoolRaceOracle oracle) private {
        vm.setEnv("SIMULATION_OWNER_ADDRESS", vm.toString(OWNER));
        vm.setEnv("SIGNED_POOL_ORACLE_ADDRESS", vm.toString(address(oracle)));
        vm.setEnv("PRICE_SIGNER_ADDRESS", vm.toString(PRICE_SIGNER));
        vm.setEnv("FEE_BP", "200");
        vm.setEnv("MAX_SEED_LIQUIDITY_WEI", vm.toString(uint256(0.1 ether)));
        vm.setEnv("MAX_STAKE_PER_SIDE_WEI", vm.toString(uint256(0.1 ether)));
        vm.setEnv("PRICE_ARENA_MIN_STAKE_WEI", vm.toString(uint256(0.0001 ether)));
        vm.setEnv("PRICE_ARENA_MAX_STAKE_WEI", vm.toString(uint256(0.1 ether)));
        vm.setEnv("ASSET_RACE_LOBBY_DURATION", "300");
        vm.setEnv("ASSET_RACE_BETTING_DURATION", "300");
        vm.setEnv("ASSET_RACE_START_GRACE", "180");
        vm.setEnv("ASSET_RACE_RESOLUTION_GRACE", "300");
        vm.setEnv("ASSET_RACE_MAX_ORACLE_TIMESTAMP_SKEW", "0");
        vm.setEnv("ASSET_RACE_FEE_BP", "200");
        vm.setEnv("ASSET_RACE_MIN_ACTIVE_CONTENDERS", "2");
        vm.setEnv("ASSET_RACE_MIN_STAKE_WEI", vm.toString(uint256(0.0001 ether)));
        vm.setEnv("ASSET_RACE_MAX_STAKE_PER_WALLET_WEI", vm.toString(uint256(0.1 ether)));
        vm.setEnv("ASSET_RACE_MAX_PRICE_AGE", "60");
        vm.setEnv("ASSET_RACE_MAX_ENDPOINT_LAG", "0");
        vm.setEnv("ASSET_RACE_DURATION_PRESETS", "60,300,900");
        vm.setEnv("STOCK_SYMBOLS", "S0,S1,S2,S3,S4,S5,S6,S7,S8,S9");
        vm.setEnv("STOCK_ORACLE_IDS", _oracleIds(1, 10));
        vm.setEnv("MEME_SYMBOLS", "M0,M1,M2,M3,M4,M5,M6,M7,M8,M9,M10,M11,M12");
        vm.setEnv("MEME_ORACLE_IDS", _oracleIds(101, 13));
        vm.setEnv("CRYPTO_SYMBOLS", "BTC,ETH");
        vm.setEnv("CRYPTO_ORACLE_IDS", _oracleIds(201, 2));
    }

    function _oracleIds(uint256 first, uint256 count) private pure returns (string memory result) {
        for (uint256 i; i < count; ++i) {
            if (i > 0) result = string.concat(result, ",");
            result = string.concat(result, vm.toString(bytes32(first + i)));
        }
    }
}
