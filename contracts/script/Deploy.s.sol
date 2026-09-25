// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Deploys a fresh PredictionMarket instance. A deployment does not modify the
// currently configured mainnet contract or migrate its open markets.

import {Script, console} from "forge-std/Script.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

/// @notice Deploys PredictionMarket. Reads config from env vars so nothing
/// secret ever lives in this file or in git:
///   PRIVATE_KEY        - deployer/owner wallet key, read only by Foundry
///   SIGNED_POOL_ORACLE_ADDRESS - deployed SignedPoolRaceOracle shared with AssetRace
///   MAX_SEED_LIQUIDITY_WEI - broad native ETH seed safety cap, in wei
///   MAX_STAKE_PER_SIDE_WEI - broad per-wallet/side ETH safety cap, in wei
///   FEE_BP             - optional, protocol fee in basis points for markets
///                        created from now on (200 = 2%, capped at MAX_FEE_BP =
///                        1000 = 10% on-chain). Defaults to 200 if unset.
contract Deploy is Script {
    function run() external returns (PredictionMarket predictionMarket) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address endpointOracle = vm.envAddress("SIGNED_POOL_ORACLE_ADDRESS");
        uint256 maxSeedLiquidityWei = vm.envUint("MAX_SEED_LIQUIDITY_WEI");
        uint256 maxStakePerSideWei = vm.envUint("MAX_STAKE_PER_SIDE_WEI");
        uint256 feeBp = vm.envOr("FEE_BP", uint256(200));

        vm.startBroadcast(deployerKey);
        predictionMarket = new PredictionMarket(endpointOracle, feeBp, maxSeedLiquidityWei, maxStakePerSideWei);
        vm.stopBroadcast();

        console.log("PredictionMarket deployed at:", address(predictionMarket));
        console.log("Signed pool endpoint oracle:", address(predictionMarket.endpointOracle()));
        console.log("Max seed liquidity (wei):", maxSeedLiquidityWei);
        console.log("Max stake per side (wei):", maxStakePerSideWei);
        console.log("Fee (bp):", feeBp);
    }
}
