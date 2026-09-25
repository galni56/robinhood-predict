// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AssetRace} from "../src/AssetRace.sol";
import {SignedPoolRaceOracle} from "../src/oracles/SignedPoolRaceOracle.sol";

/// @notice Guarded mainnet-only lifecycle rehearsal for the native ETH
/// AssetRace deployment. Run every phase without `--broadcast` first.
abstract contract AssetRaceCanaryBase is Script {
    uint256 internal constant ROBINHOOD_MAINNET_CHAIN_ID = 4663;
    uint256 internal constant CANARY_STAKE = 0.0001 ether;
    uint64 internal constant BETTING_START_DELAY = 1 minutes;
    uint64 internal constant BETTING_DURATION = 5 minutes;
    uint64 internal constant RACE_DURATION = 1 minutes;
    uint64 internal constant START_GRACE = 3 minutes;
    uint64 internal constant RESOLUTION_GRACE = 5 minutes;
    uint16 internal constant FEE_BP = 200;
    uint256 internal constant SETTLEMENT_RACE_ID = 0;
    uint256 internal constant CANCELLATION_RACE_ID = 1;
    uint256 internal constant RETRY_RACE_ID = 2;

    address internal constant RACE_ADDRESS = 0x02F030Bd9D9DC86d713CDF0772ae4d1E3b81f235;
    address internal constant EXPECTED_OWNER = 0x6d68157bEDa778346Dd27f8Ef4F917f69aD2Dc41;
    address internal constant EXPECTED_ORACLE = 0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7;
    address internal constant EXPECTED_SIGNER = 0x79F4991Ccc64Cbb8143fB61e4cBD49b8b64d3635;
    address internal constant EXPECTED_KEEPER = 0xaF95287026339B51b1Ff45DC385b4D56F507634a;

    bytes32 internal constant NVDA = bytes32("NVDA");
    bytes32 internal constant TSLA = bytes32("TSLA");
    bytes32 internal constant NVDA_ORACLE_ID = 0x28b1117d38bcf0b69924a2d75043bb306f3272fe110a078f4d54e473f8c60925;
    bytes32 internal constant TSLA_ORACLE_ID = 0x14e1dfbdefeb08594f0852a6449b41554f51dd277f968d2499f7666feebb4aeb;

    function _race() internal pure returns (AssetRace) {
        return AssetRace(payable(RACE_ADDRESS));
    }

    function _ownerKey() internal view returns (uint256 key) {
        key = vm.envUint("PRIVATE_KEY");
        require(vm.addr(key) == EXPECTED_OWNER, "PRIVATE_KEY is not reviewed owner");
    }

    function _playerKey() internal view returns (uint256 key) {
        key = vm.envUint("CANARY_PLAYER_PRIVATE_KEY");
        address player = vm.addr(key);
        require(player != address(0), "canary player = zero");
        require(player != EXPECTED_OWNER, "canary player must differ from owner");
        require(player != EXPECTED_ORACLE, "canary player must differ from oracle");
        require(player != EXPECTED_SIGNER, "canary player must differ from signer");
        require(player != EXPECTED_KEEPER, "canary player must differ from keeper");
        require(player != RACE_ADDRESS, "canary player must differ from race");
    }

    function _validateAsset(AssetRace race, bytes32 assetId, bytes32 expectedOracleId) private view {
        (
            bool registered,
            bool enabled,
            AssetRace.RaceCategory category,
            address oracle,
            bytes32 oracleId,
            uint8 decimals,
            uint64 maxPriceAge,
            uint64 maxEndpointLag
        ) = race.approvedAssets(assetId);
        require(registered && enabled, "asset disabled");
        require(category == AssetRace.RaceCategory.STOCK, "wrong category");
        require(oracle == EXPECTED_ORACLE && oracleId == expectedOracleId, "wrong asset oracle");
        require(decimals == 18 && maxPriceAge == 60 && maxEndpointLag == 0, "wrong asset policy");
    }

    function _validateDeployment(AssetRace race) internal view {
        require(block.chainid == ROBINHOOD_MAINNET_CHAIN_ID, "wrong chain");
        require(RACE_ADDRESS.code.length > 0, "race has no code");
        require(race.owner() == EXPECTED_OWNER, "wrong owner");
        require(!race.newActivityPaused(), "new activity paused");
        require(SignedPoolRaceOracle(EXPECTED_ORACLE).TRUSTED_SIGNER() == EXPECTED_SIGNER, "wrong signer");
        _validateAsset(race, NVDA, NVDA_ORACLE_ID);
        _validateAsset(race, TSLA, TSLA_ORACLE_ID);
    }

    function _assetIds() internal pure returns (bytes32[] memory ids) {
        ids = new bytes32[](2);
        ids[0] = NVDA;
        ids[1] = TSLA;
    }

    function _config(uint64 bettingStart, uint64 bettingEnd) internal pure returns (AssetRace.RaceConfigInput memory) {
        return AssetRace.RaceConfigInput({
            category: AssetRace.RaceCategory.STOCK,
            bettingStartTime: bettingStart,
            bettingEndTime: bettingEnd,
            raceDuration: RACE_DURATION,
            startGrace: START_GRACE,
            resolutionGrace: RESOLUTION_GRACE,
            maxOracleTimestampSkew: 0,
            feeBp: FEE_BP,
            minActiveContenders: 2,
            minStake: CANARY_STAKE,
            maxStakePerWallet: 0.1 ether
        });
    }

    function _retryConfig(uint64 bettingStart, uint64 bettingEnd)
        internal
        pure
        returns (AssetRace.RaceConfigInput memory)
    {
        AssetRace.RaceConfigInput memory config = _config(bettingStart, bettingEnd);
        config.startGrace = 10 minutes;
        config.resolutionGrace = 10 minutes;
        return config;
    }
}

/// @notice Creates a settlement race (#0) and an insufficient-contender
/// cancellation race (#1). Betting deliberately opens one minute later so
/// fixed timestamps remain safe across separately mined broadcast transactions.
contract CreateAssetRaceCanaries is AssetRaceCanaryBase {
    function run() external returns (uint256 settlementRaceId, uint256 cancellationRaceId) {
        AssetRace race = _race();
        _validateDeployment(race);
        require(race.raceCount() == 0, "canary races already created");

        uint256 ownerKey = _ownerKey();
        uint256 start = block.timestamp + BETTING_START_DELAY;
        uint256 end = start + BETTING_DURATION;
        require(end <= type(uint64).max, "timestamp overflow");
        AssetRace.RaceConfigInput memory config = _config(uint64(start), uint64(end));
        bytes32[] memory ids = _assetIds();

        vm.startBroadcast(ownerKey);
        settlementRaceId = race.createPlatformRace("PROPHET ETH CANARY", config, ids);
        cancellationRaceId = race.createPlatformRace("PROPHET ETH CANCEL", config, ids);
        vm.stopBroadcast();

        require(settlementRaceId == 0 && cancellationRaceId == 1, "unexpected race ids");
        require(race.raceCount() == 2, "unexpected race count");
        console.log("AssetRace canary address", RACE_ADDRESS);
        console.log("Settlement race id", settlementRaceId);
        console.log("Cancellation race id", cancellationRaceId);
        console.log("Betting starts", start);
        console.log("Betting ends", end);
    }
}

/// @notice Funds two different assets in race #0 and only one asset in race #1.
contract FundAssetRaceCanaries is AssetRaceCanaryBase {
    function run() external {
        AssetRace race = _race();
        _validateDeployment(race);
        require(race.raceCount() >= 2, "canary races missing");
        AssetRace.Race memory settlement = race.getRace(0);
        AssetRace.Race memory cancellation = race.getRace(1);
        require(settlement.status == AssetRace.RaceStatus.BETTING, "race #0 not betting");
        require(cancellation.status == AssetRace.RaceStatus.BETTING, "race #1 not betting");
        require(block.timestamp >= settlement.bettingStartTime, "betting not started");
        require(block.timestamp < settlement.bettingEndTime, "betting ended");

        uint256 ownerKey = _ownerKey();
        uint256 playerKey = _playerKey();
        address player = vm.addr(playerKey);
        AssetRace.Position memory ownerSettlement = race.getPosition(0, EXPECTED_OWNER);
        AssetRace.Position memory playerSettlement = race.getPosition(0, player);
        AssetRace.Position memory ownerCancellation = race.getPosition(1, EXPECTED_OWNER);
        require(!ownerSettlement.exists && !playerSettlement.exists && !ownerCancellation.exists, "already funded");
        require(EXPECTED_OWNER.balance >= CANARY_STAKE * 2, "owner lacks canary stake");
        require(player.balance >= CANARY_STAKE, "player lacks canary stake");

        vm.startBroadcast(ownerKey);
        race.bet{value: CANARY_STAKE}(0, 0, CANARY_STAKE);
        race.bet{value: CANARY_STAKE}(1, 0, CANARY_STAKE);
        vm.stopBroadcast();
        vm.startBroadcast(playerKey);
        race.bet{value: CANARY_STAKE}(0, 1, CANARY_STAKE);
        vm.stopBroadcast();

        require(race.getRace(0).totalPool == CANARY_STAKE * 2, "race #0 pool mismatch");
        require(race.getRace(1).totalPool == CANARY_STAKE, "race #1 pool mismatch");
        console.log("AssetRace canaries funded");
        console.log("Stake per position (wei)", CANARY_STAKE);
        console.log("Second player", player);
    }
}

/// @notice Claims the unique winner of race #0 and refunds the sole position
/// in cancelled race #1 after the keeper completes both transitions.
contract FinalizeAssetRaceCanaries is AssetRaceCanaryBase {
    function run() external {
        AssetRace race = _race();
        _validateDeployment(race);
        require(race.raceCount() >= 2, "canary races missing");

        AssetRace.Race memory resolved = race.getRace(0);
        AssetRace.Race memory cancelled = race.getRace(1);
        require(resolved.status == AssetRace.RaceStatus.RESOLVED, "race #0 not resolved");
        require(cancelled.status == AssetRace.RaceStatus.CANCELLED, "race #1 not cancelled");
        require(resolved.winningAssetIndex < 2, "unexpected winner");
        require(resolved.protocolFee == (CANARY_STAKE * FEE_BP) / race.BP_DENOMINATOR(), "fee mismatch");

        uint256 ownerKey = _ownerKey();
        uint256 playerKey = _playerKey();
        address winner = resolved.winningAssetIndex == 0 ? EXPECTED_OWNER : vm.addr(playerKey);
        uint256 winnerKey = resolved.winningAssetIndex == 0 ? ownerKey : playerKey;
        uint256 expectedPayout = CANARY_STAKE + resolved.distributableLosingPool;

        uint256 beforeClaim = RACE_ADDRESS.balance;
        vm.startBroadcast(winnerKey);
        uint256 payout = race.claim(0);
        vm.stopBroadcast();
        require(payout == expectedPayout, "payout mismatch");
        require(RACE_ADDRESS.balance + expectedPayout == beforeClaim, "wrong claim ETH delta");

        uint256 beforeRefund = RACE_ADDRESS.balance;
        vm.startBroadcast(ownerKey);
        uint256 refund = race.refund(1);
        vm.stopBroadcast();
        require(refund == CANARY_STAKE, "refund mismatch");
        require(RACE_ADDRESS.balance + CANARY_STAKE == beforeRefund, "wrong refund ETH delta");

        console.log("AssetRace canary finalized");
        console.log("Winner", winner);
        console.log("Payout (wei)", payout);
        console.log("Refunded (wei)", refund);
    }
}

/// @notice Recovers every position after both original canaries missed their
/// start window and were objectively cancelled by the permissionless keeper.
contract RecoverExpiredAssetRaceCanaries is AssetRaceCanaryBase {
    function run() external {
        AssetRace race = _race();
        _validateDeployment(race);
        require(race.raceCount() == RETRY_RACE_ID, "unexpected race count");
        require(race.getRace(SETTLEMENT_RACE_ID).status == AssetRace.RaceStatus.CANCELLED, "race #0 not cancelled");
        require(race.getRace(CANCELLATION_RACE_ID).status == AssetRace.RaceStatus.CANCELLED, "race #1 not cancelled");

        uint256 ownerKey = _ownerKey();
        uint256 playerKey = _playerKey();
        address player = vm.addr(playerKey);
        AssetRace.Position memory ownerSettlement = race.getPosition(SETTLEMENT_RACE_ID, EXPECTED_OWNER);
        AssetRace.Position memory playerSettlement = race.getPosition(SETTLEMENT_RACE_ID, player);
        AssetRace.Position memory ownerCancellation = race.getPosition(CANCELLATION_RACE_ID, EXPECTED_OWNER);
        require(
            ownerSettlement.stake == CANARY_STAKE && ownerSettlement.exists && !ownerSettlement.settled,
            "owner race #0 position mismatch"
        );
        require(
            playerSettlement.stake == CANARY_STAKE && playerSettlement.exists && !playerSettlement.settled,
            "player race #0 position mismatch"
        );
        require(
            ownerCancellation.stake == CANARY_STAKE && ownerCancellation.exists && !ownerCancellation.settled,
            "owner race #1 position mismatch"
        );

        uint256 beforeRefunds = RACE_ADDRESS.balance;
        vm.startBroadcast(ownerKey);
        uint256 ownerSettlementRefund = race.refund(SETTLEMENT_RACE_ID);
        uint256 ownerCancellationRefund = race.refund(CANCELLATION_RACE_ID);
        vm.stopBroadcast();
        vm.startBroadcast(playerKey);
        uint256 playerSettlementRefund = race.refund(SETTLEMENT_RACE_ID);
        vm.stopBroadcast();

        require(ownerSettlementRefund == CANARY_STAKE, "wrong owner race #0 refund");
        require(ownerCancellationRefund == CANARY_STAKE, "wrong owner race #1 refund");
        require(playerSettlementRefund == CANARY_STAKE, "wrong player race #0 refund");
        require(RACE_ADDRESS.balance + CANARY_STAKE * 3 == beforeRefunds, "wrong recovery ETH delta");
        require(race.getRace(SETTLEMENT_RACE_ID).remainingLiability == 0, "race #0 liability remains");
        require(race.getRace(CANCELLATION_RACE_ID).remainingLiability == 0, "race #1 liability remains");

        console.log("Expired AssetRace canaries recovered");
        console.log("Refunded (wei)", CANARY_STAKE * 3);
    }
}

/// @notice Creates one replacement settlement canary after the original pair
/// has been cancelled and fully refunded. The wider grace windows reduce
/// operator timing pressure without changing production race mechanics.
contract CreateAssetRaceRetryCanary is AssetRaceCanaryBase {
    function run() external returns (uint256 raceId) {
        AssetRace race = _race();
        _validateDeployment(race);
        require(race.raceCount() == RETRY_RACE_ID, "unexpected race count");
        require(race.getRace(SETTLEMENT_RACE_ID).status == AssetRace.RaceStatus.CANCELLED, "race #0 not cancelled");
        require(race.getRace(CANCELLATION_RACE_ID).status == AssetRace.RaceStatus.CANCELLED, "race #1 not cancelled");
        require(race.getRace(SETTLEMENT_RACE_ID).remainingLiability == 0, "race #0 liability remains");
        require(race.getRace(CANCELLATION_RACE_ID).remainingLiability == 0, "race #1 liability remains");

        uint256 ownerKey = _ownerKey();
        uint256 start = block.timestamp + BETTING_START_DELAY;
        uint256 end = start + BETTING_DURATION;
        require(end <= type(uint64).max, "timestamp overflow");
        AssetRace.RaceConfigInput memory config = _retryConfig(uint64(start), uint64(end));
        bytes32[] memory ids = _assetIds();

        vm.startBroadcast(ownerKey);
        raceId = race.createPlatformRace("PROPHET ETH CANARY RETRY", config, ids);
        vm.stopBroadcast();

        require(raceId == RETRY_RACE_ID, "unexpected retry race id");
        require(race.raceCount() == RETRY_RACE_ID + 1, "unexpected race count");
        console.log("AssetRace retry canary address", RACE_ADDRESS);
        console.log("Settlement race id", raceId);
        console.log("Betting starts", start);
        console.log("Betting ends", end);
        console.log("Start grace ends", end + config.startGrace);
    }
}

/// @notice Funds the replacement settlement race with two different wallets
/// choosing two different assets.
contract FundAssetRaceRetryCanary is AssetRaceCanaryBase {
    function run() external {
        AssetRace race = _race();
        _validateDeployment(race);
        require(race.raceCount() == RETRY_RACE_ID + 1, "retry race missing");
        AssetRace.Race memory retryRace = race.getRace(RETRY_RACE_ID);
        require(retryRace.status == AssetRace.RaceStatus.BETTING, "retry race not betting");
        require(block.timestamp >= retryRace.bettingStartTime, "betting not started");
        require(block.timestamp < retryRace.bettingEndTime, "betting ended");

        uint256 ownerKey = _ownerKey();
        uint256 playerKey = _playerKey();
        address player = vm.addr(playerKey);
        require(!race.getPosition(RETRY_RACE_ID, EXPECTED_OWNER).exists, "owner already funded");
        require(!race.getPosition(RETRY_RACE_ID, player).exists, "player already funded");
        require(EXPECTED_OWNER.balance >= CANARY_STAKE, "owner lacks canary stake");
        require(player.balance >= CANARY_STAKE, "player lacks canary stake");

        vm.startBroadcast(ownerKey);
        race.bet{value: CANARY_STAKE}(RETRY_RACE_ID, 0, CANARY_STAKE);
        vm.stopBroadcast();
        vm.startBroadcast(playerKey);
        race.bet{value: CANARY_STAKE}(RETRY_RACE_ID, 1, CANARY_STAKE);
        vm.stopBroadcast();

        require(race.getRace(RETRY_RACE_ID).totalPool == CANARY_STAKE * 2, "retry pool mismatch");
        console.log("AssetRace retry canary funded");
        console.log("Race id", RETRY_RACE_ID);
        console.log("Stake per position (wei)", CANARY_STAKE);
        console.log("Second player", player);
    }
}

/// @notice Claims the unique winner after the keeper resolves retry race #2.
contract FinalizeAssetRaceRetryCanary is AssetRaceCanaryBase {
    function run() external {
        AssetRace race = _race();
        _validateDeployment(race);
        require(race.raceCount() == RETRY_RACE_ID + 1, "retry race missing");
        AssetRace.Race memory resolved = race.getRace(RETRY_RACE_ID);
        require(resolved.status == AssetRace.RaceStatus.RESOLVED, "retry race not resolved");
        require(resolved.winningAssetIndex < 2, "unexpected winner");
        require(resolved.protocolFee == (CANARY_STAKE * FEE_BP) / race.BP_DENOMINATOR(), "fee mismatch");

        uint256 ownerKey = _ownerKey();
        uint256 playerKey = _playerKey();
        address winner = resolved.winningAssetIndex == 0 ? EXPECTED_OWNER : vm.addr(playerKey);
        uint256 winnerKey = resolved.winningAssetIndex == 0 ? ownerKey : playerKey;
        uint256 expectedPayout = CANARY_STAKE + resolved.distributableLosingPool;

        uint256 beforeClaim = RACE_ADDRESS.balance;
        vm.startBroadcast(winnerKey);
        uint256 payout = race.claim(RETRY_RACE_ID);
        vm.stopBroadcast();
        require(payout == expectedPayout, "payout mismatch");
        require(RACE_ADDRESS.balance + expectedPayout == beforeClaim, "wrong claim ETH delta");

        console.log("AssetRace retry canary finalized");
        console.log("Winner", winner);
        console.log("Payout (wei)", payout);
    }
}
