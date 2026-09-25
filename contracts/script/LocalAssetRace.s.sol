// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AssetRace} from "../src/AssetRace.sol";
import {MockRaceOracle} from "../src/mocks/MockRaceOracle.sol";

/// @dev Local Anvil tooling only. Every entry point rejects non-31337 chains.
abstract contract LocalAssetRaceBase is Script {
    uint256 internal constant LOCAL_CHAIN_ID = 31_337;
    uint8 internal constant PRICE_DECIMALS = 8;
    uint256 internal constant STAKE_UNIT = 1 ether;
    uint256 internal constant PRICE_UNIT = 1e8;

    modifier localOnly() {
        require(block.chainid == LOCAL_CHAIN_ID, "local Anvil only");
        _;
    }

    function _registryCandidates(MockRaceOracle oracle)
        internal
        view
        returns (AssetRace.CandidateInput[] memory candidates)
    {
        string[] memory stockSymbols = _stockSymbols();
        string[] memory memeSymbols = _memeSymbols();
        candidates = new AssetRace.CandidateInput[](stockSymbols.length + memeSymbols.length);
        for (uint256 i = 0; i < stockSymbols.length; ++i) {
            candidates[i] = _candidate(
                AssetRace.RaceCategory.STOCK, _assetId(stockSymbols[i]), oracle, _stockOracleId(stockSymbols[i])
            );
        }
        for (uint256 i = 0; i < memeSymbols.length; ++i) {
            candidates[stockSymbols.length + i] = _candidate(
                AssetRace.RaceCategory.MEME, _assetId(memeSymbols[i]), oracle, _memeOracleId(memeSymbols[i])
            );
        }
    }

    function _candidate(AssetRace.RaceCategory category, bytes32 assetId, MockRaceOracle oracle, bytes32 oracleId)
        private
        pure
        returns (AssetRace.CandidateInput memory)
    {
        return AssetRace.CandidateInput({
            category: category,
            assetId: assetId,
            oracle: address(oracle),
            oracleId: oracleId,
            expectedDecimals: PRICE_DECIMALS,
            maxPriceAge: 1 days,
            maxEndpointLag: 5 minutes
        });
    }

    function _platformAssetIds() internal view returns (bytes32[] memory assetIds) {
        string[] memory symbols = _stockSymbols();
        require(symbols.length >= 4, "need four local Stock assets");
        assetIds = new bytes32[](4);
        for (uint256 i = 0; i < assetIds.length; ++i) {
            assetIds[i] = _assetId(symbols[i]);
        }
    }

    function _memePlatformAssetIds() internal view returns (bytes32[] memory assetIds) {
        string[] memory symbols = _memeSymbols();
        require(symbols.length >= 4, "need four local Meme assets");
        assetIds = new bytes32[](4);
        for (uint256 i = 0; i < assetIds.length; ++i) {
            assetIds[i] = _assetId(symbols[i]);
        }
    }

    function _createPlatformRace(AssetRace race) internal returns (uint256) {
        // A Forge broadcast sends deployment/setup calls as separate Anvil
        // transactions, so leave enough room for all of them to mine before
        // AssetRace validates this timestamp in the final create transaction.
        uint64 bettingStart = uint64(block.timestamp + 5 minutes);
        AssetRace.RaceConfigInput memory config = AssetRace.RaceConfigInput({
            category: AssetRace.RaceCategory.STOCK,
            bettingStartTime: bettingStart,
            bettingEndTime: bettingStart + 300,
            raceDuration: 60,
            startGrace: 1 hours,
            resolutionGrace: 1 hours,
            maxOracleTimestampSkew: 5,
            feeBp: 200,
            minActiveContenders: 2,
            minStake: STAKE_UNIT,
            maxStakePerWallet: 50 * STAKE_UNIT
        });
        return race.createPlatformRace("PROPHET TECH RACE", config, _platformAssetIds());
    }

    function _createMemePlatformRace(AssetRace race) internal returns (uint256) {
        uint64 bettingStart = uint64(block.timestamp + 5 minutes);
        AssetRace.RaceConfigInput memory config = AssetRace.RaceConfigInput({
            category: AssetRace.RaceCategory.MEME,
            bettingStartTime: bettingStart,
            bettingEndTime: bettingStart + 300,
            raceDuration: 60,
            startGrace: 1 hours,
            resolutionGrace: 1 hours,
            maxOracleTimestampSkew: 5,
            feeBp: 200,
            minActiveContenders: 2,
            minStake: STAKE_UNIT,
            maxStakePerWallet: 50 * STAKE_UNIT
        });
        return race.createPlatformRace("LOCAL MEME MAYHEM", config, _memePlatformAssetIds());
    }

    function _setPrices(MockRaceOracle oracle, string memory scenario) internal {
        bytes32 scenarioHash = keccak256(bytes(scenario));
        require(
            scenarioHash == keccak256("start") || scenarioHash == keccak256("winner")
                || scenarioHash == keccak256("negative") || scenarioHash == keccak256("tie"),
            "scenario must be start, winner, negative, or tie"
        );

        bytes32 observationId = bytes32(block.timestamp);
        string[] memory stockSymbols = _stockSymbols();
        for (uint256 i = 0; i < stockSymbols.length; ++i) {
            oracle.setObservation(
                _stockOracleId(stockSymbols[i]),
                _scenarioPrice(scenarioHash, i) * PRICE_UNIT,
                PRICE_DECIMALS,
                block.timestamp,
                observationId
            );
        }
        string[] memory memeSymbols = _memeSymbols();
        for (uint256 i = 0; i < memeSymbols.length; ++i) {
            oracle.setObservation(
                _memeOracleId(memeSymbols[i]),
                _scenarioPrice(scenarioHash, i) * PRICE_UNIT,
                PRICE_DECIMALS,
                block.timestamp,
                observationId
            );
        }
    }

    function _scenarioPrice(bytes32 scenarioHash, uint256 index) private pure returns (uint256) {
        if (scenarioHash == keccak256("start")) return 100;
        if (scenarioHash == keccak256("winner")) return index == 1 ? 105 : 100 + (index % 4);
        if (scenarioHash == keccak256("negative")) return 99 - (index % 7);
        return index < 2 ? 105 : 99;
    }

    function _stockSymbols() internal view returns (string[] memory) {
        return vm.envString("LOCAL_STOCK_SYMBOLS", ",");
    }

    function _memeSymbols() internal view returns (string[] memory) {
        return vm.envString("LOCAL_MEME_SYMBOLS", ",");
    }

    function _stockOracleId(string memory symbol) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("LOCAL_", symbol, "_USD"));
    }

    function _memeOracleId(string memory symbol) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("LOCAL_DEMO_", symbol, "_USD"));
    }

    function _assetId(string memory symbol) internal pure returns (bytes32 result) {
        bytes memory value = bytes(symbol);
        require(value.length > 0 && value.length <= 32, "invalid asset symbol");
        assembly {
            result := mload(add(value, 32))
        }
    }

    function _assetIndex(AssetRace race, uint256 raceId, string memory symbol) internal view returns (uint8) {
        bytes32 wanted = _assetId(symbol);
        AssetRace.RaceAsset[] memory assets = race.getRaceAssets(raceId);
        for (uint8 i = 0; i < assets.length; ++i) {
            if (assets[i].assetId == wanted) return i;
        }
        revert("asset is not in this race");
    }
}

contract DeployLocalAssetRace is LocalAssetRaceBase {
    function run() external localOnly returns (MockRaceOracle oracle, AssetRace race) {
        vm.startBroadcast();
        oracle = new MockRaceOracle();
        race = new AssetRace();
        AssetRace.CandidateInput[] memory registry = _registryCandidates(oracle);
        for (uint256 i = 0; i < registry.length; ++i) {
            race.setApprovedAsset(registry[i], true);
        }
        race.setCommunityPolicy(
            AssetRace.CommunityPolicyInput({
                lobbyDuration: 300,
                bettingDuration: 300,
                startGrace: 1 hours,
                resolutionGrace: 1 hours,
                maxOracleTimestampSkew: 5,
                feeBp: 200,
                minActiveContenders: 2,
                minStake: STAKE_UNIT,
                maxStakePerWallet: 50 * STAKE_UNIT
            })
        );
        race.setRaceDurationPreset(60, true);
        race.setRaceDurationPreset(300, true);
        _setPrices(oracle, "start");
        vm.stopBroadcast();

        console.log("LOCAL_ORACLE_ADDRESS", address(oracle));
        console.log("LOCAL_ASSET_RACE_ADDRESS", address(race));
    }
}

contract CreateLocalAssetRace is LocalAssetRaceBase {
    function run() external localOnly returns (uint256 raceId) {
        AssetRace race = AssetRace(payable(vm.envAddress("LOCAL_ASSET_RACE_ADDRESS")));
        string memory categoryName = vm.envOr("LOCAL_RACE_CATEGORY", string("stock"));
        bool isMeme = keccak256(bytes(categoryName)) == keccak256("meme");
        vm.startBroadcast();
        raceId = isMeme ? _createMemePlatformRace(race) : _createPlatformRace(race);
        vm.stopBroadcast();

        console.log("LOCAL_RACE_ID", raceId);
    }
}

contract CreateLocalCommunityRace is LocalAssetRaceBase {
    function run() external localOnly returns (uint256 raceId) {
        AssetRace race = AssetRace(payable(vm.envAddress("LOCAL_ASSET_RACE_ADDRESS")));
        string memory title = vm.envString("LOCAL_RACE_TITLE");
        string memory categoryName = vm.envOr("LOCAL_RACE_CATEGORY", string("stock"));
        bool isMeme = keccak256(bytes(categoryName)) == keccak256("meme");
        uint64 duration = uint64(vm.envUint("LOCAL_RACE_DURATION"));
        bytes32[] memory initialAssetIds = new bytes32[](2);
        if (isMeme) {
            string[] memory memeSymbols = _memeSymbols();
            require(memeSymbols.length >= 3, "need three local Meme assets");
            initialAssetIds[0] = _assetId(memeSymbols[0]);
            initialAssetIds[1] = _assetId(memeSymbols[2]);
        } else {
            string[] memory stockSymbols = _stockSymbols();
            require(stockSymbols.length >= 4, "need four local Stock assets");
            initialAssetIds[0] = _assetId(stockSymbols[0]);
            initialAssetIds[1] = _assetId(stockSymbols[3]);
        }

        vm.startBroadcast();
        raceId = race.createCommunityRace(
            title, isMeme ? AssetRace.RaceCategory.MEME : AssetRace.RaceCategory.STOCK, duration, initialAssetIds
        );
        vm.stopBroadcast();

        console.log("LOCAL_RACE_ID", raceId);
        console.log("LOCAL_RACE_TITLE", title);
    }
}

contract AddLocalRaceAsset is LocalAssetRaceBase {
    function run() external localOnly {
        AssetRace race = AssetRace(payable(vm.envAddress("LOCAL_ASSET_RACE_ADDRESS")));
        uint256 raceId = vm.envUint("LOCAL_RACE_ID");
        string memory symbol = vm.envString("LOCAL_ASSET_SYMBOL");

        vm.startBroadcast();
        race.addLobbyAsset(raceId, _assetId(symbol));
        vm.stopBroadcast();

        console.log("LOCAL_RACE_ID", raceId);
        console.log("LOCAL_ASSET_SYMBOL", symbol);
    }
}

contract SetLocalAssetRacePrices is LocalAssetRaceBase {
    function run() external localOnly {
        MockRaceOracle oracle = MockRaceOracle(vm.envAddress("LOCAL_ORACLE_ADDRESS"));
        string memory scenario = vm.envString("LOCAL_PRICE_SCENARIO");

        vm.startBroadcast();
        _setPrices(oracle, scenario);
        vm.stopBroadcast();

        console.log("LOCAL_PRICE_SCENARIO", scenario);
    }
}

contract FundLocalAssetRaceWallet is LocalAssetRaceBase {
    function run() external localOnly {
        address recipient = vm.envAddress("LOCAL_RECIPIENT");
        uint256 amount = vm.envUint("LOCAL_AMOUNT_WEI");

        vm.startBroadcast();
        (bool success,) = payable(recipient).call{value: amount}("");
        require(success, "native ETH funding failed");
        vm.stopBroadcast();

        console.log("LOCAL_FUNDED_WALLET", recipient);
        console.log("LOCAL_FUNDED_WEI", amount);
    }
}

contract BetLocalAssetRace is LocalAssetRaceBase {
    function run() external localOnly {
        AssetRace race = AssetRace(payable(vm.envAddress("LOCAL_ASSET_RACE_ADDRESS")));
        uint256 raceId = vm.envUint("LOCAL_RACE_ID");
        string memory symbol = vm.envString("LOCAL_ASSET_SYMBOL");
        uint8 assetIndex = _assetIndex(race, raceId, symbol);
        uint256 amount = vm.envUint("LOCAL_AMOUNT_WEI");

        vm.startBroadcast();
        race.bet{value: amount}(raceId, assetIndex, amount);
        vm.stopBroadcast();

        console.log("LOCAL_BET_RACE_ID", raceId);
        console.log("LOCAL_BET_ASSET_INDEX", assetIndex);
        console.log("LOCAL_BET_ASSET_SYMBOL", symbol);
        console.log("LOCAL_BET_WEI", amount);
    }
}

contract ManageLocalAssetRace is LocalAssetRaceBase {
    function run() external localOnly {
        AssetRace race = AssetRace(payable(vm.envAddress("LOCAL_ASSET_RACE_ADDRESS")));
        uint256 raceId = vm.envUint("LOCAL_RACE_ID");
        string memory action = vm.envString("LOCAL_RACE_ACTION");
        bytes32 actionHash = keccak256(bytes(action));

        vm.startBroadcast();
        if (actionHash == keccak256("start")) {
            race.startRace(raceId);
        } else if (actionHash == keccak256("open-betting")) {
            race.openBetting(raceId);
        } else if (actionHash == keccak256("capture-end")) {
            bytes[] memory proofs = new bytes[](race.getRace(raceId).candidateCount);
            race.captureEndSnapshots(raceId, proofs);
        } else if (actionHash == keccak256("resolve")) {
            race.resolveRace(raceId);
        } else if (actionHash == keccak256("cancel-unstarted")) {
            race.cancelUnstartedRace(raceId);
        } else if (actionHash == keccak256("void-expired")) {
            race.voidExpiredRace(raceId);
        } else if (actionHash == keccak256("claim")) {
            race.claim(raceId);
        } else if (actionHash == keccak256("refund")) {
            race.refund(raceId);
        } else {
            revert("unknown local race action");
        }
        vm.stopBroadcast();

        console.log("LOCAL_RACE_ACTION", action);
        console.log("LOCAL_RACE_ID", raceId);
    }
}

contract InspectLocalAssetRace is LocalAssetRaceBase {
    function run() external view localOnly {
        AssetRace race = AssetRace(payable(vm.envAddress("LOCAL_ASSET_RACE_ADDRESS")));
        uint256 raceId = vm.envUint("LOCAL_RACE_ID");
        AssetRace.Race memory data = race.getRace(raceId);
        AssetRace.RaceAsset[] memory assets = race.getRaceAssets(raceId);

        console.log("LOCAL_RACE_ID", raceId);
        console.log("TITLE", data.title);
        console.log("ORIGIN", uint256(uint8(data.origin)));
        console.log("STATUS", uint256(uint8(data.status)));
        console.log("LOBBY_END", data.lobbyEndTime);
        console.log("CANDIDATE_COUNT", data.candidateCount);
        console.log("BETTING_END", data.bettingEndTime);
        console.log("RACE_END", data.raceEndTime);
        console.log("TOTAL_POOL_RAW", data.totalPool);
        console.log("WINNING_ASSET_INDEX", data.winningAssetIndex);
        console.log("PROTOCOL_FEE_RAW", data.protocolFee);
        for (uint256 i = 0; i < assets.length; ++i) {
            console.log("ASSET_INDEX", i);
            console.logBytes32(assets[i].assetId);
            console.log("ASSET_POOL_RAW", assets[i].pool);
            console.log("P0", assets[i].startPrice);
            console.log("P1", assets[i].endPrice);
            console.logInt(assets[i].returnValue);
        }
    }
}
