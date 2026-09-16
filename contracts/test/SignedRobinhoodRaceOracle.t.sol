// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AssetRace} from "../src/AssetRace.sol";
import {IAssetRaceOracle} from "../src/interfaces/IAssetRaceOracle.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {SignedRobinhoodRaceOracle} from "../src/oracles/SignedRobinhoodRaceOracle.sol";

contract SignedRobinhoodRaceOracleTest is Test {
    uint256 internal constant SIGNER_KEY = 0xA11CE;
    uint256 internal constant OTHER_KEY = 0xB0B;
    uint8 internal constant DECIMALS = 8;
    bytes32 internal constant NVDA = bytes32("NVDA");
    bytes32 internal constant TSLA = bytes32("TSLA");
    bytes32 internal constant AAPL = bytes32("AAPL");
    address internal constant ALICE = address(0x1001);
    address internal constant BOB = address(0x1002);
    address internal constant CHARLIE = address(0x1003);

    SignedRobinhoodRaceOracle internal adapter;

    function setUp() public {
        vm.warp(1_000_000);
        adapter = new SignedRobinhoodRaceOracle(vm.addr(SIGNER_KEY));
    }

    function _observation(bytes32 oracleId, uint256 price, uint256 updatedAt, uint256 sequence)
        internal
        pure
        returns (SignedRobinhoodRaceOracle.SignedObservation memory)
    {
        return SignedRobinhoodRaceOracle.SignedObservation({
            oracleId: oracleId, price: price, decimals: DECIMALS, updatedAt: updatedAt, sequence: sequence
        });
    }

    function _signature(
        SignedRobinhoodRaceOracle target,
        SignedRobinhoodRaceOracle.SignedObservation memory observation,
        uint256 key
    ) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, target.observationDigest(observation));
        return abi.encodePacked(r, s, v);
    }

    function _proof(
        SignedRobinhoodRaceOracle.SignedObservation memory previous,
        SignedRobinhoodRaceOracle.SignedObservation memory selected
    ) internal view returns (bytes memory) {
        return abi.encode(
            previous, _signature(adapter, previous, SIGNER_KEY), selected, _signature(adapter, selected, SIGNER_KEY)
        );
    }

    function _pair(bytes32 oracleId, uint256 target, uint256 startPrice, uint256 sequence)
        internal
        pure
        returns (
            SignedRobinhoodRaceOracle.SignedObservation memory previous,
            SignedRobinhoodRaceOracle.SignedObservation memory selected
        )
    {
        previous = _observation(oracleId, startPrice - 1e8, target - 1, sequence);
        selected = _observation(oracleId, startPrice, target + 1, sequence + 1);
    }

    function test_ValidSignedObservationPairVerifies() public view {
        uint256 target = block.timestamp + 10;
        (
            SignedRobinhoodRaceOracle.SignedObservation memory previous,
            SignedRobinhoodRaceOracle.SignedObservation memory selected
        ) = _pair(NVDA, target, 100e8, 1);
        IAssetRaceOracle.Observation memory result =
            adapter.endpointObservation(NVDA, target, 60, _proof(previous, selected));
        assertEq(result.price, 100e8);
        assertEq(result.decimals, DECIMALS);
        assertEq(result.updatedAt, target + 1);
        assertEq(result.observationId, adapter.observationDigest(selected));
    }

    function test_InvalidSignerAndTamperedPriceReject() public {
        uint256 target = block.timestamp + 10;
        (
            SignedRobinhoodRaceOracle.SignedObservation memory previous,
            SignedRobinhoodRaceOracle.SignedObservation memory selected
        ) = _pair(NVDA, target, 100e8, 1);
        bytes memory wrongSignerProof = abi.encode(
            previous, _signature(adapter, previous, OTHER_KEY), selected, _signature(adapter, selected, SIGNER_KEY)
        );
        vm.expectRevert(SignedRobinhoodRaceOracle.InvalidSigner.selector);
        adapter.endpointObservation(NVDA, target, 60, wrongSignerProof);

        bytes memory selectedSignature = _signature(adapter, selected, SIGNER_KEY);
        selected.price = 999e8;
        bytes memory tamperedProof =
            abi.encode(previous, _signature(adapter, previous, SIGNER_KEY), selected, selectedSignature);
        vm.expectRevert(SignedRobinhoodRaceOracle.InvalidSigner.selector);
        adapter.endpointObservation(NVDA, target, 60, tamperedProof);
    }

    function test_WrongIdentityDecimalsAndSequenceReject() public {
        uint256 target = block.timestamp + 10;
        (
            SignedRobinhoodRaceOracle.SignedObservation memory previous,
            SignedRobinhoodRaceOracle.SignedObservation memory selected
        ) = _pair(NVDA, target, 100e8, 1);

        bytes memory proof = _proof(previous, selected);
        vm.expectRevert(SignedRobinhoodRaceOracle.InvalidObservationProof.selector);
        adapter.endpointObservation(TSLA, target, 60, proof);

        selected.decimals = 18;
        proof = _proof(previous, selected);
        vm.expectRevert(SignedRobinhoodRaceOracle.InvalidObservationProof.selector);
        adapter.endpointObservation(NVDA, target, 60, proof);

        selected.decimals = DECIMALS;
        selected.sequence = previous.sequence + 2;
        proof = _proof(previous, selected);
        vm.expectRevert(SignedRobinhoodRaceOracle.InvalidObservationProof.selector);
        adapter.endpointObservation(NVDA, target, 60, proof);
    }

    function test_EndpointTimestampBoundsReject() public {
        uint256 target = block.timestamp + 10;
        (
            SignedRobinhoodRaceOracle.SignedObservation memory previous,
            SignedRobinhoodRaceOracle.SignedObservation memory selected
        ) = _pair(NVDA, target, 100e8, 1);

        previous.updatedAt = target;
        bytes memory proof = _proof(previous, selected);
        vm.expectRevert(SignedRobinhoodRaceOracle.InvalidObservationProof.selector);
        adapter.endpointObservation(NVDA, target, 60, proof);

        previous.updatedAt = target - 1;
        selected.updatedAt = target - 1;
        proof = _proof(previous, selected);
        vm.expectRevert(SignedRobinhoodRaceOracle.InvalidObservationProof.selector);
        adapter.endpointObservation(NVDA, target, 60, proof);

        selected.updatedAt = target + 61;
        proof = _proof(previous, selected);
        vm.expectRevert(SignedRobinhoodRaceOracle.InvalidObservationProof.selector);
        adapter.endpointObservation(NVDA, target, 60, proof);
    }

    function test_SignatureCannotReplayAgainstAnotherAdapterDomain() public {
        SignedRobinhoodRaceOracle other = new SignedRobinhoodRaceOracle(vm.addr(SIGNER_KEY));
        uint256 target = block.timestamp + 10;
        (
            SignedRobinhoodRaceOracle.SignedObservation memory previous,
            SignedRobinhoodRaceOracle.SignedObservation memory selected
        ) = _pair(NVDA, target, 100e8, 1);
        bytes memory proof = _proof(previous, selected);
        vm.expectRevert(SignedRobinhoodRaceOracle.InvalidSigner.selector);
        other.endpointObservation(NVDA, target, 60, proof);
    }

    function test_LatestObservationAlwaysRequiresProof() public {
        vm.expectRevert(SignedRobinhoodRaceOracle.ProofRequired.selector);
        adapter.latestObservation(NVDA);
    }

    function test_SignedRaceDeterministicP0P1DelayedFinalizationAndClaim() public {
        (AssetRace race, MockERC20 token) = _createRace(3);
        _bet(race, token, ALICE, 0, 10);
        _bet(race, token, BOB, 1, 10);
        _bet(race, token, CHARLIE, 2, 10);

        AssetRace.Race memory beforeStart = race.getRace(0);
        vm.warp(beforeStart.bettingEndTime + 2);
        bytes[] memory startProofs = new bytes[](3);
        startProofs[0] = _proofPair(NVDA, beforeStart.bettingEndTime, 100e8, 1);
        startProofs[1] = _proofPair(TSLA, beforeStart.bettingEndTime, 100e8, 1);
        startProofs[2] = _proofPair(AAPL, beforeStart.bettingEndTime, 100e8, 1);
        race.startRaceWithProofs(0, startProofs);

        AssetRace.Race memory running = race.getRace(0);
        assertEq(running.actualStartTime, beforeStart.bettingEndTime);
        assertEq(running.raceEndTime, beforeStart.bettingEndTime + running.raceDuration);
        assertEq(race.getRaceAsset(0, 0).startPrice, 100e8);

        vm.warp(running.raceEndTime + 2);
        bytes[] memory endProofs = new bytes[](3);
        endProofs[0] = _proofPair(NVDA, running.raceEndTime, 90e8, 3);
        endProofs[1] = _proofPair(TSLA, running.raceEndTime, 95e8, 3);
        endProofs[2] = _proofPair(AAPL, running.raceEndTime, 80e8, 3);
        race.captureEndSnapshots(0, endProofs);
        assertEq(race.getRaceAsset(0, 1).endPrice, 95e8);

        vm.expectRevert(AssetRace.EndSnapshotsAlreadyCaptured.selector);
        race.captureEndSnapshots(0, endProofs);

        vm.warp(block.timestamp + 30 days);
        race.resolveRace(0);
        assertEq(race.getRace(0).winningAssetIndex, 1);
        assertEq(race.getRaceAsset(0, 1).endPrice, 95e8);

        uint256 balanceBefore = token.balanceOf(BOB);
        vm.prank(BOB);
        race.claim(0);
        assertEq(token.balanceOf(BOB) - balanceBefore, 30);
    }

    function test_SignedRaceCannotBypassProofStartOrSelectLaterP0() public {
        (AssetRace race, MockERC20 token) = _createRace(2);
        _bet(race, token, ALICE, 0, 10);
        _bet(race, token, BOB, 1, 10);
        uint256 target = race.getRace(0).bettingEndTime;
        vm.warp(target + 3);

        vm.expectRevert(AssetRace.StartProofRequired.selector);
        race.startRace(0);

        SignedRobinhoodRaceOracle.SignedObservation memory firstAfter = _observation(NVDA, 100e8, target + 1, 2);
        SignedRobinhoodRaceOracle.SignedObservation memory later = _observation(NVDA, 999e8, target + 2, 3);
        bytes[] memory proofs = new bytes[](2);
        proofs[0] = _proof(firstAfter, later);
        proofs[1] = _proofPair(TSLA, target, 100e8, 1);
        vm.expectRevert(SignedRobinhoodRaceOracle.InvalidObservationProof.selector);
        race.startRaceWithProofs(0, proofs);
    }

    function test_AssetRaceRejectsSignedObservationWithWrongExpectedDecimals() public {
        (AssetRace race, MockERC20 token) = _createRace(2);
        _bet(race, token, ALICE, 0, 10);
        _bet(race, token, BOB, 1, 10);
        uint256 target = race.getRace(0).bettingEndTime;
        vm.warp(target + 2);
        (
            SignedRobinhoodRaceOracle.SignedObservation memory previous,
            SignedRobinhoodRaceOracle.SignedObservation memory selected
        ) = _pair(NVDA, target, 100e8, 1);
        previous.decimals = 18;
        selected.decimals = 18;
        bytes[] memory proofs = new bytes[](2);
        proofs[0] = _proof(previous, selected);
        proofs[1] = _proofPair(TSLA, target, 100e8, 1);
        vm.expectRevert(AssetRace.InvalidOracleDecimals.selector);
        race.startRaceWithProofs(0, proofs);
    }

    function _proofPair(bytes32 oracleId, uint256 target, uint256 price, uint256 sequence)
        internal
        view
        returns (bytes memory)
    {
        (
            SignedRobinhoodRaceOracle.SignedObservation memory previous,
            SignedRobinhoodRaceOracle.SignedObservation memory selected
        ) = _pair(oracleId, target, price, sequence);
        return _proof(previous, selected);
    }

    function _createRace(uint8 count) internal returns (AssetRace race, MockERC20 token) {
        token = new MockERC20("Mock USDG", "mUSDG");
        race = new AssetRace(address(token));
        AssetRace.CandidateInput[] memory candidates = new AssetRace.CandidateInput[](count);
        bytes32[3] memory ids = [NVDA, TSLA, AAPL];
        for (uint8 i = 0; i < count; ++i) {
            candidates[i] = AssetRace.CandidateInput({
                category: AssetRace.RaceCategory.STOCK,
                assetId: ids[i],
                oracle: address(adapter),
                oracleId: ids[i],
                expectedDecimals: DECIMALS,
                maxPriceAge: 60,
                maxEndpointLag: 60
            });
            race.setApprovedAsset(candidates[i], true);
        }
        race.createRace(
            AssetRace.RaceConfigInput({
                category: AssetRace.RaceCategory.STOCK,
                bettingStartTime: uint64(block.timestamp),
                bettingEndTime: uint64(block.timestamp + 10),
                raceDuration: 10,
                startGrace: 60,
                resolutionGrace: 60,
                maxOracleTimestampSkew: 5,
                feeBp: 0,
                minActiveContenders: 2,
                minStake: 1,
                maxStakePerWallet: 100
            }),
            candidates
        );
    }

    function _bet(AssetRace race, MockERC20 token, address bettor, uint8 assetIndex, uint256 amount) internal {
        token.mint(bettor, amount);
        vm.startPrank(bettor);
        token.approve(address(race), type(uint256).max);
        race.bet(0, assetIndex, amount);
        vm.stopPrank();
    }
}
