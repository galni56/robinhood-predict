// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AssetRace} from "../src/AssetRace.sol";
import {IAssetRaceOracle} from "../src/interfaces/IAssetRaceOracle.sol";
import {ChainlinkV3RaceOracle} from "../src/oracles/ChainlinkV3RaceOracle.sol";
import {MockAggregator} from "../src/mocks/MockAggregator.sol";

contract ChainlinkV3RaceOracleTest is Test {
    address internal constant BETTOR_A = address(0xA11CE);
    address internal constant BETTOR_B = address(0xB0B);

    ChainlinkV3RaceOracle internal adapter;
    MockAggregator internal feedA;
    MockAggregator internal feedB;

    function setUp() public {
        vm.warp(1_000_000);
        adapter = new ChainlinkV3RaceOracle();
        feedA = new MockAggregator(8, 100e8);
        feedB = new MockAggregator(8, 100e8);
    }

    function _oracleId(address feed) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(feed)));
    }

    function _roundId(uint16 phase, uint64 aggregatorRound) internal pure returns (uint80) {
        return (uint80(phase) << 64) | uint80(aggregatorRound);
    }

    function _proof(uint80 selectedRoundId, uint80 previousRoundId) internal pure returns (bytes memory) {
        return abi.encode(selectedRoundId, previousRoundId);
    }

    function _race(uint64 maxPriceAge) internal returns (AssetRace race) {
        race = new AssetRace();
        AssetRace.CandidateInput[] memory candidates = new AssetRace.CandidateInput[](2);
        candidates[0] = AssetRace.CandidateInput({
            category: AssetRace.RaceCategory.STOCK,
            assetId: bytes32("A"),
            oracle: address(adapter),
            oracleId: _oracleId(address(feedA)),
            expectedDecimals: 8,
            maxPriceAge: maxPriceAge,
            maxEndpointLag: 60
        });
        candidates[1] = AssetRace.CandidateInput({
            category: AssetRace.RaceCategory.STOCK,
            assetId: bytes32("B"),
            oracle: address(adapter),
            oracleId: _oracleId(address(feedB)),
            expectedDecimals: 8,
            maxPriceAge: maxPriceAge,
            maxEndpointLag: 60
        });
        race.setApprovedAsset(candidates[0], true);
        race.setApprovedAsset(candidates[1], true);
        race.createRace(
            AssetRace.RaceConfigInput({
                category: AssetRace.RaceCategory.STOCK,
                bettingStartTime: uint64(block.timestamp),
                bettingEndTime: uint64(block.timestamp + 10),
                raceDuration: 10,
                startGrace: 10,
                resolutionGrace: 10,
                maxOracleTimestampSkew: 5,
                feeBp: 0,
                minActiveContenders: 2,
                minStake: 1,
                maxStakePerWallet: 10
            }),
            candidates
        );
        vm.deal(BETTOR_A, 100);
        vm.deal(BETTOR_B, 100);
        vm.prank(BETTOR_A);
        race.bet{value: 1}(0, 0, 1);
        vm.prank(BETTOR_B);
        race.bet{value: 1}(0, 1, 1);
    }

    function test_AdapterReadsConfiguredFeed() public view {
        assertEq(adapter.oracleIdFor(address(feedA)), _oracleId(address(feedA)));
        IAssetRaceOracle.Observation memory observation = adapter.latestObservation(_oracleId(address(feedA)));
        assertEq(observation.price, 100e8);
        assertEq(observation.decimals, 8);
        assertEq(observation.updatedAt, block.timestamp);
        assertEq(observation.observationId, bytes32(uint256(1)));
    }

    function test_MissingFeedFailsClosed() public {
        vm.expectRevert();
        adapter.latestObservation(_oracleId(address(0xBEEF)));
    }

    function test_EndpointReturnsFirstRoundAtOrAfterTargetEvenWhenNewerRoundExists() public {
        uint256 target = block.timestamp + 100;
        uint80 previous = _roundId(1, 10);
        uint80 selected = _roundId(1, 11);
        uint80 newer = _roundId(1, 12);
        feedA.setRoundData(previous, 99e8, target - 1);
        feedA.setRoundData(selected, 101e8, target + 2);
        feedA.setRoundData(newer, 777e8, target + 5 minutes);

        IAssetRaceOracle.Observation memory observation =
            adapter.endpointObservation(_oracleId(address(feedA)), target, 60, _proof(selected, previous));

        assertEq(observation.price, 101e8);
        assertEq(observation.updatedAt, target + 2);
        assertEq(observation.observationId, bytes32(uint256(selected)));
    }

    function test_EndpointRejectsNonAdjacentFavorableRound() public {
        uint256 target = block.timestamp + 100;
        uint80 previous = _roundId(1, 10);
        uint80 firstAfter = _roundId(1, 11);
        uint80 favorable = _roundId(1, 12);
        feedA.setRoundData(previous, 99e8, target - 1);
        feedA.setRoundData(firstAfter, 101e8, target + 2);
        feedA.setRoundData(favorable, 777e8, target + 3);

        vm.expectRevert(ChainlinkV3RaceOracle.InvalidRoundProof.selector);
        adapter.endpointObservation(_oracleId(address(feedA)), target, 60, _proof(favorable, previous));
    }

    function test_EndpointRejectsSelectedRoundBeforeTargetOrAfterLag() public {
        uint256 target = block.timestamp + 100;
        uint80 previous = _roundId(1, 10);
        uint80 selected = _roundId(1, 11);
        feedA.setRoundData(previous, 99e8, target - 2);
        feedA.setRoundData(selected, 101e8, target - 1);

        vm.expectRevert(ChainlinkV3RaceOracle.InvalidRoundProof.selector);
        adapter.endpointObservation(_oracleId(address(feedA)), target, 60, _proof(selected, previous));

        feedA.setRoundData(selected, 101e8, target + 61);
        vm.expectRevert(ChainlinkV3RaceOracle.InvalidRoundProof.selector);
        adapter.endpointObservation(_oracleId(address(feedA)), target, 60, _proof(selected, previous));
    }

    function test_EndpointFailsClosedAtProxyPhaseBoundary() public {
        uint256 target = block.timestamp + 100;
        uint80 previous = _roundId(1, 99);
        uint80 selected = _roundId(2, 1);
        feedA.setRoundData(previous, 99e8, target - 1);
        feedA.setRoundData(selected, 101e8, target + 1);

        vm.expectRevert(ChainlinkV3RaceOracle.PhaseBoundaryUnsupported.selector);
        adapter.endpointObservation(_oracleId(address(feedA)), target, 60, _proof(selected, previous));
    }

    function test_RaceUsesHistoricalEndpointAndCanFinalizeMuchLater() public {
        AssetRace race = _race(60);
        vm.warp(block.timestamp + 10);
        feedA.setAnswer(100e8, block.timestamp);
        feedB.setAnswer(100e8, block.timestamp);
        race.startRace(0);

        uint256 target = race.getRace(0).raceEndTime;
        uint80 previous = _roundId(1, 10);
        uint80 selected = _roundId(1, 11);
        uint80 newer = _roundId(1, 12);
        feedA.setRoundData(previous, 99e8, target - 1);
        feedA.setRoundData(selected, 110e8, target + 2);
        feedA.setRoundData(newer, 1e8, target + 5 minutes);
        feedB.setRoundData(previous, 99e8, target - 1);
        feedB.setRoundData(selected, 105e8, target + 2);
        feedB.setRoundData(newer, 999e8, target + 5 minutes);

        vm.warp(target + 2);
        bytes[] memory proofs = new bytes[](2);
        proofs[0] = _proof(selected, previous);
        proofs[1] = _proof(selected, previous);
        race.captureEndSnapshots(0, proofs);

        vm.warp(block.timestamp + 30 days);
        race.resolveRace(0);
        assertEq(race.getRace(0).winningAssetIndex, 0);
        assertEq(race.getRaceAsset(0, 0).endPrice, 110e8);
        assertEq(race.getRaceAsset(0, 1).endPrice, 105e8);
    }

    function test_ZeroAndNegativeAnswersFailThroughAssetRaceValidation() public {
        AssetRace race = _race(60);
        feedA.setAnswer(0, block.timestamp);
        vm.warp(block.timestamp + 10);
        feedB.setAnswer(100e8, block.timestamp);
        vm.expectRevert(AssetRace.InvalidOraclePrice.selector);
        race.startRace(0);

        feedA.setAnswer(-1, block.timestamp);
        vm.expectRevert(AssetRace.InvalidOraclePrice.selector);
        race.startRace(0);
    }

    function test_StaleChainlinkAnswerFailsThroughAssetRaceValidation() public {
        AssetRace race = _race(5);
        vm.warp(block.timestamp + 10);
        feedA.setAnswer(100e8, block.timestamp - 6);
        feedB.setAnswer(100e8, block.timestamp);
        vm.expectRevert(AssetRace.OraclePriceStale.selector);
        race.startRace(0);
    }

    function test_WrongChainlinkDecimalsFailThroughAssetRaceValidation() public {
        MockAggregator wrongDecimals = new MockAggregator(18, 1e18);
        AssetRace race = _race(60);
        AssetRace.CandidateInput memory replacement = AssetRace.CandidateInput({
            category: AssetRace.RaceCategory.STOCK,
            assetId: bytes32("A"),
            oracle: address(adapter),
            oracleId: _oracleId(address(wrongDecimals)),
            expectedDecimals: 8,
            maxPriceAge: 60,
            maxEndpointLag: 60
        });
        race.setApprovedAsset(replacement, true);

        // Race 0 keeps the original feed snapshot; create race 1 from the updated registry.
        bytes32[] memory ids = new bytes32[](2);
        ids[0] = bytes32("A");
        ids[1] = bytes32("B");
        race.createPlatformRace(
            "WRONG DECIMALS",
            AssetRace.RaceConfigInput({
                category: AssetRace.RaceCategory.STOCK,
                bettingStartTime: uint64(block.timestamp),
                bettingEndTime: uint64(block.timestamp + 10),
                raceDuration: 10,
                startGrace: 10,
                resolutionGrace: 10,
                maxOracleTimestampSkew: 5,
                feeBp: 0,
                minActiveContenders: 2,
                minStake: 1,
                maxStakePerWallet: 10
            }),
            ids
        );
        vm.prank(BETTOR_A);
        race.bet{value: 1}(1, 0, 1);
        vm.prank(BETTOR_B);
        race.bet{value: 1}(1, 1, 1);
        vm.warp(block.timestamp + 10);
        vm.expectRevert(AssetRace.InvalidOracleDecimals.selector);
        race.startRace(1);
    }
}
