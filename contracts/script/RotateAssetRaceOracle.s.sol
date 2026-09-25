// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// STATUS: emergency/planned rotation preparation only. Never run by automation.
// Existing races retain their frozen oracle. This script updates only enabled
// registry entries that still point at the explicitly supplied old oracle.

import {Script, console} from "forge-std/Script.sol";
import {AssetRace} from "../src/AssetRace.sol";
import {IAssetRaceOracle} from "../src/interfaces/IAssetRaceOracle.sol";
import {SignedPoolRaceOracle} from "../src/oracles/SignedPoolRaceOracle.sol";
import {AssetRaceOperatorSafety} from "./helpers/AssetRaceOperatorSafety.sol";

contract RotateAssetRaceOracle is Script {
    function run() external returns (uint256 rotated) {
        uint256 deployerKey = vm.envUint("ASSET_RACE_DEPLOYER_PRIVATE_KEY");
        AssetRace race = AssetRace(payable(vm.envAddress("ASSET_RACE_ADDRESS")));
        address oldOracle = vm.envAddress("ASSET_RACE_OLD_SIGNED_POOL_ORACLE_ADDRESS");
        SignedPoolRaceOracle newOracle = SignedPoolRaceOracle(vm.envAddress("ASSET_RACE_SIGNED_POOL_ORACLE_ADDRESS"));
        address expectedSigner = vm.envAddress("ASSET_RACE_PRICE_SIGNER_ADDRESS");
        address owner = race.owner();

        AssetRaceOperatorSafety.validateRotation(
            vm.addr(deployerKey), owner, expectedSigner, race.newActivityPaused(), oldOracle, address(newOracle)
        );
        require(newOracle.TRUSTED_SIGNER() == expectedSigner, "new price signer mismatch");
        require(
            newOracle.endpointProofType() == IAssetRaceOracle.EndpointProofType.SIGNED_POOL_BLOCK_PAIR,
            "new oracle proof type mismatch"
        );

        bytes32[] memory assetIds = race.getApprovedAssetIds();
        vm.startBroadcast(deployerKey);
        for (uint256 i = 0; i < assetIds.length; ++i) {
            (
                bool registered,
                bool enabled,
                AssetRace.RaceCategory category,
                address currentOracle,
                bytes32 oracleId,
                uint8 expectedDecimals,
                uint64 maxPriceAge,
                uint64 maxEndpointLag
            ) = race.approvedAssets(assetIds[i]);
            if (!registered || !enabled || currentOracle != oldOracle) continue;
            race.setApprovedAsset(
                AssetRace.CandidateInput({
                    category: category,
                    assetId: assetIds[i],
                    oracle: address(newOracle),
                    oracleId: oracleId,
                    expectedDecimals: expectedDecimals,
                    maxPriceAge: maxPriceAge,
                    maxEndpointLag: maxEndpointLag
                }),
                true
            );
            ++rotated;
        }
        vm.stopBroadcast();

        require(rotated != 0, "no enabled assets use old oracle");
        console.log("Rotated enabled assets", rotated);
        console.log("OLD_SIGNED_POOL_ORACLE_ADDRESS", oldOracle);
        console.log("SIGNED_POOL_ORACLE_ADDRESS", address(newOracle));
        console.log("ASSET_RACE_PRICE_SIGNER_ADDRESS", expectedSigner);
    }
}
