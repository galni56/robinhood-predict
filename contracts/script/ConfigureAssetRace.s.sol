// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// STATUS: deployment preparation only. Registers the registry-approved Stock/Meme
// symbols and configures community timing/economics entirely from env values.

import {Script, console} from "forge-std/Script.sol";
import {AssetRace} from "../src/AssetRace.sol";
import {SignedPoolRaceOracle} from "../src/oracles/SignedPoolRaceOracle.sol";
import {AssetRaceOperatorSafety} from "./helpers/AssetRaceOperatorSafety.sol";

contract ConfigureAssetRace is Script {
    uint8 private constant STOCK_DECIMALS = 18;
    uint64 private constant STOCK_MAX_ENDPOINT_LAG = 0;

    function run() external {
        uint256 deployerKey = vm.envUint("ASSET_RACE_DEPLOYER_PRIVATE_KEY");
        AssetRace race = AssetRace(vm.envAddress("ASSET_RACE_ADDRESS"));
        SignedPoolRaceOracle oracle = SignedPoolRaceOracle(vm.envAddress("ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS"));
        address expectedSigner = vm.envAddress("ASSET_RACE_PRICE_SIGNER_ADDRESS");
        require(oracle.TRUSTED_SIGNER() == expectedSigner, "price signer mismatch");
        AssetRaceOperatorSafety.validateConfiguration(vm.addr(deployerKey), race.owner(), expectedSigner);

        uint64 maxPriceAge = _envUint64("ASSET_RACE_MAX_PRICE_AGE");
        uint64 maxEndpointLag = _envUint64("ASSET_RACE_MAX_ENDPOINT_LAG");
        require(maxEndpointLag == STOCK_MAX_ENDPOINT_LAG, "pool endpoint lag must match registry");
        uint64 maxOracleTimestampSkew = _envUint64("ASSET_RACE_MAX_ORACLE_TIMESTAMP_SKEW");
        uint256 feeBpValue = vm.envUint("ASSET_RACE_FEE_BP");
        uint256 minimumContendersValue = vm.envUint("ASSET_RACE_MIN_ACTIVE_CONTENDERS");
        require(feeBpValue <= type(uint16).max, "fee does not fit uint16");
        require(minimumContendersValue <= type(uint8).max, "contenders do not fit uint8");

        // Public arrays are exported by the registry validator, not maintained
        // as a second asset/pool catalog in this script.
        string[] memory symbols = vm.envString("ASSET_RACE_STOCK_SYMBOLS", ",");
        bytes32[] memory oracleIds = vm.envBytes32("ASSET_RACE_STOCK_ORACLE_IDS", ",");
        require(symbols.length >= 2 && symbols.length == oracleIds.length, "invalid approved stock arrays");
        string[] memory memeSymbols = vm.envOr("ASSET_RACE_MEME_SYMBOLS", ",", new string[](0));
        bytes32[] memory memeOracleIds = vm.envOr("ASSET_RACE_MEME_ORACLE_IDS", ",", new bytes32[](0));
        require(memeSymbols.length == memeOracleIds.length, "invalid approved meme arrays");
        require(memeSymbols.length == 0 || memeSymbols.length >= 2, "insufficient approved memes");

        vm.startBroadcast(deployerKey);
        _registerAssets(race, oracle, AssetRace.RaceCategory.STOCK, symbols, oracleIds, maxPriceAge, maxEndpointLag);
        _registerAssets(
            race, oracle, AssetRace.RaceCategory.MEME, memeSymbols, memeOracleIds, maxPriceAge, maxEndpointLag
        );
        race.setCommunityPolicy(
            AssetRace.CommunityPolicyInput({
                lobbyDuration: _envUint64("ASSET_RACE_LOBBY_DURATION"),
                bettingDuration: _envUint64("ASSET_RACE_BETTING_DURATION"),
                startGrace: _envUint64("ASSET_RACE_START_GRACE"),
                resolutionGrace: _envUint64("ASSET_RACE_RESOLUTION_GRACE"),
                maxOracleTimestampSkew: maxOracleTimestampSkew,
                feeBp: uint16(feeBpValue),
                minActiveContenders: uint8(minimumContendersValue),
                minStake: vm.envUint("ASSET_RACE_MIN_STAKE"),
                maxStakePerWallet: vm.envUint("ASSET_RACE_MAX_STAKE_PER_WALLET")
            })
        );
        _enableDurationPreset(race, "ASSET_RACE_DURATION_PRESET_1");
        _enableDurationPreset(race, "ASSET_RACE_DURATION_PRESET_2");
        _enableDurationPreset(race, "ASSET_RACE_DURATION_PRESET_3");
        vm.stopBroadcast();

        console.log("Configured signed StockToken/USDG pool assets", symbols.length);
        console.log("Configured signed Meme/WETH pool assets", memeSymbols.length);
        console.log("maxPriceAge", maxPriceAge);
        console.log("maxEndpointLag", maxEndpointLag);
        console.log("maxOracleTimestampSkew", maxOracleTimestampSkew);
    }

    function _registerAssets(
        AssetRace race,
        SignedPoolRaceOracle oracle,
        AssetRace.RaceCategory category,
        string[] memory symbols,
        bytes32[] memory oracleIds,
        uint64 maxPriceAge,
        uint64 maxEndpointLag
    ) private {
        for (uint256 i = 0; i < symbols.length; ++i) {
            race.setApprovedAsset(
                AssetRace.CandidateInput({
                    category: category,
                    assetId: _assetId(symbols[i]),
                    oracle: address(oracle),
                    oracleId: oracleIds[i],
                    expectedDecimals: STOCK_DECIMALS,
                    maxPriceAge: maxPriceAge,
                    maxEndpointLag: maxEndpointLag
                }),
                true
            );
        }
    }

    function _assetId(string memory symbol) private pure returns (bytes32 result) {
        bytes memory value = bytes(symbol);
        require(value.length > 0 && value.length <= 32, "invalid asset symbol");
        assembly {
            result := mload(add(value, 32))
        }
    }

    function _enableDurationPreset(AssetRace race, string memory name) private {
        uint256 value = vm.envOr(name, uint256(0));
        if (value == 0) return;
        require(value <= type(uint64).max, "duration does not fit uint64");
        race.setRaceDurationPreset(uint64(value), true);
    }

    function _envUint64(string memory name) private view returns (uint64 value) {
        uint256 raw = vm.envUint(name);
        require(raw <= type(uint64).max, "value does not fit uint64");
        value = uint64(raw);
    }
}
