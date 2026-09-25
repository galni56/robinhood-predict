// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Deploys a fresh PredictionMarket instance. A deployment does not modify the
// currently configured mainnet contract or migrate its open markets.

import {Script, console} from "forge-std/Script.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {SignedPoolRaceOracle} from "../src/oracles/SignedPoolRaceOracle.sol";
import {NativeEthDeploymentSafety} from "./helpers/NativeEthDeploymentSafety.sol";

/// @notice Deploys PredictionMarket. Reads config from env vars so nothing
/// secret ever lives in this file or in git:
///   PRIVATE_KEY        - deployer/owner wallet key, read only by Foundry
///   EXPECTED_OWNER_ADDRESS - reviewed public owner; must match PRIVATE_KEY
///   SIGNED_POOL_ORACLE_ADDRESS - deployed SignedPoolRaceOracle shared with AssetRace
///   PRICE_SIGNER_ADDRESS - reviewed public signer returned by the shared oracle
///   MAX_SEED_LIQUIDITY_WEI - broad native ETH seed safety cap, in wei
///   MAX_STAKE_PER_SIDE_WEI - broad per-wallet/side ETH safety cap, in wei
///   FEE_BP             - optional, protocol fee in basis points for markets
///                        created from now on (200 = 2%, capped at MAX_FEE_BP =
///                        1000 = 10% on-chain). Defaults to 200 if unset.
contract Deploy is Script {
    function run() external returns (PredictionMarket predictionMarket) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address expectedOwner = vm.envAddress("EXPECTED_OWNER_ADDRESS");
        SignedPoolRaceOracle endpointOracle = SignedPoolRaceOracle(vm.envAddress("SIGNED_POOL_ORACLE_ADDRESS"));
        address priceSigner = vm.envAddress("PRICE_SIGNER_ADDRESS");
        uint256 maxSeedLiquidityWei = vm.envUint("MAX_SEED_LIQUIDITY_WEI");
        uint256 maxStakePerSideWei = vm.envUint("MAX_STAKE_PER_SIDE_WEI");
        uint256 feeBp = vm.envOr("FEE_BP", uint256(200));

        NativeEthDeploymentSafety.validateSigningOwner(vm.addr(deployerKey), expectedOwner);
        NativeEthDeploymentSafety.validateReleaseRoles(expectedOwner, address(endpointOracle), priceSigner);
        require(address(endpointOracle).code.length > 0, "signed pool oracle has no code");
        NativeEthDeploymentSafety.validateOracle(
            address(endpointOracle), address(endpointOracle), endpointOracle.TRUSTED_SIGNER(), priceSigner
        );

        vm.startBroadcast(deployerKey);
        predictionMarket = new PredictionMarket(address(endpointOracle), feeBp, maxSeedLiquidityWei, maxStakePerSideWei);
        vm.stopBroadcast();

        NativeEthDeploymentSafety.validateContractOwner(predictionMarket.owner(), expectedOwner);

        console.log("PredictionMarket deployed at:", address(predictionMarket));
        console.log("Signed pool endpoint oracle:", address(predictionMarket.endpointOracle()));
        console.log("Max seed liquidity (wei):", maxSeedLiquidityWei);
        console.log("Max stake per side (wei):", maxStakePerSideWei);
        console.log("Fee (bp):", feeBp);
        console.log("Owner:", predictionMarket.owner());
    }
}
