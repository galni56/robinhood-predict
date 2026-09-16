// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// STATUS: deployment preparation only; never run by automation in this repo.
// The price signer address is public configuration. Its private key belongs
// only in the offchain collector environment.

import {Script, console} from "forge-std/Script.sol";
import {AssetRace} from "../src/AssetRace.sol";
import {SignedPoolRaceOracle} from "../src/oracles/SignedPoolRaceOracle.sol";

contract DeployAssetRace is Script {
    function run() external returns (SignedPoolRaceOracle oracle, AssetRace race) {
        uint256 deployerKey = vm.envUint("ASSET_RACE_DEPLOYER_PRIVATE_KEY");
        address priceSigner = vm.envAddress("ASSET_RACE_PRICE_SIGNER_ADDRESS");
        address betToken = vm.envAddress("ASSET_RACE_BET_TOKEN_ADDRESS");

        vm.startBroadcast(deployerKey);
        oracle = new SignedPoolRaceOracle(priceSigner);
        race = new AssetRace(betToken);
        vm.stopBroadcast();

        console.log("SIGNED_POOL_ORACLE_ADDRESS", address(oracle));
        console.log("ASSET_RACE_ADDRESS", address(race));
        console.log("ASSET_RACE_PRICE_SIGNER_ADDRESS", priceSigner);
        console.log("ASSET_RACE_BET_TOKEN_ADDRESS", betToken);
    }
}
