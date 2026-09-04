// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// STATUS: written but never run. See contracts/CLAUDE.md.
// Testnet only — MockERC20 is a toy mintable token, never deploy it near
// mainnet or treat it as representing real value.

import {Script, console} from "forge-std/Script.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

/// @notice Deploys MockERC20 (stand-in "bet token" / testnet stablecoin) and
/// mints an initial testnet balance to the deployer so there's something to
/// bet with immediately. Env vars:
///   PRIVATE_KEY   - burner wallet key, 0x-prefixed, testnet-only funds
///   MINT_AMOUNT   - optional, whole tokens to mint to the deployer (default 100000)
contract DeployMockToken is Script {
    function run() external returns (MockERC20 token) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        uint256 mintAmount = vm.envOr("MINT_AMOUNT", uint256(100_000));

        vm.startBroadcast(deployerKey);
        token = new MockERC20("Mock Testnet USD", "mUSD");
        token.mint(deployer, mintAmount * 1e18);
        vm.stopBroadcast();

        console.log("MockERC20 (mUSD) deployed at:", address(token));
        console.log("Minted to deployer:", deployer);
        console.log("Amount (whole tokens):", mintAmount);
    }
}
