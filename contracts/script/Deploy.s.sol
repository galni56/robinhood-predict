// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// STATUS: written but never run. Never deploy with a key that also holds real
// funds elsewhere — use a fresh burner wallet. See contracts/CLAUDE.md.

import {Script, console} from "forge-std/Script.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

/// @notice Deploys PredictionMarket. Reads config from env vars so nothing
/// secret ever lives in this file or in git:
///   PRIVATE_KEY        - burner wallet key, 0x-prefixed, testnet-only funds
///   BET_TOKEN_ADDRESS  - ERC20 the market accepts bets in (a testnet USDC-like
///                        token — see contracts/CLAUDE.md for where to get one)
contract Deploy is Script {
    function run() external returns (PredictionMarket predictionMarket) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address betToken = vm.envAddress("BET_TOKEN_ADDRESS");

        vm.startBroadcast(deployerKey);
        predictionMarket = new PredictionMarket(betToken);
        vm.stopBroadcast();

        console.log("PredictionMarket deployed at:", address(predictionMarket));
        console.log("Bet token:", betToken);
    }
}
