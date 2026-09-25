// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {SignedPoolRaceOracle} from "../src/oracles/SignedPoolRaceOracle.sol";

/// @notice Guarded mainnet-only lifecycle rehearsal for the corrected native
/// ETH PredictionMarket. Secrets are read by Foundry from the local environment
/// and never logged. Run every phase without `--broadcast` first.
abstract contract PredictionMarketCanaryBase is Script {
    uint256 internal constant ROBINHOOD_MAINNET_CHAIN_ID = 4663;
    uint256 internal constant CANARY_STAKE = 0.0001 ether;
    uint256 internal constant CANARY_DURATION = 35 minutes;
    uint256 internal constant EXPECTED_MAX_SEED = 0.1 ether;
    uint256 internal constant EXPECTED_MAX_STAKE = 0.1 ether;
    uint256 internal constant EXPECTED_FEE_BP = 200;

    address internal constant MARKET_ADDRESS = 0x4bfd0efc15C3198fe3AFf4741FF121AB2F38060e;
    address internal constant EXPECTED_OWNER = 0x6d68157bEDa778346Dd27f8Ef4F917f69aD2Dc41;
    address internal constant EXPECTED_ORACLE = 0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7;
    address internal constant EXPECTED_SIGNER = 0x79F4991Ccc64Cbb8143fB61e4cBD49b8b64d3635;
    address internal constant EXPECTED_KEEPER = 0xaF95287026339B51b1Ff45DC385b4D56F507634a;

    bytes32 internal constant ASSET_ID = bytes32("TSLA");
    bytes32 internal constant EXPECTED_ORACLE_ID = 0x14e1dfbdefeb08594f0852a6449b41554f51dd277f968d2499f7666feebb4aeb;

    function _market() internal pure returns (PredictionMarket) {
        return PredictionMarket(payable(MARKET_ADDRESS));
    }

    function _ownerKey() internal view returns (uint256 key) {
        key = vm.envUint("PRIVATE_KEY");
        require(vm.addr(key) == EXPECTED_OWNER, "PRIVATE_KEY is not reviewed owner");
    }

    function _playerKey() internal view returns (uint256 key) {
        key = vm.envUint("CANARY_PLAYER_PRIVATE_KEY");
        address player = vm.addr(key);
        require(player != address(0), "canary player = zero");
        require(player != EXPECTED_OWNER, "canary player must differ from owner");
        require(player != EXPECTED_ORACLE, "canary player must differ from oracle");
        require(player != EXPECTED_SIGNER, "canary player must differ from signer");
        require(player != EXPECTED_KEEPER, "canary player must differ from keeper");
        require(player != MARKET_ADDRESS, "canary player must differ from market");
    }

    function _validateDeployment(PredictionMarket market) internal view {
        require(block.chainid == ROBINHOOD_MAINNET_CHAIN_ID, "wrong chain");
        require(MARKET_ADDRESS.code.length > 0, "market has no code");
        require(market.owner() == EXPECTED_OWNER, "wrong owner");
        require(address(market.endpointOracle()) == EXPECTED_ORACLE, "wrong oracle");
        require(SignedPoolRaceOracle(EXPECTED_ORACLE).TRUSTED_SIGNER() == EXPECTED_SIGNER, "wrong signer");
        require(market.maxSeedLiquidityWei() == EXPECTED_MAX_SEED, "wrong seed cap");
        require(market.maxStakePerSideWei() == EXPECTED_MAX_STAKE, "wrong stake cap");
        require(market.feeBp() == EXPECTED_FEE_BP, "wrong fee");
        (bytes32 oracleId, uint8 decimals, bool allowed) = market.approvedAssets(ASSET_ID);
        require(allowed && oracleId == EXPECTED_ORACLE_ID && decimals == 18, "wrong TSLA binding");
    }
}

/// @notice Creates exactly two markets on an otherwise unused deployment:
/// market #0 has two distinct participants and must settle; market #1 has one
/// address funding both sides and must cancel with two full refunds.
contract CreatePredictionMarketCanaries is PredictionMarketCanaryBase {
    function run() external returns (uint256 settlementMarketId, uint256 cancellationMarketId) {
        PredictionMarket market = _market();
        _validateDeployment(market);
        require(market.marketCount() == 0, "canary markets already created");

        uint256 ownerKey = _ownerKey();
        uint256 playerKey = _playerKey();
        address player = vm.addr(playerKey);
        require(EXPECTED_OWNER.balance >= CANARY_STAKE * 3, "owner lacks canary stake");
        require(player.balance >= CANARY_STAKE, "player lacks canary stake");

        uint256 targetPrice = vm.envOr("CANARY_TARGET_PRICE_18", uint256(100 ether));
        require(targetPrice > 0 && targetPrice <= uint256(type(int256).max), "invalid target price");
        uint256 deadline = block.timestamp + CANARY_DURATION;

        vm.startBroadcast(ownerKey);
        settlementMarketId = market.createMarket(ASSET_ID, int256(targetPrice), deadline, 0, 0);
        market.bet{value: CANARY_STAKE}(settlementMarketId, PredictionMarket.Side.YES, CANARY_STAKE);
        cancellationMarketId = market.createMarket(ASSET_ID, int256(targetPrice), deadline, 0, 0);
        market.bet{value: CANARY_STAKE}(cancellationMarketId, PredictionMarket.Side.YES, CANARY_STAKE);
        market.bet{value: CANARY_STAKE}(cancellationMarketId, PredictionMarket.Side.NO, CANARY_STAKE);
        vm.stopBroadcast();

        vm.startBroadcast(playerKey);
        market.bet{value: CANARY_STAKE}(settlementMarketId, PredictionMarket.Side.NO, CANARY_STAKE);
        vm.stopBroadcast();

        require(settlementMarketId == 0 && cancellationMarketId == 1, "unexpected canary ids");
        require(market.marketCount() == 2, "unexpected market count");
        require(market.participantCount(settlementMarketId) == 2, "settlement market needs two participants");
        require(market.participantCount(cancellationMarketId) == 1, "cancellation market needs one participant");

        console.log("PredictionMarket canary address", MARKET_ADDRESS);
        console.log("Settlement market id", settlementMarketId);
        console.log("Cancellation market id", cancellationMarketId);
        console.log("Deadline", deadline);
        console.log("Canary stake per position (wei)", CANARY_STAKE);
        console.log("Second player", player);
    }
}

/// @notice Claims the winner of market #0 and refunds both positions in market
/// #1 after the keeper has resolved/cancelled them. Exact contract-side ETH and
/// fee deltas are asserted during simulation and broadcast replay.
contract FinalizePredictionMarketCanaries is PredictionMarketCanaryBase {
    uint256 private constant SETTLEMENT_MARKET_ID = 0;
    uint256 private constant CANCELLATION_MARKET_ID = 1;
    uint256 private constant BP_DENOMINATOR = 10_000;

    function run() external {
        PredictionMarket market = _market();
        _validateDeployment(market);
        require(market.marketCount() >= 2, "canary markets missing");

        uint256 ownerKey = _ownerKey();
        uint256 playerKey = _playerKey();
        address player = vm.addr(playerKey);
        PredictionMarket.Market memory resolved = market.getMarket(SETTLEMENT_MARKET_ID);
        PredictionMarket.Market memory cancelled = market.getMarket(CANCELLATION_MARKET_ID);
        require(resolved.status == PredictionMarket.Status.Resolved, "market #0 not resolved");
        require(cancelled.status == PredictionMarket.Status.Cancelled, "market #1 not cancelled");
        require(market.participantCount(SETTLEMENT_MARKET_ID) == 2, "market #0 participant mismatch");
        require(market.participantCount(CANCELLATION_MARKET_ID) == 1, "market #1 participant mismatch");

        PredictionMarket.Side outcome = resolved.outcome;
        address winner = outcome == PredictionMarket.Side.YES ? EXPECTED_OWNER : player;
        uint256 winnerKey = outcome == PredictionMarket.Side.YES ? ownerKey : playerKey;
        uint256 userStake = market.stakes(SETTLEMENT_MARKET_ID, winner, outcome);
        uint256 userWeightedStake = market.weightedStakes(SETTLEMENT_MARKET_ID, winner, outcome);
        uint256 losingPool = outcome == PredictionMarket.Side.YES ? resolved.poolNo : resolved.poolYes;
        uint256 weightedWinningPool =
            outcome == PredictionMarket.Side.YES ? resolved.weightedPoolYes : resolved.weightedPoolNo;
        require(userStake == CANARY_STAKE && weightedWinningPool > 0, "winner accounting mismatch");
        uint256 losingShare = (userWeightedStake * losingPool) / weightedWinningPool;
        uint256 fee = (losingShare * resolved.feeBp) / BP_DENOMINATOR;
        uint256 expectedPayout = userStake + losingShare - fee;

        uint256 feesBefore = market.accumulatedFees();
        uint256 balanceBeforeClaim = MARKET_ADDRESS.balance;
        vm.startBroadcast(winnerKey);
        market.claim(SETTLEMENT_MARKET_ID);
        vm.stopBroadcast();
        require(market.claimed(SETTLEMENT_MARKET_ID, winner), "winner not marked claimed");
        require(MARKET_ADDRESS.balance + expectedPayout == balanceBeforeClaim, "wrong claim ETH delta");
        require(market.accumulatedFees() == feesBefore + fee, "wrong fee delta");

        uint256 balanceBeforeRefunds = MARKET_ADDRESS.balance;
        vm.startBroadcast(ownerKey);
        market.refund(CANCELLATION_MARKET_ID, PredictionMarket.Side.YES);
        market.refund(CANCELLATION_MARKET_ID, PredictionMarket.Side.NO);
        vm.stopBroadcast();
        require(MARKET_ADDRESS.balance + CANARY_STAKE * 2 == balanceBeforeRefunds, "wrong refund ETH delta");
        require(
            market.stakes(CANCELLATION_MARKET_ID, EXPECTED_OWNER, PredictionMarket.Side.YES) == 0
                && market.stakes(CANCELLATION_MARKET_ID, EXPECTED_OWNER, PredictionMarket.Side.NO) == 0,
            "refund stakes not cleared"
        );

        console.log("PredictionMarket canary finalized");
        console.log("Winner", winner);
        console.log("Payout (wei)", expectedPayout);
        console.log("Fee (wei)", fee);
        console.log("Refunded (wei)", CANARY_STAKE * 2);
    }
}
