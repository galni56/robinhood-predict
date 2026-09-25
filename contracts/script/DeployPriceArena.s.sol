// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PriceArena} from "../src/PriceArena.sol";
import {SignedPoolRaceOracle} from "../src/oracles/SignedPoolRaceOracle.sol";
import {NativeEthDeploymentSafety} from "./helpers/NativeEthDeploymentSafety.sol";

/// @notice Deploys PriceArena without creating an arena or configuring assets.
/// Environment: PRIVATE_KEY, EXPECTED_OWNER_ADDRESS, SIGNED_POOL_ORACLE_ADDRESS,
/// PRICE_SIGNER_ADDRESS, PRICE_ARENA_MIN_STAKE_WEI, PRICE_ARENA_MAX_STAKE_WEI.
contract DeployPriceArena is Script {
    function run() external returns (PriceArena priceArena) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address expectedOwner = vm.envAddress("EXPECTED_OWNER_ADDRESS");
        SignedPoolRaceOracle oracle = SignedPoolRaceOracle(vm.envAddress("SIGNED_POOL_ORACLE_ADDRESS"));
        address priceSigner = vm.envAddress("PRICE_SIGNER_ADDRESS");
        uint256 minStakeWei = vm.envUint("PRICE_ARENA_MIN_STAKE_WEI");
        uint256 maxStakeWei = vm.envUint("PRICE_ARENA_MAX_STAKE_WEI");

        NativeEthDeploymentSafety.validateSigningOwner(vm.addr(deployerKey), expectedOwner);
        NativeEthDeploymentSafety.validateReleaseRoles(expectedOwner, address(oracle), priceSigner);
        require(address(oracle).code.length > 0, "signed pool oracle has no code");
        NativeEthDeploymentSafety.validateOracle(address(oracle), address(oracle), oracle.TRUSTED_SIGNER(), priceSigner);

        vm.startBroadcast(deployerKey);
        priceArena = new PriceArena(minStakeWei, maxStakeWei);
        vm.stopBroadcast();

        NativeEthDeploymentSafety.validateContractOwner(priceArena.owner(), expectedOwner);

        console.log("PriceArena deployed at:", address(priceArena));
        console.log("Owner:", priceArena.owner());
        console.log("Min stake (wei):", priceArena.minStakeWei());
        console.log("Max stake (wei):", priceArena.maxStakeWei());
        console.log("Lobby duration:", priceArena.LOBBY_DURATION());
        console.log("Fee (bp):", priceArena.FEE_BP());
    }
}
