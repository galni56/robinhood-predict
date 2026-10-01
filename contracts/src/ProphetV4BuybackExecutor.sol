// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    IProphetPostGraduationBuybackExecutor,
    IPonsV2LaunchFactory,
    PonsV2GraduationPhase
} from "./interfaces/IPonsV2.sol";

interface IUniversalRouterLike {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
    function poolManager() external view returns (address);
}

/// @notice Minimal ABI-compatible copies of the current Uniswap V4 types used
/// by Universal Router 2.1.2. Keeping the surface narrow avoids adding a large
/// dependency tree to the existing Foundry project.
struct ProphetPoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct ProphetExactInputSingleParams {
    ProphetPoolKey poolKey;
    bool zeroForOne;
    uint128 amountIn;
    uint128 amountOutMinimum;
    uint256 minHopPriceX36;
    bytes hookData;
}

/// @title ProphetV4BuybackExecutor
/// @notice Executes only the exact native-ETH-to-launch-token swap for a bound
/// PONZ V2 graduated pool, then returns all output and any refund to the
/// owner-wallet buyback executor.
contract ProphetV4BuybackExecutor is IProphetPostGraduationBuybackExecutor {
    using SafeERC20 for IERC20;

    bytes1 private constant V4_SWAP = 0x10;
    bytes1 private constant SWAP_EXACT_IN_SINGLE = 0x06;
    bytes1 private constant SETTLE_ALL = 0x0c;
    bytes1 private constant TAKE_ALL = 0x0f;
    uint256 private constant EXPECTED_CHAIN_ID = 4_663;

    address public immutable buybackExecutor;
    address public immutable feeRecipient;
    IPonsV2LaunchFactory public immutable ponsFactory;
    address public immutable ponsMemeHook;
    IUniversalRouterLike public immutable universalRouter;

    error WrongChain(uint256 actual);
    error ZeroAddress();
    error Unauthorized();
    error InvalidLaunch();
    error InvalidValue();
    error InvalidDeadline();
    error NativeRefundFailed();
    error UnexpectedNativeSender(address sender);

    event GraduatedPoolBuy(address indexed token, uint256 nativeIn, uint256 tokenOut);

    constructor(
        address buybackExecutor_,
        address feeRecipient_,
        IPonsV2LaunchFactory factory_,
        address memeHook_,
        IUniversalRouterLike router_
    ) {
        if (block.chainid != EXPECTED_CHAIN_ID) revert WrongChain(block.chainid);
        if (
            buybackExecutor_ == address(0) || feeRecipient_ == address(0) || address(factory_) == address(0)
                || memeHook_ == address(0) || address(router_) == address(0)
        ) revert ZeroAddress();
        if (address(factory_).code.length == 0 || memeHook_.code.length == 0 || address(router_).code.length == 0) {
            revert ZeroAddress();
        }
        if (factory_.memeHook() != memeHook_ || factory_.poolManager() != router_.poolManager()) {
            revert InvalidLaunch();
        }
        buybackExecutor = buybackExecutor_;
        feeRecipient = feeRecipient_;
        ponsFactory = factory_;
        ponsMemeHook = memeHook_;
        universalRouter = router_;
    }

    function buy(address token, uint256 minTokensOut, uint256 deadline)
        external
        payable
        override
        returns (uint256 tokensOut)
    {
        if (msg.sender != buybackExecutor) revert Unauthorized();
        if (msg.value == 0 || msg.value > type(uint128).max || minTokensOut == 0 || minTokensOut > type(uint128).max) {
            revert InvalidValue();
        }
        if (deadline < block.timestamp) revert InvalidDeadline();

        IPonsV2LaunchFactory.LaunchedToken memory launch = ponsFactory.getLaunchedToken(token);
        if (
            !launch.exists || launch.token != token || launch.creatorFeeRecipient != feeRecipient
                || launch.pairToken != address(0) || launch.buybackEnabled
                || launch.phase != PonsV2GraduationPhase.PoolCreated
        ) revert InvalidLaunch();

        ProphetPoolKey memory key = ProphetPoolKey({
            currency0: address(0),
            currency1: token,
            fee: launch.poolFee,
            tickSpacing: launch.tickSpacing,
            hooks: ponsMemeHook
        });
        ProphetExactInputSingleParams memory swapParams = ProphetExactInputSingleParams({
            poolKey: key,
            zeroForOne: true,
            amountIn: uint128(msg.value),
            amountOutMinimum: uint128(minTokensOut),
            minHopPriceX36: 0,
            hookData: bytes("")
        });

        bytes[] memory actionParams = new bytes[](3);
        actionParams[0] = abi.encode(swapParams);
        actionParams[1] = abi.encode(address(0), msg.value);
        actionParams[2] = abi.encode(token, minTokensOut);

        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(abi.encodePacked(SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL), actionParams);

        uint256 tokenBefore = IERC20(token).balanceOf(address(this));
        universalRouter.execute{value: msg.value}(abi.encodePacked(V4_SWAP), inputs, deadline);
        tokensOut = IERC20(token).balanceOf(address(this)) - tokenBefore;
        if (tokensOut < minTokensOut) revert InvalidValue();
        IERC20(token).safeTransfer(buybackExecutor, tokensOut);

        uint256 refund = address(this).balance;
        if (refund != 0) {
            (bool ok,) = payable(buybackExecutor).call{value: refund}("");
            if (!ok) revert NativeRefundFailed();
        }

        emit GraduatedPoolBuy(token, msg.value - refund, tokensOut);
    }

    receive() external payable {
        if (msg.sender != address(universalRouter)) revert UnexpectedNativeSender(msg.sender);
    }
}
