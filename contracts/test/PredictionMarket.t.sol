// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// STATUS: written but never run — forge is not installed on the machine this
// was authored on. Run `forge test -vvv` on your own machine first; see
// contracts/CLAUDE.md. Treat this file as a strong draft, not a green suite.

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

    uint256 constant START_BALANCE = 10_000e18;

    function setUp() public {
        betToken = new MockERC20("Mock USD", "mUSD");
        feed = new MockAggregator(8, 90_00000000); // $90.00, 8 decimals like Chainlink USD feeds
        market = new PredictionMarket(address(betToken));

        betToken.mint(alice, START_BALANCE);
        betToken.mint(bob, START_BALANCE);

        vm.prank(alice);
        betToken.approve(address(market), type(uint256).max);
        vm.prank(bob);
        betToken.approve(address(market), type(uint256).max);
    }

    function _createMarket(uint256 deadline) internal returns (uint256 id) {
        id = market.createMarket(address(feed), 100_00000000, deadline); // target $100
    }

    function test_CreateMarket_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        market.createMarket(address(feed), 100_00000000, block.timestamp + 1 days);
    }

    function test_Bet_RecordsStakeAndPool() public {
        uint256 id = _createMarket(block.timestamp + 1 days);

        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 100e18);

        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(m.poolYes, 100e18);
        assertEq(m.poolNo, 0);
        assertEq(betToken.balanceOf(address(market)), 100e18);
    }

    function test_Bet_RevertsAfterDeadline() public {
        uint256 id = _createMarket(block.timestamp + 1 hours);
        vm.warp(block.timestamp + 2 hours);

        vm.prank(alice);
        vm.expectRevert("betting closed");
        market.bet(id, PredictionMarket.Side.YES, 1e18);
    }

    function test_Resolve_YesWins_PayoutIsProportional() public {
        uint256 id = _createMarket(block.timestamp + 1 days);

        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 100e18);
        vm.prank(bob);
        market.bet(id, PredictionMarket.Side.NO, 300e18);

        vm.warp(block.timestamp + 1 days + 1);
        feed.setAnswer(101_00000000, block.timestamp); // price now above $100 target

        market.resolve(id);

        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.Resolved));
        assertEq(uint8(m.outcome), uint8(PredictionMarket.Side.YES));

        uint256 balBefore = betToken.balanceOf(alice);
        vm.prank(alice);
        market.claim(id);
        // sole YES bettor takes the whole pool (100 + 300)
        assertEq(betToken.balanceOf(alice) - balBefore, 400e18);
    }

    function test_Resolve_NoWins_LoserCannotClaim() public {
        uint256 id = _createMarket(block.timestamp + 1 days);

        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 100e18);
        vm.prank(bob);
        market.bet(id, PredictionMarket.Side.NO, 100e18);

        vm.warp(block.timestamp + 1 days + 1);
        feed.setAnswer(50_00000000, block.timestamp); // below target -> NO wins

        market.resolve(id);

        vm.prank(alice);
        vm.expectRevert("no winning stake");
        market.claim(id);
    }

    function test_Resolve_NoOneOnWinningSide_VoidsAndRefunds() public {
        uint256 id = _createMarket(block.timestamp + 1 days);

        // everyone bets NO, but price ends up above target -> YES would "win"
        // with an empty pool. Market should void instead of resolve.
        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.NO, 100e18);

        vm.warp(block.timestamp + 1 days + 1);
        feed.setAnswer(150_00000000, block.timestamp);

        market.resolve(id);

        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.Cancelled));

        uint256 balBefore = betToken.balanceOf(alice);
        vm.prank(alice);
        market.refund(id, PredictionMarket.Side.NO);
        assertEq(betToken.balanceOf(alice) - balBefore, 100e18);
    }

    function test_Resolve_RevertsOnStalePrice() public {
        uint256 id = _createMarket(block.timestamp + 1 days);
        vm.warp(block.timestamp + 1 days + 1);
        // feed was last updated far in the past relative to resolution time
        feed.setAnswer(101_00000000, block.timestamp - 2 hours);

        vm.expectRevert("stale price feed");
        market.resolve(id);
    }

    function test_Claim_RevertsOnDoubleClaim() public {
        uint256 id = _createMarket(block.timestamp + 1 days);
        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 100e18);

        vm.warp(block.timestamp + 1 days + 1);
        feed.setAnswer(101_00000000, block.timestamp);
        market.resolve(id);

        vm.prank(alice);
        market.claim(id);

        vm.prank(alice);
        vm.expectRevert("already claimed");
        market.claim(id);
    }
}
