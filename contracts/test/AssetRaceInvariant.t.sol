// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AssetRace} from "../src/AssetRace.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockRaceOracle} from "../src/mocks/MockRaceOracle.sol";

contract AssetRaceHandler is Test {
    uint256 internal constant UNIT = 1e6;

    MockERC20 public token;
    MockRaceOracle public oracle;
    AssetRace public race;
    uint256 public raceId;

    bool public transitionViolation;
    bool public terminalStateViolation;

    address[4] internal actors = [address(0xA11CE), address(0xB0B), address(0xC4A511E), address(0xDA7E)];

    constructor() {
        vm.warp(2_000_000);
        token = new MockERC20("Invariant USDG", "iUSDG");
        oracle = new MockRaceOracle();
        race = new AssetRace(address(token));

        AssetRace.CandidateInput[] memory candidates = new AssetRace.CandidateInput[](3);
        for (uint8 i = 0; i < 3; ++i) {
            bytes32 oracleId = bytes32(uint256(i + 1));
            candidates[i] = AssetRace.CandidateInput({
                category: AssetRace.RaceCategory.STOCK,
                assetId: keccak256(abi.encodePacked("INVARIANT_ASSET", i)),
                oracle: address(oracle),
                oracleId: oracleId,
                expectedDecimals: 8,
                maxPriceAge: 300,
                maxEndpointLag: 300
            });
            oracle.setObservation(oracleId, 100e8, 8, block.timestamp, bytes32(uint256(1)));
            race.setApprovedAsset(candidates[i], true);
        }

        AssetRace.RaceConfigInput memory config = AssetRace.RaceConfigInput({
            category: AssetRace.RaceCategory.STOCK,
            bettingStartTime: uint64(block.timestamp),
            bettingEndTime: uint64(block.timestamp + 100),
            raceDuration: 60,
            startGrace: 20,
            resolutionGrace: 20,
            maxOracleTimestampSkew: 5,
            feeBp: 333,
            minActiveContenders: 2,
            minStake: UNIT,
            maxStakePerWallet: 1_000 * UNIT
        });
        raceId = race.createRace(config, candidates);

        for (uint256 i = 0; i < actors.length; ++i) {
            token.mint(actors[i], 10_000 * UNIT);
            vm.prank(actors[i]);
            token.approve(address(race), type(uint256).max);
        }
    }

    function placeBet(uint8 actorSeed, uint8 assetSeed, uint96 amountSeed) external {
        AssetRace.Race memory beforeRace = race.getRace(raceId);
        AssetRace.RaceStatus oldStatus = beforeRace.status;
        if (
            oldStatus != AssetRace.RaceStatus.BETTING || block.timestamp < beforeRace.bettingStartTime
                || block.timestamp >= beforeRace.bettingEndTime
        ) return;

        address actor = actors[actorSeed % uint8(actors.length)];
        AssetRace.Position memory position = race.getPosition(raceId, actor);
        uint8 assetIndex = position.exists ? position.assetIndex : assetSeed % beforeRace.candidateCount;
        uint256 remaining = beforeRace.maxStakePerWallet - position.stake;
        if (remaining == 0) return;
        uint256 minimum = position.exists ? 1 : beforeRace.minStake;
        if (remaining < minimum) return;
        uint256 amount = bound(uint256(amountSeed), minimum, remaining);

        vm.prank(actor);
        try race.bet(raceId, assetIndex, amount) {} catch {}
        _recordTransition(oldStatus);
    }

    function start() external {
        AssetRace.Race memory beforeRace = race.getRace(raceId);
        AssetRace.RaceStatus oldStatus = beforeRace.status;
        if (oldStatus != AssetRace.RaceStatus.BETTING) return;
        if (block.timestamp < beforeRace.bettingEndTime) vm.warp(beforeRace.bettingEndTime);
        if (block.timestamp > uint256(beforeRace.bettingEndTime) + beforeRace.startGrace) return;

        _setStartObservations();
        try race.startRace(raceId) {} catch {}
        _recordTransition(oldStatus);
    }

    function expireUnstarted() external {
        AssetRace.Race memory beforeRace = race.getRace(raceId);
        AssetRace.RaceStatus oldStatus = beforeRace.status;
        if (oldStatus != AssetRace.RaceStatus.BETTING) return;
        vm.warp(uint256(beforeRace.bettingEndTime) + beforeRace.startGrace + 1);
        try race.cancelUnstartedRace(raceId) {} catch {}
        _recordTransition(oldStatus);
    }

    function resolve() external {
        AssetRace.Race memory beforeRace = race.getRace(raceId);
        AssetRace.RaceStatus oldStatus = beforeRace.status;
        if (oldStatus != AssetRace.RaceStatus.RUNNING) return;
        if (block.timestamp < beforeRace.raceEndTime) vm.warp(beforeRace.raceEndTime);
        if (block.timestamp > uint256(beforeRace.raceEndTime) + beforeRace.resolutionGrace) return;

        oracle.setObservation(bytes32(uint256(1)), 110e8, 8, block.timestamp, bytes32(uint256(2)));
        oracle.setObservation(bytes32(uint256(2)), 105e8, 8, block.timestamp, bytes32(uint256(2)));
        oracle.setObservation(bytes32(uint256(3)), 90e8, 8, block.timestamp, bytes32(uint256(2)));
        bytes[] memory proofs = new bytes[](beforeRace.candidateCount);
        try race.captureEndSnapshots(raceId, proofs) {} catch {}
        try race.resolveRace(raceId) {} catch {}
        _recordTransition(oldStatus);
    }

    function expireRunning() external {
        AssetRace.Race memory beforeRace = race.getRace(raceId);
        AssetRace.RaceStatus oldStatus = beforeRace.status;
        if (oldStatus != AssetRace.RaceStatus.RUNNING) return;
        vm.warp(uint256(beforeRace.raceEndTime) + beforeRace.resolutionGrace + 1);
        try race.voidExpiredRace(raceId) {} catch {}
        _recordTransition(oldStatus);
    }

    function claim(uint8 actorSeed) external {
        AssetRace.RaceStatus oldStatus = race.getRace(raceId).status;
        address actor = actors[actorSeed % uint8(actors.length)];
        vm.prank(actor);
        try race.claim(raceId) {} catch {}
        _recordTransition(oldStatus);
    }

    function refund(uint8 actorSeed) external {
        AssetRace.RaceStatus oldStatus = race.getRace(raceId).status;
        address actor = actors[actorSeed % uint8(actors.length)];
        vm.prank(actor);
        try race.refund(raceId) {} catch {}
        _recordTransition(oldStatus);
    }

    function _setStartObservations() internal {
        oracle.setObservation(bytes32(uint256(1)), 100e8, 8, block.timestamp, bytes32(uint256(1)));
        oracle.setObservation(bytes32(uint256(2)), 100e8, 8, block.timestamp, bytes32(uint256(1)));
        oracle.setObservation(bytes32(uint256(3)), 100e8, 8, block.timestamp, bytes32(uint256(1)));
    }

    function _recordTransition(AssetRace.RaceStatus oldStatus) internal {
        AssetRace.RaceStatus newStatus = race.getRace(raceId).status;
        bool oldTerminal = _isTerminal(oldStatus);
        if (oldTerminal && newStatus != oldStatus) terminalStateViolation = true;

        bool legal = oldStatus == newStatus
            || (oldStatus == AssetRace.RaceStatus.BETTING
                && (newStatus == AssetRace.RaceStatus.RUNNING || newStatus == AssetRace.RaceStatus.CANCELLED))
            || (oldStatus == AssetRace.RaceStatus.RUNNING
                && (newStatus == AssetRace.RaceStatus.RESOLVED || newStatus == AssetRace.RaceStatus.VOID));
        if (!legal) transitionViolation = true;
    }

    function _isTerminal(AssetRace.RaceStatus status) internal pure returns (bool) {
        return status == AssetRace.RaceStatus.RESOLVED || status == AssetRace.RaceStatus.CANCELLED
            || status == AssetRace.RaceStatus.VOID;
    }
}

contract AssetRaceInvariantTest is Test {
    AssetRaceHandler internal handler;

    function setUp() public {
        handler = new AssetRaceHandler();
        targetContract(address(handler));
    }

    function invariant_ContractBalanceCoversFeesAndUserLiabilities() public view {
        AssetRace race = handler.race();
        MockERC20 token = handler.token();
        assertGe(token.balanceOf(address(race)), race.totalUserLiability() + race.accumulatedFees());
    }

    function invariant_SingleRaceLiabilityMatchesGlobalLiability() public view {
        AssetRace race = handler.race();
        assertEq(race.getRace(handler.raceId()).remainingLiability, race.totalUserLiability());
    }

    function invariant_LifecycleTransitionsAreLegal() public view {
        assertFalse(handler.transitionViolation());
    }

    function invariant_TerminalStatesAreIrreversible() public view {
        assertFalse(handler.terminalStateViolation());
    }

    function testFuzz_ReturnOrderingMatchesExactRationalOrdering(
        uint96 startASeed,
        uint96 endASeed,
        uint96 startBSeed,
        uint96 endBSeed
    ) public view {
        uint256 startA = bound(uint256(startASeed), 1, 1e24);
        uint256 endA = bound(uint256(endASeed), 1, 1e24);
        uint256 startB = bound(uint256(startBSeed), 1, 1e24);
        uint256 endB = bound(uint256(endBSeed), 1, 1e24);

        AssetRace race = handler.race();
        int256 returnA = race.calculateReturn(startA, endA);
        int256 returnB = race.calculateReturn(startB, endB);
        int256 exactLeft = (int256(endA) - int256(startA)) * int256(startB);
        int256 exactRight = (int256(endB) - int256(startB)) * int256(startA);

        if (returnA > returnB) assertGt(exactLeft, exactRight);
        if (returnA < returnB) assertLt(exactLeft, exactRight);
        if (exactLeft == exactRight) assertEq(returnA, returnB);
    }

    function testFuzz_PayoutConservation(
        uint128 winningPoolSeed,
        uint128 losingPoolSeed,
        uint128 stakeSeed,
        uint16 feeSeed
    ) public pure {
        uint256 winningPool = bound(uint256(winningPoolSeed), 1, 1e24);
        uint256 losingPool = bound(uint256(losingPoolSeed), 0, 1e24);
        uint256 stake = bound(uint256(stakeSeed), 1, winningPool);
        uint256 feeBp = bound(uint256(feeSeed), 0, 1_000);

        uint256 fee = Math.mulDiv(losingPool, feeBp, 10_000);
        uint256 distributable = losingPool - fee;
        uint256 payout = stake + Math.mulDiv(stake, distributable, winningPool);

        assertGe(payout, stake);
        assertLe(payout, stake + distributable);
        assertLe(payout + fee, winningPool + losingPool);
    }
}
