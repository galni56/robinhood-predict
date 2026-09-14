// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AssetRace} from "../src/AssetRace.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockRaceOracle} from "../src/mocks/MockRaceOracle.sol";

/// @dev Local Anvil tooling only. Every entry point rejects non-31337 chains.
abstract contract LocalAssetRaceBase is Script {
    uint256 internal constant LOCAL_CHAIN_ID = 31_337;
    uint8 internal constant PRICE_DECIMALS = 8;
    uint256 internal constant TOKEN_UNIT = 1 ether;
    uint256 internal constant PRICE_UNIT = 1e8;

    bytes32 internal constant NVDA = bytes32("NVDA");
    bytes32 internal constant TSLA = bytes32("TSLA");
    bytes32 internal constant AAPL = bytes32("AAPL");
    bytes32 internal constant META = bytes32("META");
    bytes32 internal constant AMD = bytes32("AMD");
    bytes32 internal constant COIN = bytes32("COIN");
    bytes32 internal constant MSTR = bytes32("MSTR");
    bytes32 internal constant AMZN = bytes32("AMZN");
    bytes32 internal constant MSFT = bytes32("MSFT");
    bytes32 internal constant GOOGL = bytes32("GOOGL");
    bytes32 internal constant NVDA_ORACLE_ID = keccak256("LOCAL_NVDA_USD");
    bytes32 internal constant TSLA_ORACLE_ID = keccak256("LOCAL_TSLA_USD");
    bytes32 internal constant AAPL_ORACLE_ID = keccak256("LOCAL_AAPL_USD");
    bytes32 internal constant META_ORACLE_ID = keccak256("LOCAL_META_USD");
    bytes32 internal constant AMD_ORACLE_ID = keccak256("LOCAL_AMD_USD");
    bytes32 internal constant COIN_ORACLE_ID = keccak256("LOCAL_COIN_USD");
    bytes32 internal constant MSTR_ORACLE_ID = keccak256("LOCAL_MSTR_USD");
    bytes32 internal constant AMZN_ORACLE_ID = keccak256("LOCAL_AMZN_USD");
    bytes32 internal constant MSFT_ORACLE_ID = keccak256("LOCAL_MSFT_USD");
    bytes32 internal constant GOOGL_ORACLE_ID = keccak256("LOCAL_GOOGL_USD");
    modifier localOnly() {
        require(block.chainid == LOCAL_CHAIN_ID, "local Anvil only");
        _;
    }

    function _registryCandidates(MockRaceOracle oracle)
        internal
        view
        returns (AssetRace.CandidateInput[] memory candidates)
    {
        string[] memory memeSymbols = _memeSymbols();
        candidates = new AssetRace.CandidateInput[](10 + memeSymbols.length);
        candidates[0] = _candidate(AssetRace.RaceCategory.STOCK, NVDA, oracle, NVDA_ORACLE_ID);
        candidates[1] = _candidate(AssetRace.RaceCategory.STOCK, TSLA, oracle, TSLA_ORACLE_ID);
        candidates[2] = _candidate(AssetRace.RaceCategory.STOCK, AAPL, oracle, AAPL_ORACLE_ID);
        candidates[3] = _candidate(AssetRace.RaceCategory.STOCK, META, oracle, META_ORACLE_ID);
        candidates[4] = _candidate(AssetRace.RaceCategory.STOCK, AMD, oracle, AMD_ORACLE_ID);
        candidates[5] = _candidate(AssetRace.RaceCategory.STOCK, COIN, oracle, COIN_ORACLE_ID);
        candidates[6] = _candidate(AssetRace.RaceCategory.STOCK, MSTR, oracle, MSTR_ORACLE_ID);
        candidates[7] = _candidate(AssetRace.RaceCategory.STOCK, AMZN, oracle, AMZN_ORACLE_ID);
        candidates[8] = _candidate(AssetRace.RaceCategory.STOCK, MSFT, oracle, MSFT_ORACLE_ID);
        candidates[9] = _candidate(AssetRace.RaceCategory.STOCK, GOOGL, oracle, GOOGL_ORACLE_ID);
        for (uint256 i = 0; i < memeSymbols.length; ++i) {
            candidates[10 + i] = _candidate(
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
            maxPriceAge: 1 days
        });
    }

    function _platformAssetIds() internal pure returns (bytes32[] memory assetIds) {
        assetIds = new bytes32[](4);
        assetIds[0] = NVDA;
        assetIds[1] = TSLA;
        assetIds[2] = AAPL;
        assetIds[3] = META;
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
            minStake: TOKEN_UNIT,
            maxStakePerWallet: 50 * TOKEN_UNIT
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
            minStake: TOKEN_UNIT,
            maxStakePerWallet: 50 * TOKEN_UNIT
        });
        return race.createPlatformRace("LOCAL MEME MAYHEM", config, _memePlatformAssetIds());
    }

    function _setPrices(MockRaceOracle oracle, string memory scenario) internal {
        bytes32 scenarioHash = keccak256(bytes(scenario));
        uint256[10] memory stockPrices;

        if (scenarioHash == keccak256("start")) {
            stockPrices = [uint256(100), 100, 100, 100, 100, 100, 100, 100, 100, 100];
        } else if (scenarioHash == keccak256("winner")) {
            stockPrices = [uint256(102), 105, 99, 103, 101, 98, 104, 100, 106, 99];
        } else if (scenarioHash == keccak256("negative")) {
            stockPrices = [uint256(98), 99, 96, 97, 95, 94, 93, 92, 91, 90];
        } else if (scenarioHash == keccak256("tie")) {
            stockPrices = [uint256(105), 105, 99, 103, 105, 98, 104, 100, 106, 99];
        } else {
            revert("scenario must be start, winner, negative, or tie");
        }

        bytes32 observationId = bytes32(block.timestamp);
        oracle.setObservation(
            NVDA_ORACLE_ID, stockPrices[0] * PRICE_UNIT, PRICE_DECIMALS, block.timestamp, observationId
        );
        oracle.setObservation(
            TSLA_ORACLE_ID, stockPrices[1] * PRICE_UNIT, PRICE_DECIMALS, block.timestamp, observationId
        );
        oracle.setObservation(
            AAPL_ORACLE_ID, stockPrices[2] * PRICE_UNIT, PRICE_DECIMALS, block.timestamp, observationId
        );
        oracle.setObservation(
            META_ORACLE_ID, stockPrices[3] * PRICE_UNIT, PRICE_DECIMALS, block.timestamp, observationId
        );
        oracle.setObservation(
            AMD_ORACLE_ID, stockPrices[4] * PRICE_UNIT, PRICE_DECIMALS, block.timestamp, observationId
        );
        oracle.setObservation(
            COIN_ORACLE_ID, stockPrices[5] * PRICE_UNIT, PRICE_DECIMALS, block.timestamp, observationId
        );
        oracle.setObservation(
            MSTR_ORACLE_ID, stockPrices[6] * PRICE_UNIT, PRICE_DECIMALS, block.timestamp, observationId
        );
        oracle.setObservation(
            AMZN_ORACLE_ID, stockPrices[7] * PRICE_UNIT, PRICE_DECIMALS, block.timestamp, observationId
        );
        oracle.setObservation(
            MSFT_ORACLE_ID, stockPrices[8] * PRICE_UNIT, PRICE_DECIMALS, block.timestamp, observationId
        );
        oracle.setObservation(
            GOOGL_ORACLE_ID, stockPrices[9] * PRICE_UNIT, PRICE_DECIMALS, block.timestamp, observationId
        );
        string[] memory memeSymbols = _memeSymbols();
        for (uint256 i = 0; i < memeSymbols.length; ++i) {
            uint256 price = 100;
            if (scenarioHash == keccak256("winner")) price = 101 + i;
            else if (scenarioHash == keccak256("negative")) price = 99 - i;
            else if (scenarioHash == keccak256("tie")) price = i < 2 ? 105 : 99;
            oracle.setObservation(
                _memeOracleId(memeSymbols[i]), price * PRICE_UNIT, PRICE_DECIMALS, block.timestamp, observationId
            );
        }
    }

    function _memeSymbols() internal view returns (string[] memory) {
        return vm.envString("LOCAL_MEME_SYMBOLS", ",");
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
    function run() external localOnly returns (MockERC20 token, MockRaceOracle oracle, AssetRace race) {
        address walletA = vm.envAddress("LOCAL_WALLET_A");
        address walletB = vm.envAddress("LOCAL_WALLET_B");
        address walletC = vm.envAddress("LOCAL_WALLET_C");

        vm.startBroadcast();
        token = new MockERC20("Local Fake USDG", "fUSDG");
        oracle = new MockRaceOracle();
        race = new AssetRace(address(token));
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
                minStake: TOKEN_UNIT,
                maxStakePerWallet: 50 * TOKEN_UNIT
            })
        );
        race.setRaceDurationPreset(60, true);
        race.setRaceDurationPreset(300, true);
        token.mint(walletA, 1_000 * TOKEN_UNIT);
        token.mint(walletB, 1_000 * TOKEN_UNIT);
        token.mint(walletC, 1_000 * TOKEN_UNIT);
        _setPrices(oracle, "start");
        vm.stopBroadcast();

        console.log("LOCAL_TOKEN_ADDRESS", address(token));
        console.log("LOCAL_ORACLE_ADDRESS", address(oracle));
        console.log("LOCAL_ASSET_RACE_ADDRESS", address(race));
        console.log("LOCAL_WALLET_A", walletA);
        console.log("LOCAL_WALLET_B", walletB);
        console.log("LOCAL_WALLET_C", walletC);
    }
}

contract CreateLocalAssetRace is LocalAssetRaceBase {
    function run() external localOnly returns (uint256 raceId) {
        AssetRace race = AssetRace(vm.envAddress("LOCAL_ASSET_RACE_ADDRESS"));
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
        AssetRace race = AssetRace(vm.envAddress("LOCAL_ASSET_RACE_ADDRESS"));
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
            initialAssetIds[0] = NVDA;
            initialAssetIds[1] = META;
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
        AssetRace race = AssetRace(vm.envAddress("LOCAL_ASSET_RACE_ADDRESS"));
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
        MockERC20 token = MockERC20(vm.envAddress("LOCAL_TOKEN_ADDRESS"));
        address recipient = vm.envAddress("LOCAL_RECIPIENT");
        uint256 amount = vm.envUint("LOCAL_AMOUNT_TOKENS") * TOKEN_UNIT;

        vm.startBroadcast();
        token.mint(recipient, amount);
        vm.stopBroadcast();

        console.log("LOCAL_FUNDED_WALLET", recipient);
        console.log("LOCAL_FUNDED_WHOLE_TOKENS", amount / TOKEN_UNIT);
    }
}

contract BetLocalAssetRace is LocalAssetRaceBase {
    function run() external localOnly {
        AssetRace race = AssetRace(vm.envAddress("LOCAL_ASSET_RACE_ADDRESS"));
        uint256 raceId = vm.envUint("LOCAL_RACE_ID");
        string memory symbol = vm.envString("LOCAL_ASSET_SYMBOL");
        uint8 assetIndex = _assetIndex(race, raceId, symbol);
        uint256 amount = vm.envUint("LOCAL_AMOUNT_TOKENS") * TOKEN_UNIT;
        MockERC20 token = MockERC20(address(race.betToken()));

        vm.startBroadcast();
        token.approve(address(race), amount);
        race.bet(raceId, assetIndex, amount);
        vm.stopBroadcast();

        console.log("LOCAL_BET_RACE_ID", raceId);
        console.log("LOCAL_BET_ASSET_INDEX", assetIndex);
        console.log("LOCAL_BET_ASSET_SYMBOL", symbol);
        console.log("LOCAL_BET_WHOLE_TOKENS", amount / TOKEN_UNIT);
    }
}

contract ManageLocalAssetRace is LocalAssetRaceBase {
    function run() external localOnly {
        AssetRace race = AssetRace(vm.envAddress("LOCAL_ASSET_RACE_ADDRESS"));
        uint256 raceId = vm.envUint("LOCAL_RACE_ID");
        string memory action = vm.envString("LOCAL_RACE_ACTION");
        bytes32 actionHash = keccak256(bytes(action));

        vm.startBroadcast();
        if (actionHash == keccak256("start")) race.startRace(raceId);
        else if (actionHash == keccak256("open-betting")) race.openBetting(raceId);
        else if (actionHash == keccak256("resolve")) race.resolveRace(raceId);
        else if (actionHash == keccak256("cancel-unstarted")) race.cancelUnstartedRace(raceId);
        else if (actionHash == keccak256("void-expired")) race.voidExpiredRace(raceId);
        else if (actionHash == keccak256("claim")) race.claim(raceId);
        else if (actionHash == keccak256("refund")) race.refund(raceId);
        else revert("unknown local race action");
        vm.stopBroadcast();

        console.log("LOCAL_RACE_ACTION", action);
        console.log("LOCAL_RACE_ID", raceId);
    }
}

contract InspectLocalAssetRace is LocalAssetRaceBase {
    function run() external view localOnly {
        AssetRace race = AssetRace(vm.envAddress("LOCAL_ASSET_RACE_ADDRESS"));
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
