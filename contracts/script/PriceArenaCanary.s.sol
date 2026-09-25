// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PriceArena} from "../src/PriceArena.sol";
import {SignedPoolRaceOracle} from "../src/oracles/SignedPoolRaceOracle.sol";

/// @notice Guarded mainnet-only lifecycle rehearsal for the native ETH
/// PriceArena deployment. Run every phase without `--broadcast` first.
abstract contract PriceArenaCanaryBase is Script {
    uint256 internal constant ROBINHOOD_MAINNET_CHAIN_ID = 4663;
    uint256 internal constant CANARY_STAKE = 0.0001 ether;
    uint256 internal constant FIRST_OWNER_PREDICTION = 99 ether;
    uint256 internal constant OWNER_PREDICTION = 100 ether;
    uint256 internal constant PLAYER_PREDICTION = 110 ether;

    address internal constant ARENA_ADDRESS = 0x383840a8Ca00dcB4b6cAc17e746c793426fE2f05;
    address internal constant EXPECTED_OWNER = 0x6d68157bEDa778346Dd27f8Ef4F917f69aD2Dc41;
    address internal constant EXPECTED_ORACLE = 0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7;
    address internal constant EXPECTED_SIGNER = 0x79F4991Ccc64Cbb8143fB61e4cBD49b8b64d3635;
    address internal constant EXPECTED_KEEPER = 0xaF95287026339B51b1Ff45DC385b4D56F507634a;

    bytes32 internal constant ASSET_ID = bytes32("TSLA");
    bytes32 internal constant EXPECTED_ORACLE_ID = 0x14e1dfbdefeb08594f0852a6449b41554f51dd277f968d2499f7666feebb4aeb;

    function _arena() internal pure returns (PriceArena) {
        return PriceArena(payable(ARENA_ADDRESS));
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
        require(player != ARENA_ADDRESS, "canary player must differ from arena");
    }

    function _validateDeployment(PriceArena arena) internal view {
        require(block.chainid == ROBINHOOD_MAINNET_CHAIN_ID, "wrong chain");
        require(ARENA_ADDRESS.code.length > 0, "arena has no code");
        require(arena.owner() == EXPECTED_OWNER, "wrong owner");
        require(!arena.newActivityPaused(), "new activity paused");
        require(arena.minStakeWei() == CANARY_STAKE && arena.maxStakeWei() == 0.1 ether, "wrong stake limits");
        require(arena.LOBBY_DURATION() == 10 minutes && arena.FEE_BP() == 200, "wrong arena policy");
        require(SignedPoolRaceOracle(EXPECTED_ORACLE).TRUSTED_SIGNER() == EXPECTED_SIGNER, "wrong signer");
        (address oracle, bytes32 oracleId, uint8 decimals, PriceArena.Category category, bool enabled) =
            arena.approvedAssets(ASSET_ID);
        require(enabled && category == PriceArena.Category.STOCK, "wrong TSLA category");
        require(oracle == EXPECTED_ORACLE && oracleId == EXPECTED_ORACLE_ID, "wrong TSLA oracle");
        require(decimals == 18, "wrong TSLA decimals");
    }
}

/// @notice Creates two one-minute arenas with ten-minute lobbies. Arena #0 has
/// two players and exercises enter plus a payable top-up/update; arena #1 has
/// one player and must cancel at its deadline.
contract CreatePriceArenaCanaries is PriceArenaCanaryBase {
    function run() external returns (uint256 settlementArenaId, uint256 cancellationArenaId) {
        PriceArena arena = _arena();
        _validateDeployment(arena);
        require(arena.arenaCount() == 0, "canary arenas already created");

        uint256 ownerKey = _ownerKey();
        uint256 playerKey = _playerKey();
        address player = vm.addr(playerKey);
        require(EXPECTED_OWNER.balance >= CANARY_STAKE * 3, "owner lacks canary stake");
        require(player.balance >= CANARY_STAKE, "player lacks canary stake");

        vm.startBroadcast(ownerKey);
        settlementArenaId = arena.createArena(ASSET_ID, PriceArena.Category.STOCK, 1 minutes, "PROPHET ETH CANARY");
        arena.enter{value: CANARY_STAKE}(settlementArenaId, FIRST_OWNER_PREDICTION, CANARY_STAKE);
        arena.updateEntry{value: CANARY_STAKE}(settlementArenaId, OWNER_PREDICTION, CANARY_STAKE);
        cancellationArenaId = arena.createArena(ASSET_ID, PriceArena.Category.STOCK, 1 minutes, "PROPHET ETH CANCEL");
        arena.enter{value: CANARY_STAKE}(cancellationArenaId, OWNER_PREDICTION, CANARY_STAKE);
        vm.stopBroadcast();

        vm.startBroadcast(playerKey);
        arena.enter{value: CANARY_STAKE}(settlementArenaId, PLAYER_PREDICTION, CANARY_STAKE);
        vm.stopBroadcast();

        require(settlementArenaId == 0 && cancellationArenaId == 1, "unexpected arena ids");
        require(arena.arenaCount() == 2, "unexpected arena count");
        PriceArena.Arena memory settlement = arena.getArena(0);
        PriceArena.Arena memory cancellation = arena.getArena(1);
        require(settlement.participantCount == 2 && settlement.totalPool == CANARY_STAKE * 3, "arena #0 mismatch");
        require(cancellation.participantCount == 1 && cancellation.totalPool == CANARY_STAKE, "arena #1 mismatch");

        console.log("PriceArena canary address", ARENA_ADDRESS);
        console.log("Settlement arena id", settlementArenaId);
        console.log("Cancellation arena id", cancellationArenaId);
        console.log("Settlement deadline", settlement.deadline);
        console.log("Cancellation deadline", cancellation.deadline);
        console.log("Second player", player);
    }
}

/// @notice Claims the sole winner of arena #0 and refunds the owner from
/// cancelled arena #1 after the keeper completes both transitions.
contract FinalizePriceArenaCanaries is PriceArenaCanaryBase {
    function run() external {
        PriceArena arena = _arena();
        _validateDeployment(arena);
        require(arena.arenaCount() >= 2, "canary arenas missing");

        uint256 ownerKey = _ownerKey();
        uint256 playerKey = _playerKey();
        address player = vm.addr(playerKey);
        PriceArena.Arena memory resolved = arena.getArena(0);
        PriceArena.Arena memory cancelled = arena.getArena(1);
        require(resolved.status == PriceArena.Status.RESOLVED, "arena #0 not resolved");
        require(cancelled.status == PriceArena.Status.CANCELLED, "arena #1 not cancelled");
        require(resolved.winnerCount == 1, "unexpected winner count");

        PriceArena.PublicEntry memory ownerEntry = arena.getEntry(0, EXPECTED_OWNER);
        PriceArena.PublicEntry memory playerEntry = arena.getEntry(0, player);
        bool ownerWon = ownerEntry.payout > 0;
        require(ownerWon != (playerEntry.payout > 0), "winner accounting mismatch");
        address winner = ownerWon ? EXPECTED_OWNER : player;
        uint256 winnerKey = ownerWon ? ownerKey : playerKey;
        uint256 payout = ownerWon ? ownerEntry.payout : playerEntry.payout;
        uint256 winningStake = ownerWon ? ownerEntry.stake : playerEntry.stake;
        uint256 losingPool = resolved.totalPool - winningStake;
        uint256 expectedFee = (losingPool * arena.FEE_BP()) / arena.BP_DENOMINATOR();
        require(resolved.protocolFee == expectedFee, "fee mismatch");
        require(payout == winningStake + losingPool - expectedFee, "payout mismatch");

        uint256 beforeClaim = ARENA_ADDRESS.balance;
        vm.startBroadcast(winnerKey);
        arena.claim(0);
        vm.stopBroadcast();
        require(ARENA_ADDRESS.balance + payout == beforeClaim, "wrong claim ETH delta");

        uint256 beforeRefund = ARENA_ADDRESS.balance;
        vm.startBroadcast(ownerKey);
        arena.refund(1);
        vm.stopBroadcast();
        require(ARENA_ADDRESS.balance + CANARY_STAKE == beforeRefund, "wrong refund ETH delta");

        console.log("PriceArena canary finalized");
        console.log("Winner", winner);
        console.log("Payout (wei)", payout);
        console.log("Fee (wei)", expectedFee);
        console.log("Refunded (wei)", CANARY_STAKE);
    }
}
