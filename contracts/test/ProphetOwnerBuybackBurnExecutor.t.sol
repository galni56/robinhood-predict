// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ProphetOwnerBuybackBurnExecutor} from "../src/ProphetOwnerBuybackBurnExecutor.sol";
import {
    IProphetPostGraduationBuybackExecutor,
    IPonsV2LaunchFactory,
    PonsV2GraduationPhase
} from "../src/interfaces/IPonsV2.sol";

contract MockOwnerBurnToken {
    mapping(address => uint256) public balanceOf;
    uint256 public totalSupply;
    uint256 public totalBurned;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function burn(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        totalBurned += amount;
    }
}

contract MockOwnerBurnFactory is IPonsV2LaunchFactory {
    mapping(address => LaunchedToken) internal launches;
    address public feeEscrow = address(0xFEE);
    address public memeHook = address(0x100);
    address public poolManager = address(0x200);

    function setLaunch(address token, address curve, address recipient, PonsV2GraduationPhase phase) external {
        launches[token] = LaunchedToken({
            token: token,
            curve: curve,
            deployer: address(0xD),
            creatorFeeRecipient: recipient,
            pairToken: address(0),
            graduationThreshold: 100 ether,
            poolFee: 0,
            tickSpacing: 200,
            creatorTaxBps: 0,
            buybackEnabled: false,
            phase: phase,
            sweptQuote: 0,
            sweptTokens: 0,
            sweptAt: 0,
            exists: true
        });
    }

    function setRecipient(address token, address recipient) external {
        launches[token].creatorFeeRecipient = recipient;
    }

    function setPairToken(address token, address pairToken) external {
        launches[token].pairToken = pairToken;
    }

    function setBuybackEnabled(address token, bool enabled) external {
        launches[token].buybackEnabled = enabled;
    }

    function setPhase(address token, PonsV2GraduationPhase phase) external {
        launches[token].phase = phase;
    }

    function getLaunchedToken(address token) external view returns (LaunchedToken memory) {
        return launches[token];
    }
}

contract MockOwnerBurnCurve {
    MockOwnerBurnToken public immutable token;
    uint256 public spendBps = 10_000;

    constructor(MockOwnerBurnToken token_) {
        token = token_;
    }

    function setSpendBps(uint256 newSpendBps) external {
        spendBps = newSpendBps;
    }

    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient)
        external
        payable
        returns (uint256 tokensOut)
    {
        require(msg.value == quoteIn, "value");
        uint256 spent = (quoteIn * spendBps) / 10_000;
        tokensOut = spent * 2;
        require(tokensOut >= minTokensOut, "slippage");
        token.mint(recipient, tokensOut);
        uint256 refund = quoteIn - spent;
        if (refund != 0) {
            (bool ok,) = payable(msg.sender).call{value: refund}("");
            require(ok, "refund");
        }
    }
}

contract MockOwnerPostGraduationExecutor is IProphetPostGraduationBuybackExecutor {
    MockOwnerBurnToken public immutable token;

    constructor(MockOwnerBurnToken token_) {
        token = token_;
    }

    function buy(address token_, uint256 minTokensOut, uint256) external payable returns (uint256 tokensOut) {
        require(token_ == address(token), "token");
        tokensOut = msg.value * 3;
        require(tokensOut >= minTokensOut, "slippage");
        token.mint(msg.sender, tokensOut);
    }
}

contract ProphetOwnerBuybackBurnExecutorTest is Test {
    address internal constant FEE_RECIPIENT = address(0xBEEF);

    MockOwnerBurnToken internal token;
    MockOwnerBurnFactory internal factory;
    MockOwnerBurnCurve internal curve;
    MockOwnerPostGraduationExecutor internal graduatedExecutor;
    ProphetOwnerBuybackBurnExecutor internal executor;

    function setUp() public {
        vm.chainId(4_663);
        vm.deal(FEE_RECIPIENT, 10 ether);
        token = new MockOwnerBurnToken();
        factory = new MockOwnerBurnFactory();
        curve = new MockOwnerBurnCurve(token);
        graduatedExecutor = new MockOwnerPostGraduationExecutor(token);
        executor = new ProphetOwnerBuybackBurnExecutor(address(this), FEE_RECIPIENT, factory, 1 ether);
        factory.setLaunch(address(token), address(curve), FEE_RECIPIENT, PonsV2GraduationPhase.NotGraduated);
    }

    function testBindRequiresOwnerWalletAsCreatorRecipient() public {
        factory.setRecipient(address(token), address(0xBAD));
        vm.expectRevert(
            abi.encodeWithSelector(ProphetOwnerBuybackBurnExecutor.InvalidCreatorRecipient.selector, address(0xBAD))
        );
        executor.bindToken(address(token));

        factory.setRecipient(address(token), FEE_RECIPIENT);
        factory.setPairToken(address(token), address(0x1));
        vm.expectRevert(abi.encodeWithSelector(ProphetOwnerBuybackBurnExecutor.NonNativeQuote.selector, address(0x1)));
        executor.bindToken(address(token));

        factory.setPairToken(address(token), address(0));
        factory.setBuybackEnabled(address(token), true);
        vm.expectRevert(ProphetOwnerBuybackBurnExecutor.PonsBuybackMustBeDisabled.selector);
        executor.bindToken(address(token));

        factory.setBuybackEnabled(address(token), false);
        executor.bindToken(address(token));
        assertEq(executor.token(), address(token));
        assertEq(executor.curve(), address(curve));
    }

    function testOwnerWalletSubmissionBuysAndBurns() public {
        _enableCurveBuybacks();

        vm.prank(FEE_RECIPIENT);
        (uint256 spent, uint256 burned, uint256 refunded) =
            executor.executeBuyback{value: 0.15 ether}(0.3 ether, block.timestamp + 60);

        assertEq(spent, 0.15 ether);
        assertEq(burned, 0.3 ether);
        assertEq(refunded, 0);
        assertEq(executor.totalNativeSubmitted(), 0.15 ether);
        assertEq(executor.totalNativeSpent(), 0.15 ether);
        assertEq(executor.totalTokensBurned(), 0.3 ether);
        assertEq(token.balanceOf(address(executor)), 0);
        assertEq(token.totalBurned(), 0.3 ether);
    }

    function testPartialFillRefundsOwnerAndCarriesNoExecutorBalance() public {
        _enableCurveBuybacks();
        curve.setSpendBps(5_000);
        uint256 ownerBefore = FEE_RECIPIENT.balance;

        vm.prank(FEE_RECIPIENT);
        (uint256 spent, uint256 burned, uint256 refunded) =
            executor.executeBuyback{value: 0.2 ether}(0.2 ether, block.timestamp + 60);

        assertEq(spent, 0.1 ether);
        assertEq(burned, 0.2 ether);
        assertEq(refunded, 0.1 ether);
        assertEq(FEE_RECIPIENT.balance, ownerBefore - 0.1 ether);
        assertEq(address(executor).balance, 0);
        assertEq(executor.totalNativeSpent(), 0.1 ether);
        assertEq(executor.totalNativeRefunded(), 0.1 ether);
    }

    function testGraduatedPoolBuyBurnsThroughConfiguredExecutor() public {
        executor.bindToken(address(token));
        executor.setPostGraduationExecutor(graduatedExecutor);
        executor.setBuybacksPaused(false);
        factory.setPhase(address(token), PonsV2GraduationPhase.PoolCreated);

        vm.prank(FEE_RECIPIENT);
        (uint256 spent, uint256 burned,) = executor.executeBuyback{value: 0.1 ether}(0.3 ether, block.timestamp + 60);

        assertEq(spent, 0.1 ether);
        assertEq(burned, 0.3 ether);
        assertEq(token.totalBurned(), 0.3 ether);
    }

    function testOnlyFeeRecipientCanSubmitBuybackFunds() public {
        _enableCurveBuybacks();
        vm.expectRevert(ProphetOwnerBuybackBurnExecutor.Unauthorized.selector);
        executor.executeBuyback{value: 1 wei}(1, block.timestamp + 60);
    }

    function testRejectsSubmissionAboveCap() public {
        _enableCurveBuybacks();
        executor.setMaxBuybackPerCall(0.1 ether);
        vm.prank(FEE_RECIPIENT);
        vm.expectRevert(
            abi.encodeWithSelector(ProphetOwnerBuybackBurnExecutor.BuybackTooLarge.selector, 0.2 ether, 0.1 ether)
        );
        executor.executeBuyback{value: 0.2 ether}(1, block.timestamp + 60);
    }

    function testRevalidatesFeeRecipientBeforeEveryBuy() public {
        _enableCurveBuybacks();
        factory.setRecipient(address(token), address(0xBAD));
        vm.prank(FEE_RECIPIENT);
        vm.expectRevert(
            abi.encodeWithSelector(ProphetOwnerBuybackBurnExecutor.InvalidCreatorRecipient.selector, address(0xBAD))
        );
        executor.executeBuyback{value: 1 wei}(1, block.timestamp + 60);
    }

    function testRejectsPausedInvalidDeadlineAndUnsupportedPhase() public {
        executor.bindToken(address(token));
        vm.prank(FEE_RECIPIENT);
        vm.expectRevert(ProphetOwnerBuybackBurnExecutor.BuybacksArePaused.selector);
        executor.executeBuyback{value: 1 wei}(1, block.timestamp + 60);

        executor.setBuybacksPaused(false);
        vm.prank(FEE_RECIPIENT);
        vm.expectRevert(ProphetOwnerBuybackBurnExecutor.InvalidDeadline.selector);
        executor.executeBuyback{value: 1 wei}(1, block.timestamp - 1);

        factory.setPhase(address(token), PonsV2GraduationPhase.Swept);
        vm.prank(FEE_RECIPIENT);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProphetOwnerBuybackBurnExecutor.UnsupportedPhase.selector, PonsV2GraduationPhase.Swept
            )
        );
        executor.executeBuyback{value: 1 wei}(1, block.timestamp + 60);
    }

    function _enableCurveBuybacks() private {
        executor.bindToken(address(token));
        executor.setBuybacksPaused(false);
    }
}
