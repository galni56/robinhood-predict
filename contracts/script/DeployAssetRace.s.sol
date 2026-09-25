// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// STATUS: deployment preparation only; never run by automation in this repo.
// Reuses the already deployed SignedPoolRaceOracle so the native-ETH migration
// does not change settlement identity or signer trust. The price signer address
// is public configuration; its private key belongs only in the collector.

import {Script, console} from "forge-std/Script.sol";
import {AssetRace} from "../src/AssetRace.sol";
import {SignedPoolRaceOracle} from "../src/oracles/SignedPoolRaceOracle.sol";
import {AssetRaceOperatorSafety} from "./helpers/AssetRaceOperatorSafety.sol";
import {NativeEthDeploymentSafety} from "./helpers/NativeEthDeploymentSafety.sol";

contract DeployAssetRace is Script {
    function run() external returns (SignedPoolRaceOracle oracle, AssetRace race) {
        uint256 deployerKey = vm.envUint("ASSET_RACE_DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address expectedOwner = vm.envAddress("EXPECTED_OWNER_ADDRESS");
        address priceSigner = vm.envAddress("ASSET_RACE_PRICE_SIGNER_ADDRESS");
        oracle = SignedPoolRaceOracle(vm.envAddress("ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS"));
        NativeEthDeploymentSafety.validateSigningOwner(deployer, expectedOwner);
        NativeEthDeploymentSafety.validateReleaseRoles(expectedOwner, address(oracle), priceSigner);
        require(address(oracle).code.length > 0, "signed pool oracle has no code");
        NativeEthDeploymentSafety.validateOracle(address(oracle), address(oracle), oracle.TRUSTED_SIGNER(), priceSigner);
        AssetRaceOperatorSafety.validateDeployment(deployer, priceSigner);

        vm.startBroadcast(deployerKey);
        race = new AssetRace();
        vm.stopBroadcast();

        NativeEthDeploymentSafety.validateContractOwner(race.owner(), expectedOwner);

        console.log("REUSED_SIGNED_POOL_ORACLE_ADDRESS", address(oracle));
        console.log("ASSET_RACE_ADDRESS", address(race));
        console.log("ASSET_RACE_PRICE_SIGNER_ADDRESS", priceSigner);
        console.log("OWNER", race.owner());
    }
}
