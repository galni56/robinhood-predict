// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AssetRace} from "../src/AssetRace.sol";
import {IAssetRaceOracle} from "../src/interfaces/IAssetRaceOracle.sol";
import {SignedPoolRaceOracle} from "../src/oracles/SignedPoolRaceOracle.sol";

contract SignedPoolRaceOracleTest is Test {
    uint256 internal constant SIGNER_KEY = 0xA11CE;
    uint256 internal constant OTHER_KEY = 0xB0B;
    uint8 internal constant DECIMALS = 18;
    bytes32 internal constant ORACLE_A = keccak256("pool-a");
    bytes32 internal constant ORACLE_B = keccak256("pool-b");
    bytes32 internal constant ORACLE_C = keccak256("pool-c");
    bytes32 internal constant BLOCK_0 = keccak256("block-0");
    bytes32 internal constant BLOCK_1 = keccak256("block-1");
    bytes32 internal constant BLOCK_2 = keccak256("block-2");
    bytes32 internal constant BLOCK_3 = keccak256("block-3");
    address internal constant ALICE = address(0x1001);
    address internal constant BOB = address(0x1002);
    address internal constant CHARLIE = address(0x1003);

    SignedPoolRaceOracle internal adapter;

    function setUp() public {
        vm.warp(1_000_000);
        adapter = new SignedPoolRaceOracle(vm.addr(SIGNER_KEY));
    }

    function _observation(
        bytes32 oracleId,
        uint256 price,
        uint256 blockNumber,
        bytes32 blockHash,
        bytes32 parentBlockHash,
        uint256 blockTimestamp
    ) internal pure returns (SignedPoolRaceOracle.SignedPoolObservation memory) {
        return SignedPoolRaceOracle.SignedPoolObservation({
            oracleId: oracleId,
            price: price,
            decimals: DECIMALS,
            blockNumber: blockNumber,
            blockHash: blockHash,
            parentBlockHash: parentBlockHash,
            blockTimestamp: blockTimestamp
        });
    }

    function _signature(
        SignedPoolRaceOracle target,
        SignedPoolRaceOracle.SignedPoolObservation memory observation,
        uint256 key
    ) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, target.observationDigest(observation));
        return abi.encodePacked(r, s, v);
    }

    function _proof(
        SignedPoolRaceOracle.SignedPoolObservation memory previous,
        SignedPoolRaceOracle.SignedPoolObservation memory selected
    ) internal view returns (bytes memory) {
        return abi.encode(
            previous, _signature(adapter, previous, SIGNER_KEY), selected, _signature(adapter, selected, SIGNER_KEY)
        );
    }

    function _proofPair(
        bytes32 oracleId,
        uint256 target,
        uint256 price,
        uint256 blockNumber,
        bytes32 previousHash,
        bytes32 selectedHash
    ) internal view returns (bytes memory) {
        SignedPoolRaceOracle.SignedPoolObservation memory previous =
            _observation(oracleId, price, blockNumber - 1, previousHash, BLOCK_0, target - 1);
        SignedPoolRaceOracle.SignedPoolObservation memory selected =
            _observation(oracleId, price + 4e18, blockNumber, selectedHash, previousHash, target);
        return _proof(previous, selected);
    }

    function test_EndpointBeforeTargetSuppliesPriceNotBoundaryAtTarget() public view {
        uint256 target = block.timestamp;
        bytes memory proof = _proofPair(ORACLE_A, target, 123e18, 101, BLOCK_1, BLOCK_2);
        IAssetRaceOracle.Observation memory result = adapter.endpointObservation(ORACLE_A, target, 2, proof);
        assertEq(result.price, 123e18);
        assertEq(result.decimals, DECIMALS);
        assertEq(result.updatedAt, target - 1);
        assertEq(result.observationId, BLOCK_1);
    }

    function test_BoundaryRequiresConsecutiveBlocksLineageAndTimestamps() public {
        // Unlike a real transaction, vm.warp changes time during this test;
        // avoid IR rematerializing block.timestamp after the cheatcode call.
        uint256 target = vm.getBlockTimestamp();
        SignedPoolRaceOracle.SignedPoolObservation memory previous =
            _observation(ORACLE_A, 100e18, 100, BLOCK_1, BLOCK_0, target - 1);
        SignedPoolRaceOracle.SignedPoolObservation memory selected =
            _observation(ORACLE_A, 100e18, 102, BLOCK_2, BLOCK_1, target);
        bytes memory proof = _proof(previous, selected);
        vm.expectRevert(SignedPoolRaceOracle.InvalidObservationProof.selector);
        adapter.endpointObservation(ORACLE_A, target, 2, proof);

        selected.blockNumber = 101;
        selected.parentBlockHash = BLOCK_3;
        proof = _proof(previous, selected);
        vm.expectRevert(SignedPoolRaceOracle.InvalidObservationProof.selector);
        adapter.endpointObservation(ORACLE_A, target, 2, proof);

        selected.parentBlockHash = BLOCK_1;
        previous.blockTimestamp = target;
        proof = _proof(previous, selected);
        vm.expectRevert(SignedPoolRaceOracle.InvalidObservationProof.selector);
        adapter.endpointObservation(ORACLE_A, target, 2, proof);

        previous.blockTimestamp = target - 1;
        selected.blockTimestamp = target - 1;
        proof = _proof(previous, selected);
        vm.expectRevert(SignedPoolRaceOracle.InvalidObservationProof.selector);
        adapter.endpointObservation(ORACLE_A, target, 2, proof);

        selected.blockTimestamp = target + 3;
        proof = _proof(previous, selected);
        vm.expectRevert(SignedPoolRaceOracle.InvalidObservationProof.selector);
        adapter.endpointObservation(ORACLE_A, target, 2, proof);
        vm.warp(target + 7);
        selected.blockTimestamp = target + 7;
        selected.price = 999e18;
        IAssetRaceOracle.Observation memory result =
            adapter.endpointObservation(ORACLE_A, target, 0, _proof(previous, selected));
        assertEq(result.price, 100e18);
        assertEq(result.observationId, BLOCK_1);
    }

    function test_TamperingIdentityPriceOrBlockMetadataRejects() public {
        uint256 target = block.timestamp;
        SignedPoolRaceOracle.SignedPoolObservation memory previous =
            _observation(ORACLE_A, 100e18, 100, BLOCK_1, BLOCK_0, target - 1);
        SignedPoolRaceOracle.SignedPoolObservation memory selected =
            _observation(ORACLE_A, 101e18, 101, BLOCK_2, BLOCK_1, target);
        bytes memory proof = _proof(previous, selected);
        vm.expectRevert(SignedPoolRaceOracle.InvalidObservationProof.selector);
        adapter.endpointObservation(ORACLE_B, target, 2, proof);

        bytes memory validSelectedSignature = _signature(adapter, selected, SIGNER_KEY);
        selected.price = 999e18;
        proof = abi.encode(previous, _signature(adapter, previous, SIGNER_KEY), selected, validSelectedSignature);
        vm.expectRevert(SignedPoolRaceOracle.InvalidSigner.selector);
        adapter.endpointObservation(ORACLE_A, target, 2, proof);

        bytes memory validPreviousSignature = _signature(adapter, previous, SIGNER_KEY);
        previous.price = 999e18;
        proof = abi.encode(previous, validPreviousSignature, selected, _signature(adapter, selected, SIGNER_KEY));
        vm.expectRevert(SignedPoolRaceOracle.InvalidSigner.selector);
        adapter.endpointObservation(ORACLE_A, target, 0, proof);

        selected.price = 101e18;
        validSelectedSignature = _signature(adapter, selected, SIGNER_KEY);
        selected.blockHash = BLOCK_3;
        proof = abi.encode(previous, _signature(adapter, previous, SIGNER_KEY), selected, validSelectedSignature);
        vm.expectRevert(SignedPoolRaceOracle.InvalidSigner.selector);
        adapter.endpointObservation(ORACLE_A, target, 2, proof);
    }

    function test_WrongSignerAndCrossDomainReplayReject() public {
        uint256 target = block.timestamp;
        SignedPoolRaceOracle.SignedPoolObservation memory previous =
            _observation(ORACLE_A, 100e18, 100, BLOCK_1, BLOCK_0, target - 1);
        SignedPoolRaceOracle.SignedPoolObservation memory selected =
            _observation(ORACLE_A, 101e18, 101, BLOCK_2, BLOCK_1, target);
        bytes memory wrongSigner = abi.encode(
            previous, _signature(adapter, previous, OTHER_KEY), selected, _signature(adapter, selected, SIGNER_KEY)
        );
        vm.expectRevert(SignedPoolRaceOracle.InvalidSigner.selector);
        adapter.endpointObservation(ORACLE_A, target, 2, wrongSigner);

        SignedPoolRaceOracle other = new SignedPoolRaceOracle(vm.addr(SIGNER_KEY));
        bytes memory replay = _proof(previous, selected);
        vm.expectRevert(SignedPoolRaceOracle.InvalidSigner.selector);
        other.endpointObservation(ORACLE_A, target, 2, replay);
    }

    function test_RaceRequiresCommonP0AndP1Block() public {
        AssetRace race = _createRace(2);
        _bet(race, ALICE, 0, 10);
        _bet(race, BOB, 1, 10);
        uint256 t0 = race.getRace(0).bettingEndTime;
        vm.warp(t0);
        bytes[] memory proofs = new bytes[](2);
        proofs[0] = _proofPair(ORACLE_A, t0, 100e18, 101, BLOCK_1, BLOCK_2);
        proofs[1] = _proofPair(ORACLE_B, t0, 100e18, 101, BLOCK_3, BLOCK_2);
        vm.expectRevert(AssetRace.EndpointSourceMismatch.selector);
        race.startRaceWithProofs(0, proofs);

        proofs[1] = _proofPair(ORACLE_B, t0, 100e18, 101, BLOCK_1, BLOCK_2);
        race.startRaceWithProofs(0, proofs);
        uint256 t1 = race.getRace(0).raceEndTime;
        vm.warp(t1);
        proofs[0] = _proofPair(ORACLE_A, t1, 110e18, 201, BLOCK_2, BLOCK_3);
        proofs[1] = _proofPair(ORACLE_B, t1, 90e18, 201, BLOCK_1, BLOCK_3);
        vm.expectRevert(AssetRace.EndpointSourceMismatch.selector);
        race.captureEndSnapshots(0, proofs);
    }

    function test_DelayedResolveAndClaimKeepSignedPoolP1() public {
        AssetRace race = _createRace(3);
        _bet(race, ALICE, 0, 10);
        _bet(race, BOB, 1, 10);
        _bet(race, CHARLIE, 2, 10);
        uint256 t0 = race.getRace(0).bettingEndTime;
        vm.warp(t0 + 1);
        bytes[] memory proofs = new bytes[](3);
        proofs[0] = _proofPair(ORACLE_A, t0, 100e18, 101, BLOCK_1, BLOCK_2);
        proofs[1] = _proofPair(ORACLE_B, t0, 100e18, 101, BLOCK_1, BLOCK_2);
        proofs[2] = _proofPair(ORACLE_C, t0, 100e18, 101, BLOCK_1, BLOCK_2);
        race.startRaceWithProofs(0, proofs);
        assertEq(race.getRace(0).actualStartTime, t0);

        uint256 t1 = race.getRace(0).raceEndTime;
        vm.warp(t1 + 45);
        proofs[0] = _proofPair(ORACLE_A, t1, 90e18, 201, BLOCK_2, BLOCK_3);
        proofs[1] = _proofPair(ORACLE_B, t1, 95e18, 201, BLOCK_2, BLOCK_3);
        proofs[2] = _proofPair(ORACLE_C, t1, 80e18, 201, BLOCK_2, BLOCK_3);
        race.captureEndSnapshots(0, proofs);
        vm.warp(block.timestamp + 30 days);
        race.resolveRace(0);
        assertEq(race.getRace(0).winningAssetIndex, 1);
        assertEq(race.getRaceAsset(0, 1).endPrice, 95e18);

        vm.warp(block.timestamp + 30 days);
        uint256 beforeBalance = BOB.balance;
        vm.prank(BOB);
        race.claim(0);
        assertEq(BOB.balance - beforeBalance, 30);
    }

    function test_MemeCommonEndpointsDelayedCaptureResolveAndClaim() public {
        AssetRace race = _createRaceForCategory(3, AssetRace.RaceCategory.MEME);
        _bet(race, ALICE, 0, 10);
        _bet(race, BOB, 1, 10);
        _bet(race, CHARLIE, 2, 10);
        uint256 t0 = race.getRace(0).bettingEndTime;
        vm.warp(t0 + 30);
        bytes[] memory proofs = _memeProofs(t0, 100e18, 100e18, 100e18, false);
        proofs[2] = _proofPair(ORACLE_C, t0, 100e18, 101, BLOCK_3, BLOCK_2);
        vm.expectRevert(AssetRace.EndpointSourceMismatch.selector);
        race.startRaceWithProofs(0, proofs);
        race.startRaceWithProofs(0, _memeProofs(t0, 100e18, 100e18, 100e18, false));
        assertEq(race.getRace(0).actualStartTime, t0);
        for (uint8 i = 0; i < 3; ++i) {
            assertEq(race.getRaceAsset(0, i).startObservationId, BLOCK_1);
        }

        uint256 t1 = race.getRace(0).raceEndTime;
        vm.warp(t1 + 45);
        proofs = _memeProofs(t1, 102e18, 105e18, 104e18, true);
        proofs[2] = _proofPair(ORACLE_C, t1, 104e18, 201, BLOCK_1, BLOCK_3);
        vm.expectRevert(AssetRace.EndpointSourceMismatch.selector);
        race.captureEndSnapshots(0, proofs);
        race.captureEndSnapshots(0, _memeProofs(t1, 102e18, 105e18, 104e18, true));
        for (uint8 i = 0; i < 3; ++i) {
            assertEq(race.getRaceAsset(0, i).endObservationId, BLOCK_2);
        }
        // The proof's boundary price is deliberately different; P1 comes from E.
        assertEq(race.getRaceAsset(0, 1).endPrice, 105e18);
        vm.warp(t1 + 30 days);
        proofs = _memeProofs(t1, 900e18, 105e18, 800e18, true);
        vm.expectRevert(AssetRace.EndSnapshotsAlreadyCaptured.selector);
        race.captureEndSnapshots(0, proofs);
        vm.prank(CHARLIE); // Settlement is permissionless, not keeper-only.
        race.resolveRace(0);
        assertEq(race.getRace(0).winningAssetIndex, 1);
        assertEq(race.getRaceAsset(0, 0).endPrice, 102e18);
        vm.warp(t1 + 60 days);
        vm.prank(BOB);
        race.claim(0);
        assertEq(BOB.balance, 30);
    }

    function test_MemeFinalTieVoidsAndLateRefundWorks() public {
        AssetRace race = _startedMemeRace();
        uint256 t1 = race.getRace(0).raceEndTime;
        vm.warp(t1 + 45);
        race.captureEndSnapshots(0, _memeProofs(t1, 105e18, 105e18, 104e18, true));
        vm.warp(t1 + 30 days);
        race.resolveRace(0);
        assertEq(uint8(race.getRace(0).status), uint8(AssetRace.RaceStatus.VOID));
        vm.warp(t1 + 60 days);
        vm.prank(ALICE);
        race.refund(0);
        assertEq(ALICE.balance, 10);
    }

    function test_MemeAllNegativeChoosesLeastNegativeUnchanged() public {
        AssetRace race = _startedMemeRace();
        uint256 t1 = race.getRace(0).raceEndTime;
        vm.warp(t1);
        race.captureEndSnapshots(0, _memeProofs(t1, 90e18, 95e18, 80e18, true));
        race.resolveRace(0);
        assertEq(race.getRace(0).winningAssetIndex, 1);
    }

    function test_MemeMissingP0CancelsAndLateRefundWorks() public {
        AssetRace race = _createRaceForCategory(3, AssetRace.RaceCategory.MEME);
        _bet(race, ALICE, 0, 10);
        _bet(race, BOB, 1, 10);
        uint256 t0 = race.getRace(0).bettingEndTime;
        vm.warp(t0);
        bytes[] memory proofs = new bytes[](3);
        vm.expectRevert();
        race.startRaceWithProofs(0, proofs);
        vm.warp(t0 + 61);
        race.cancelUnstartedRace(0);
        assertEq(uint8(race.getRace(0).status), uint8(AssetRace.RaceStatus.CANCELLED));
        vm.warp(t0 + 60 days);
        vm.prank(ALICE);
        race.refund(0);
        assertEq(ALICE.balance, 10);
    }

    function test_MemeMissingP1VoidsAndLateRefundWorks() public {
        AssetRace race = _startedMemeRace();
        uint256 t1 = race.getRace(0).raceEndTime;
        vm.warp(t1);
        bytes[] memory proofs = new bytes[](3);
        vm.expectRevert();
        race.captureEndSnapshots(0, proofs);
        vm.warp(t1 + 61);
        race.voidExpiredRace(0);
        assertEq(uint8(race.getRace(0).status), uint8(AssetRace.RaceStatus.VOID));
        vm.warp(t1 + 60 days);
        vm.prank(BOB);
        race.refund(0);
        assertEq(BOB.balance, 10);
    }

    function test_MemeCannotIncludeStockCandidate() public {
        AssetRace race = _createRaceForCategory(2, AssetRace.RaceCategory.MEME);
        AssetRace.CandidateInput[] memory candidates = new AssetRace.CandidateInput[](2);
        candidates[0] =
            AssetRace.CandidateInput(AssetRace.RaceCategory.MEME, bytes32("AI"), address(adapter), ORACLE_A, 18, 60, 0);
        candidates[1] = AssetRace.CandidateInput(
            AssetRace.RaceCategory.STOCK, bytes32("NVDA"), address(adapter), ORACLE_B, 18, 60, 0
        );
        race.setApprovedAsset(candidates[1], true);
        vm.expectRevert(AssetRace.AssetNotApproved.selector);
        race.createRace(
            AssetRace.RaceConfigInput(
                AssetRace.RaceCategory.MEME,
                uint64(block.timestamp),
                uint64(block.timestamp + 10),
                10,
                60,
                60,
                2,
                0,
                2,
                1,
                100
            ),
            candidates
        );
    }

    function _memeProofs(uint256 target, uint256 a, uint256 b, uint256 c, bool end)
        internal
        view
        returns (bytes[] memory proofs)
    {
        proofs = new bytes[](3);
        uint256 blockNumber = end ? 201 : 101;
        bytes32 previous = end ? BLOCK_2 : BLOCK_1;
        bytes32 selected = end ? BLOCK_3 : BLOCK_2;
        proofs[0] = _proofPair(ORACLE_A, target, a, blockNumber, previous, selected);
        proofs[1] = _proofPair(ORACLE_B, target, b, blockNumber, previous, selected);
        proofs[2] = _proofPair(ORACLE_C, target, c, blockNumber, previous, selected);
    }

    function _startedMemeRace() internal returns (AssetRace race) {
        race = _createRaceForCategory(3, AssetRace.RaceCategory.MEME);
        _bet(race, ALICE, 0, 10);
        _bet(race, BOB, 1, 10);
        _bet(race, CHARLIE, 2, 10);
        uint256 t0 = race.getRace(0).bettingEndTime;
        vm.warp(t0);
        race.startRaceWithProofs(0, _memeProofs(t0, 100e18, 100e18, 100e18, false));
    }

    function _createRace(uint8 count) internal returns (AssetRace race) {
        return _createRaceForCategory(count, AssetRace.RaceCategory.STOCK);
    }

    function _createRaceForCategory(uint8 count, AssetRace.RaceCategory category) internal returns (AssetRace race) {
        race = new AssetRace();
        AssetRace.CandidateInput[] memory candidates = new AssetRace.CandidateInput[](count);
        bytes32[3] memory assetIds = [bytes32("NVDA"), bytes32("TSLA"), bytes32("MU")];
        if (category == AssetRace.RaceCategory.MEME) assetIds = [bytes32("AI"), bytes32("CASHCAT"), bytes32("CHUMP")];
        bytes32[3] memory oracleIds = [ORACLE_A, ORACLE_B, ORACLE_C];
        for (uint8 i = 0; i < count; ++i) {
            candidates[i] = AssetRace.CandidateInput({
                category: category,
                assetId: assetIds[i],
                oracle: address(adapter),
                oracleId: oracleIds[i],
                expectedDecimals: DECIMALS,
                maxPriceAge: 60,
                maxEndpointLag: 0
            });
            race.setApprovedAsset(candidates[i], true);
        }
        race.createRace(
            AssetRace.RaceConfigInput({
                category: category,
                bettingStartTime: uint64(block.timestamp),
                bettingEndTime: uint64(block.timestamp + 10),
                raceDuration: 10,
                startGrace: 60,
                resolutionGrace: 60,
                maxOracleTimestampSkew: 2,
                feeBp: 0,
                minActiveContenders: 2,
                minStake: 1,
                maxStakePerWallet: 100
            }),
            candidates
        );
    }

    function _bet(AssetRace race, address bettor, uint8 assetIndex, uint256 amount) internal {
        vm.deal(bettor, amount);
        vm.prank(bettor);
        race.bet{value: amount}(0, assetIndex, amount);
    }
}
