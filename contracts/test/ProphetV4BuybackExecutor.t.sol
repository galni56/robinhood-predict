// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {
    IUniversalRouterLike,
    ProphetExactInputSingleParams,
    ProphetV4BuybackExecutor
} from "../src/ProphetV4BuybackExecutor.sol";
import {IPonsV2LaunchFactory, PonsV2GraduationPhase} from "../src/interfaces/IPonsV2.sol";

contract MockExecutorToken {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockExecutorFactory is IPonsV2LaunchFactory {
    LaunchedToken internal launch;
    address public feeEscrow = address(0xFEE);
    address public memeHook;
    address public poolManager;

    function setDependencies(address memeHook_, address poolManager_) external {
        memeHook = memeHook_;
        poolManager = poolManager_;
    }

    function setLaunch(address token, address recipient, uint24 fee, int24 spacing) external {
        launch = LaunchedToken({
            token: token,
            curve: address(0xC0),
            deployer: address(0xD0),
            creatorFeeRecipient: recipient,
            pairToken: address(0),
            graduationThreshold: 1 ether,
            poolFee: fee,
            tickSpacing: spacing,
            creatorTaxBps: 0,
            buybackEnabled: false,
            phase: PonsV2GraduationPhase.PoolCreated,
            sweptQuote: 0,
            sweptTokens: 0,
            sweptAt: 0,
            exists: true
        });
    }

    function getLaunchedToken(address) external view returns (LaunchedToken memory) {
        return launch;
    }
}

contract MockUniversalRouter is IUniversalRouterLike {
    MockExecutorToken public immutable token;
    address public immutable expectedHook;
    uint24 public expectedFee;
    int24 public expectedSpacing;
    address public immutable poolManager;

    constructor(MockExecutorToken token_, address expectedHook_, address poolManager_) {
        token = token_;
        expectedHook = expectedHook_;
        poolManager = poolManager_;
    }

    function setExpectedPool(uint24 fee, int24 spacing) external {
        expectedFee = fee;
        expectedSpacing = spacing;
    }

    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable {
        assert(commands.length == 1 && commands[0] == 0x10);
        assert(deadline >= block.timestamp);
        (bytes memory actions, bytes[] memory params) = abi.decode(inputs[0], (bytes, bytes[]));
        assert(keccak256(actions) == keccak256(hex"060c0f"));
        ProphetExactInputSingleParams memory swapParams = abi.decode(params[0], (ProphetExactInputSingleParams));
        assert(swapParams.poolKey.currency0 == address(0));
        assert(swapParams.poolKey.currency1 == address(token));
        assert(swapParams.poolKey.fee == expectedFee);
        assert(swapParams.poolKey.tickSpacing == expectedSpacing);
        assert(swapParams.poolKey.hooks == expectedHook);
        assert(swapParams.zeroForOne);
        assert(swapParams.amountIn == msg.value);
        assert(swapParams.minHopPriceX36 == 0);
        (address settleCurrency, uint256 settleAmount) = abi.decode(params[1], (address, uint256));
        (address takeCurrency, uint256 takeMinimum) = abi.decode(params[2], (address, uint256));
        assert(settleCurrency == address(0) && settleAmount == msg.value);
        assert(takeCurrency == address(token) && takeMinimum == swapParams.amountOutMinimum);
        token.mint(msg.sender, msg.value * 2);
    }
}

contract MockHook {}

contract ProphetV4BuybackExecutorTest is Test {
    address internal constant FEE_RECIPIENT = address(0xFEE);

    MockExecutorToken internal token;
    MockExecutorFactory internal factory;
    MockHook internal hook;
    MockUniversalRouter internal router;
    ProphetV4BuybackExecutor internal executor;

    function setUp() public {
        vm.chainId(4_663);
        token = new MockExecutorToken();
        factory = new MockExecutorFactory();
        hook = new MockHook();
        address poolManager = address(0x200);
        router = new MockUniversalRouter(token, address(hook), poolManager);
        factory.setDependencies(address(hook), poolManager);
        router.setExpectedPool(0, 200);
        executor = new ProphetV4BuybackExecutor(address(this), FEE_RECIPIENT, factory, address(hook), router);
        factory.setLaunch(address(token), FEE_RECIPIENT, 0, 200);
    }

    function testBuildsExactNativeV4SwapAndReturnsTokens() public {
        vm.deal(address(this), 1 ether);
        uint256 out = executor.buy{value: 0.1 ether}(address(token), 0.2 ether, block.timestamp + 60);
        assertEq(out, 0.2 ether);
        assertEq(token.balanceOf(address(this)), 0.2 ether);
        assertEq(token.balanceOf(address(executor)), 0);
        assertEq(address(executor).balance, 0);
    }

    function testRejectsCallerOtherThanTreasury() public {
        vm.deal(address(0xBAD), 1);
        vm.prank(address(0xBAD));
        vm.expectRevert(ProphetV4BuybackExecutor.Unauthorized.selector);
        executor.buy{value: 1}(address(token), 1, block.timestamp + 60);
    }

    receive() external payable {}
}
