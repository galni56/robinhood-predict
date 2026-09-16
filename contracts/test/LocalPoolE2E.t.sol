// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {LocalRaceV4StateView} from "./helpers/StockPoolE2E.sol";

contract LocalPoolE2ETest is Test {
    LocalRaceV4StateView internal fixture;

    function setUp() public {
        vm.chainId(31337);
        fixture = new LocalRaceV4StateView();
    }

    function key() internal pure returns (LocalRaceV4StateView.PoolKey memory) {
        return LocalRaceV4StateView.PoolKey(address(0), address(0x1234), 2500, 60, address(0));
    }

    function test_NativeKeyStoresExactPriceAndFee() public {
        LocalRaceV4StateView.PoolKey memory poolKey = key();
        fixture.setSqrtPrice(poolKey, uint160(1 << 96));
        (uint160 price, int24 tick, uint24 protocolFee, uint24 lpFee) = fixture.getSlot0(keccak256(abi.encode(poolKey)));
        assertEq(price, 1 << 96);
        assertEq(tick, 0);
        assertEq(protocolFee, 0);
        assertEq(lpFee, 2500);
    }

    function test_DifferentKeyCannotReadConfiguredSource() public {
        LocalRaceV4StateView.PoolKey memory poolKey = key();
        fixture.setSqrtPrice(poolKey, uint160(1 << 96));
        poolKey.tickSpacing = 1;
        vm.expectRevert("unknown pool key");
        fixture.getSlot0(keccak256(abi.encode(poolKey)));
        poolKey = key();
        poolKey.fee = 0;
        vm.expectRevert("unknown pool key");
        fixture.getSlot0(keccak256(abi.encode(poolKey)));
    }

    function test_UnsupportedHooksCurrencyAndZeroPriceReject() public {
        LocalRaceV4StateView.PoolKey memory poolKey = key();
        poolKey.hooks = address(1);
        vm.expectRevert("hook-free key only");
        fixture.setSqrtPrice(poolKey, 1);
        poolKey = key();
        poolKey.currency0 = address(1);
        vm.expectRevert("native quote only");
        fixture.setSqrtPrice(poolKey, 1);
        vm.expectRevert("positive price");
        fixture.setSqrtPrice(key(), 0);
    }

    function test_PublicChainsCannotDeployOrUpdateFixture() public {
        vm.chainId(4663);
        vm.expectRevert("Anvil only");
        new LocalRaceV4StateView();
        vm.expectRevert("Anvil only");
        fixture.setSqrtPrice(key(), 1);
    }
}
