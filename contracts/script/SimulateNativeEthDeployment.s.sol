// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Deliberately contains no startBroadcast/broadcast call. Even if invoked with
// Forge's --broadcast flag, this script only mutates the local fork simulation.

import {Script, console} from "forge-std/Script.sol";
import {AssetRace} from "../src/AssetRace.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {PriceArena} from "../src/PriceArena.sol";
import {SignedPoolRaceOracle} from "../src/oracles/SignedPoolRaceOracle.sol";
import {AssetRaceOperatorSafety} from "./helpers/AssetRaceOperatorSafety.sol";

/// @notice No-broadcast chain-4663 deployment/configuration rehearsal.
/// @dev All inputs are public release-manifest values. No private key is read.
contract SimulateNativeEthDeployment is Script {
    uint256 private constant EXPECTED_CHAIN_ID = 4663;
    uint8 private constant EXPECTED_PRICE_DECIMALS = 18;
    uint256 private constant EXPECTED_STOCK_COUNT = 10;
    uint256 private constant EXPECTED_MEME_COUNT = 13;
    uint256 private constant EXPECTED_FEE_BP = 200;

    struct Inputs {
        address owner;
        SignedPoolRaceOracle oracle;
        address priceSigner;
        uint256 feeBp;
        uint256 maxSeedLiquidityWei;
        uint256 maxStakePerSideWei;
        uint256 arenaMinStakeWei;
        uint256 arenaMaxStakeWei;
        uint64 maxPriceAge;
        uint64 maxEndpointLag;
        AssetRace.CommunityPolicyInput racePolicy;
        uint256[] raceDurations;
        string[] stockSymbols;
        bytes32[] stockOracleIds;
        string[] memeSymbols;
        bytes32[] memeOracleIds;
    }

    function run() external returns (PredictionMarket market, AssetRace race, PriceArena arena) {
        Inputs memory inputs = _inputs();
        _validateInputs(inputs);

        uint256 deployGasStart = gasleft();
        vm.startPrank(inputs.owner, inputs.owner);
        market = new PredictionMarket(
            address(inputs.oracle), inputs.feeBp, inputs.maxSeedLiquidityWei, inputs.maxStakePerSideWei
        );
        uint256 marketDeployGas = deployGasStart - gasleft();
        uint256 raceDeployGasStart = gasleft();
        race = new AssetRace();
        uint256 raceDeployGas = raceDeployGasStart - gasleft();
        uint256 arenaDeployGasStart = gasleft();
        arena = new PriceArena(inputs.arenaMinStakeWei, inputs.arenaMaxStakeWei);
        uint256 arenaDeployGas = arenaDeployGasStart - gasleft();

        uint256 configureGasStart = gasleft();
        _configurePredictionMarket(market, inputs.stockSymbols, inputs.stockOracleIds);
        _configureAssetRace(race, inputs);
        _configurePriceArena(arena, inputs);
        uint256 configureGas = configureGasStart - gasleft();
        vm.stopPrank();

        _verifyPostconditions(market, race, arena, inputs);
        _report(market, race, arena, inputs, marketDeployGas, raceDeployGas, arenaDeployGas, configureGas);
    }

    function _inputs() private view returns (Inputs memory inputs) {
        inputs.owner = vm.envAddress("SIMULATION_OWNER_ADDRESS");
        inputs.oracle = SignedPoolRaceOracle(vm.envAddress("SIGNED_POOL_ORACLE_ADDRESS"));
        inputs.priceSigner = vm.envAddress("PRICE_SIGNER_ADDRESS");
        inputs.feeBp = vm.envOr("FEE_BP", uint256(200));
        inputs.maxSeedLiquidityWei = vm.envUint("MAX_SEED_LIQUIDITY_WEI");
        inputs.maxStakePerSideWei = vm.envUint("MAX_STAKE_PER_SIDE_WEI");
        inputs.arenaMinStakeWei = vm.envUint("PRICE_ARENA_MIN_STAKE_WEI");
        inputs.arenaMaxStakeWei = vm.envUint("PRICE_ARENA_MAX_STAKE_WEI");
        inputs.maxPriceAge = _envUint64("ASSET_RACE_MAX_PRICE_AGE");
        inputs.maxEndpointLag = _envUint64("ASSET_RACE_MAX_ENDPOINT_LAG");
        inputs.racePolicy = AssetRace.CommunityPolicyInput({
            lobbyDuration: _envUint64("ASSET_RACE_LOBBY_DURATION"),
            bettingDuration: _envUint64("ASSET_RACE_BETTING_DURATION"),
            startGrace: _envUint64("ASSET_RACE_START_GRACE"),
            resolutionGrace: _envUint64("ASSET_RACE_RESOLUTION_GRACE"),
            maxOracleTimestampSkew: _envUint64("ASSET_RACE_MAX_ORACLE_TIMESTAMP_SKEW"),
            feeBp: _envUint16("ASSET_RACE_FEE_BP"),
            minActiveContenders: _envUint8("ASSET_RACE_MIN_ACTIVE_CONTENDERS"),
            minStake: vm.envUint("ASSET_RACE_MIN_STAKE_WEI"),
            maxStakePerWallet: vm.envUint("ASSET_RACE_MAX_STAKE_PER_WALLET_WEI")
        });
        inputs.raceDurations = vm.envUint("ASSET_RACE_DURATION_PRESETS", ",");
        inputs.stockSymbols = vm.envString("STOCK_SYMBOLS", ",");
        inputs.stockOracleIds = vm.envBytes32("STOCK_ORACLE_IDS", ",");
        inputs.memeSymbols = vm.envString("MEME_SYMBOLS", ",");
        inputs.memeOracleIds = vm.envBytes32("MEME_ORACLE_IDS", ",");
    }

    function _validateInputs(Inputs memory inputs) private view {
        require(block.chainid == EXPECTED_CHAIN_ID, "expected chain 4663 fork");
        require(inputs.owner != address(0), "owner = zero addr");
        require(address(inputs.oracle).code.length > 0, "signed oracle has no code");
        require(inputs.oracle.TRUSTED_SIGNER() == inputs.priceSigner, "price signer mismatch");
        AssetRaceOperatorSafety.validateDeployment(inputs.owner, inputs.priceSigner);
        require(inputs.maxSeedLiquidityWei > 0, "seed cap = 0");
        require(inputs.maxStakePerSideWei > 0, "market stake cap = 0");
        require(inputs.arenaMinStakeWei > 0 && inputs.arenaMaxStakeWei >= inputs.arenaMinStakeWei, "arena caps");
        require(inputs.racePolicy.minStake > 0, "race min stake = 0");
        require(inputs.racePolicy.maxStakePerWallet >= inputs.racePolicy.minStake, "race caps");
        require(inputs.feeBp == EXPECTED_FEE_BP && inputs.racePolicy.feeBp == EXPECTED_FEE_BP, "fee policy mismatch");
        require(
            inputs.maxSeedLiquidityWei == inputs.arenaMaxStakeWei
                && inputs.maxStakePerSideWei == inputs.arenaMaxStakeWei
                && inputs.racePolicy.minStake == inputs.arenaMinStakeWei
                && inputs.racePolicy.maxStakePerWallet == inputs.arenaMaxStakeWei,
            "cross-product cap mismatch"
        );
        require(
            inputs.racePolicy.lobbyDuration == 300 && inputs.racePolicy.bettingDuration == 300
                && inputs.racePolicy.startGrace == 180 && inputs.racePolicy.resolutionGrace == 300
                && inputs.racePolicy.maxOracleTimestampSkew == 0 && inputs.racePolicy.minActiveContenders == 2,
            "race policy mismatch"
        );
        require(inputs.maxPriceAge == 60 && inputs.maxEndpointLag == 0, "race validation profile mismatch");
        require(inputs.stockSymbols.length == EXPECTED_STOCK_COUNT, "expected 10 stocks");
        require(inputs.memeSymbols.length == EXPECTED_MEME_COUNT, "expected 13 memes");
        require(inputs.stockSymbols.length == inputs.stockOracleIds.length, "stock arrays mismatch");
        require(inputs.memeSymbols.length == inputs.memeOracleIds.length, "meme arrays mismatch");
        require(
            inputs.raceDurations.length == 3 && inputs.raceDurations[0] == 60 && inputs.raceDurations[1] == 300
                && inputs.raceDurations[2] == 900,
            "race durations mismatch"
        );
    }

    function _configurePredictionMarket(PredictionMarket market, string[] memory symbols, bytes32[] memory oracleIds)
        private
    {
        for (uint256 i; i < symbols.length; ++i) {
            market.setAssetAllowed(_assetId(symbols[i]), oracleIds[i], EXPECTED_PRICE_DECIMALS, true);
        }
    }

    function _configureAssetRace(AssetRace race, Inputs memory inputs) private {
        _configureRaceCategory(
            race,
            inputs.oracle,
            AssetRace.RaceCategory.STOCK,
            inputs.stockSymbols,
            inputs.stockOracleIds,
            inputs.maxPriceAge,
            inputs.maxEndpointLag
        );
        _configureRaceCategory(
            race,
            inputs.oracle,
            AssetRace.RaceCategory.MEME,
            inputs.memeSymbols,
            inputs.memeOracleIds,
            inputs.maxPriceAge,
            inputs.maxEndpointLag
        );
        race.setCommunityPolicy(inputs.racePolicy);
        for (uint256 i; i < inputs.raceDurations.length; ++i) {
            require(inputs.raceDurations[i] <= type(uint64).max, "race duration overflow");
            race.setRaceDurationPreset(uint64(inputs.raceDurations[i]), true);
        }
    }

    function _configureRaceCategory(
        AssetRace race,
        SignedPoolRaceOracle oracle,
        AssetRace.RaceCategory category,
        string[] memory symbols,
        bytes32[] memory oracleIds,
        uint64 maxPriceAge,
        uint64 maxEndpointLag
    ) private {
        for (uint256 i; i < symbols.length; ++i) {
            race.setApprovedAsset(
                AssetRace.CandidateInput({
                    category: category,
                    assetId: _assetId(symbols[i]),
                    oracle: address(oracle),
                    oracleId: oracleIds[i],
                    expectedDecimals: EXPECTED_PRICE_DECIMALS,
                    maxPriceAge: maxPriceAge,
                    maxEndpointLag: maxEndpointLag
                }),
                true
            );
        }
    }

    function _configurePriceArena(PriceArena arena, Inputs memory inputs) private {
        _configureArenaCategory(
            arena, inputs.oracle, PriceArena.Category.STOCK, inputs.stockSymbols, inputs.stockOracleIds
        );
        _configureArenaCategory(
            arena, inputs.oracle, PriceArena.Category.MEME, inputs.memeSymbols, inputs.memeOracleIds
        );
    }

    function _configureArenaCategory(
        PriceArena arena,
        SignedPoolRaceOracle oracle,
        PriceArena.Category category,
        string[] memory symbols,
        bytes32[] memory oracleIds
    ) private {
        for (uint256 i; i < symbols.length; ++i) {
            arena.setAsset(_assetId(symbols[i]), address(oracle), oracleIds[i], EXPECTED_PRICE_DECIMALS, category, true);
        }
    }

    function _verifyPostconditions(PredictionMarket market, AssetRace race, PriceArena arena, Inputs memory inputs)
        private
        view
    {
        require(
            market.owner() == inputs.owner && race.owner() == inputs.owner && arena.owner() == inputs.owner,
            "owner mismatch"
        );
        require(address(market.endpointOracle()) == address(inputs.oracle), "market oracle mismatch");
        require(market.feeBp() == inputs.feeBp, "market fee mismatch");
        require(market.maxSeedLiquidityWei() == inputs.maxSeedLiquidityWei, "market seed cap mismatch");
        require(market.maxStakePerSideWei() == inputs.maxStakePerSideWei, "market stake cap mismatch");
        require(arena.minStakeWei() == inputs.arenaMinStakeWei, "arena min mismatch");
        require(arena.maxStakeWei() == inputs.arenaMaxStakeWei, "arena max mismatch");
        require(race.communityPolicyConfigured(), "race policy missing");
        require(race.getApprovedAssetIds().length == EXPECTED_STOCK_COUNT + EXPECTED_MEME_COUNT, "race asset count");
        uint64[] memory actualDurations = race.getApprovedRaceDurations();
        require(actualDurations.length == inputs.raceDurations.length, "race duration count");
        for (uint256 i; i < actualDurations.length; ++i) {
            require(actualDurations[i] == inputs.raceDurations[i], "race duration mismatch");
        }
        (
            uint64 lobbyDuration,
            uint64 bettingDuration,
            uint64 startGrace,
            uint64 resolutionGrace,
            uint64 maxOracleTimestampSkew,
            uint16 feeBp,
            uint8 minActiveContenders,
            uint256 minStake,
            uint256 maxStakePerWallet
        ) = race.communityPolicy();
        require(
            lobbyDuration == inputs.racePolicy.lobbyDuration && bettingDuration == inputs.racePolicy.bettingDuration
                && startGrace == inputs.racePolicy.startGrace && resolutionGrace == inputs.racePolicy.resolutionGrace
                && maxOracleTimestampSkew == inputs.racePolicy.maxOracleTimestampSkew
                && feeBp == inputs.racePolicy.feeBp && minActiveContenders == inputs.racePolicy.minActiveContenders
                && minStake == inputs.racePolicy.minStake && maxStakePerWallet == inputs.racePolicy.maxStakePerWallet,
            "race policy postcondition"
        );

        for (uint256 i; i < inputs.stockSymbols.length; ++i) {
            bytes32 assetId = _assetId(inputs.stockSymbols[i]);
            _verifyPredictionAsset(market, assetId, inputs.stockOracleIds[i]);
            _verifyRaceAsset(
                race,
                assetId,
                inputs.stockOracleIds[i],
                AssetRace.RaceCategory.STOCK,
                inputs.oracle,
                inputs.maxPriceAge,
                inputs.maxEndpointLag
            );
            _verifyArenaAsset(arena, assetId, inputs.stockOracleIds[i], PriceArena.Category.STOCK, inputs.oracle);
        }
        for (uint256 i; i < inputs.memeSymbols.length; ++i) {
            bytes32 assetId = _assetId(inputs.memeSymbols[i]);
            _verifyRaceAsset(
                race,
                assetId,
                inputs.memeOracleIds[i],
                AssetRace.RaceCategory.MEME,
                inputs.oracle,
                inputs.maxPriceAge,
                inputs.maxEndpointLag
            );
            _verifyArenaAsset(arena, assetId, inputs.memeOracleIds[i], PriceArena.Category.MEME, inputs.oracle);
        }
    }

    function _verifyPredictionAsset(PredictionMarket market, bytes32 assetId, bytes32 oracleId) private view {
        (bytes32 actualOracleId, uint8 decimals, bool allowed) = market.approvedAssets(assetId);
        require(actualOracleId == oracleId && decimals == EXPECTED_PRICE_DECIMALS && allowed, "market asset mismatch");
    }

    function _verifyRaceAsset(
        AssetRace race,
        bytes32 assetId,
        bytes32 oracleId,
        AssetRace.RaceCategory category,
        SignedPoolRaceOracle oracle,
        uint64 expectedMaxPriceAge,
        uint64 expectedMaxEndpointLag
    ) private view {
        (
            bool registered,
            bool enabled,
            AssetRace.RaceCategory actualCategory,
            address actualOracle,
            bytes32 actualOracleId,
            uint8 decimals,
            uint64 maxPriceAge,
            uint64 maxEndpointLag
        ) = race.approvedAssets(assetId);
        require(
            registered && enabled && actualCategory == category && actualOracle == address(oracle)
                && actualOracleId == oracleId && decimals == EXPECTED_PRICE_DECIMALS
                && maxPriceAge == expectedMaxPriceAge && maxEndpointLag == expectedMaxEndpointLag,
            "race asset mismatch"
        );
    }

    function _verifyArenaAsset(
        PriceArena arena,
        bytes32 assetId,
        bytes32 oracleId,
        PriceArena.Category category,
        SignedPoolRaceOracle oracle
    ) private view {
        (
            address actualOracle,
            bytes32 actualOracleId,
            uint8 decimals,
            PriceArena.Category actualCategory,
            bool enabled
        ) = arena.approvedAssets(assetId);
        require(
            enabled && actualCategory == category && actualOracle == address(oracle) && actualOracleId == oracleId
                && decimals == EXPECTED_PRICE_DECIMALS,
            "arena asset mismatch"
        );
    }

    function _report(
        PredictionMarket market,
        AssetRace race,
        PriceArena arena,
        Inputs memory inputs,
        uint256 marketDeployGas,
        uint256 raceDeployGas,
        uint256 arenaDeployGas,
        uint256 configureGas
    ) private view {
        console.log("NATIVE_ETH_SIMULATION_CHAIN_ID", block.chainid);
        console.log("SIMULATION_OWNER", inputs.owner);
        console.log("REUSED_SIGNED_POOL_ORACLE", address(inputs.oracle));
        console.log("EXPECTED_PRICE_SIGNER", inputs.priceSigner);
        console.log("FEE_BP", inputs.feeBp);
        console.log("MAX_SEED_LIQUIDITY_WEI", inputs.maxSeedLiquidityWei);
        console.log("MAX_STAKE_PER_SIDE_WEI", inputs.maxStakePerSideWei);
        console.log("PRICE_ARENA_MIN_STAKE_WEI", inputs.arenaMinStakeWei);
        console.log("PRICE_ARENA_MAX_STAKE_WEI", inputs.arenaMaxStakeWei);
        console.log("CONFIGURED_STOCK_COUNT", inputs.stockSymbols.length);
        console.log("CONFIGURED_MEME_COUNT", inputs.memeSymbols.length);
        console.log("SIMULATED_PREDICTION_MARKET", address(market));
        console.log("SIMULATED_ASSET_RACE", address(race));
        console.log("SIMULATED_PRICE_ARENA", address(arena));
        console.log("PREDICTION_DEPLOY_SIMULATION_GAS", marketDeployGas);
        console.log("ASSET_RACE_DEPLOY_SIMULATION_GAS", raceDeployGas);
        console.log("PRICE_ARENA_DEPLOY_SIMULATION_GAS", arenaDeployGas);
        console.log("ALL_CONFIGURATION_SIMULATION_GAS", configureGas);
        console.log("PREDICTION_RUNTIME_CODEHASH");
        console.logBytes32(address(market).codehash);
        console.log("PREDICTION_CREATION_CODEHASH");
        console.logBytes32(keccak256(type(PredictionMarket).creationCode));
        console.log("ASSET_RACE_RUNTIME_CODEHASH");
        console.logBytes32(address(race).codehash);
        console.log("ASSET_RACE_CREATION_CODEHASH");
        console.logBytes32(keccak256(type(AssetRace).creationCode));
        console.log("PRICE_ARENA_RUNTIME_CODEHASH");
        console.logBytes32(address(arena).codehash);
        console.log("PRICE_ARENA_CREATION_CODEHASH");
        console.logBytes32(keccak256(type(PriceArena).creationCode));
        console.log("PUBLIC_CONFIGURATION_ABI_HASH");
        console.logBytes32(
            keccak256(
                abi.encode(
                    inputs.owner,
                    inputs.oracle,
                    inputs.priceSigner,
                    inputs.feeBp,
                    inputs.maxSeedLiquidityWei,
                    inputs.maxStakePerSideWei,
                    inputs.arenaMinStakeWei,
                    inputs.arenaMaxStakeWei,
                    inputs.maxPriceAge,
                    inputs.maxEndpointLag,
                    inputs.racePolicy,
                    inputs.raceDurations,
                    inputs.stockSymbols,
                    inputs.stockOracleIds,
                    inputs.memeSymbols,
                    inputs.memeOracleIds
                )
            )
        );
    }

    function _assetId(string memory symbol) private pure returns (bytes32 result) {
        bytes memory value = bytes(symbol);
        require(value.length > 0 && value.length <= 32, "invalid asset symbol");
        assembly ("memory-safe") {
            result := mload(add(value, 32))
        }
    }

    function _envUint64(string memory name) private view returns (uint64 value) {
        uint256 raw = vm.envUint(name);
        require(raw <= type(uint64).max, "value does not fit uint64");
        value = uint64(raw);
    }

    function _envUint16(string memory name) private view returns (uint16 value) {
        uint256 raw = vm.envUint(name);
        require(raw <= type(uint16).max, "value does not fit uint16");
        value = uint16(raw);
    }

    function _envUint8(string memory name) private view returns (uint8 value) {
        uint256 raw = vm.envUint(name);
        require(raw <= type(uint8).max, "value does not fit uint8");
        value = uint8(raw);
    }
}
