// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";

interface ILegacyPredictionMarket {
    enum Side {
        YES,
        NO
    }

    enum Status {
        Open,
        Resolved,
        Cancelled
    }

    struct Market {
        bytes32 assetId;
        bytes32 oracleId;
        uint8 priceDecimals;
        int256 targetPrice;
        uint256 createdAt;
        uint256 deadline;
        uint256 poolYes;
        uint256 poolNo;
        uint256 weightedPoolYes;
        uint256 weightedPoolNo;
        Status status;
        Side outcome;
        uint256 feeBp;
    }

    function owner() external view returns (address);
    function marketCount() external view returns (uint256);
    function getMarket(uint256 id) external view returns (Market memory);
    function voidMarket(uint256 id, string calldata reason) external;
}

/// @notice One-off guarded retirement of the final three empty V1 markets.
/// Existing resolved/cancelled markets and every claim/refund path remain intact.
contract RetireLegacyPredictionMarkets is Script {
    uint256 private constant ROBINHOOD_MAINNET_CHAIN_ID = 4663;
    uint256 private constant EXPECTED_MARKET_COUNT = 43;
    address private constant EXPECTED_OWNER = 0x6d68157bEDa778346Dd27f8Ef4F917f69aD2Dc41;
    address private constant LEGACY_MARKET = 0x4bfd0efc15C3198fe3AFf4741FF121AB2F38060e;

    function run() external {
        require(block.chainid == ROBINHOOD_MAINNET_CHAIN_ID, "wrong chain");
        ILegacyPredictionMarket market = ILegacyPredictionMarket(LEGACY_MARKET);
        require(LEGACY_MARKET.code.length > 0, "legacy market has no code");
        require(market.owner() == EXPECTED_OWNER, "wrong legacy owner");
        require(market.marketCount() == EXPECTED_MARKET_COUNT, "legacy market count changed");

        uint256[3] memory ids = [uint256(40), uint256(41), uint256(42)];
        for (uint256 index; index < ids.length; ++index) {
            ILegacyPredictionMarket.Market memory item = market.getMarket(ids[index]);
            require(item.status == ILegacyPredictionMarket.Status.Open, "legacy market not open");
            require(item.poolYes == 0 && item.poolNo == 0, "legacy market is funded");
        }

        uint256 ownerKey = vm.envUint("PRIVATE_KEY");
        require(vm.addr(ownerKey) == EXPECTED_OWNER, "PRIVATE_KEY is not reviewed owner");
        vm.startBroadcast(ownerKey);
        for (uint256 index; index < ids.length; ++index) {
            market.voidMarket(ids[index], "V1 retired before V2 launch");
        }
        vm.stopBroadcast();

        for (uint256 index; index < ids.length; ++index) {
            require(
                market.getMarket(ids[index]).status == ILegacyPredictionMarket.Status.Cancelled,
                "legacy market retirement failed"
            );
        }
        console.log("Retired empty V1 markets 40, 41 and 42");
    }
}
