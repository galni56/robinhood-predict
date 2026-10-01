// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ProphetOwnerBuybackBurnExecutor} from "../src/ProphetOwnerBuybackBurnExecutor.sol";

/// @dev Run explicitly against Robinhood mainnet. This test never broadcasts.
contract ProphetBuybackMainnetForkTest is Test {
    address internal constant OWNER = 0x821758584b2155c93713cE4991A7D9b447d0ccd8;
    address internal constant TOKEN = 0x410f2bD350F3d88795cfC29b61cA664C30987Efd;
    address internal constant CURVE = 0x4e520DAe47102c047e947BBec173026ecD01ef40;
    address internal constant EXECUTOR = 0x7B71d233FFFD6c354A4eD83816Ef7b3Dffb88D4c;
    address internal constant V4_EXECUTOR = 0x8BA56F49391470EF6729D5fDFfC02D6fa6ffDD85;

    function testLiveProphetRouteBuysAndBurns() public {
        // The normal unit suite does not use a fork. The explicit release
        // command supplies Robinhood mainnet and exercises this branch.
        if (block.chainid != 4_663) return;

        ProphetOwnerBuybackBurnExecutor executor = ProphetOwnerBuybackBurnExecutor(payable(EXECUTOR));
        IERC20 token = IERC20(TOKEN);

        assertEq(executor.owner(), OWNER, "wrong owner");
        assertEq(executor.feeRecipient(), OWNER, "wrong fee recipient");
        assertEq(address(executor.postGraduationExecutor()), V4_EXECUTOR, "wrong V4 executor");
        assertEq(executor.token(), address(0), "already bound on live chain");
        assertTrue(executor.buybacksPaused(), "live executor must remain paused");

        vm.prank(OWNER);
        executor.bindToken(TOKEN);
        assertEq(executor.token(), TOKEN, "token binding failed");
        assertEq(executor.curve(), CURVE, "wrong launch curve");

        vm.prank(OWNER);
        executor.setBuybacksPaused(false);

        uint256 supplyBefore = token.totalSupply();
        uint256 spentBefore = executor.totalNativeSpent();
        uint256 burnedBefore = executor.totalTokensBurned();
        vm.deal(OWNER, 1 ether);

        vm.prank(OWNER);
        (uint256 spent, uint256 burned, uint256 refunded) =
            executor.executeBuyback{value: 0.001 ether}(1, block.timestamp + 60);

        assertGt(spent, 0, "no native spent");
        assertGt(burned, 0, "no tokens bought");
        assertLe(spent, 0.001 ether, "overspent");
        assertEq(spent + refunded, 0.001 ether, "bad accounting");
        assertEq(token.balanceOf(EXECUTOR), 0, "executor retained tokens");
        assertEq(token.totalSupply(), supplyBefore - burned, "supply did not burn");
        assertEq(executor.totalNativeSpent(), spentBefore + spent, "spent counter mismatch");
        assertEq(executor.totalTokensBurned(), burnedBefore + burned, "burn counter mismatch");
    }
}
