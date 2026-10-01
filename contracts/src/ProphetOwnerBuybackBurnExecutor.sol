// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {
    IProphetPostGraduationBuybackExecutor,
    IPonsV2BondingCurve,
    IPonsV2LaunchFactory,
    IPonsV2LauncherToken,
    PonsV2GraduationPhase
} from "./interfaces/IPonsV2.sol";

/// @title ProphetOwnerBuybackBurnExecutor
/// @notice Buys and burns a PONZ V2 launch token using ETH submitted by the
/// launch's creator fee recipient. PONZ creator fees are paid to the configured
/// owner wallet first; an offchain signer submits the required 15% here.
/// @dev This contract deliberately cannot pull native ETH from an EOA. The
/// automation signer must be the immutable PONZ creator fee recipient.
contract ProphetOwnerBuybackBurnExecutor is Ownable2Step, ReentrancyGuard {
    uint256 public constant BUYBACK_BPS = 1_500;
    uint256 public constant EXPECTED_CHAIN_ID = 4_663;
    uint256 public constant MAX_DEADLINE_WINDOW = 10 minutes;

    IPonsV2LaunchFactory public immutable ponsFactory;
    address public immutable feeRecipient;

    address public token;
    address public curve;
    IProphetPostGraduationBuybackExecutor public postGraduationExecutor;
    uint256 public maxBuybackPerCall;
    bool public buybacksPaused = true;

    uint256 public totalNativeSubmitted;
    uint256 public totalNativeSpent;
    uint256 public totalNativeRefunded;
    uint256 public totalTokensBurned;

    error WrongChain(uint256 actual);
    error ZeroAddress();
    error ZeroAmount();
    error Unauthorized();
    error AlreadyBound();
    error InvalidLaunch();
    error InvalidCreatorRecipient(address actual);
    error NonNativeQuote(address pairToken);
    error PonsBuybackMustBeDisabled();
    error BuybacksArePaused();
    error InvalidDeadline();
    error UnsupportedPhase(PonsV2GraduationPhase phase);
    error ExecutorNotConfigured();
    error Slippage(uint256 received, uint256 minimum);
    error InvalidSpend(uint256 spent, uint256 submitted);
    error BuybackTooLarge(uint256 submitted, uint256 maximum);
    error NativeTransferFailed();
    error UnexpectedNativeSender(address sender);

    event TokenBound(address indexed token, address indexed curve);
    event ExecutorUpdated(address indexed previousExecutor, address indexed newExecutor);
    event MaxBuybackPerCallUpdated(uint256 previousAmount, uint256 newAmount);
    event BuybacksPaused(bool paused);
    event BuybackBurned(
        address indexed token,
        PonsV2GraduationPhase indexed phase,
        uint256 nativeSubmitted,
        uint256 nativeSpent,
        uint256 nativeRefunded,
        uint256 tokensBurned,
        uint256 cumulativeNativeSpent,
        uint256 cumulativeTokensBurned
    );

    constructor(
        address initialOwner,
        address creatorFeeRecipient,
        IPonsV2LaunchFactory factory,
        uint256 initialMaxBuybackPerCall
    ) Ownable(initialOwner) {
        if (block.chainid != EXPECTED_CHAIN_ID) revert WrongChain(block.chainid);
        if (initialOwner == address(0) || creatorFeeRecipient == address(0) || address(factory) == address(0)) {
            revert ZeroAddress();
        }
        if (initialMaxBuybackPerCall == 0) revert ZeroAmount();
        if (address(factory).code.length == 0) revert InvalidLaunch();

        feeRecipient = creatorFeeRecipient;
        ponsFactory = factory;
        maxBuybackPerCall = initialMaxBuybackPerCall;
    }

    modifier onlyFeeRecipient() {
        if (msg.sender != feeRecipient) revert Unauthorized();
        _;
    }

    /// @notice Binds the executor once to the future PONZ token and verifies
    /// that all creator fees are assigned to the required owner wallet.
    function bindToken(address token_) external onlyOwner {
        if (token != address(0)) revert AlreadyBound();
        if (token_ == address(0) || token_.code.length == 0) revert InvalidLaunch();

        IPonsV2LaunchFactory.LaunchedToken memory launch = ponsFactory.getLaunchedToken(token_);
        _validateLaunch(launch, token_);

        token = token_;
        curve = launch.curve;
        emit TokenBound(token_, launch.curve);
    }

    /// @notice Uses the submitted owner-wallet ETH to buy and immediately burn
    /// the launch token. Any curve partial-fill refund returns to that wallet.
    function executeBuyback(uint256 minTokensOut, uint256 deadline)
        external
        payable
        nonReentrant
        onlyFeeRecipient
        returns (uint256 spent, uint256 burned, uint256 refunded)
    {
        if (buybacksPaused) revert BuybacksArePaused();
        if (token == address(0)) revert InvalidLaunch();
        if (msg.value == 0 || minTokensOut == 0) revert ZeroAmount();
        if (msg.value > maxBuybackPerCall) revert BuybackTooLarge(msg.value, maxBuybackPerCall);
        if (deadline < block.timestamp || deadline > block.timestamp + MAX_DEADLINE_WINDOW) {
            revert InvalidDeadline();
        }

        IPonsV2LaunchFactory.LaunchedToken memory launch = ponsFactory.getLaunchedToken(token);
        _validateLaunch(launch, token);
        if (launch.curve != curve) revert InvalidLaunch();

        uint256 nativeBaseline = address(this).balance - msg.value;
        uint256 tokenBefore = IPonsV2LauncherToken(token).balanceOf(address(this));

        if (launch.phase == PonsV2GraduationPhase.NotGraduated) {
            IPonsV2BondingCurve(curve).buy{value: msg.value}(msg.value, minTokensOut, address(this));
        } else if (launch.phase == PonsV2GraduationPhase.PoolCreated) {
            IProphetPostGraduationBuybackExecutor executor = postGraduationExecutor;
            if (address(executor) == address(0)) revert ExecutorNotConfigured();
            executor.buy{value: msg.value}(token, minTokensOut, deadline);
        } else {
            revert UnsupportedPhase(launch.phase);
        }

        uint256 nativeAfter = address(this).balance;
        if (nativeAfter < nativeBaseline) revert InvalidSpend(0, msg.value);
        refunded = nativeAfter - nativeBaseline;
        if (refunded > msg.value) revert InvalidSpend(0, msg.value);
        spent = msg.value - refunded;
        burned = IPonsV2LauncherToken(token).balanceOf(address(this)) - tokenBefore;
        if (spent == 0) revert InvalidSpend(spent, msg.value);
        if (burned < minTokensOut) revert Slippage(burned, minTokensOut);

        totalNativeSubmitted += msg.value;
        totalNativeSpent += spent;
        totalNativeRefunded += refunded;
        IPonsV2LauncherToken(token).burn(burned);
        totalTokensBurned += burned;

        if (refunded != 0) {
            (bool ok,) = payable(feeRecipient).call{value: refunded}("");
            if (!ok) revert NativeTransferFailed();
        }

        emit BuybackBurned(token, launch.phase, msg.value, spent, refunded, burned, totalNativeSpent, totalTokensBurned);
    }

    function setPostGraduationExecutor(IProphetPostGraduationBuybackExecutor newExecutor) external onlyOwner {
        if (address(newExecutor) == address(0) || address(newExecutor).code.length == 0) revert ZeroAddress();
        address previous = address(postGraduationExecutor);
        postGraduationExecutor = newExecutor;
        emit ExecutorUpdated(previous, address(newExecutor));
    }

    function setMaxBuybackPerCall(uint256 newMaximum) external onlyOwner {
        if (newMaximum == 0) revert ZeroAmount();
        uint256 previous = maxBuybackPerCall;
        maxBuybackPerCall = newMaximum;
        emit MaxBuybackPerCallUpdated(previous, newMaximum);
    }

    function setBuybacksPaused(bool paused) external onlyOwner {
        buybacksPaused = paused;
        emit BuybacksPaused(paused);
    }

    function _validateLaunch(IPonsV2LaunchFactory.LaunchedToken memory launch, address expectedToken) private view {
        if (
            !launch.exists || launch.token != expectedToken || launch.curve == address(0)
                || launch.curve.code.length == 0
        ) {
            revert InvalidLaunch();
        }
        if (launch.creatorFeeRecipient != feeRecipient) {
            revert InvalidCreatorRecipient(launch.creatorFeeRecipient);
        }
        if (launch.pairToken != address(0)) revert NonNativeQuote(launch.pairToken);
        if (launch.buybackEnabled) revert PonsBuybackMustBeDisabled();
    }

    receive() external payable {
        if (msg.sender != curve && msg.sender != address(postGraduationExecutor)) {
            revert UnexpectedNativeSender(msg.sender);
        }
    }
}
