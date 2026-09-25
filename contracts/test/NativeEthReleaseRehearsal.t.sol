// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AssetRace} from "../src/AssetRace.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {PriceArena} from "../src/PriceArena.sol";
import {SignedPoolRaceOracle} from "../src/oracles/SignedPoolRaceOracle.sol";

/// @notice Release-candidate smoke test: all three native-ETH products reuse
/// one signed-pool oracle and complete real payable settlement lifecycles.
contract NativeEthReleaseRehearsalTest is Test {
    uint256 private constant SIGNER_KEY = 0xA11CE;
    uint256 private constant STAKE = 1 ether;
    uint8 private constant DECIMALS = 18;
    bytes32 private constant ASSET_A = bytes32("NVDA");
    bytes32 private constant ASSET_B = bytes32("TSLA");
    bytes32 private constant ORACLE_A = keccak256("NVDA_STOCK_TOKEN_USDG_POOL");
    bytes32 private constant ORACLE_B = keccak256("TSLA_STOCK_TOKEN_USDG_POOL");
    address private constant ALICE = address(0x1001);
    address private constant BOB = address(0x1002);

    SignedPoolRaceOracle private oracle;
    PredictionMarket private market;
    AssetRace private race;
    PriceArena private arena;

    function setUp() public {
        vm.warp(1_000_000);
        oracle = new SignedPoolRaceOracle(vm.addr(SIGNER_KEY));
        market = new PredictionMarket(address(oracle), 200, 50 ether, 50 ether);
        race = new AssetRace();
        arena = new PriceArena(0.01 ether, 50 ether);

        market.setAssetAllowed(ASSET_A, ORACLE_A, DECIMALS, true);
        arena.setAsset(ASSET_A, address(oracle), ORACLE_A, DECIMALS, PriceArena.Category.STOCK, true);
        race.setApprovedAsset(_candidate(ASSET_A, ORACLE_A), true);
        race.setApprovedAsset(_candidate(ASSET_B, ORACLE_B), true);

        vm.deal(ALICE, 100 ether);
        vm.deal(BOB, 100 ether);
    }

    function test_AllNativeProductsShareOracleAndCompletePayableLifecycles() public {
        assertEq(address(market.endpointOracle()), address(oracle));
        (address arenaOracle,,,,) = arena.approvedAssets(ASSET_A);
        assertEq(arenaOracle, address(oracle));

        uint256 predictionId = market.createMarket(ASSET_A, 100e18, block.timestamp + 30 minutes, 0, 0);
        uint256 raceId = _createRace();
        uint256 arenaId = arena.createArena(ASSET_A, PriceArena.Category.STOCK, 1 minutes, "NATIVE ETH RC");

        vm.prank(ALICE);
        market.bet{value: STAKE}(predictionId, PredictionMarket.Side.YES, STAKE);
        vm.prank(BOB);
        market.bet{value: STAKE}(predictionId, PredictionMarket.Side.NO, STAKE);

        vm.prank(ALICE);
        race.bet{value: STAKE}(raceId, 0, STAKE);
        vm.prank(BOB);
        race.bet{value: STAKE}(raceId, 1, STAKE);

        vm.prank(ALICE);
        arena.enter{value: STAKE}(arenaId, 110e18, STAKE);
        vm.prank(BOB);
        arena.enter{value: STAKE}(arenaId, 140e18, STAKE);

        AssetRace.Race memory raceData = race.getRace(raceId);
        vm.warp(raceData.bettingEndTime);
        race.startRaceWithProofs(raceId, _raceProofs(raceData.bettingEndTime, 100e18, 100e18, 101));

        raceData = race.getRace(raceId);
        vm.warp(raceData.raceEndTime);
        race.captureEndSnapshots(raceId, _raceProofs(raceData.raceEndTime, 120e18, 90e18, 201));
        race.resolveRace(raceId);
        vm.prank(ALICE);
        race.claim(raceId);

        PriceArena.Arena memory arenaData = arena.getArena(arenaId);
        vm.warp(arenaData.deadline);
        arena.resolve(arenaId, _proof(ORACLE_A, arenaData.deadline, 110e18, 301));
        vm.prank(ALICE);
        arena.claim(arenaId);

        PredictionMarket.Market memory marketData = market.getMarket(predictionId);
        vm.warp(marketData.deadline);
        market.resolve(predictionId, _proof(ORACLE_A, marketData.deadline, 110e18, 401));
        vm.prank(ALICE);
        market.claim(predictionId);

        assertEq(uint256(race.getRace(raceId).status), uint256(AssetRace.RaceStatus.RESOLVED));
        assertEq(uint256(arena.getArena(arenaId).status), uint256(PriceArena.Status.RESOLVED));
        assertEq(uint256(market.getMarket(predictionId).status), uint256(PredictionMarket.Status.Resolved));
        assertEq(address(race).balance, race.accumulatedFees());
        assertEq(address(arena).balance, arena.accumulatedFees());
        assertEq(address(market).balance, market.accumulatedFees());
    }

    function test_AllNativeProductsCompleteCancellationAndRefundLifecycles() public {
        uint256 predictionId = market.createMarket(ASSET_A, 100e18, block.timestamp + 30 minutes, 0, 0);
        uint256 raceId = _createRace();
        uint256 arenaId = arena.createArena(ASSET_A, PriceArena.Category.STOCK, 1 minutes, "REFUND RC");

        vm.prank(ALICE);
        market.bet{value: STAKE}(predictionId, PredictionMarket.Side.YES, STAKE);
        vm.prank(ALICE);
        race.bet{value: STAKE}(raceId, 0, STAKE);
        vm.prank(ALICE);
        arena.enter{value: STAKE}(arenaId, 110e18, STAKE);

        AssetRace.Race memory raceData = race.getRace(raceId);
        vm.warp(raceData.bettingEndTime);
        race.startRaceWithProofs(raceId, new bytes[](0));
        vm.prank(ALICE);
        race.refund(raceId);

        PriceArena.Arena memory arenaData = arena.getArena(arenaId);
        vm.warp(arenaData.startsAt);
        arena.cancelIfInsufficient(arenaId);
        vm.prank(ALICE);
        arena.refund(arenaId);

        PredictionMarket.Market memory marketData = market.getMarket(predictionId);
        vm.warp(marketData.deadline);
        market.resolve(predictionId, "");
        vm.prank(ALICE);
        market.refund(predictionId, PredictionMarket.Side.YES);

        assertEq(uint256(race.getRace(raceId).status), uint256(AssetRace.RaceStatus.CANCELLED));
        assertEq(uint256(arena.getArena(arenaId).status), uint256(PriceArena.Status.CANCELLED));
        assertEq(uint256(market.getMarket(predictionId).status), uint256(PredictionMarket.Status.Cancelled));
        assertEq(address(race).balance, 0);
        assertEq(address(arena).balance, 0);
        assertEq(address(market).balance, 0);
    }

    function _createRace() private returns (uint256 raceId) {
        AssetRace.CandidateInput[] memory candidates = new AssetRace.CandidateInput[](2);
        candidates[0] = _candidate(ASSET_A, ORACLE_A);
        candidates[1] = _candidate(ASSET_B, ORACLE_B);
        raceId = race.createRace(
            AssetRace.RaceConfigInput({
                category: AssetRace.RaceCategory.STOCK,
                bettingStartTime: uint64(block.timestamp),
                bettingEndTime: uint64(block.timestamp + 10),
                raceDuration: 10,
                startGrace: 60,
                resolutionGrace: 60,
                maxOracleTimestampSkew: 2,
                feeBp: 200,
                minActiveContenders: 2,
                minStake: 0.01 ether,
                maxStakePerWallet: 50 ether
            }),
            candidates
        );
    }

    function _candidate(bytes32 assetId, bytes32 oracleId) private view returns (AssetRace.CandidateInput memory) {
        return AssetRace.CandidateInput({
            category: AssetRace.RaceCategory.STOCK,
            assetId: assetId,
            oracle: address(oracle),
            oracleId: oracleId,
            expectedDecimals: DECIMALS,
            maxPriceAge: 60,
            maxEndpointLag: 0
        });
    }

    function _raceProofs(uint256 target, uint256 priceA, uint256 priceB, uint256 blockNumber)
        private
        view
        returns (bytes[] memory proofs)
    {
        proofs = new bytes[](2);
        proofs[0] = _proof(ORACLE_A, target, priceA, blockNumber);
        proofs[1] = _proof(ORACLE_B, target, priceB, blockNumber);
    }

    function _proof(bytes32 oracleId, uint256 target, uint256 price, uint256 blockNumber)
        private
        view
        returns (bytes memory)
    {
        bytes32 parentHash = keccak256(abi.encode("parent", target, blockNumber));
        bytes32 previousHash = keccak256(abi.encode("previous", target, blockNumber));
        bytes32 selectedHash = keccak256(abi.encode("selected", target, blockNumber));
        SignedPoolRaceOracle.SignedPoolObservation memory previous = SignedPoolRaceOracle.SignedPoolObservation({
            oracleId: oracleId,
            price: price,
            decimals: DECIMALS,
            blockNumber: blockNumber - 1,
            blockHash: previousHash,
            parentBlockHash: parentHash,
            blockTimestamp: target - 1
        });
        SignedPoolRaceOracle.SignedPoolObservation memory selected = SignedPoolRaceOracle.SignedPoolObservation({
            oracleId: oracleId,
            price: price,
            decimals: DECIMALS,
            blockNumber: blockNumber,
            blockHash: selectedHash,
            parentBlockHash: previousHash,
            blockTimestamp: target
        });
        return abi.encode(previous, _signature(previous), selected, _signature(selected));
    }

    function _signature(SignedPoolRaceOracle.SignedPoolObservation memory observation)
        private
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_KEY, oracle.observationDigest(observation));
        return abi.encodePacked(r, s, v);
    }
}
