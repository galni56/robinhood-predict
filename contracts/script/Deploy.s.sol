// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Deploys a fresh PredictionMarket instance. A deployment does not modify the
// currently configured mainnet contract or migrate its open markets.

import {Script, console} from "forge-std/Script.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

/// @notice Deploys PredictionMarket. Reads config from env vars so nothing
/// secret ever lives in this file or in git:
///   PRIVATE_KEY        - deployer/owner wallet key, read only by Foundry
///   BET_TOKEN_ADDRESS  - ERC20 the market accepts bets in
///   SIGNED_POOL_ORACLE_ADDRESS - deployed SignedPoolRaceOracle shared with AssetRace
///   FEE_BP             - optional, protocol fee in basis points for markets
///                        created from now on (200 = 2%, capped at MAX_FEE_BP =
///                        1000 = 10% on-chain). Defaults to 200 if unset.
contract Deploy is Script {
    function run() external returns (PredictionMarket predictionMarket) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address betToken = vm.envAddress("BET_TOKEN_ADDRESS");
        address endpointOracle = vm.envAddress("SIGNED_POOL_ORACLE_ADDRESS");
        uint256 feeBp = vm.envOr("FEE_BP", uint256(200));

        vm.startBroadcast(deployerKey);
        predictionMarket = new PredictionMarket(betToken, endpointOracle, feeBp);
        vm.stopBroadcast();

        console.log("PredictionMarket deployed at:", address(predictionMarket));
        console.log("Signed pool endpoint oracle:", address(predictionMarket.endpointOracle()));
        console.log("Bet token:", betToken);
        console.log("Fee (bp):", feeBp);
    }
}
