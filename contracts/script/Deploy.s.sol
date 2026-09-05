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
///   FEE_BP             - optional, protocol fee in basis points for markets
///                        created from now on (200 = 2%, capped at MAX_FEE_BP =
///                        1000 = 10% on-chain). Defaults to 200 if unset.
contract Deploy is Script {
    function run() external returns (PredictionMarket predictionMarket) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address betToken = vm.envAddress("BET_TOKEN_ADDRESS");
        uint256 feeBp = vm.envOr("FEE_BP", uint256(200));

        vm.startBroadcast(deployerKey);
        predictionMarket = new PredictionMarket(betToken, feeBp);
        vm.stopBroadcast();

        console.log("PredictionMarket deployed at:", address(predictionMarket));
        console.log("Bet token:", betToken);
        console.log("Fee (bp):", feeBp);
    }
}
