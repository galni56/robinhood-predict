// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NicknameRegistry} from "../src/NicknameRegistry.sol";

contract NicknameRegistryTest is Test {
    NicknameRegistry registry;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        registry = new NicknameRegistry();
    }

    function test_DefaultNicknameIsEmpty() public view {
        assertEq(registry.nicknameOf(alice), "");
    }

    function test_SetAndReadOwnNickname() public {
        vm.prank(alice);
        registry.setNickname("alice.eth");
        assertEq(registry.nicknameOf(alice), "alice.eth");
    }

    function test_SetOverwritesPreviousNickname() public {
        vm.startPrank(alice);
        registry.setNickname("first");
        registry.setNickname("second");
        vm.stopPrank();
        assertEq(registry.nicknameOf(alice), "second");
    }

    function test_SetEmptyStringClearsNickname() public {
        vm.startPrank(alice);
        registry.setNickname("temp");
        registry.setNickname("");
        vm.stopPrank();
        assertEq(registry.nicknameOf(alice), "");
    }

    function test_CannotSetAnotherAddressNickname() public {
        vm.prank(alice);
        registry.setNickname("alice-name");

        vm.prank(bob);
        registry.setNickname("bob-name");

        assertEq(registry.nicknameOf(alice), "alice-name");
        assertEq(registry.nicknameOf(bob), "bob-name");
    }

    function test_RevertsWhenNicknameTooLong() public {
        vm.prank(alice);
        vm.expectRevert("nickname too long");
        registry.setNickname("this nickname is way way too long for the limit");
    }

    function test_AllowsNicknameAtExactMaxLength() public {
        string memory maxLen = "123456789012345678901234"; // 24 chars
        assertEq(bytes(maxLen).length, 24);
        vm.prank(alice);
        registry.setNickname(maxLen);
        assertEq(registry.nicknameOf(alice), maxLen);
    }

    function test_EmitsNicknameSetEvent() public {
        vm.expectEmit(true, false, false, true);
        emit NicknameRegistry.NicknameSet(alice, "alice.eth");
        vm.prank(alice);
        registry.setNickname("alice.eth");
    }
}
