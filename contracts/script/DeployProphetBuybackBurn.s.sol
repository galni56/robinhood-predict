// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ProphetOwnerBuybackBurnExecutor} from "../src/ProphetOwnerBuybackBurnExecutor.sol";
import {IUniversalRouterLike, ProphetV4BuybackExecutor} from "../src/ProphetV4BuybackExecutor.sol";
import {IPonsV2LaunchFactory} from "../src/interfaces/IPonsV2.sol";

/// @notice Deploys the token-independent buyback contracts before the PONZ
/// launch. Run without --broadcast first. No token address is needed here.
contract DeployProphetBuybackBurn is Script {
    address internal constant EXPECTED_TOKEN_DEPLOYER = 0x821758584b2155c93713cE4991A7D9b447d0ccd8;
    address internal constant PONS_V2_FACTORY = 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e;
    address internal constant PONS_V2_MEME_HOOK = 0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044;
    address internal constant UNIVERSAL_ROUTER = 0x204FAca1764B154221e35c0d20aBb3c525710498;

    function run()
        external
        returns (ProphetOwnerBuybackBurnExecutor buybackExecutor, ProphetV4BuybackExecutor v4Executor)
    {
        require(block.chainid == 4_663, "wrong chain");
        uint256 deployerKey = vm.envExists("BUYBACK_TOKEN_DEPLOYER_PRIVATE_KEY")
            ? vm.envUint("BUYBACK_TOKEN_DEPLOYER_PRIVATE_KEY")
            : vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address feeRecipient = deployer;
        uint256 maxPerCall = vm.envOr("BUYBACK_MAX_PER_CALL_WEI", uint256(0.05 ether));
        require(deployer == EXPECTED_TOKEN_DEPLOYER, "wrong token deployer signer");
        require(maxPerCall != 0, "invalid configuration");
        require(PONS_V2_FACTORY.code.length != 0, "factory code missing");
        require(PONS_V2_MEME_HOOK.code.length != 0, "hook code missing");
        require(UNIVERSAL_ROUTER.code.length != 0, "router code missing");

        vm.startBroadcast(deployerKey);
        buybackExecutor = new ProphetOwnerBuybackBurnExecutor(
            deployer, feeRecipient, IPonsV2LaunchFactory(PONS_V2_FACTORY), maxPerCall
        );
        v4Executor = new ProphetV4BuybackExecutor(
            address(buybackExecutor),
            feeRecipient,
            IPonsV2LaunchFactory(PONS_V2_FACTORY),
            PONS_V2_MEME_HOOK,
            IUniversalRouterLike(UNIVERSAL_ROUTER)
        );
        buybackExecutor.setPostGraduationExecutor(v4Executor);
        vm.stopBroadcast();

        require(buybackExecutor.owner() == deployer, "wrong deployment owner");
        require(buybackExecutor.feeRecipient() == deployer, "wrong fee recipient");
        require(buybackExecutor.buybacksPaused(), "must deploy paused");
        require(address(buybackExecutor.postGraduationExecutor()) == address(v4Executor), "wrong V4 executor");

        console.log("ProphetOwnerBuybackBurnExecutor:", address(buybackExecutor));
        console.log("ProphetV4BuybackExecutor:", address(v4Executor));
        console.log("Use token deployer as PONZ creatorFeeRecipient:", feeRecipient);
        console.log("Set PONZ buybackEnabled to false");
    }
}
