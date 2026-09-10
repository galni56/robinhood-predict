// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockAggregator} from "../src/mocks/MockAggregator.sol";

contract PredictionMarketTest is Test {
    PredictionMarket market;
    MockERC20 betToken;
    MockAggregator feed;

    address owner = address(this);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address charlie = address(0xC4A511E);

    uint256 constant START_BALANCE = 10_000e18;

    function setUp() public {
        betToken = new MockERC20("Mock USD", "mUSD");
        // $97, ~3.1% below the $100 target used by _createMarket and most tests
        // below — inside every tier's deviation band (2%-4% short, up to 15%/20%
        // medium/long) so the floor+ceiling guard on createMarket doesn't interfere
        // with tests unrelated to it. Resolution-time price movement is set
        // separately per test via feed.setAnswer().
        feed = new MockAggregator(8, 97_00000000); // $97.00, 8 decimals like Chainlink USD feeds
        market = new PredictionMarket(address(betToken), 0); // 0% fee by default — keeps old exact-payout math unchanged

        betToken.mint(owner, START_BALANCE);
        betToken.mint(alice, START_BALANCE);
        betToken.mint(bob, START_BALANCE);
        betToken.mint(charlie, START_BALANCE);

        betToken.approve(address(market), type(uint256).max);
        vm.prank(alice);
        betToken.approve(address(market), type(uint256).max);
        vm.prank(bob);
        betToken.approve(address(market), type(uint256).max);
        vm.prank(charlie);
        betToken.approve(address(market), type(uint256).max);

        market.setPriceFeedAllowed(address(feed), true);
    }

    function _createMarket(uint256 deadline) internal returns (uint256 id) {
        id = market.createMarket(address(feed), 100_00000000, deadline, 0, 0); // target $100, no seed
    }

    // --- createMarket: permissionless, allowlist, cap ---

    function test_CreateMarket_AnyoneCanCreate_WithAllowlistedFeed() public {
        vm.prank(alice);
        uint256 id = market.createMarket(address(feed), 100_00000000, block.timestamp + 1 days, 0, 0);

        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(m.priceFeed, address(feed));
        assertEq(m.targetPrice, 100_00000000);
    }

    function test_CreateMarket_RevertsForNonAllowlistedFeed() public {
        MockAggregator rogueFeed = new MockAggregator(8, 90_00000000);

        vm.prank(alice);
        vm.expectRevert("feed not allowlisted");
        market.createMarket(address(rogueFeed), 100_00000000, block.timestamp + 1 days, 0, 0);
    }

    function test_CreateMarket_AllowsTargetAboveOldFlatCap() public {
        // No absolute dollar cap anymore -- only the relative deviation
        // guard applies, so a target well above the old $500 flat cap must
        // succeed as long as it's within the duration-scaled band of the
        // feed's own live price. Own feed priced at $800 so a $900 target
        // (12.5% away) stays inside the long-duration 20% band.
        MockAggregator pricierFeed = new MockAggregator(8, 800_00000000);
        market.setPriceFeedAllowed(address(pricierFeed), true);

        vm.prank(alice);
        uint256 id = market.createMarket(address(pricierFeed), 900_00000000, block.timestamp + 7 days, 0, 0);
        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(m.targetPrice, 900_00000000);
    }

    // --- createMarket: anti-griefing guards (min duration, target-vs-price deviation) ---

    function test_CreateMarket_RevertsWhenDurationTooShort() public {
        vm.prank(alice);
        vm.expectRevert("market duration too short");
        market.createMarket(address(feed), 100_00000000, block.timestamp + 29 minutes, 0, 0);
    }

    function test_CreateMarket_AllowsDurationAtExactMinimum() public {
        vm.prank(alice);
        uint256 id = market.createMarket(address(feed), 100_00000000, block.timestamp + 30 minutes, 0, 0);
        assertEq(market.getMarket(id).deadline, block.timestamp + 30 minutes);
    }

    function test_CreateMarket_RevertsWhenTargetTooCloseToPrice() public {
        // Feed at $97, floor is +/-2% ($95.06-$98.94) regardless of duration —
        // $97.50 is only ~0.5% away, a degenerate market trivial to flip with a
        // last-second nudge to the underlying price.
        vm.prank(alice);
        vm.expectRevert("target too close to current price");
        market.createMarket(address(feed), 97_50000000, block.timestamp + 7 days, 0, 0);
    }

    function test_CreateMarket_AllowsTargetAtExactFloor() public {
        // Exactly 2% below $97 = $95.06.
        vm.prank(alice);
        uint256 id = market.createMarket(address(feed), 95_06000000, block.timestamp + 7 days, 0, 0);
        assertEq(market.getMarket(id).targetPrice, 95_06000000);
    }

    function test_CreateMarket_RevertsWhenTargetTooFarFromPrice_ShortDuration() public {
        // Feed at $100, short (<=2h) tier allows only +/-4% ($96-$104) — $110 is a
        // "sure thing" dressed up as a market and should be rejected.
        vm.prank(alice);
        vm.expectRevert("target too far from current price");
        market.createMarket(address(feed), 110_00000000, block.timestamp + 1 hours, 0, 0);
    }

    function test_CreateMarket_AllowsWiderDeviation_LongDuration() public {
        // Same $110 target that reverts on a short-duration market is fine on a
        // 7-day one — long tier allows +/-20% ($80-$120).
        vm.prank(alice);
        uint256 id = market.createMarket(address(feed), 110_00000000, block.timestamp + 7 days, 0, 0);
        assertEq(market.getMarket(id).targetPrice, 110_00000000);
    }

    function test_CreateMarket_RevertsWhenTargetTooFarFromPrice_LongDuration() public {
        // Even the widest (long, <=7d) tier has a limit — +/-20% of $100 tops out
        // at $120, so $130 should still revert.
        vm.prank(alice);
        vm.expectRevert("target too far from current price");
        market.createMarket(address(feed), 130_00000000, block.timestamp + 7 days, 0, 0);
    }

    function test_SetPriceFeedAllowed_OnlyOwner() public {
        MockAggregator newFeed = new MockAggregator(8, 90_00000000);

        vm.prank(alice);
        vm.expectRevert();
        market.setPriceFeedAllowed(address(newFeed), true);

        market.setPriceFeedAllowed(address(newFeed), true);
        assertTrue(market.allowedPriceFeeds(address(newFeed)));
    }

    // --- House seed liquidity (owner-only, capped at $50) ---

    function test_CreateMarket_WithHouseSeedLiquidity() public {
        uint256 id = market.createMarket(address(feed), 100_00000000, block.timestamp + 1 days, 25e18, 25e18);

        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(m.poolYes, 25e18);
        assertEq(m.poolNo, 25e18);
        assertEq(market.stakes(id, owner, PredictionMarket.Side.YES), 25e18);
        assertEq(market.stakes(id, owner, PredictionMarket.Side.NO), 25e18);
        assertEq(betToken.balanceOf(address(market)), 50e18);
    }

    function test_CreateMarket_SeedLiquidity_RevertsAboveMax() public {
        vm.expectRevert("seed exceeds max");
        market.createMarket(address(feed), 100_00000000, block.timestamp + 1 days, 30e18, 25e18); // $55 total > $50 cap
    }

    function test_CreateMarket_SeedLiquidity_AllowsExactMax() public {
        uint256 id = market.createMarket(address(feed), 100_00000000, block.timestamp + 1 days, 25e18, 25e18); // exactly $50
        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(m.poolYes + m.poolNo, 50e18);
    }

    function test_CreateMarket_SeedLiquidity_OwnerOnly() public {
        vm.prank(alice);
        vm.expectRevert("seed liquidity is owner-only");
        market.createMarket(address(feed), 100_00000000, block.timestamp + 1 days, 10e18, 10e18);
    }

    // --- bet ---

    function test_Bet_RecordsStakeAndPool() public {
        uint256 id = _createMarket(block.timestamp + 1 days);

        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 50e18);

        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(m.poolYes, 50e18);
        assertEq(m.poolNo, 0);
        assertEq(betToken.balanceOf(address(market)), 50e18);
    }

    function test_Bet_AllowsOneBetPerSide() public {
        uint256 id = _createMarket(block.timestamp + 1 days);

        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 50e18);
        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.NO, 30e18);

        assertEq(market.stakes(id, alice, PredictionMarket.Side.YES), 50e18);
        assertEq(market.stakes(id, alice, PredictionMarket.Side.NO), 30e18);
    }

    function test_Bet_RevertsOnSecondBetSameSide() public {
        uint256 id = _createMarket(block.timestamp + 1 days);

        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 50e18);

        vm.prank(alice);
        vm.expectRevert("already bet this side");
        market.bet(id, PredictionMarket.Side.YES, 50e18);
    }

    function test_Bet_RevertsWhenAboveMaxStakePerSide() public {
        uint256 id = _createMarket(block.timestamp + 1 days);

        vm.prank(alice);
        vm.expectRevert("exceeds max stake per side");
        market.bet(id, PredictionMarket.Side.YES, 50e18 + 1);
    }

    function test_Bet_AllowsExactMaxStakePerSide_BothSidesIndependently() public {
        uint256 id = _createMarket(block.timestamp + 1 days);

        // Same wallet can hit the $50 cap on YES *and* the $50 cap on NO —
        // the cap is per-side, not a combined per-wallet total.
        vm.startPrank(alice);
        market.bet(id, PredictionMarket.Side.YES, 50e18);
        market.bet(id, PredictionMarket.Side.NO, 50e18);
        vm.stopPrank();

        assertEq(market.stakes(id, alice, PredictionMarket.Side.YES), 50e18);
        assertEq(market.stakes(id, alice, PredictionMarket.Side.NO), 50e18);
    }

    function test_Bet_RevertsAfterDeadline() public {
        uint256 id = _createMarket(block.timestamp + 1 hours);
        vm.warp(block.timestamp + 2 hours);

        vm.prank(alice);
        vm.expectRevert("betting closed");
        market.bet(id, PredictionMarket.Side.YES, 1e18);
    }

    // --- resolve / claim ---

    function test_Resolve_YesWins_PayoutIsProportional() public {
        uint256 id = _createMarket(block.timestamp + 1 days);

        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 50e18);
        vm.prank(bob);
        market.bet(id, PredictionMarket.Side.NO, 50e18);

        vm.warp(block.timestamp + 1 days + 1);
        feed.setAnswer(101_00000000, block.timestamp); // price now above $100 target

        market.resolve(id);

        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.Resolved));
        assertEq(uint8(m.outcome), uint8(PredictionMarket.Side.YES));

        uint256 balBefore = betToken.balanceOf(alice);
        vm.prank(alice);
        market.claim(id);
        // sole YES bettor takes the whole pool (50 + 50), 0% fee
        assertEq(betToken.balanceOf(alice) - balBefore, 100e18);
    }

    function test_Resolve_NoWins_LoserCannotClaim() public {
        uint256 id = _createMarket(block.timestamp + 1 days);

        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 50e18);
        vm.prank(bob);
        market.bet(id, PredictionMarket.Side.NO, 50e18);

        vm.warp(block.timestamp + 1 days + 1);
        feed.setAnswer(50_00000000, block.timestamp); // below target -> NO wins

        market.resolve(id);

        vm.prank(alice);
        vm.expectRevert("no winning stake");
        market.claim(id);
    }

    function test_Resolve_RevertsOnStalePrice() public {
        // Deadline pushed out past MAX_PRICE_STALENESS so warping there and
        // subtracting 4 days for the feed timestamp can't underflow the
        // test's starting block.timestamp.
        uint256 id = _createMarket(block.timestamp + 5 days);
        // Need both sides staked so resolve() reaches the price-feed check
        // instead of short-circuiting into the one-sided-market cancellation.
        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 50e18);
        vm.prank(bob);
        market.bet(id, PredictionMarket.Side.NO, 50e18);

        vm.warp(block.timestamp + 5 days + 1);
        // feed was last updated far in the past relative to resolution time
        // (beyond MAX_PRICE_STALENESS = 3 days, sized for equity feeds that
        // don't publish over closed-market weekends)
        feed.setAnswer(101_00000000, block.timestamp - 4 days);

        vm.expectRevert("stale price feed");
        market.resolve(id);
    }

    function test_Claim_RevertsOnDoubleClaim() public {
        uint256 id = _createMarket(block.timestamp + 1 days);
        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 50e18);
        vm.prank(bob);
        market.bet(id, PredictionMarket.Side.NO, 1e18); // needs a nonzero NO pool or resolve() cancels instead

        vm.warp(block.timestamp + 1 days + 1);
        feed.setAnswer(101_00000000, block.timestamp);
        market.resolve(id);

        vm.prank(alice);
        market.claim(id);

        vm.prank(alice);
        vm.expectRevert("already claimed");
        market.claim(id);
    }

    // --- one-sided market cancellation + full refund ---

    function test_Resolve_CancelsWhenNoSideHasAnyBets() public {
        uint256 id = _createMarket(block.timestamp + 1 days);
        vm.warp(block.timestamp + 1 days + 1);

        market.resolve(id);

        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.Cancelled));
    }

    function test_Resolve_CancelsWhenOnlyOneSideHasBets_AllowsFullRefund() public {
        uint256 id = _createMarket(block.timestamp + 1 days);

        // everyone bets NO, but price ends up above target -> YES would "win"
        // with an empty pool. Market should cancel instead of resolve, before
        // even reading the price feed.
        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.NO, 50e18);

        vm.warp(block.timestamp + 1 days + 1);
        feed.setAnswer(150_00000000, block.timestamp);

        market.resolve(id);

        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.Cancelled));

        uint256 balBefore = betToken.balanceOf(alice);
        vm.prank(alice);
        market.refund(id, PredictionMarket.Side.NO);
        assertEq(betToken.balanceOf(alice) - balBefore, 50e18); // 100% back, no fee on a cancelled market
    }

    // --- parimutuel payout math with a protocol fee ---

    function test_Claim_ParimutuelPayoutWithFee_MatchesFormulaExactly() public {
        market.setFeeBp(200); // 2% — snapshotted into the market created next
        uint256 id = market.createMarket(address(feed), 100_00000000, block.timestamp + 1 days, 0, 0);

        // Sole YES bettor (winning side) vs sole NO bettor (losing side).
        // 80/20 split, halved to 40/10 to respect MAX_STAKE_PER_SIDE_USD ($50) —
        // same ratio, same fee math, smaller numbers.
        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 40e18);
        vm.prank(bob);
        market.bet(id, PredictionMarket.Side.NO, 10e18);

        vm.warp(block.timestamp + 1 days + 1);
        feed.setAnswer(101_00000000, block.timestamp);
        market.resolve(id);

        // payout = userStake + userStake * losingPool * (10000 - feeBp) / (winningPool * 10000)
        //        = 40e18 + 40e18 * 10e18 * 9800 / (40e18 * 10000)
        //        = 40e18 + 9.8e18 = 49.8e18
        uint256 balBefore = betToken.balanceOf(alice);
        vm.prank(alice);
        market.claim(id);
        assertEq(betToken.balanceOf(alice) - balBefore, 49.8e18);

        // fee = 40e18 * 10e18 * 200 / (40e18 * 10000) = 0.2e18
        assertEq(market.accumulatedFees(), 0.2e18);
    }

    function test_Claim_FeeIsSnapshotted_LaterFeeChangeDoesNotAffectOpenMarket() public {
        uint256 id = _createMarket(block.timestamp + 1 days); // created at 0% fee (setUp default)
        market.setFeeBp(500); // owner raises the fee after the market is already open

        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 50e18);
        vm.prank(bob);
        market.bet(id, PredictionMarket.Side.NO, 50e18);

        vm.warp(block.timestamp + 1 days + 1);
        feed.setAnswer(101_00000000, block.timestamp);
        market.resolve(id);

        uint256 balBefore = betToken.balanceOf(alice);
        vm.prank(alice);
        market.claim(id);
        // still the 0% fee from creation time, not the 5% set afterwards
        assertEq(betToken.balanceOf(alice) - balBefore, 100e18);
    }

    function test_SetFeeBp_RevertsAboveMax() public {
        vm.expectRevert("fee exceeds max");
        market.setFeeBp(1001); // > MAX_FEE_BP (1000 = 10%)
    }

    function test_SetFeeBp_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        market.setFeeBp(100);
    }

    function test_WithdrawFees_OnlyOwnerAndTransfersBalance() public {
        market.setFeeBp(200);
        uint256 id = market.createMarket(address(feed), 100_00000000, block.timestamp + 1 days, 0, 0);

        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 40e18);
        vm.prank(bob);
        market.bet(id, PredictionMarket.Side.NO, 10e18);

        vm.warp(block.timestamp + 1 days + 1);
        feed.setAnswer(101_00000000, block.timestamp);
        market.resolve(id);

        vm.prank(alice);
        market.claim(id);

        vm.prank(alice);
        vm.expectRevert();
        market.withdrawFees(alice);

        uint256 balBefore = betToken.balanceOf(owner);
        market.withdrawFees(owner);
        assertEq(betToken.balanceOf(owner) - balBefore, 0.2e18);
        assertEq(market.accumulatedFees(), 0);
    }

    // --- early-bet weight decay + betting window ---

    function test_BettingWindowEnd_And_CurrentWeightBp_AtCreation() public {
        uint256 deadline = block.timestamp + 15_000;
        uint256 id = market.createMarket(address(feed), 100_00000000, deadline, 0, 0);

        // 15000 * 6667 / 10000 = 10000.5 -> truncates to 10000
        assertEq(market.bettingWindowEnd(id), block.timestamp + 10_000);
        // elapsed = 0 at creation -> full MAX_WEIGHT_BP
        assertEq(market.currentWeightBp(id), market.MAX_WEIGHT_BP());
    }

    function test_Bet_RevertsAfterBettingWindowCloses_ButBeforeDeadline() public {
        uint256 deadline = block.timestamp + 15_000;
        uint256 id = market.createMarket(address(feed), 100_00000000, deadline, 0, 0);

        vm.warp(block.timestamp + 10_001); // just past the window, deadline still ~5000s away
        assertLt(block.timestamp, deadline);

        vm.prank(alice);
        vm.expectRevert("betting closed");
        market.bet(id, PredictionMarket.Side.YES, 10e18);
    }

    function test_Bet_EarlyBettorGetsBiggerPayoutThanLateBettor_SameStake() public {
        uint256 deadline = block.timestamp + 15_000; // betting window closes at +10000
        uint256 id = market.createMarket(address(feed), 100_00000000, deadline, 0, 0);

        // Alice bets the instant betting opens -> max weight.
        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 50e18);

        // Bob bets the same amount, same side, but halfway through the window -> lower weight.
        vm.warp(block.timestamp + 5_000);
        vm.prank(bob);
        market.bet(id, PredictionMarket.Side.YES, 50e18);

        // Charlie funds the losing side so there's something to win.
        vm.prank(charlie);
        market.bet(id, PredictionMarket.Side.NO, 50e18);

        vm.warp(deadline);
        feed.setAnswer(101_00000000, block.timestamp);
        market.resolve(id);

        uint256 aliceBefore = betToken.balanceOf(alice);
        vm.prank(alice);
        market.claim(id);
        uint256 alicePayout = betToken.balanceOf(alice) - aliceBefore;

        uint256 bobBefore = betToken.balanceOf(bob);
        vm.prank(bob);
        market.claim(id);
        uint256 bobPayout = betToken.balanceOf(bob) - bobBefore;

        // Same stake, same side, same outcome — the only difference is when they bet.
        assertGt(alicePayout, bobPayout);
    }

    function test_CreateMarket_SeedLiquidity_GetsMaxWeight() public {
        uint256 id = market.createMarket(address(feed), 100_00000000, block.timestamp + 1 days, 25e18, 25e18);
        PredictionMarket.Market memory m = market.getMarket(id);
        uint256 expected = (25e18 * market.MAX_WEIGHT_BP()) / 10_000;
        assertEq(m.weightedPoolYes, expected);
        assertEq(m.weightedPoolNo, expected);
    }
}
