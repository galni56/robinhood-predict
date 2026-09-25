// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AssetRace} from "../src/AssetRace.sol";
import {MockRaceOracle} from "../src/mocks/MockRaceOracle.sol";

contract ReentrantRaceReceiver {
    AssetRace private immutable race;
    uint256 private raceId;
    bool public reentryAttempted;
    bool public reentrySucceeded;

    constructor(AssetRace _race) {
        race = _race;
    }

    function placeBet(uint256 targetRaceId, uint8 assetIndex) external payable {
        raceId = targetRaceId;
        race.bet{value: msg.value}(targetRaceId, assetIndex, msg.value);
    }

    function claim() external {
        race.claim(raceId);
    }

    receive() external payable {
        reentryAttempted = true;
        (reentrySucceeded,) = address(race).call(abi.encodeCall(AssetRace.claim, (raceId)));
    }
}

contract RejectingRaceReceiver {
    AssetRace private immutable race;

    constructor(AssetRace _race) {
        race = _race;
    }

    function placeBet(uint256 raceId, uint8 assetIndex) external payable {
        race.bet{value: msg.value}(raceId, assetIndex, msg.value);
    }

    function claim(uint256 raceId) external {
        race.claim(raceId);
    }

    receive() external payable {
        revert("reject ETH");
    }
}

contract AssetRaceTest is Test {
    uint256 internal constant UNIT = 1e6;
    uint8 internal constant DECIMALS = 8;

    MockRaceOracle internal oracle;
    AssetRace internal race;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal charlie = address(0xC4A511E);
    address internal dave = address(0xDA7E);
    address internal erin = address(0xE21A);

    function setUp() public {
        vm.warp(1_000_000);
        oracle = new MockRaceOracle();
        race = new AssetRace();

        _fund(address(this));
        _fund(alice);
        _fund(bob);
        _fund(charlie);
        _fund(dave);
        _fund(erin);
    }

    function _fund(address user) internal {
        vm.deal(user, 100_000 * UNIT);
    }

    function _config(uint8 minimumActive, uint16 feeBp)
        internal
        view
        returns (AssetRace.RaceConfigInput memory config)
    {
        config = AssetRace.RaceConfigInput({
            category: AssetRace.RaceCategory.STOCK,
            bettingStartTime: uint64(block.timestamp),
            bettingEndTime: uint64(block.timestamp + 100),
            raceDuration: 60,
            startGrace: 20,
            resolutionGrace: 20,
            maxOracleTimestampSkew: 5,
            feeBp: feeBp,
            minActiveContenders: minimumActive,
            minStake: UNIT,
            maxStakePerWallet: 1_000 * UNIT
        });
    }

    function _candidates(uint8 count) internal returns (AssetRace.CandidateInput[] memory candidates) {
        candidates = new AssetRace.CandidateInput[](count);
        for (uint8 i = 0; i < count; ++i) {
            bytes32 id = bytes32(uint256(i + 1));
            candidates[i] = AssetRace.CandidateInput({
                category: AssetRace.RaceCategory.STOCK,
                assetId: keccak256(abi.encodePacked("ASSET", i)),
                oracle: address(oracle),
                oracleId: id,
                expectedDecimals: DECIMALS,
                maxPriceAge: 300,
                maxEndpointLag: 300
            });
            oracle.setObservation(id, 100e8, DECIMALS, block.timestamp, bytes32(uint256(1)));
            race.setApprovedAsset(candidates[i], true);
        }
    }

    function _create(uint8 count) internal returns (uint256) {
        return race.createRace(_config(2, 0), _candidates(count));
    }

    function _create(uint8 count, uint16 feeBp) internal returns (uint256) {
        return race.createRace(_config(2, feeBp), _candidates(count));
    }

    function _bet(uint256 raceId, address user, uint8 assetIndex, uint256 amount) internal {
        vm.prank(user);
        race.bet{value: amount}(raceId, assetIndex, amount);
    }

    function _refresh(uint8 count, uint256[] memory prices, uint8[] memory decimals_) internal {
        for (uint8 i = 0; i < count; ++i) {
            oracle.setObservation(
                bytes32(uint256(i + 1)), prices[i], decimals_[i], block.timestamp, bytes32(uint256(block.timestamp + i))
            );
        }
    }

    function _uniformDecimals(uint8 count) internal pure returns (uint8[] memory values) {
        values = new uint8[](count);
        for (uint8 i = 0; i < count; ++i) {
            values[i] = DECIMALS;
        }
    }

    function _startWithTwo(uint256 raceId, uint8 candidateCount) internal {
        _bet(raceId, alice, 0, 10 * UNIT);
        _bet(raceId, bob, 1, 10 * UNIT);
        AssetRace.Race memory data = race.getRace(raceId);
        vm.warp(data.bettingEndTime);
        uint256[] memory prices = new uint256[](candidateCount);
        for (uint8 i = 0; i < candidateCount; ++i) {
            prices[i] = 100e8;
        }
        _refresh(candidateCount, prices, _uniformDecimals(candidateCount));
        race.startRace(raceId);
    }

    function _resolve(uint256 raceId, uint256[] memory endPrices, uint8[] memory decimals_) internal {
        AssetRace.Race memory data = race.getRace(raceId);
        vm.warp(data.raceEndTime);
        _refresh(uint8(endPrices.length), endPrices, decimals_);
        race.captureEndSnapshots(raceId, _proofs(data.candidateCount));
        race.resolveRace(raceId);
    }

    function _proofs(uint8 count) internal pure returns (bytes[] memory proofs) {
        proofs = new bytes[](count);
    }

    function test_CreateRace_StoresFrozenConfigurationAndCandidates() public {
        AssetRace.RaceConfigInput memory config = _config(2, 237);
        AssetRace.CandidateInput[] memory candidates = _candidates(4);
        uint256 id = race.createRace(config, candidates);

        AssetRace.Race memory data = race.getRace(id);
        assertEq(uint8(data.category), uint8(AssetRace.RaceCategory.STOCK));
        assertEq(uint8(data.status), uint8(AssetRace.RaceStatus.BETTING));
        assertEq(data.candidateCount, 4);
        assertEq(data.minActiveContenders, 2);
        assertEq(data.feeBp, 237);
        assertEq(data.minStake, UNIT);
        assertEq(data.maxStakePerWallet, 1_000 * UNIT);
        assertEq(race.getRaceAsset(id, 3).oracleId, bytes32(uint256(4)));
    }

    function test_CreateRace_AllowsTwoAndSixCandidates() public {
        race.createRace(_config(2, 0), _candidates(2));
        race.createRace(_config(2, 0), _candidates(6));
        assertEq(race.raceCount(), 2);
    }

    function test_CreateRace_RejectsCandidateCountOutsideBounds() public {
        AssetRace.RaceConfigInput memory config = _config(2, 0);
        AssetRace.CandidateInput[] memory tooFewCandidates = _candidates(1);
        AssetRace.CandidateInput[] memory tooManyCandidates = _candidates(7);

        vm.expectRevert(AssetRace.InvalidCandidateCount.selector);
        race.createRace(config, tooFewCandidates);

        vm.expectRevert(AssetRace.InvalidCandidateCount.selector);
        race.createRace(config, tooManyCandidates);
    }

    function test_CreateRace_RejectsFeeAboveBasisPointDenominator() public {
        AssetRace.RaceConfigInput memory config = _config(2, 10_001);
        AssetRace.CandidateInput[] memory candidates = _candidates(2);

        vm.expectRevert(AssetRace.FeeExceedsMaximum.selector);
        race.createRace(config, candidates);
    }

    function test_CreateRace_RejectsDuplicateAssetIds() public {
        AssetRace.CandidateInput[] memory candidates = _candidates(2);
        candidates[1].assetId = candidates[0].assetId;
        vm.expectRevert(AssetRace.DuplicateAsset.selector);
        race.createRace(_config(2, 0), candidates);
    }

    function test_CreateRace_RejectsDuplicateOracleFeeds() public {
        AssetRace.CandidateInput[] memory candidates = _candidates(2);
        candidates[1].oracleId = candidates[0].oracleId;
        vm.expectRevert(AssetRace.DuplicateOracleFeed.selector);
        race.createRace(_config(2, 0), candidates);
    }

    function test_ConfigurationIsFrozenPerRace() public {
        AssetRace.RaceConfigInput memory first = _config(2, 200);
        uint256 firstId = race.createRace(first, _candidates(2));

        AssetRace.RaceConfigInput memory second = _config(3, 500);
        second.minStake = 5 * UNIT;
        second.maxStakePerWallet = 77 * UNIT;
        race.createRace(second, _candidates(3));

        AssetRace.Race memory original = race.getRace(firstId);
        assertEq(original.feeBp, 200);
        assertEq(original.minActiveContenders, 2);
        assertEq(original.minStake, UNIT);
        assertEq(original.maxStakePerWallet, 1_000 * UNIT);
        assertEq(original.raceDuration, 60);
    }

    function test_CreateRace_IsOwnerOnlyAndPauseAffectsOnlyNewActivity() public {
        AssetRace.RaceConfigInput memory unauthorizedConfig = _config(2, 0);
        AssetRace.CandidateInput[] memory unauthorizedCandidates = _candidates(2);
        vm.startPrank(alice);
        vm.expectRevert();
        race.createRace(unauthorizedConfig, unauthorizedCandidates);
        vm.stopPrank();

        uint256 id = _create(2);
        race.setNewActivityPaused(true);
        AssetRace.RaceConfigInput memory pausedConfig = _config(2, 0);
        AssetRace.CandidateInput[] memory pausedCandidates = _candidates(2);
        vm.expectRevert(AssetRace.ActivityPaused.selector);
        race.createRace(pausedConfig, pausedCandidates);
        vm.prank(alice);
        vm.expectRevert(AssetRace.ActivityPaused.selector);
        race.bet{value: UNIT}(id, 0, UNIT);

        AssetRace.Race memory data = race.getRace(id);
        vm.warp(uint256(data.bettingEndTime) + data.startGrace + 1);
        race.cancelUnstartedRace(id);
        assertEq(uint8(race.getRace(id).status), uint8(AssetRace.RaceStatus.CANCELLED));
    }

    function test_Bet_EnforcesBettingWindow() public {
        AssetRace.RaceConfigInput memory config = _config(2, 0);
        config.bettingStartTime = uint64(block.timestamp + 10);
        config.bettingEndTime = uint64(block.timestamp + 20);
        uint256 id = race.createRace(config, _candidates(2));

        vm.prank(alice);
        vm.expectRevert(AssetRace.BettingNotOpen.selector);
        race.bet{value: UNIT}(id, 0, UNIT);

        vm.warp(config.bettingStartTime);
        _bet(id, alice, 0, UNIT);

        vm.warp(config.bettingEndTime);
        vm.prank(bob);
        vm.expectRevert(AssetRace.BettingNotOpen.selector);
        race.bet{value: UNIT}(id, 1, UNIT);
    }

    function test_Bet_OneAssetPerWalletAndSameAssetTopUps() public {
        uint256 id = _create(3);
        _bet(id, alice, 1, 20 * UNIT);
        _bet(id, alice, 1, 30 * UNIT);

        AssetRace.Position memory position = race.getPosition(id, alice);
        assertEq(position.assetIndex, 1);
        assertEq(position.stake, 50 * UNIT);
        assertEq(race.getRaceAsset(id, 1).pool, 50 * UNIT);

        vm.prank(alice);
        vm.expectRevert(AssetRace.WrongAsset.selector);
        race.bet{value: UNIT}(id, 2, UNIT);
    }

    function test_Bet_EnforcesMinimumFirstStakeAndCumulativeMaximum() public {
        AssetRace.RaceConfigInput memory config = _config(2, 0);
        config.minStake = 10 * UNIT;
        config.maxStakePerWallet = 50 * UNIT;
        uint256 id = race.createRace(config, _candidates(2));

        vm.prank(alice);
        vm.expectRevert(AssetRace.StakeBelowMinimum.selector);
        race.bet{value: 9 * UNIT}(id, 0, 9 * UNIT);

        _bet(id, alice, 0, 20 * UNIT);
        _bet(id, alice, 0, 30 * UNIT);
        assertEq(race.getPosition(id, alice).stake, 50 * UNIT);

        vm.prank(alice);
        vm.expectRevert(AssetRace.StakeExceedsMaximum.selector);
        race.bet{value: 1}(id, 0, 1);
    }

    function test_Bet_RequiresExactMsgValue() public {
        uint256 id = _create(2);

        vm.prank(alice);
        vm.expectRevert(AssetRace.IncorrectEthAmount.selector);
        race.bet{value: UNIT - 1}(id, 0, UNIT);

        assertFalse(race.getPosition(id, alice).exists);
        assertEq(address(race).balance, 0);
    }

    function test_DirectEthTransfersRevert() public {
        (bool success,) = address(race).call{value: 1}("");
        assertFalse(success);
        assertEq(address(race).balance, 0);
    }

    function test_StartRace_ExcludesInactiveZeroPoolCandidates() public {
        uint256 id = _create(3);
        _startWithTwo(id, 3);

        AssetRace.Race memory data = race.getRace(id);
        assertEq(uint8(data.status), uint8(AssetRace.RaceStatus.RUNNING));
        assertEq(data.activeCount, 2);
        assertTrue(race.getRaceAsset(id, 0).active);
        assertTrue(race.getRaceAsset(id, 1).active);
        assertFalse(race.getRaceAsset(id, 2).active);
        assertEq(race.getRaceAsset(id, 2).startPrice, 0);
    }

    function test_StartRace_OneActiveAssetCancelsWithFullRefund() public {
        uint256 id = _create(4, 200);
        _bet(id, alice, 2, 25 * UNIT);
        vm.warp(race.getRace(id).bettingEndTime);
        race.startRace(id);

        assertEq(uint8(race.getRace(id).status), uint8(AssetRace.RaceStatus.CANCELLED));
        assertEq(race.accumulatedFees(), 0);
        uint256 before = alice.balance;
        vm.prank(alice);
        race.refund(id);
        assertEq(alice.balance - before, 25 * UNIT);
    }

    function test_StartRace_UsesAtomicActualT0AndExactDuration() public {
        uint256 id = _create(2);
        _bet(id, alice, 0, UNIT);
        _bet(id, bob, 1, UNIT);
        AssetRace.Race memory beforeStart = race.getRace(id);
        vm.warp(uint256(beforeStart.bettingEndTime) + 7);
        uint256[] memory prices = new uint256[](2);
        prices[0] = 100e8;
        prices[1] = 100e8;
        _refresh(2, prices, _uniformDecimals(2));
        race.startRace(id);

        AssetRace.Race memory data = race.getRace(id);
        assertEq(data.actualStartTime, block.timestamp);
        assertEq(data.raceEndTime, block.timestamp + data.raceDuration);
        assertGt(data.actualStartTime, data.bettingEndTime);
    }

    function test_StartRace_CannotExecuteTwiceAndP0WritesOnce() public {
        uint256 id = _create(2);
        _startWithTwo(id, 2);
        uint256 frozen = race.getRaceAsset(id, 0).startPrice;
        oracle.setObservation(bytes32(uint256(1)), 999e8, DECIMALS, block.timestamp, bytes32(uint256(99)));

        vm.expectRevert(AssetRace.AlreadyStarted.selector);
        race.startRace(id);
        assertEq(race.getRaceAsset(id, 0).startPrice, frozen);
    }

    function test_StartRace_NoPartialSnapshotsWhenOneOracleFails() public {
        uint256 id = _create(3);
        _bet(id, alice, 0, UNIT);
        _bet(id, bob, 1, UNIT);
        vm.warp(race.getRace(id).bettingEndTime);
        oracle.setObservation(bytes32(uint256(1)), 100e8, DECIMALS, block.timestamp, bytes32(uint256(10)));
        oracle.setShouldRevert(bytes32(uint256(2)), true);

        vm.expectRevert("mock oracle failure");
        race.startRace(id);
        assertEq(race.getRaceAsset(id, 0).startPrice, 0);
        assertFalse(race.getRaceAsset(id, 0).active);
        assertEq(uint8(race.getRace(id).status), uint8(AssetRace.RaceStatus.BETTING));
    }

    function test_StartGraceExpiryRequiresPermissionlessCancellation() public {
        uint256 id = _create(2);
        _bet(id, alice, 0, UNIT);
        _bet(id, bob, 1, UNIT);
        AssetRace.Race memory data = race.getRace(id);
        vm.warp(uint256(data.bettingEndTime) + data.startGrace + 1);

        vm.expectRevert(AssetRace.StartWindowExpired.selector);
        race.startRace(id);
        vm.prank(charlie);
        race.cancelUnstartedRace(id);
        assertEq(uint8(race.getRace(id).status), uint8(AssetRace.RaceStatus.CANCELLED));
    }

    function test_StartRace_RejectsZeroOraclePrice() public {
        uint256 id = _create(2);
        _bet(id, alice, 0, UNIT);
        _bet(id, bob, 1, UNIT);
        vm.warp(race.getRace(id).bettingEndTime);
        oracle.setObservation(bytes32(uint256(1)), 0, DECIMALS, block.timestamp, bytes32(uint256(2)));
        vm.expectRevert(AssetRace.InvalidOraclePrice.selector);
        race.startRace(id);
    }

    function test_StartRace_RejectsStaleOracle() public {
        AssetRace.CandidateInput[] memory candidates = _candidates(2);
        candidates[0].maxPriceAge = 5;
        race.setApprovedAsset(candidates[0], true);
        uint256 id = race.createRace(_config(2, 0), candidates);
        _bet(id, alice, 0, UNIT);
        _bet(id, bob, 1, UNIT);
        vm.warp(race.getRace(id).bettingEndTime);
        oracle.setObservation(bytes32(uint256(1)), 100e8, DECIMALS, block.timestamp - 6, bytes32(uint256(2)));
        oracle.setObservation(bytes32(uint256(2)), 100e8, DECIMALS, block.timestamp, bytes32(uint256(2)));
        vm.expectRevert(AssetRace.OraclePriceStale.selector);
        race.startRace(id);
    }

    function test_StartRace_RejectsFutureTimestamp() public {
        uint256 id = _create(2);
        _bet(id, alice, 0, UNIT);
        _bet(id, bob, 1, UNIT);
        vm.warp(race.getRace(id).bettingEndTime);
        oracle.setObservation(bytes32(uint256(1)), 100e8, DECIMALS, block.timestamp + 1, bytes32(uint256(2)));
        vm.expectRevert(AssetRace.InvalidOracleTimestamp.selector);
        race.startRace(id);
    }

    function test_StartRace_RejectsMismatchedDecimals() public {
        uint256 id = _create(2);
        _bet(id, alice, 0, UNIT);
        _bet(id, bob, 1, UNIT);
        vm.warp(race.getRace(id).bettingEndTime);
        oracle.setObservation(bytes32(uint256(1)), 100e18, 18, block.timestamp, bytes32(uint256(2)));
        vm.expectRevert(AssetRace.InvalidOracleDecimals.selector);
        race.startRace(id);
    }

    function test_StartRace_RejectsCrossFeedTimestampSkew() public {
        uint256 id = _create(2);
        _bet(id, alice, 0, UNIT);
        _bet(id, bob, 1, UNIT);
        vm.warp(race.getRace(id).bettingEndTime);
        oracle.setObservation(bytes32(uint256(1)), 100e8, DECIMALS, block.timestamp - 6, bytes32(uint256(2)));
        oracle.setObservation(bytes32(uint256(2)), 100e8, DECIMALS, block.timestamp, bytes32(uint256(2)));
        vm.expectRevert(AssetRace.OracleTimestampSkew.selector);
        race.startRace(id);
    }

    function test_ResolveRace_UniquePositiveWinner() public {
        uint256 id = _create(3);
        _startWithTwo(id, 3);
        uint256[] memory prices = new uint256[](3);
        prices[0] = 110e8;
        prices[1] = 105e8;
        prices[2] = 999e8;
        _resolve(id, prices, _uniformDecimals(3));
        assertEq(uint8(race.getRace(id).status), uint8(AssetRace.RaceStatus.RESOLVED));
        assertEq(race.getRace(id).winningAssetIndex, 0);
        assertEq(race.getRaceAsset(id, 0).returnValue, 0.1e18);
    }

    function test_ResolveRace_FinalEndpointBeatsHigherIntraracePeak() public {
        uint256 id = _create(2);
        _startWithTwo(id, 2);

        vm.warp(block.timestamp + 30);
        oracle.setObservation(bytes32(uint256(1)), 150e8, DECIMALS, block.timestamp, bytes32(uint256(20)));
        oracle.setObservation(bytes32(uint256(2)), 108e8, DECIMALS, block.timestamp, bytes32(uint256(20)));

        vm.warp(race.getRace(id).raceEndTime);
        uint256[] memory finalPrices = new uint256[](2);
        finalPrices[0] = 103e8;
        finalPrices[1] = 110e8;
        _refresh(2, finalPrices, _uniformDecimals(2));
        race.captureEndSnapshots(id, _proofs(2));
        race.resolveRace(id);

        assertEq(race.getRace(id).winningAssetIndex, 1);
        assertEq(race.getRaceAsset(id, 0).endPrice, 103e8);
        assertEq(race.getRaceAsset(id, 1).endPrice, 110e8);
    }

    function test_ResolveRace_MixedPositiveAndNegativeWinner() public {
        uint256 id = _create(3);
        _bet(id, alice, 0, UNIT);
        _bet(id, bob, 1, UNIT);
        _bet(id, charlie, 2, UNIT);
        vm.warp(race.getRace(id).bettingEndTime);
        uint256[] memory startPrices = new uint256[](3);
        startPrices[0] = 100e8;
        startPrices[1] = 100e8;
        startPrices[2] = 100e8;
        _refresh(3, startPrices, _uniformDecimals(3));
        race.startRace(id);

        uint256[] memory endPrices = new uint256[](3);
        endPrices[0] = 95e8;
        endPrices[1] = 102e8;
        endPrices[2] = 99e8;
        _resolve(id, endPrices, _uniformDecimals(3));
        assertEq(race.getRace(id).winningAssetIndex, 1);
    }

    function test_ResolveRace_AllNegativeStillHasUniqueWinner() public {
        uint256 id = _create(3);
        _bet(id, alice, 0, UNIT);
        _bet(id, bob, 1, UNIT);
        _bet(id, charlie, 2, UNIT);
        vm.warp(race.getRace(id).bettingEndTime);
        uint256[] memory startPrices = new uint256[](3);
        startPrices[0] = 100e8;
        startPrices[1] = 100e8;
        startPrices[2] = 100e8;
        _refresh(3, startPrices, _uniformDecimals(3));
        race.startRace(id);

        uint256[] memory endPrices = new uint256[](3);
        endPrices[0] = 92e8;
        endPrices[1] = 97e8;
        endPrices[2] = 89e8;
        _resolve(id, endPrices, _uniformDecimals(3));
        assertEq(race.getRace(id).winningAssetIndex, 1);
        assertEq(race.getRaceAsset(id, 1).returnValue, -0.03e18);
    }

    function test_ResolveRace_ExactTopTieVoids() public {
        uint256 id = _create(3);
        _bet(id, alice, 0, UNIT);
        _bet(id, bob, 1, UNIT);
        _bet(id, charlie, 2, UNIT);
        vm.warp(race.getRace(id).bettingEndTime);
        uint256[] memory starts = new uint256[](3);
        starts[0] = 100e8;
        starts[1] = 200e8;
        starts[2] = 50e8;
        _refresh(3, starts, _uniformDecimals(3));
        race.startRace(id);

        uint256[] memory ends = new uint256[](3);
        ends[0] = 110e8;
        ends[1] = 220e8;
        ends[2] = 54e8;
        _resolve(id, ends, _uniformDecimals(3));
        assertEq(uint8(race.getRace(id).status), uint8(AssetRace.RaceStatus.VOID));
        assertEq(race.accumulatedFees(), 0);
    }

    function test_ResolveRace_AllZeroVoids() public {
        uint256 id = _create(2);
        _startWithTwo(id, 2);
        uint256[] memory ends = new uint256[](2);
        ends[0] = 100e8;
        ends[1] = 100e8;
        _resolve(id, ends, _uniformDecimals(2));
        assertEq(uint8(race.getRace(id).status), uint8(AssetRace.RaceStatus.VOID));
    }

    function test_ReturnPrecisionUsesRawSettlementValueNotDisplayRounding() public {
        uint256 id = _create(2);
        _bet(id, alice, 0, UNIT);
        _bet(id, bob, 1, UNIT);
        vm.warp(race.getRace(id).bettingEndTime);
        uint256[] memory starts = new uint256[](2);
        starts[0] = 100_000_000;
        starts[1] = 100_000_000;
        _refresh(2, starts, _uniformDecimals(2));
        race.startRace(id);

        uint256[] memory ends = new uint256[](2);
        ends[0] = 102_120_001;
        ends[1] = 102_120_000;
        _resolve(id, ends, _uniformDecimals(2));
        assertEq(race.getRace(id).winningAssetIndex, 0);
        assertGt(race.getRaceAsset(id, 0).returnValue, race.getRaceAsset(id, 1).returnValue);
    }

    function test_ReturnComparisonSupportsDifferentOracleDecimals() public {
        AssetRace.CandidateInput[] memory candidates = _candidates(2);
        candidates[1].expectedDecimals = 18;
        race.setApprovedAsset(candidates[1], true);
        uint256 id = race.createRace(_config(2, 0), candidates);
        _bet(id, alice, 0, UNIT);
        _bet(id, bob, 1, UNIT);
        vm.warp(race.getRace(id).bettingEndTime);
        oracle.setObservation(bytes32(uint256(1)), 100e8, 8, block.timestamp, bytes32(uint256(10)));
        oracle.setObservation(bytes32(uint256(2)), 1e18, 18, block.timestamp, bytes32(uint256(10)));
        race.startRace(id);

        vm.warp(race.getRace(id).raceEndTime);
        oracle.setObservation(bytes32(uint256(1)), 110e8, 8, block.timestamp, bytes32(uint256(11)));
        oracle.setObservation(bytes32(uint256(2)), 1.05e18, 18, block.timestamp, bytes32(uint256(11)));
        race.captureEndSnapshots(id, _proofs(2));
        race.resolveRace(id);
        assertEq(race.getRace(id).winningAssetIndex, 0);
    }

    function test_ResolveRace_NoPartialP1SnapshotsWhenOneOracleFails() public {
        uint256 id = _create(2);
        _startWithTwo(id, 2);
        vm.warp(race.getRace(id).raceEndTime);
        oracle.setObservation(bytes32(uint256(1)), 110e8, DECIMALS, block.timestamp, bytes32(uint256(11)));
        oracle.setShouldRevert(bytes32(uint256(2)), true);
        vm.expectRevert("mock oracle failure");
        race.captureEndSnapshots(id, _proofs(2));
        assertEq(race.getRaceAsset(id, 0).endPrice, 0);
        assertEq(uint8(race.getRace(id).status), uint8(AssetRace.RaceStatus.RUNNING));
    }

    function test_CaptureEndSnapshots_RejectsObservationBeforeEndpointWithoutPartialSnapshots() public {
        AssetRace.CandidateInput[] memory candidates = _candidates(2);
        candidates[0].maxPriceAge = 5;
        race.setApprovedAsset(candidates[0], true);
        uint256 id = race.createRace(_config(2, 0), candidates);
        _startWithTwo(id, 2);
        vm.warp(race.getRace(id).raceEndTime);
        oracle.setObservation(bytes32(uint256(1)), 110e8, DECIMALS, block.timestamp - 6, bytes32(uint256(11)));
        oracle.setObservation(bytes32(uint256(2)), 90e8, DECIMALS, block.timestamp, bytes32(uint256(11)));

        vm.expectRevert(AssetRace.InvalidOracleTimestamp.selector);
        race.captureEndSnapshots(id, _proofs(2));
        assertEq(race.getRaceAsset(id, 0).endPrice, 0);
        assertEq(race.getRaceAsset(id, 1).endPrice, 0);
        assertEq(uint8(race.getRace(id).status), uint8(AssetRace.RaceStatus.RUNNING));
    }

    function test_ResolveRace_RejectsCrossFeedTimestampSkewWithoutPartialSnapshots() public {
        uint256 id = _create(2);
        _startWithTwo(id, 2);
        vm.warp(race.getRace(id).raceEndTime + 6);
        oracle.setObservation(bytes32(uint256(1)), 110e8, DECIMALS, block.timestamp - 6, bytes32(uint256(11)));
        oracle.setObservation(bytes32(uint256(2)), 90e8, DECIMALS, block.timestamp, bytes32(uint256(11)));

        vm.expectRevert(AssetRace.OracleTimestampSkew.selector);
        race.captureEndSnapshots(id, _proofs(2));
        assertEq(race.getRaceAsset(id, 0).endPrice, 0);
        assertEq(race.getRaceAsset(id, 1).endPrice, 0);
        assertEq(uint8(race.getRace(id).status), uint8(AssetRace.RaceStatus.RUNNING));
    }

    function test_ResolveRace_CannotExecuteTwiceAndP1WritesOnce() public {
        uint256 id = _create(2);
        _startWithTwo(id, 2);
        uint256[] memory ends = new uint256[](2);
        ends[0] = 110e8;
        ends[1] = 90e8;
        _resolve(id, ends, _uniformDecimals(2));
        uint256 frozen = race.getRaceAsset(id, 0).endPrice;

        vm.expectRevert(AssetRace.InvalidRaceStatus.selector);
        race.captureEndSnapshots(id, _proofs(2));
        vm.expectRevert(AssetRace.InvalidRaceStatus.selector);
        race.resolveRace(id);
        assertEq(race.getRaceAsset(id, 0).endPrice, frozen);
    }

    function test_CapturedEndpointCanResolveArbitrarilyLaterWithoutChangingP1() public {
        uint256 id = _create(2);
        _startWithTwo(id, 2);
        vm.warp(race.getRace(id).raceEndTime);
        uint256[] memory ends = new uint256[](2);
        ends[0] = 110e8;
        ends[1] = 105e8;
        _refresh(2, ends, _uniformDecimals(2));
        race.captureEndSnapshots(id, _proofs(2));

        vm.warp(block.timestamp + 365 days);
        oracle.setObservation(bytes32(uint256(1)), 1e8, DECIMALS, block.timestamp, bytes32(uint256(99)));
        oracle.setObservation(bytes32(uint256(2)), 999e8, DECIMALS, block.timestamp, bytes32(uint256(99)));
        vm.expectRevert(AssetRace.EndSnapshotsAlreadyCaptured.selector);
        race.voidExpiredRace(id);
        race.resolveRace(id);

        assertEq(race.getRace(id).winningAssetIndex, 0);
        assertEq(race.getRaceAsset(id, 0).endPrice, 110e8);
        assertEq(race.getRaceAsset(id, 1).endPrice, 105e8);
    }

    function test_CapturedEndpointCannotBeOverwrittenBeforeResolve() public {
        uint256 id = _create(2);
        _startWithTwo(id, 2);
        vm.warp(race.getRace(id).raceEndTime);
        uint256[] memory ends = new uint256[](2);
        ends[0] = 110e8;
        ends[1] = 105e8;
        _refresh(2, ends, _uniformDecimals(2));
        race.captureEndSnapshots(id, _proofs(2));

        oracle.setObservation(bytes32(uint256(1)), 1e8, DECIMALS, block.timestamp, bytes32(uint256(99)));
        vm.expectRevert(AssetRace.EndSnapshotsAlreadyCaptured.selector);
        race.captureEndSnapshots(id, _proofs(2));
        assertEq(race.getRaceAsset(id, 0).endPrice, 110e8);
    }

    function test_EndpointCallerCannotSupplyPriceDataToMockAdapter() public {
        uint256 id = _create(2);
        _startWithTwo(id, 2);
        vm.warp(race.getRace(id).raceEndTime);
        uint256[] memory ends = new uint256[](2);
        ends[0] = 110e8;
        ends[1] = 105e8;
        _refresh(2, ends, _uniformDecimals(2));
        bytes[] memory proofs = _proofs(2);
        proofs[0] = abi.encode(uint256(999e8));

        vm.expectRevert("unexpected endpoint proof");
        race.captureEndSnapshots(id, proofs);
        assertFalse(race.getRace(id).endSnapshotsCaptured);
    }

    function test_CaptureRejectsObservationBeyondFrozenEndpointLag() public {
        AssetRace.CandidateInput[] memory candidates = _candidates(2);
        candidates[0].maxEndpointLag = 5;
        race.setApprovedAsset(candidates[0], true);
        uint256 id = race.createRace(_config(2, 0), candidates);
        _startWithTwo(id, 2);
        vm.warp(race.getRace(id).raceEndTime + 6);
        oracle.setObservation(bytes32(uint256(1)), 110e8, DECIMALS, block.timestamp, bytes32(uint256(11)));
        oracle.setObservation(bytes32(uint256(2)), 105e8, DECIMALS, block.timestamp, bytes32(uint256(11)));

        vm.expectRevert(AssetRace.OraclePriceStale.selector);
        race.captureEndSnapshots(id, _proofs(2));
        assertFalse(race.getRace(id).endSnapshotsCaptured);
    }

    function test_EndGraceExpiryVoidsAndRefunds() public {
        uint256 id = _create(2, 200);
        _startWithTwo(id, 2);
        AssetRace.Race memory data = race.getRace(id);
        vm.warp(uint256(data.raceEndTime) + data.resolutionGrace + 1);

        vm.expectRevert(AssetRace.EndSnapshotsNotCaptured.selector);
        race.resolveRace(id);
        vm.prank(charlie);
        race.voidExpiredRace(id);
        assertEq(uint8(race.getRace(id).status), uint8(AssetRace.RaceStatus.VOID));
        assertEq(race.accumulatedFees(), 0);

        uint256 before = alice.balance;
        vm.prank(alice);
        race.refund(id);
        assertEq(alice.balance - before, 10 * UNIT);
    }

    function test_PayoutExample_500_200_200_100_PepeWinner() public {
        uint256 id = _create(4, 200);
        _bet(id, charlie, 0, 500 * UNIT);
        _bet(id, alice, 1, 50 * UNIT);
        _bet(id, bob, 1, 150 * UNIT);
        _bet(id, dave, 2, 200 * UNIT);
        _bet(id, erin, 3, 100 * UNIT);

        vm.warp(race.getRace(id).bettingEndTime);
        uint256[] memory starts = new uint256[](4);
        for (uint8 i = 0; i < 4; ++i) {
            starts[i] = 100e8;
        }
        _refresh(4, starts, _uniformDecimals(4));
        race.startRace(id);

        uint256[] memory ends = new uint256[](4);
        ends[0] = 101e8;
        ends[1] = 105e8;
        ends[2] = 102e8;
        ends[3] = 100e8;
        _resolve(id, ends, _uniformDecimals(4));

        AssetRace.Race memory data = race.getRace(id);
        assertEq(data.winningAssetIndex, 1);
        assertEq(data.winningPool, 200 * UNIT);
        assertEq(data.protocolFee, 16 * UNIT);
        assertEq(data.distributableLosingPool, 784 * UNIT);

        uint256 before = alice.balance;
        vm.prank(alice);
        uint256 payout = race.claim(id);
        assertEq(payout, 246 * UNIT);
        assertEq(alice.balance - before, 246 * UNIT);
    }

    function test_MultipleWinningUsersSplitLosingPoolProportionally() public {
        uint256 id = _create(2);
        _bet(id, alice, 0, 30 * UNIT);
        _bet(id, bob, 0, 70 * UNIT);
        _bet(id, charlie, 1, 100 * UNIT);
        vm.warp(race.getRace(id).bettingEndTime);
        uint256[] memory starts = new uint256[](2);
        starts[0] = 100e8;
        starts[1] = 100e8;
        _refresh(2, starts, _uniformDecimals(2));
        race.startRace(id);
        uint256[] memory ends = new uint256[](2);
        ends[0] = 110e8;
        ends[1] = 90e8;
        _resolve(id, ends, _uniformDecimals(2));

        vm.prank(alice);
        assertEq(race.claim(id), 60 * UNIT);
        vm.prank(bob);
        assertEq(race.claim(id), 140 * UNIT);
    }

    function test_FeeIsOnlyTakenFromLosingPoolAndCannotConsumePrincipal() public {
        uint256 id = _create(2, 1_000);
        _bet(id, alice, 0, 100 * UNIT);
        _bet(id, bob, 1, 40 * UNIT);
        vm.warp(race.getRace(id).bettingEndTime);
        uint256[] memory starts = new uint256[](2);
        starts[0] = 100e8;
        starts[1] = 100e8;
        _refresh(2, starts, _uniformDecimals(2));
        race.startRace(id);
        uint256[] memory ends = new uint256[](2);
        ends[0] = 101e8;
        ends[1] = 99e8;
        _resolve(id, ends, _uniformDecimals(2));

        assertEq(race.getRace(id).protocolFee, 4 * UNIT);
        vm.prank(alice);
        assertEq(race.claim(id), 136 * UNIT);
    }

    function test_TopUpsUseTotalStakeWithoutTimingWeighting() public {
        uint256 id = _create(2);
        _bet(id, alice, 0, 20 * UNIT);
        vm.warp(block.timestamp + 50);
        _bet(id, alice, 0, 30 * UNIT);
        _bet(id, bob, 0, 50 * UNIT);
        _bet(id, charlie, 1, 100 * UNIT);
        vm.warp(race.getRace(id).bettingEndTime);
        uint256[] memory starts = new uint256[](2);
        starts[0] = 100e8;
        starts[1] = 100e8;
        _refresh(2, starts, _uniformDecimals(2));
        race.startRace(id);
        uint256[] memory ends = new uint256[](2);
        ends[0] = 110e8;
        ends[1] = 90e8;
        _resolve(id, ends, _uniformDecimals(2));

        vm.prank(alice);
        assertEq(race.claim(id), 100 * UNIT);
        vm.prank(bob);
        assertEq(race.claim(id), 100 * UNIT);
    }

    function test_ClaimOnceAndLoserCannotClaim() public {
        uint256 id = _create(2);
        _startWithTwo(id, 2);
        uint256[] memory ends = new uint256[](2);
        ends[0] = 110e8;
        ends[1] = 90e8;
        _resolve(id, ends, _uniformDecimals(2));

        vm.prank(alice);
        race.claim(id);
        vm.prank(alice);
        vm.expectRevert(AssetRace.AlreadySettled.selector);
        race.claim(id);

        vm.prank(bob);
        vm.expectRevert(AssetRace.NoWinningPosition.selector);
        race.claim(id);
    }

    function test_ClaimHasNoDeadlineAfterResolution() public {
        uint256 id = _create(2);
        _startWithTwo(id, 2);
        uint256[] memory ends = new uint256[](2);
        ends[0] = 110e8;
        ends[1] = 90e8;
        _resolve(id, ends, _uniformDecimals(2));

        vm.warp(block.timestamp + 10 * 365 days);
        vm.prank(alice);
        assertEq(race.claim(id), 20 * UNIT);
    }

    function test_RefundOnceAndNoFeeOnVoid() public {
        uint256 id = _create(2, 200);
        _startWithTwo(id, 2);
        uint256[] memory ends = new uint256[](2);
        ends[0] = 100e8;
        ends[1] = 100e8;
        _resolve(id, ends, _uniformDecimals(2));
        assertEq(race.accumulatedFees(), 0);

        vm.prank(alice);
        race.refund(id);
        vm.prank(alice);
        vm.expectRevert(AssetRace.AlreadySettled.selector);
        race.refund(id);
    }

    function test_RefundHasNoDeadlineAfterVoid() public {
        uint256 id = _create(2);
        _startWithTwo(id, 2);
        vm.warp(uint256(race.getRace(id).raceEndTime) + race.getRace(id).resolutionGrace + 1);
        race.voidExpiredRace(id);

        vm.warp(block.timestamp + 10 * 365 days);
        vm.prank(alice);
        assertEq(race.refund(id), 10 * UNIT);
    }

    function test_AggregatePayoutsNeverExceedRacePoolAndDustStaysUnclassified() public {
        uint256 id = _create(2, 333);
        _bet(id, alice, 0, 1 * UNIT);
        _bet(id, bob, 0, 2 * UNIT);
        _bet(id, charlie, 0, 4 * UNIT);
        _bet(id, dave, 1, 10 * UNIT + 1);
        vm.warp(race.getRace(id).bettingEndTime);
        uint256[] memory starts = new uint256[](2);
        starts[0] = 100e8;
        starts[1] = 100e8;
        _refresh(2, starts, _uniformDecimals(2));
        race.startRace(id);
        uint256[] memory ends = new uint256[](2);
        ends[0] = 101e8;
        ends[1] = 99e8;
        _resolve(id, ends, _uniformDecimals(2));

        uint256 totalPayout = 0;
        vm.prank(alice);
        totalPayout += race.claim(id);
        vm.prank(bob);
        totalPayout += race.claim(id);
        vm.prank(charlie);
        totalPayout += race.claim(id);

        AssetRace.Race memory data = race.getRace(id);
        assertLe(totalPayout + data.protocolFee, data.totalPool);
        assertEq(race.accumulatedFees(), data.protocolFee);
        assertEq(address(race).balance, race.totalUserLiability() + race.accumulatedFees());
        assertGt(data.remainingLiability, 0); // deterministic rounding dust stays locked, not fee income
    }

    function test_ProtocolWithdrawalsCannotConsumeUserLiabilities() public {
        uint256 id = _create(2, 200);
        _bet(id, alice, 0, 100 * UNIT);
        _bet(id, bob, 1, 100 * UNIT);
        vm.warp(race.getRace(id).bettingEndTime);
        uint256[] memory starts = new uint256[](2);
        starts[0] = 100e8;
        starts[1] = 100e8;
        _refresh(2, starts, _uniformDecimals(2));
        race.startRace(id);
        uint256[] memory ends = new uint256[](2);
        ends[0] = 110e8;
        ends[1] = 90e8;
        _resolve(id, ends, _uniformDecimals(2));

        assertEq(race.accumulatedFees(), 2 * UNIT);
        vm.expectRevert(AssetRace.InsufficientFeeBalance.selector);
        race.withdrawFees(dave, 2 * UNIT + 1);
        race.withdrawFees(dave, 2 * UNIT);
        assertEq(address(race).balance, race.totalUserLiability());

        vm.prank(alice);
        assertEq(race.claim(id), 198 * UNIT);
        assertEq(address(race).balance, 0);
        assertEq(race.totalUserLiability(), 0);
    }

    function test_ClaimIsReentrancyProtected() public {
        AssetRace guardedRace = new AssetRace();
        AssetRace.CandidateInput[] memory candidates = _candidates(2);
        for (uint256 i = 0; i < candidates.length; ++i) {
            guardedRace.setApprovedAsset(candidates[i], true);
        }
        uint256 id = guardedRace.createRace(_config(2, 0), candidates);
        ReentrantRaceReceiver receiver = new ReentrantRaceReceiver(guardedRace);
        receiver.placeBet{value: 10 * UNIT}(id, 0);
        vm.prank(bob);
        guardedRace.bet{value: 10 * UNIT}(id, 1, 10 * UNIT);

        vm.warp(guardedRace.getRace(id).bettingEndTime);
        uint256[] memory starts = new uint256[](2);
        starts[0] = 100e8;
        starts[1] = 100e8;
        _refresh(2, starts, _uniformDecimals(2));
        guardedRace.startRace(id);

        vm.warp(guardedRace.getRace(id).raceEndTime);
        uint256[] memory ends = new uint256[](2);
        ends[0] = 110e8;
        ends[1] = 90e8;
        _refresh(2, ends, _uniformDecimals(2));
        guardedRace.captureEndSnapshots(id, _proofs(2));
        guardedRace.resolveRace(id);
        receiver.claim();

        assertTrue(receiver.reentryAttempted());
        assertFalse(receiver.reentrySucceeded());
        assertTrue(guardedRace.getPosition(id, address(receiver)).settled);
        assertEq(address(receiver).balance, 20 * UNIT);
        assertEq(address(guardedRace).balance, 0);
    }

    function test_ClaimFailedReceiverRollsBackLiabilityAndSettlement() public {
        uint256 id = _create(2);
        RejectingRaceReceiver rejector = new RejectingRaceReceiver(race);
        rejector.placeBet{value: 10 * UNIT}(id, 0);
        _bet(id, bob, 1, 10 * UNIT);

        vm.warp(race.getRace(id).bettingEndTime);
        uint256[] memory starts = new uint256[](2);
        starts[0] = 100e8;
        starts[1] = 100e8;
        _refresh(2, starts, _uniformDecimals(2));
        race.startRace(id);
        uint256[] memory ends = new uint256[](2);
        ends[0] = 110e8;
        ends[1] = 90e8;
        _resolve(id, ends, _uniformDecimals(2));

        uint256 liabilityBefore = race.totalUserLiability();
        vm.expectRevert(AssetRace.EthTransferFailed.selector);
        rejector.claim(id);

        assertFalse(race.getPosition(id, address(rejector)).settled);
        assertEq(race.totalUserLiability(), liabilityBefore);
        assertEq(address(race).balance, 20 * UNIT);
    }

    function testGas_AssetCounts_2() public {
        _measureGasForAssetCount(2);
    }

    function testGas_AssetCounts_4() public {
        _measureGasForAssetCount(4);
    }

    function testGas_AssetCounts_6() public {
        _measureGasForAssetCount(6);
    }

    function _measureGasForAssetCount(uint8 count) internal {
        AssetRace.RaceConfigInput memory config = _config(2, 200);
        AssetRace.CandidateInput[] memory candidates = _candidates(count);
        uint256 gasBefore = gasleft();
        uint256 id = race.createRace(config, candidates);
        uint256 createGas = gasBefore - gasleft();

        address[5] memory users = [alice, bob, charlie, dave, erin];
        for (uint8 i = 0; i < count; ++i) {
            address user = i < 5 ? users[i] : address(0xF6);
            if (i == 5) _fund(user);
            _bet(id, user, i, UNIT);
        }
        vm.warp(race.getRace(id).bettingEndTime);
        uint256[] memory starts = new uint256[](count);
        for (uint8 i = 0; i < count; ++i) {
            starts[i] = 100e8;
        }
        _refresh(count, starts, _uniformDecimals(count));

        gasBefore = gasleft();
        race.startRace(id);
        uint256 startGas = gasBefore - gasleft();

        vm.warp(race.getRace(id).raceEndTime);
        uint256[] memory ends = new uint256[](count);
        for (uint8 i = 0; i < count; ++i) {
            ends[i] = uint256(110 - i) * 1e8;
        }
        _refresh(count, ends, _uniformDecimals(count));
        gasBefore = gasleft();
        race.captureEndSnapshots(id, _proofs(count));
        uint256 captureGas = gasBefore - gasleft();
        gasBefore = gasleft();
        race.resolveRace(id);
        uint256 resolveGas = gasBefore - gasleft();

        emit log_named_uint("asset count", count);
        emit log_named_uint("createRace gas", createGas);
        emit log_named_uint("startRace gas", startGas);
        emit log_named_uint("captureEndSnapshots gas", captureGas);
        emit log_named_uint("resolveRace gas", resolveGas);
    }
}

contract AssetRaceCommunityTest is Test {
    uint256 internal constant UNIT = 1e6;
    uint8 internal constant DECIMALS = 8;
    uint64 internal constant RACE_DURATION = 60;

    MockRaceOracle internal oracle;
    AssetRace internal race;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal charlie = address(0xC4A511E);

    function setUp() public {
        vm.warp(3_000_000);
        oracle = new MockRaceOracle();
        race = new AssetRace();
        race.setCommunityPolicy(
            AssetRace.CommunityPolicyInput({
                lobbyDuration: 30,
                bettingDuration: 100,
                startGrace: 20,
                resolutionGrace: 20,
                maxOracleTimestampSkew: 5,
                feeBp: 200,
                minActiveContenders: 2,
                minStake: UNIT,
                maxStakePerWallet: 1_000 * UNIT
            })
        );
        race.setRaceDurationPreset(RACE_DURATION, true);

        for (uint8 i = 0; i < 8; ++i) {
            AssetRace.CandidateInput memory candidate = _candidate(i);
            race.setApprovedAsset(candidate, true);
            oracle.setObservation(candidate.oracleId, 100e8, DECIMALS, block.timestamp, bytes32(uint256(1)));
        }

        _fund(alice);
        _fund(bob);
        _fund(charlie);
    }

    function _candidate(uint8 index) internal view returns (AssetRace.CandidateInput memory) {
        return AssetRace.CandidateInput({
            category: AssetRace.RaceCategory.STOCK,
            assetId: bytes32(uint256(index + 100)),
            oracle: address(oracle),
            oracleId: bytes32(uint256(index + 1)),
            expectedDecimals: DECIMALS,
            maxPriceAge: 300,
            maxEndpointLag: 300
        });
    }

    function _assetIds(uint8 count) internal pure returns (bytes32[] memory ids) {
        ids = new bytes32[](count);
        for (uint8 i = 0; i < count; ++i) {
            ids[i] = bytes32(uint256(i + 100));
        }
    }

    function _createCommunity(address creator, uint8 initialCount) internal returns (uint256 id) {
        vm.prank(creator);
        id = race.createCommunityRace(
            "AI STOCK BATTLE", AssetRace.RaceCategory.STOCK, RACE_DURATION, _assetIds(initialCount)
        );
    }

    function _openBetting(uint256 id) internal {
        vm.warp(race.getRace(id).lobbyEndTime);
        race.openBetting(id);
    }

    function _fund(address user) internal {
        vm.deal(user, 10_000 * UNIT);
    }

    function test_CommunityCreationStoresMetadataAndStartsInLobby() public {
        uint256 id = _createCommunity(alice, 2);
        AssetRace.Race memory data = race.getRace(id);
        assertEq(uint8(data.origin), uint8(AssetRace.RaceOrigin.COMMUNITY));
        assertEq(uint8(data.category), uint8(AssetRace.RaceCategory.STOCK));
        assertEq(uint8(data.status), uint8(AssetRace.RaceStatus.LOBBY));
        assertEq(data.creator, alice);
        assertEq(data.title, "AI STOCK BATTLE");
        assertEq(data.candidateCount, 2);
        assertEq(data.totalPool, 0);
    }

    function test_CommunityCreationRejectsEmptyAndOversizedTitles() public {
        vm.prank(alice);
        vm.expectRevert(AssetRace.InvalidTitle.selector);
        race.createCommunityRace("", AssetRace.RaceCategory.STOCK, RACE_DURATION, _assetIds(0));

        vm.prank(alice);
        vm.expectRevert(AssetRace.InvalidTitle.selector);
        race.createCommunityRace("   ", AssetRace.RaceCategory.STOCK, RACE_DURATION, _assetIds(0));

        bytes memory oversized = new bytes(65);
        for (uint256 i = 0; i < oversized.length; ++i) {
            oversized[i] = "A";
        }
        vm.prank(alice);
        vm.expectRevert(AssetRace.InvalidTitle.selector);
        race.createCommunityRace(string(oversized), AssetRace.RaceCategory.STOCK, RACE_DURATION, _assetIds(0));
    }

    function test_CommunityCreationRejectsUnapprovedDurationAndAsset() public {
        vm.prank(alice);
        vm.expectRevert(AssetRace.DurationNotApproved.selector);
        race.createCommunityRace("BAD DURATION", AssetRace.RaceCategory.STOCK, 61, _assetIds(0));

        bytes32[] memory ids = new bytes32[](1);
        ids[0] = keccak256("NOT_APPROVED");
        vm.prank(alice);
        vm.expectRevert(AssetRace.AssetNotApproved.selector);
        race.createCommunityRace("BAD ASSET", AssetRace.RaceCategory.STOCK, RACE_DURATION, ids);
    }

    function test_DisabledAssetRejectsButRegistryRemainsEnumerable() public {
        AssetRace.CandidateInput memory disabled = _candidate(2);
        race.setApprovedAsset(disabled, false);
        bytes32[] memory allIds = race.getApprovedAssetIds();
        assertEq(allIds.length, 8);

        bytes32[] memory ids = new bytes32[](1);
        ids[0] = disabled.assetId;
        vm.prank(alice);
        vm.expectRevert(AssetRace.AssetNotApproved.selector);
        race.createCommunityRace("DISABLED", AssetRace.RaceCategory.STOCK, RACE_DURATION, ids);
    }

    function test_InitialAndLobbyAssetsRejectDuplicatesAndSeventhAsset() public {
        bytes32[] memory duplicates = new bytes32[](2);
        duplicates[0] = _candidate(0).assetId;
        duplicates[1] = _candidate(0).assetId;
        vm.prank(alice);
        vm.expectRevert(AssetRace.DuplicateAsset.selector);
        race.createCommunityRace("DUPLICATE", AssetRace.RaceCategory.STOCK, RACE_DURATION, duplicates);

        uint256 id = _createCommunity(alice, 6);
        vm.prank(bob);
        vm.expectRevert(AssetRace.InvalidCandidateCount.selector);
        race.addLobbyAsset(id, _candidate(6).assetId);
    }

    function test_ParticipantsAddOneAssetEachDuringLobby() public {
        uint256 id = _createCommunity(alice, 2);
        vm.prank(bob);
        race.addLobbyAsset(id, _candidate(2).assetId);
        assertEq(race.getRace(id).candidateCount, 3);
        assertTrue(race.lobbyAssetAddedByWallet(id, bob));

        vm.prank(bob);
        vm.expectRevert(AssetRace.LobbyAdditionAlreadyUsed.selector);
        race.addLobbyAsset(id, _candidate(3).assetId);

        vm.prank(alice);
        race.addLobbyAsset(id, _candidate(3).assetId);
        assertEq(race.getRace(id).candidateCount, 4);
    }

    function test_AddAfterLobbyEndOrBettingBeginsRejectsAndCandidatesFreeze() public {
        uint256 endedId = _createCommunity(alice, 2);
        vm.warp(race.getRace(endedId).lobbyEndTime);
        vm.prank(bob);
        vm.expectRevert(AssetRace.LobbyClosed.selector);
        race.addLobbyAsset(endedId, _candidate(2).assetId);

        race.openBetting(endedId);
        vm.prank(bob);
        vm.expectRevert(AssetRace.InvalidRaceStatus.selector);
        race.addLobbyAsset(endedId, _candidate(2).assetId);
        assertEq(race.getRace(endedId).candidateCount, 2);
    }

    function test_BettingDuringLobbyRejectsAndNoFundsMove() public {
        uint256 id = _createCommunity(alice, 2);
        uint256 beforeBalance = alice.balance;
        vm.prank(alice);
        vm.expectRevert(AssetRace.InvalidRaceStatus.selector);
        race.bet{value: 10 * UNIT}(id, 0, 10 * UNIT);
        assertEq(alice.balance, beforeBalance);
        assertEq(address(race).balance, 0);
    }

    function test_OpenBettingCancelsLobbyWithFewerThanTwoAssets() public {
        uint256 id = _createCommunity(alice, 1);
        _openBetting(id);
        AssetRace.Race memory data = race.getRace(id);
        assertEq(uint8(data.status), uint8(AssetRace.RaceStatus.CANCELLED));
        assertEq(data.totalPool, 0);
        assertEq(data.remainingLiability, 0);
    }

    function test_OpenBettingIsPermissionlessAndFreezesWindow() public {
        uint256 id = _createCommunity(alice, 2);
        vm.warp(race.getRace(id).lobbyEndTime);
        vm.prank(charlie);
        race.openBetting(id);

        AssetRace.Race memory data = race.getRace(id);
        assertEq(uint8(data.status), uint8(AssetRace.RaceStatus.BETTING));
        assertEq(data.bettingStartTime, block.timestamp);
        assertEq(data.bettingEndTime, block.timestamp + 100);
        vm.expectRevert(AssetRace.InvalidRaceStatus.selector);
        race.openBetting(id);
    }

    function test_RegistryChangesDoNotRewriteFrozenRaceAsset() public {
        uint256 id = _createCommunity(alice, 2);
        AssetRace.RaceAsset memory frozen = race.getRaceAsset(id, 0);
        AssetRace.CandidateInput memory changed = _candidate(0);
        changed.oracleId = bytes32(uint256(999));
        changed.expectedDecimals = 18;
        changed.maxPriceAge = 999;
        changed.maxEndpointLag = 777;
        race.setApprovedAsset(changed, true);

        AssetRace.RaceAsset memory afterChange = race.getRaceAsset(id, 0);
        assertEq(afterChange.oracle, frozen.oracle);
        assertEq(afterChange.oracleId, frozen.oracleId);
        assertEq(afterChange.expectedDecimals, frozen.expectedDecimals);
        assertEq(afterChange.maxPriceAge, frozen.maxPriceAge);
        assertEq(afterChange.maxEndpointLag, frozen.maxEndpointLag);
    }

    function test_CreatorHasNoSettlementOrRegistryPower() public {
        uint256 id = _createCommunity(alice, 2);
        vm.prank(alice);
        vm.expectRevert();
        race.setApprovedAsset(_candidate(7), false);

        vm.prank(alice);
        vm.expectRevert(AssetRace.InvalidRaceStatus.selector);
        race.resolveRace(id);
    }

    function test_CommunityRacePreservesBetStartResolveClaimEconomics() public {
        uint256 id = _createCommunity(alice, 2);
        _openBetting(id);

        vm.prank(alice);
        race.bet{value: 10 * UNIT}(id, 0, 10 * UNIT);
        vm.prank(bob);
        race.bet{value: 10 * UNIT}(id, 1, 10 * UNIT);

        vm.warp(race.getRace(id).bettingEndTime);
        oracle.setObservation(bytes32(uint256(1)), 100e8, DECIMALS, block.timestamp, bytes32(uint256(2)));
        oracle.setObservation(bytes32(uint256(2)), 100e8, DECIMALS, block.timestamp, bytes32(uint256(2)));
        race.startRace(id);

        vm.warp(race.getRace(id).raceEndTime);
        oracle.setObservation(bytes32(uint256(1)), 110e8, DECIMALS, block.timestamp, bytes32(uint256(3)));
        oracle.setObservation(bytes32(uint256(2)), 105e8, DECIMALS, block.timestamp, bytes32(uint256(3)));
        bytes[] memory proofs = new bytes[](race.getRace(id).candidateCount);
        race.captureEndSnapshots(id, proofs);
        race.resolveRace(id);

        AssetRace.Race memory data = race.getRace(id);
        assertEq(uint8(data.status), uint8(AssetRace.RaceStatus.RESOLVED));
        assertEq(data.winningAssetIndex, 0);
        assertEq(data.protocolFee, 200_000);
        uint256 balanceBefore = alice.balance;
        vm.prank(alice);
        assertEq(race.claim(id), 19_800_000);
        assertEq(alice.balance - balanceBefore, 19_800_000);
    }

    function test_PlatformRaceUsesRegistryAndStillBeginsInBetting() public {
        AssetRace.RaceConfigInput memory config = AssetRace.RaceConfigInput({
            category: AssetRace.RaceCategory.STOCK,
            bettingStartTime: uint64(block.timestamp),
            bettingEndTime: uint64(block.timestamp + 100),
            raceDuration: RACE_DURATION,
            startGrace: 20,
            resolutionGrace: 20,
            maxOracleTimestampSkew: 5,
            feeBp: 200,
            minActiveContenders: 2,
            minStake: UNIT,
            maxStakePerWallet: 1_000 * UNIT
        });
        uint256 id = race.createPlatformRace("PROPHET TECH RACE", config, _assetIds(4));
        AssetRace.Race memory data = race.getRace(id);
        assertEq(uint8(data.origin), uint8(AssetRace.RaceOrigin.PLATFORM));
        assertEq(uint8(data.status), uint8(AssetRace.RaceStatus.BETTING));
        assertEq(data.title, "PROPHET TECH RACE");
        assertEq(data.candidateCount, 4);
    }

    function test_MemeCommunityRaceUsesOnlyMemeRegistryAssets() public {
        AssetRace.CandidateInput memory memeA = _candidate(6);
        AssetRace.CandidateInput memory memeB = _candidate(7);
        memeA.category = AssetRace.RaceCategory.MEME;
        memeB.category = AssetRace.RaceCategory.MEME;
        race.setApprovedAsset(memeA, true);
        race.setApprovedAsset(memeB, true);

        bytes32[] memory memeIds = new bytes32[](2);
        memeIds[0] = memeA.assetId;
        memeIds[1] = memeB.assetId;
        vm.prank(alice);
        uint256 id = race.createCommunityRace("MEME MAYHEM", AssetRace.RaceCategory.MEME, RACE_DURATION, memeIds);

        AssetRace.Race memory data = race.getRace(id);
        assertEq(uint8(data.category), uint8(AssetRace.RaceCategory.MEME));
        assertEq(uint8(data.status), uint8(AssetRace.RaceStatus.LOBBY));

        vm.prank(bob);
        vm.expectRevert(AssetRace.AssetNotApproved.selector);
        race.addLobbyAsset(id, _candidate(0).assetId);
    }

    function test_PlatformRaceRejectsAssetFromAnotherCategory() public {
        AssetRace.RaceConfigInput memory config = AssetRace.RaceConfigInput({
            category: AssetRace.RaceCategory.MEME,
            bettingStartTime: uint64(block.timestamp),
            bettingEndTime: uint64(block.timestamp + 100),
            raceDuration: RACE_DURATION,
            startGrace: 20,
            resolutionGrace: 20,
            maxOracleTimestampSkew: 5,
            feeBp: 200,
            minActiveContenders: 2,
            minStake: UNIT,
            maxStakePerWallet: 1_000 * UNIT
        });

        vm.expectRevert(AssetRace.AssetNotApproved.selector);
        race.createPlatformRace("WRONG CATEGORY", config, _assetIds(2));
    }
}
