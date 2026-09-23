// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockRaceOracle} from "../src/mocks/MockRaceOracle.sol";
import {SignedPoolRaceOracle} from "../src/oracles/SignedPoolRaceOracle.sol";

contract PredictionMarketTest is Test {
    PredictionMarket market;
    MockERC20 betToken;
    MockRaceOracle oracle;

    bytes32 constant ASSET_ID = bytes32("TSLA");
    bytes32 constant ORACLE_ID = keccak256("TSLA_STOCK_TOKEN_USDG_POOL");
    uint8 constant PRICE_DECIMALS = 18;
    int256 constant TARGET_PRICE = 100e18;

    address owner = address(this);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address charlie = address(0xC4A511E);

    uint256 constant START_BALANCE = 10_000e18;

    function setUp() public {
        betToken = new MockERC20("Mock USD", "mUSD");
        oracle = new MockRaceOracle();
        market = new PredictionMarket(address(betToken), address(oracle), 0);

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

        market.setAssetAllowed(ASSET_ID, ORACLE_ID, PRICE_DECIMALS, true);
    }

    function _createMarket(uint256 deadline) internal returns (uint256 id) {
        id = market.createMarket(ASSET_ID, TARGET_PRICE, deadline, 0, 0);
    }

    function _setEndpoint(uint256 id, uint256 price, uint256 updatedAt) internal {
        PredictionMarket.Market memory m = market.getMarket(id);
        oracle.setObservation(m.oracleId, price, m.priceDecimals, updatedAt, keccak256(abi.encode(id, price, updatedAt)));
    }

    function _resolve(uint256 id) internal {
        PredictionMarket.Market memory m = market.getMarket(id);
        _setEndpoint(id, 101e18, m.deadline - 1);
        market.resolve(id, "");
    }

    // --- createMarket: permissionless, approved assets, cap ---

    function test_CreateMarket_AnyoneCanCreate_WithApprovedAsset() public {
        vm.prank(alice);
        uint256 id = market.createMarket(ASSET_ID, TARGET_PRICE, block.timestamp + 1 days, 0, 0);

        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(m.assetId, ASSET_ID);
        assertEq(m.oracleId, ORACLE_ID);
        assertEq(m.priceDecimals, PRICE_DECIMALS);
        assertEq(m.targetPrice, TARGET_PRICE);
    }

    function test_CreateMarket_RevertsForNonApprovedAsset() public {
        vm.prank(alice);
        vm.expectRevert("asset not allowed");
        market.createMarket(bytes32("ROGUE"), TARGET_PRICE, block.timestamp + 1 days, 0, 0);
    }

    function test_CreateMarket_FreezesAssetConfiguration() public {
        vm.prank(alice);
        uint256 id = market.createMarket(ASSET_ID, TARGET_PRICE, block.timestamp + 7 days, 0, 0);
        bytes32 replacementOracleId = keccak256("REPLACEMENT");
        market.setAssetAllowed(ASSET_ID, replacementOracleId, 8, true);

        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(m.oracleId, ORACLE_ID);
        assertEq(m.priceDecimals, PRICE_DECIMALS);
    }

    // --- createMarket: anti-griefing guards ---

    function test_CreateMarket_RevertsWhenDurationTooShort() public {
        vm.prank(alice);
        vm.expectRevert("market duration too short");
        market.createMarket(ASSET_ID, TARGET_PRICE, block.timestamp + 29 minutes, 0, 0);
    }

    function test_CreateMarket_AllowsDurationAtExactMinimum() public {
        vm.prank(alice);
        uint256 id = market.createMarket(ASSET_ID, TARGET_PRICE, block.timestamp + 30 minutes, 0, 0);
        assertEq(market.getMarket(id).deadline, block.timestamp + 30 minutes);
    }

    function test_SetAssetAllowed_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        market.setAssetAllowed(bytes32("NVDA"), keccak256("NVDA_POOL"), 18, true);

        market.setAssetAllowed(bytes32("NVDA"), keccak256("NVDA_POOL"), 18, true);
        (bytes32 oracleId, uint8 decimals, bool allowed) = market.approvedAssets(bytes32("NVDA"));
        assertEq(oracleId, keccak256("NVDA_POOL"));
        assertEq(decimals, 18);
        assertTrue(allowed);
    }

    // --- House seed liquidity (owner-only, capped at $50) ---

    function test_CreateMarket_WithHouseSeedLiquidity() public {
        uint256 id = market.createMarket(ASSET_ID, TARGET_PRICE, block.timestamp + 1 days, 25e18, 25e18);

        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(m.poolYes, 25e18);
        assertEq(m.poolNo, 25e18);
        assertEq(market.stakes(id, owner, PredictionMarket.Side.YES), 25e18);
        assertEq(market.stakes(id, owner, PredictionMarket.Side.NO), 25e18);
        assertEq(betToken.balanceOf(address(market)), 50e18);
    }

    function test_CreateMarket_SeedLiquidity_RevertsAboveMax() public {
        vm.expectRevert("seed exceeds max");
        market.createMarket(ASSET_ID, TARGET_PRICE, block.timestamp + 1 days, 30e18, 25e18); // $55 total > $50 cap
    }

    function test_CreateMarket_SeedLiquidity_AllowsExactMax() public {
        uint256 id = market.createMarket(ASSET_ID, TARGET_PRICE, block.timestamp + 1 days, 25e18, 25e18); // exactly $50
        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(m.poolYes + m.poolNo, 50e18);
    }

    function test_CreateMarket_SeedLiquidity_OwnerOnly() public {
        vm.prank(alice);
        vm.expectRevert("seed liquidity is owner-only");
        market.createMarket(ASSET_ID, TARGET_PRICE, block.timestamp + 1 days, 10e18, 10e18);
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
        _resolve(id);

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

        PredictionMarket.Market memory m = market.getMarket(id);
        vm.warp(m.deadline + 1);
        _setEndpoint(id, 50e18, m.deadline - 1);
        market.resolve(id, "");

        vm.prank(alice);
        vm.expectRevert("no winning stake");
        market.claim(id);
    }

    function test_Resolve_RevertsWhenEndpointTimestampIsAtOrAfterDeadline() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 id = _createMarket(deadline);
        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 50e18);
        vm.prank(bob);
        market.bet(id, PredictionMarket.Side.NO, 50e18);

        vm.warp(deadline + 1);
        _setEndpoint(id, 101e18, deadline);
        vm.expectRevert("invalid endpoint timestamp");
        market.resolve(id, "");
    }

    function test_Resolve_UsesScheduledEndpointWhenCalledMuchLater() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 id = _createMarket(deadline);
        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 50e18);
        vm.prank(bob);
        market.bet(id, PredictionMarket.Side.NO, 50e18);

        bytes32 endpointBlockHash = keccak256("endpoint block");
        oracle.setObservation(ORACLE_ID, 101e18, PRICE_DECIMALS, deadline - 1, endpointBlockHash);
        vm.warp(deadline + 30 days);

        market.resolve(id, "");

        PredictionMarket.Market memory m = market.getMarket(id);
        (uint256 settlePrice, uint256 settleUpdatedAt, bytes32 settleObservationId) = market.settlements(id);
        assertEq(uint8(m.outcome), uint8(PredictionMarket.Side.YES));
        assertEq(settlePrice, 101e18);
        assertEq(settleUpdatedAt, deadline - 1);
        assertEq(settleObservationId, endpointBlockHash);
    }

    function test_Resolve_IntegratesWithSignedPoolOracleAndUsesPreDeadlineBlock() public {
        uint256 signerKey = 0x51A9E2;
        SignedPoolRaceOracle signedOracle = new SignedPoolRaceOracle(vm.addr(signerKey));
        PredictionMarket signedMarket = new PredictionMarket(address(betToken), address(signedOracle), 0);
        signedMarket.setAssetAllowed(ASSET_ID, ORACLE_ID, PRICE_DECIMALS, true);

        vm.prank(alice);
        betToken.approve(address(signedMarket), type(uint256).max);
        vm.prank(bob);
        betToken.approve(address(signedMarket), type(uint256).max);

        // Read through the cheatcode rather than the BLOCKTIMESTAMP opcode so
        // via-IR cannot rematerialize this local after the later vm.warp.
        uint256 deadline = vm.getBlockTimestamp() + 1 days;
        uint256 endpointTimestamp = deadline - 1;
        uint256 id = signedMarket.createMarket(ASSET_ID, TARGET_PRICE, deadline, 0, 0);
        vm.prank(alice);
        signedMarket.bet(id, PredictionMarket.Side.YES, 10e18);
        vm.prank(bob);
        signedMarket.bet(id, PredictionMarket.Side.NO, 10e18);

        bytes32 parentHash = keccak256("signed parent");
        bytes32 endpointHash = keccak256("signed endpoint");
        bytes32 childHash = keccak256("signed child");
        SignedPoolRaceOracle.SignedPoolObservation memory previous = SignedPoolRaceOracle.SignedPoolObservation({
            oracleId: ORACLE_ID,
            price: 99e18,
            decimals: PRICE_DECIMALS,
            blockNumber: 100,
            blockHash: endpointHash,
            parentBlockHash: parentHash,
            blockTimestamp: endpointTimestamp
        });
        SignedPoolRaceOracle.SignedPoolObservation memory selected = SignedPoolRaceOracle.SignedPoolObservation({
            oracleId: ORACLE_ID,
            price: 500e18,
            decimals: PRICE_DECIMALS,
            blockNumber: 101,
            blockHash: childHash,
            parentBlockHash: endpointHash,
            blockTimestamp: deadline
        });
        (uint8 previousV, bytes32 previousR, bytes32 previousS) =
            vm.sign(signerKey, signedOracle.observationDigest(previous));
        (uint8 selectedV, bytes32 selectedR, bytes32 selectedS) =
            vm.sign(signerKey, signedOracle.observationDigest(selected));
        bytes memory proof = abi.encode(
            previous,
            abi.encodePacked(previousR, previousS, previousV),
            selected,
            abi.encodePacked(selectedR, selectedS, selectedV)
        );

        vm.warp(deadline + 30 days);
        signedMarket.resolve(id, proof);

        PredictionMarket.Market memory resolved = signedMarket.getMarket(id);
        (uint256 settlePrice, uint256 settleUpdatedAt, bytes32 settleObservationId) = signedMarket.settlements(id);
        assertEq(uint8(resolved.status), uint8(PredictionMarket.Status.Resolved));
        assertEq(uint8(resolved.outcome), uint8(PredictionMarket.Side.NO));
        assertEq(settlePrice, 99e18);
        assertEq(settleUpdatedAt, endpointTimestamp);
        assertEq(settleObservationId, endpointHash);
    }

    function test_Resolve_RevertsWhenPriceDecimalsDoNotMatchFrozenAsset() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 id = _createMarket(deadline);
        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 50e18);
        vm.prank(bob);
        market.bet(id, PredictionMarket.Side.NO, 50e18);

        oracle.setObservation(ORACLE_ID, 101e8, 8, deadline - 1, keccak256("wrong decimals"));
        vm.warp(deadline + 1);

        vm.expectRevert("price decimals changed");
        market.resolve(id, "");
    }

    function test_Resolve_CancelsWhenDeadlinePriceIsStale() public {
        uint256 deadline = block.timestamp + 5 days;
        uint256 id = _createMarket(deadline);
        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 50e18);
        vm.prank(bob);
        market.bet(id, PredictionMarket.Side.NO, 50e18);

        _setEndpoint(id, 99e18, deadline - market.MAX_PRICE_STALENESS() - 1);
        vm.warp(deadline + 1);

        market.resolve(id, "");

        PredictionMarket.Market memory m = market.getMarket(id);
        assertEq(uint8(m.status), uint8(PredictionMarket.Status.Cancelled));
        (uint256 settlePrice, uint256 settleUpdatedAt, bytes32 settleObservationId) = market.settlements(id);
        assertEq(settlePrice, 0);
        assertEq(settleUpdatedAt, 0);
        assertEq(settleObservationId, bytes32(0));

        uint256 before = betToken.balanceOf(alice);
        vm.prank(alice);
        market.refund(id, PredictionMarket.Side.YES);
        assertEq(betToken.balanceOf(alice), before + 50e18);
    }

    function test_Resolve_RevertsForZeroPoolPrice() public {
        uint256 deadline = block.timestamp + 1 days;
        uint256 id = _createMarket(deadline);
        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 50e18);
        vm.prank(bob);
        market.bet(id, PredictionMarket.Side.NO, 50e18);

        oracle.setObservation(ORACLE_ID, 0, PRICE_DECIMALS, deadline - 1, keccak256("zero price"));
        vm.warp(deadline + 1);

        vm.expectRevert("invalid pool price");
        market.resolve(id, "");
    }

    function test_Claim_RevertsOnDoubleClaim() public {
        uint256 id = _createMarket(block.timestamp + 1 days);
        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 50e18);
        vm.prank(bob);
        market.bet(id, PredictionMarket.Side.NO, 1e18); // needs a nonzero NO pool or resolve() cancels instead

        vm.warp(block.timestamp + 1 days + 1);
        _resolve(id);

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

        _resolve(id);

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
        _resolve(id);

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
        uint256 id = market.createMarket(ASSET_ID, TARGET_PRICE, block.timestamp + 1 days, 0, 0);

        // Sole YES bettor (winning side) vs sole NO bettor (losing side).
        // 80/20 split, halved to 40/10 to respect MAX_STAKE_PER_SIDE_USD ($50) —
        // same ratio, same fee math, smaller numbers.
        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 40e18);
        vm.prank(bob);
        market.bet(id, PredictionMarket.Side.NO, 10e18);

        vm.warp(block.timestamp + 1 days + 1);
        _resolve(id);

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
        _resolve(id);

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
        uint256 id = market.createMarket(ASSET_ID, TARGET_PRICE, block.timestamp + 1 days, 0, 0);

        vm.prank(alice);
        market.bet(id, PredictionMarket.Side.YES, 40e18);
        vm.prank(bob);
        market.bet(id, PredictionMarket.Side.NO, 10e18);

        vm.warp(block.timestamp + 1 days + 1);
        _resolve(id);

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
        uint256 id = market.createMarket(ASSET_ID, TARGET_PRICE, deadline, 0, 0);

        // 15000 * 6667 / 10000 = 10000.5 -> truncates to 10000
        assertEq(market.bettingWindowEnd(id), block.timestamp + 10_000);
        // elapsed = 0 at creation -> full MAX_WEIGHT_BP
        assertEq(market.currentWeightBp(id), market.MAX_WEIGHT_BP());
    }

    function test_Bet_RevertsAfterBettingWindowCloses_ButBeforeDeadline() public {
        uint256 deadline = block.timestamp + 15_000;
        uint256 id = market.createMarket(ASSET_ID, TARGET_PRICE, deadline, 0, 0);

        vm.warp(block.timestamp + 10_001); // just past the window, deadline still ~5000s away
        assertLt(block.timestamp, deadline);

        vm.prank(alice);
        vm.expectRevert("betting closed");
        market.bet(id, PredictionMarket.Side.YES, 10e18);
    }

    function test_Bet_EarlyBettorGetsBiggerPayoutThanLateBettor_SameStake() public {
        uint256 deadline = block.timestamp + 15_000; // betting window closes at +10000
        uint256 id = market.createMarket(ASSET_ID, TARGET_PRICE, deadline, 0, 0);

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
        _resolve(id);

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
        uint256 id = market.createMarket(ASSET_ID, TARGET_PRICE, block.timestamp + 1 days, 25e18, 25e18);
        PredictionMarket.Market memory m = market.getMarket(id);
        uint256 expected = (25e18 * market.MAX_WEIGHT_BP()) / 10_000;
        assertEq(m.weightedPoolYes, expected);
        assertEq(m.weightedPoolNo, expected);
    }
}
