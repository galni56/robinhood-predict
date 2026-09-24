// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PriceArena} from "../src/PriceArena.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockRaceOracle} from "../src/mocks/MockRaceOracle.sol";

contract MockUSDG is MockERC20 {
    constructor() MockERC20("Mock USDG", "mUSDG") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract PriceArenaTest is Test {
    PriceArena arena;
    MockERC20 token;
    MockRaceOracle oracle;

    uint256 private constant UNIT = 1e6;
    uint256 private constant FINAL_PRICE = 100e18;
    bytes32 private constant STOCK_ID = bytes32("NVDA");
    bytes32 private constant MEME_ID = bytes32("AI");
    bytes32 private constant STOCK_ORACLE_ID = keccak256("NVDA_USDG_POOL");
    bytes32 private constant MEME_ORACLE_ID = keccak256("AI_USDG_POOL");

    address private alice = address(0xA11CE);
    address private bob = address(0xB0B);
    address private charlie = address(0xC4A511E);
    address private dave = address(0xDA7E);

    function setUp() public {
        token = new MockUSDG();
        oracle = new MockRaceOracle();
        arena = new PriceArena(address(token));

        arena.setAsset(STOCK_ID, address(oracle), STOCK_ORACLE_ID, 18, PriceArena.Category.STOCK, true);
        arena.setAsset(MEME_ID, address(oracle), MEME_ORACLE_ID, 18, PriceArena.Category.MEME, true);

        _fundAndApprove(alice);
        _fundAndApprove(bob);
        _fundAndApprove(charlie);
        _fundAndApprove(dave);
    }

    function test_CreateArena_UsesFixedLobbyAndSelectedDuration() public {
        vm.prank(alice);
        uint256 id = arena.createArena(STOCK_ID, PriceArena.Category.STOCK, 5 minutes, "NVDA CLOSEST");

        PriceArena.Arena memory data = arena.getArena(id);
        assertEq(data.creator, alice);
        assertEq(data.startsAt, block.timestamp + 10 minutes);
        assertEq(data.deadline, block.timestamp + 15 minutes);
        assertEq(data.duration, 5 minutes);
        assertEq(data.feeBp, 200);
        assertEq(uint256(data.category), uint256(PriceArena.Category.STOCK));
        assertEq(uint256(arena.phase(id)), uint256(PriceArena.Phase.LOBBY));
    }

    function test_CreateArena_SupportsAllFourDurationsAndBothCategories() public {
        uint256[4] memory durations = [uint256(1 minutes), 5 minutes, 15 minutes, 1 hours];
        for (uint256 i; i < durations.length; ++i) {
            arena.createArena(STOCK_ID, PriceArena.Category.STOCK, durations[i], "STOCK");
            arena.createArena(MEME_ID, PriceArena.Category.MEME, durations[i], "MEME");
        }
        assertEq(arena.arenaCount(), 8);
    }

    function test_CreateArena_RejectsWrongCategoryAndDuration() public {
        vm.expectRevert("wrong asset category");
        arena.createArena(STOCK_ID, PriceArena.Category.MEME, 1 minutes, "WRONG");

        vm.expectRevert("unsupported duration");
        arena.createArena(STOCK_ID, PriceArena.Category.STOCK, 2 minutes, "WRONG");
    }

    function test_Entry_HidesPredictionUntilArenaStarts() public {
        uint256 id = _createStockArena(1 minutes);
        _enter(id, alice, 101e18, 2 * UNIT);

        PriceArena.PublicEntry memory beforeStart = arena.getEntry(id, alice);
        assertEq(beforeStart.prediction, 0);
        assertEq(beforeStart.stake, 2 * UNIT);

        vm.warp(arena.getArena(id).startsAt);
        PriceArena.PublicEntry memory afterStart = arena.getEntry(id, alice);
        assertEq(afterStart.prediction, 101e18);
        assertEq(uint256(arena.phase(id)), uint256(PriceArena.Phase.RUNNING));
    }

    function test_UpdateEntry_CanChangePredictionAndOnlyIncreaseStake() public {
        uint256 id = _createStockArena(1 minutes);
        _enter(id, alice, 101e18, UNIT);
        uint256 originalUpdatedAt = arena.getEntry(id, alice).predictionUpdatedAt;

        vm.warp(block.timestamp + 5);
        vm.prank(alice);
        arena.updateEntry(id, 102e18, 2 * UNIT);

        PriceArena.PublicEntry memory entry = arena.getEntry(id, alice);
        assertEq(entry.stake, 3 * UNIT);
        assertGt(entry.predictionUpdatedAt, originalUpdatedAt);
        assertEq(arena.getArena(id).totalPool, 3 * UNIT);

        vm.prank(alice);
        vm.expectRevert("nothing changed");
        arena.updateEntry(id, 102e18, 0);
    }

    function test_UpdateEntry_PureTopUpPreservesTiePriority() public {
        uint256 id = _createStockArena(1 minutes);
        _enter(id, alice, FINAL_PRICE, UNIT);
        uint256 originalUpdatedAt = arena.getEntry(id, alice).predictionUpdatedAt;
        vm.warp(block.timestamp + 10);

        vm.prank(alice);
        arena.updateEntry(id, 0, UNIT);
        assertEq(arena.getEntry(id, alice).predictionUpdatedAt, originalUpdatedAt);
    }

    function test_Entry_ClosesExactlyAtStart() public {
        uint256 id = _createStockArena(1 minutes);
        vm.warp(arena.getArena(id).startsAt);

        vm.prank(alice);
        vm.expectRevert("lobby closed");
        arena.enter(id, FINAL_PRICE, UNIT);
    }

    function test_CancelIfInsufficient_RefundsFullStake() public {
        uint256 id = _createStockArena(1 minutes);
        _enter(id, alice, FINAL_PRICE, 3 * UNIT);
        vm.warp(arena.getArena(id).startsAt);
        arena.cancelIfInsufficient(id);

        uint256 before = token.balanceOf(alice);
        vm.prank(alice);
        arena.refund(id);
        assertEq(token.balanceOf(alice) - before, 3 * UNIT);
        assertEq(arena.totalUserLiability(), 0);
    }

    function test_Resolve_RanksClosestHalfAndPaysStakeAccuracyWeighted() public {
        uint256 id = _createStockArena(1 minutes);
        _enter(id, alice, 100e18, 10 * UNIT); // error 0, multiplier 3x
        _enter(id, bob, 110e18, 20 * UNIT); // error 10, multiplier 1x (cutoff)
        _enter(id, charlie, 130e18, 10 * UNIT); // loses
        _enter(id, dave, 140e18, 20 * UNIT); // loses
        _resolve(id, FINAL_PRICE, 1);

        PriceArena.Arena memory data = arena.getArena(id);
        PriceArena.PublicEntry memory aliceEntry = arena.getEntry(id, alice);
        PriceArena.PublicEntry memory bobEntry = arena.getEntry(id, bob);
        PriceArena.PublicEntry memory charlieEntry = arena.getEntry(id, charlie);

        assertEq(data.winnerCount, 2);
        assertEq(data.protocolFee, 600_000);
        assertEq(aliceEntry.rank, 1);
        assertEq(aliceEntry.accuracyMultiplierBp, 30_000);
        assertEq(aliceEntry.payout, 27_640_000);
        assertEq(bobEntry.rank, 2);
        assertEq(bobEntry.accuracyMultiplierBp, 10_000);
        assertEq(bobEntry.payout, 31_760_000);
        assertEq(charlieEntry.payout, 0);
        assertEq(arena.totalUserLiability(), 59_400_000);
    }

    function test_Resolve_OddFieldUsesFloorHalf() public {
        uint256 id = _createStockArena(1 minutes);
        _enter(id, alice, 100e18, UNIT);
        _enter(id, bob, 101e18, UNIT);
        _enter(id, charlie, 102e18, UNIT);
        _resolve(id, FINAL_PRICE, 1);

        assertEq(arena.getArena(id).winnerCount, 1);
        assertGt(arena.getEntry(id, alice).payout, UNIT);
        assertEq(arena.getEntry(id, bob).payout, 0);
    }

    function test_Resolve_TieUsesEarlierPredictionUpdate() public {
        uint256 id = _createStockArena(1 minutes);
        _enter(id, alice, 99e18, UNIT);
        vm.warp(block.timestamp + 1);
        _enter(id, bob, 101e18, UNIT);
        _resolve(id, FINAL_PRICE, 1);

        assertEq(arena.getEntry(id, alice).rank, 1);
        assertEq(arena.getEntry(id, bob).rank, 2);
    }

    function test_Resolve_ChangingPredictionResetsTiePriority() public {
        uint256 id = _createStockArena(1 minutes);
        _enter(id, alice, 98e18, UNIT);
        vm.warp(block.timestamp + 1);
        _enter(id, bob, 101e18, UNIT);
        vm.warp(block.timestamp + 1);
        vm.prank(alice);
        arena.updateEntry(id, 99e18, 0);
        _resolve(id, FINAL_PRICE, 1);

        assertEq(arena.getEntry(id, bob).rank, 1);
        assertEq(arena.getEntry(id, alice).rank, 2);
    }

    function test_Resolve_StalePriceCancelsAndRefundsEveryone() public {
        uint256 id = _createStockArena(1 minutes);
        _enter(id, alice, 99e18, UNIT);
        _enter(id, bob, 101e18, 2 * UNIT);
        PriceArena.Arena memory data = arena.getArena(id);
        vm.warp(data.deadline);
        oracle.setObservation(STOCK_ORACLE_ID, FINAL_PRICE, 18, data.deadline - 61, bytes32("stale"));
        arena.resolve(id, "");

        assertEq(uint256(arena.phase(id)), uint256(PriceArena.Phase.CANCELLED));
        vm.prank(alice);
        arena.refund(id);
        vm.prank(bob);
        arena.refund(id);
        assertEq(arena.totalUserLiability(), 0);
    }

    function test_Claim_WinnerOnlyAndNoDoubleClaim() public {
        uint256 id = _createStockArena(1 minutes);
        _enter(id, alice, FINAL_PRICE, UNIT);
        _enter(id, bob, 120e18, UNIT);
        _resolve(id, FINAL_PRICE, 1);

        vm.prank(bob);
        vm.expectRevert("no winning payout");
        arena.claim(id);

        uint256 expected = arena.getEntry(id, alice).payout;
        uint256 before = token.balanceOf(alice);
        vm.prank(alice);
        arena.claim(id);
        assertEq(token.balanceOf(alice) - before, expected);

        vm.prank(alice);
        vm.expectRevert("already claimed");
        arena.claim(id);
    }

    function test_AssetConfigurationIsFrozenPerArena() public {
        uint256 id = _createStockArena(1 minutes);
        bytes32 replacement = keccak256("replacement");
        arena.setAsset(STOCK_ID, address(oracle), replacement, 8, PriceArena.Category.STOCK, true);

        PriceArena.Arena memory data = arena.getArena(id);
        assertEq(data.oracleId, STOCK_ORACLE_ID);
        assertEq(data.priceDecimals, 18);
    }

    function test_WithdrawFeesCannotConsumePlayerLiability() public {
        uint256 id = _createStockArena(1 minutes);
        _enter(id, alice, FINAL_PRICE, 10 * UNIT);
        _enter(id, bob, 120e18, 10 * UNIT);
        _resolve(id, FINAL_PRICE, 1);

        uint256 fees = arena.accumulatedFees();
        arena.withdrawFees(address(this));
        assertEq(token.balanceOf(address(arena)), arena.totalUserLiability());
        assertEq(token.balanceOf(address(this)), fees);
    }

    function test_Resolve_MaximumTwentyPlayersStaysExecutable() public {
        uint256 id = _createStockArena(1 minutes);
        for (uint256 i; i < 20; ++i) {
            address player = address(uint160(0x1000 + i));
            _fundAndApprove(player);
            _enter(id, player, FINAL_PRICE + (20 - i) * 1e18, UNIT);
        }
        _resolve(id, FINAL_PRICE, 1);

        PriceArena.Arena memory data = arena.getArena(id);
        assertEq(data.participantCount, 20);
        assertEq(data.winnerCount, 10);
        assertEq(token.balanceOf(address(arena)), arena.totalUserLiability() + arena.accumulatedFees());
    }

    function test_Entry_RejectsTwentyFirstPlayer() public {
        uint256 id = _createStockArena(1 minutes);
        for (uint256 i; i < 20; ++i) {
            address player = address(uint160(0x2000 + i));
            _fundAndApprove(player);
            _enter(id, player, FINAL_PRICE + i, UNIT);
        }
        address overflowPlayer = address(0xFFFF);
        _fundAndApprove(overflowPlayer);
        vm.prank(overflowPlayer);
        vm.expectRevert("arena is full");
        arena.enter(id, FINAL_PRICE, UNIT);
    }

    function _createStockArena(uint256 duration) private returns (uint256) {
        return arena.createArena(STOCK_ID, PriceArena.Category.STOCK, duration, "PRICE ARENA");
    }

    function _enter(uint256 id, address player, uint256 prediction, uint256 amount) private {
        vm.prank(player);
        arena.enter(id, prediction, amount);
    }

    function _resolve(uint256 id, uint256 finalPrice, uint256 secondsBeforeDeadline) private {
        PriceArena.Arena memory data = arena.getArena(id);
        vm.warp(data.deadline);
        oracle.setObservation(
            data.oracleId,
            finalPrice,
            data.priceDecimals,
            data.deadline - secondsBeforeDeadline,
            keccak256(abi.encode(id, finalPrice))
        );
        arena.resolve(id, "");
    }

    function _fundAndApprove(address user) private {
        token.mint(user, 1_000 * UNIT);
        vm.prank(user);
        token.approve(address(arena), type(uint256).max);
    }
}
