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
        assertEq(race.getApprovedAssetIds().length, 23);
        assertEq(race.getApprovedRaceDurations().length, 3);
        assertEq(market.maxSeedLiquidityWei(), 0.1 ether);
        assertEq(arena.minStakeWei(), 0.0001 ether);
        assertEq(arena.maxStakeWei(), 0.1 ether);
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
    }

    function _oracleIds(uint256 first, uint256 count) private pure returns (string memory result) {
        for (uint256 i; i < count; ++i) {
            if (i > 0) result = string.concat(result, ",");
            result = string.concat(result, vm.toString(bytes32(first + i)));
        }
    }
}
